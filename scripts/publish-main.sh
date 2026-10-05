#!/bin/bash
# Update the user-facing `main` branch from `develop`: README, LICENSE, install.sh and
# screenshots only. Run from a clean develop checkout. Does not push.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
[ "$(git branch --show-current)" = develop ] || { echo "Run on develop"; exit 1; }
[ -z "$(git status --porcelain --untracked-files=no)" ] || { echo "Commit first"; exit 1; }
git checkout main
git rm -rq --ignore-unmatch . >/dev/null
git checkout develop -- README.md LICENSE install.sh docs/screenshots
git commit -m "Update user-facing files" || echo "Nothing to update"
git checkout develop
echo "Review with 'git log main -3', then: git push origin main"
