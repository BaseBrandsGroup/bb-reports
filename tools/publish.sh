#!/bin/bash
# Commits and pushes one client's locked page, then confirms the live link works.
# Usage: tools/publish.sh <client-slug> "<week label>"
# Only run after Fee has approved the dashboard, narrative AND the Central card preview.
set -euo pipefail
cd "$(dirname "$0")/.."
slug="$1"; week="${2:-weekly report}"
[ -f "$slug/index.html" ] || { echo "FAIL  $slug/index.html not found. Run lock-report.mjs first."; exit 1; }
[ -n "${GITHUB_PERSONAL_ACCESS_TOKEN:-}" ] || { echo "FAIL  GitHub token missing from settings.json env."; exit 1; }

git pull -q --ff-only origin main 2>/dev/null || true
git add "$slug/index.html"
if git diff --cached --quiet; then echo "Nothing changed for $slug."; else
  git -c user.email=accounts@basebrandsagency.com -c user.name="Base Brands" commit -q -m "Publish $slug: $week

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
fi
AUTH=$(printf 'x-access-token:%s' "$GITHUB_PERSONAL_ACCESS_TOKEN" | base64)
git -c http.extraheader="Authorization: Basic $AUTH" push -q origin main
echo "Pushed. Waiting for the live link to update..."
node tools/verify.mjs "$slug" --live
