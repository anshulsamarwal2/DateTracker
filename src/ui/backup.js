import { store } from '../store.js';
import { buildJSONExport, exportFilename, downloadText } from '../io/export.js';
import { updateMeta } from '../db.js';
import { guard, toast } from './toast.js';

/** Download a full JSON backup (including Trash) and record the backup time. */
export function exportJSONBackup() {
  const s = store.get();
  if (!s.user) return;
  downloadText(exportFilename('json'), buildJSONExport(s.entries, s.categories), 'application/json');
  guard(updateMeta(s.user.uid, { lastBackupAt: Date.now() }));
  toast('Backup downloaded');
}
