import { store } from '../store.js';
import { back } from '../router.js';
import { importData } from '../db.js';
import { activeEntries, sortNewestFirst, indexById } from '../selectors.js';
import { parseCSV } from '../io/csv.js';
import { CSV_FIELDS, guessMapping, csvRowsToEntries, parseJSONExport, planMerge } from '../io/import.js';
import { buildCSVExport, exportFilename, downloadText } from '../io/export.js';
import { formatShort } from '../dates.js';
import { html, setHTML, delegate } from './dom.js';
import { icon } from './icons.js';
import { openSheet, confirmSheet } from './sheet.js';
import { guard, toast } from './toast.js';
import { exportJSONBackup } from './backup.js';
import { sectionScreen, lastBackupLabel } from './settings-shared.js';

/** @typedef {import('../model.js').Entry} Entry */

const PREVIEW_ROWS = 5;
const IMPORT_FAILED = "Import didn't finish. Check your connection and try again.";
/** @param {number} n */
const memories = (n) => `${n} ${n === 1 ? 'memory' : 'memories'}`;
/** @param {number} n */
const categories = (n) => `${n} ${n === 1 ? 'category' : 'categories'}`;

/** Entries whose categoryId is unknown get categoryId: null. @param {Entry[]} entries @param {Set<string>} ids */
export function withKnownCategories(entries, ids) {
  return entries.map((e) => (e.categoryId && !ids.has(e.categoryId) ? { ...e, categoryId: null } : e));
}

/** @param {File} file */
async function importJSONFile(file) {
  let parsed;
  try { parsed = parseJSONExport(await file.text()); } catch (err) { toast(/** @type {Error} */ (err).message); return; }
  const s = store.get();
  const plan = planMerge(s.entries, s.categories, parsed);
  if (!plan.entriesToAdd.length && !plan.categoriesToAdd.length) {
    toast('Everything in this file is already in your journal.');
    return;
  }
  const inFile = `${memories(parsed.entries.length)}, ${categories(parsed.categories.length)} in this file`;
  const already = plan.skippedEntries ? ` · ${plan.skippedEntries} already in your journal` : '';
  const ok = await confirmSheet({
    title: `Import ${memories(plan.entriesToAdd.length)}?`,
    message: `${inFile}${already}.`,
    confirmLabel: 'Import',
  });
  if (!ok) return;
  const known = new Set([...s.categories, ...plan.categoriesToAdd].map((c) => c.id));
  guard(importData(/** @type {string} */ (s.user?.uid), {
    entries: withKnownCategories(plan.entriesToAdd, known),
    categories: plan.categoriesToAdd,
  }), IMPORT_FAILED);
  toast(`Imported ${memories(plan.entriesToAdd.length)}`);
}

/** @param {File} file */
async function importCSVFile(file) {
  const { headers, rows } = parseCSV(await file.text());
  if (!rows.length) { toast('That file has no rows to import.'); return; }
  /** @type {Record<number, string>} */
  const mapping = guessMapping(headers);
  let dayFirst = true;

  openSheet({
    title: 'Import CSV',
    render(content, api) {
      const samples = headers.map((_, i) => rows.find((r) => (r[i] ?? '').trim())?.[i] ?? '');
      setHTML(content, html`
        <div class="sheet-body csv-import">
          <p class="secondary">${rows.length} rows found in “${file.name}”. Match each column to a field.</p>
          <div class="csv-map">
            ${headers.map((h, i) => html`
              <label class="field">
                <span class="field-label">${h || `Column ${i + 1}`}</span>
                <select class="select" data-action="map" data-col="${i}">
                  ${CSV_FIELDS.map((f) => html`<option value="${f.id}" ${mapping[i] === f.id ? 'selected' : ''}>${f.label}</option>`)}
                </select>
                ${samples[i] ? html`<span class="field-hint">e.g. ${samples[i].slice(0, 60)}</span>` : ''}
              </label>`)}
          </div>
          <div class="field">
            <span class="field-label" id="dayfirst-label">Dates like 03/04/2026 mean</span>
            <div class="segmented" role="group" aria-labelledby="dayfirst-label" id="dayfirst"></div>
          </div>
          <h3 class="label">Preview</h3>
          <div class="csv-preview" id="csv-preview"></div>
          <p class="field-error" id="csv-error" hidden></p>
        </div>
        <div class="sheet-foot">
          <button type="button" class="btn btn-quiet" data-action="cancel">Cancel</button>
          <button type="button" class="btn btn-primary" data-action="import" id="csv-go">Import</button>
        </div>`);

      function refresh() {
        const s = store.get();
        setHTML(/** @type {HTMLElement} */ (content.querySelector('#dayfirst')), html`
          <button type="button" data-action="dayfirst" data-value="true" aria-pressed="${String(dayFirst)}">3 April (day first)</button>
          <button type="button" data-action="dayfirst" data-value="false" aria-pressed="${String(!dayFirst)}">March 4 (month first)</button>`);
        const usable = Object.values(mapping).some((f) => f === 'title' || f === 'date');
        const err = /** @type {HTMLElement} */ (content.querySelector('#csv-error'));
        const go = /** @type {HTMLButtonElement} */ (content.querySelector('#csv-go'));
        err.hidden = usable;
        err.textContent = usable ? '' : 'Choose which column holds the title or the date.';
        if (!usable) { setHTML(/** @type {HTMLElement} */ (content.querySelector('#csv-preview')), ''); go.disabled = true; return; }
        const preview = csvRowsToEntries(rows.slice(0, PREVIEW_ROWS), mapping, { dayFirst, categories: s.categories });
        const catName = (/** @type {string|null} */ id) => [...s.categories, ...preview.newCategories].find((c) => c.id === id)?.name || '';
        setHTML(/** @type {HTMLElement} */ (content.querySelector('#csv-preview')), html`
          <table>
            <thead><tr><th scope="col">Date</th><th scope="col">Title</th><th scope="col">Category</th></tr></thead>
            <tbody>${preview.entries.map((e) => html`<tr><td>${formatShort(e.date)}</td><td>${e.title}</td><td>${catName(e.categoryId)}</td></tr>`)}</tbody>
          </table>`);
        const total = csvRowsToEntries(rows, mapping, { dayFirst, categories: s.categories }).entries.length;
        go.disabled = total === 0;
        go.textContent = `Import ${memories(total)}`;
      }
      refresh();

      const offs = [
        delegate(content, 'change', {
          map: (el) => { mapping[Number(el.dataset.col)] = /** @type {HTMLSelectElement} */ (el).value; refresh(); },
        }),
        delegate(content, 'click', {
          cancel: () => api.close(),
          dayfirst: (el) => {
            dayFirst = el.dataset.value === 'true';
            refresh();
            /** @type {HTMLElement|null} */ (content.querySelector(`[data-action="dayfirst"][data-value="${el.dataset.value}"]`))?.focus();
          },
          import: () => {
            const s = store.get();
            const result = csvRowsToEntries(rows, mapping, { dayFirst, categories: s.categories });
            if (!result.entries.length) return;
            guard(importData(/** @type {string} */ (s.user?.uid), { entries: result.entries, categories: result.newCategories }), IMPORT_FAILED);
            api.close();
            toast(`Imported ${memories(result.entries.length)}${result.skipped ? ` · ${result.skipped} empty rows skipped` : ''}`);
          },
        }),
      ];
      return () => offs.forEach((off) => off());
    },
  });
}

