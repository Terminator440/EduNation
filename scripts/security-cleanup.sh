#!/usr/bin/env bash
#
# Security cleanup for eduro — run this in YOUR OWN terminal (not the assistant
# sandbox). It performs the operational steps that must happen on your machine:
# untracking secrets, scrubbing the leaked DB password from git history,
# regenerating the lockfile for the patched xlsx, and normalizing line endings.
#
# ⚠️  Read every step before running. The history rewrite (STEP 3) is DESTRUCTIVE
#     and requires a force-push. Make a backup branch/clone first.
#
set -euo pipefail
cd "$(dirname "$0")/.."

echo "=============================================================="
echo "STEP 0 (MANUAL — cannot be scripted): ROTATE THE DB PASSWORD"
echo "  The password 'SexyBarbosaArePulaMare' is COMPROMISED (it was"
echo "  committed to git history). Removing it from history does NOT"
echo "  invalidate it. You MUST rotate it:"
echo "    Supabase Dashboard → Project → Settings → Database →"
echo "    'Reset database password'. Then update your local .env."
echo "  Also rotate the publishable/anon key:"
echo "    Settings → API → roll the keys."
echo "  Press Enter once the password has been rotated, or Ctrl-C to abort."
echo "=============================================================="
read -r _

echo "== STEP 1: untrack secrets & CLI temp state =="
git rm --cached --ignore-unmatch .env
git rm -r --cached --ignore-unmatch supabase/.temp supabase/.branches
git add .gitignore .gitattributes
git commit -m "chore(security): stop tracking .env and supabase CLI temp state" || true

echo "== STEP 2: install git-filter-repo (history scrubber) =="
if ! command -v git-filter-repo >/dev/null 2>&1; then
  pip install git-filter-repo || pipx install git-filter-repo
fi

echo "== STEP 3: scrub the leaked password from ALL history =="
echo "SexyBarbosaArePulaMare==>REDACTED_ROTATED_SECRET" > /tmp/eduro-secrets.txt
# Also scrub the full connection strings if you want them gone entirely:
# echo 'regex:postgresql://postgres:[^@]+@==>postgresql://postgres:REDACTED@' >> /tmp/eduro-secrets.txt
git filter-repo --replace-text /tmp/eduro-secrets.txt --force
rm -f /tmp/eduro-secrets.txt

echo "== STEP 4: regenerate lockfile for the patched xlsx (CDN build) =="
# package.json now points xlsx at the official SheetJS CDN tarball (0.20.3),
# which fixes CVE-2023-30533. Regenerate the lockfile so installs are reproducible.
npm install

echo "== STEP 5: normalize line endings (one-time, after .gitattributes) =="
git add --renormalize .
git commit -m "chore: normalize line endings via .gitattributes" || true

echo "== STEP 6: re-add the remote and force-push the rewritten history =="
echo "git filter-repo removes 'origin' for safety. Re-add and force-push:"
echo "    git remote add origin <YOUR_REMOTE_URL>"
echo "    git push --force --all && git push --force --tags"
echo
echo "DONE. Remember: every collaborator must re-clone after the history rewrite."
