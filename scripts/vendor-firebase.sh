#!/usr/bin/env bash
# Download the Firebase ESM builds into vendor/firebase/ and make their
# cross-imports relative, so the app shell never fetches from gstatic.
set -euo pipefail
V=10.12.2
cd "$(dirname "$0")/../vendor/firebase"
for f in app auth firestore; do
  curl -fsSL "https://www.gstatic.com/firebasejs/$V/firebase-$f.js" -o "firebase-$f.js"
done
sed -i "s#https://www.gstatic.com/firebasejs/$V/firebase-app.js#./firebase-app.js#g" firebase-auth.js firebase-firestore.js
sed -i '/sourceMappingURL=/d' firebase-app.js firebase-auth.js firebase-firestore.js
if grep -nE "(from ?|import\\()['\"]https?://" firebase-*.js; then
  echo "absolute module imports remain" >&2
  exit 1
fi
ls -l firebase-*.js
