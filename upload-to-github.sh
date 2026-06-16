#!/bin/zsh
set -euo pipefail

cd "$(dirname "$0")"

GH_BIN="${GH_BIN:-/opt/homebrew/bin/gh}"
REPO_OWNER="${REPO_OWNER:-cyrolones-sketch}"
REPO_NAME="${REPO_NAME:-argyle-pantry}"
REMOTE_URL="https://github.com/${REPO_OWNER}/${REPO_NAME}.git"

if [ ! -x "$GH_BIN" ]; then
  echo "GitHub CLI not found at $GH_BIN"
  echo "If gh is somewhere else, run: GH_BIN=/path/to/gh ./upload-to-github.sh"
  exit 1
fi

echo "Checking GitHub login..."
"$GH_BIN" auth status

echo "Making sure .env is not tracked..."
git rm --cached .env 2>/dev/null || true

if ! git diff --quiet || ! git diff --cached --quiet || [ -n "$(git status --porcelain)" ]; then
  echo "Saving latest website files..."
  git add -A
  git commit -m "Prepare Argyle Pantry website for deployment" || true
fi

if "$GH_BIN" repo view "${REPO_OWNER}/${REPO_NAME}" >/dev/null 2>&1; then
  echo "GitHub repository already exists: ${REPO_OWNER}/${REPO_NAME}"
else
  echo "Creating GitHub repository: ${REPO_OWNER}/${REPO_NAME}"
  "$GH_BIN" repo create "${REPO_OWNER}/${REPO_NAME}" --public --source=. --remote=origin --description "Argyle Pantry restaurant website"
fi

if git remote get-url origin >/dev/null 2>&1; then
  git remote set-url origin "$REMOTE_URL"
else
  git remote add origin "$REMOTE_URL"
fi

echo "Pushing website to GitHub..."
git branch -M main
git push -u origin main

echo ""
echo "Done: https://github.com/${REPO_OWNER}/${REPO_NAME}"