/** @param {HTMLElement} root */
export function mount(root) {
  let last = '';
  function render() {
    const s = store.get();
    const markup = String(sectionScreen('Data', html`
      <p class="content secondary backup-line">${lastBackupLabel(s.meta)}</p>
      <h2 class="label list-title">Export</h2>
      <div class="list">
        <button type="button" class="list-row" data-action="export-json">${icon('download')}
          <span class="list-row-main"><span class="list-row-title">Export JSON</span><span class="list-row-meta">Full backup, including Trash</span></span></button>
        <button type="button" class="list-row" data-action="export-csv">${icon('download')}
          <span class="list-row-main"><span class="list-row-title">Export CSV</span><span class="list-row-meta">For Google Sheets or Excel</span></span></button>
      </div>
      <h2 class="label list-title">Import</h2>
      <div class="list">
        <button type="button" class="list-row" data-action="pick-json">${icon('upload')}
          <span class="list-row-main"><span class="list-row-title">Import JSON</span><span class="list-row-meta">Adds a DateTracker backup to your journal</span></span></button>
        <button type="button" class="list-row" data-action="pick-csv">${icon('upload')}
          <span class="list-row-main"><span class="list-row-title">Import CSV</span><span class="list-row-meta">From any spreadsheet</span></span></button>
      </div>
      <p class="content field-hint">Importing never replaces anything: memories already in your journal are skipped.</p>
      <input type="file" id="file-json" accept=".json,application/json" data-action="file-json" hidden>
      <input type="file" id="file-csv" accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values,text/plain" data-action="file-csv" hidden>`));
    if (markup !== last) { setHTML(root, markup); last = markup; }
  }
  /** @param {string} sel */
  const pick = (sel) => { const input = /** @type {HTMLInputElement} */ (root.querySelector(sel)); input.value = ''; input.click(); };
  const offs = [
    delegate(root, 'click', {
      back: () => back('#/settings'),
      'export-json': () => exportJSONBackup(),
      'export-csv': () => {
        const s = store.get();
        downloadText(exportFilename('csv'), buildCSVExport(sortNewestFirst(activeEntries(s.entries)), indexById(s.categories)), 'text/csv');
      },
      'pick-json': () => pick('#file-json'),
      'pick-csv': () => pick('#file-csv'),
    }),
    delegate(root, 'change', {
      'file-json': (el) => { const f = /** @type {HTMLInputElement} */ (el).files?.[0]; if (f) importJSONFile(f); },
      'file-csv': (el) => { const f = /** @type {HTMLInputElement} */ (el).files?.[0]; if (f) importCSVFile(f); },
    }),
  ];
  const unsub = store.subscribe(render);
  render();
  return { unmount() { unsub(); offs.forEach((off) => off()); } };
}
