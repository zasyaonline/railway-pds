#!/usr/bin/env bash
# Refresh NTES live board cache and publish to the Coach Position S3 site.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REGION="${AWS_REGION:-ap-south-1}"
BUCKET="${COACH_SITE_BUCKET:-railway-coach-position-site-884000107109}"
DIST="${COACH_CF_DIST:-E12U4PGOD25ISI}"
unset HTTP_PROXY HTTPS_PROXY http_proxy https_proxy 2>/dev/null || true

if [ -n "${GITHUB_ACTIONS:-}" ] || [ -n "${AWS_ACCESS_KEY_ID:-}" ]; then
  unset AWS_PROFILE
else
  export AWS_PROFILE="${AWS_PROFILE:-cursoruser}"
fi

cd "$ROOT"
node scripts/refresh-live-cache.js
aws s3 sync "$ROOT/data/" "s3://${BUCKET}/data/" --region "$REGION" \
  --exclude "sessions.json" --exclude "demo_board.json"
aws cloudfront create-invalidation --distribution-id "$DIST" --paths "/data/*" \
  --query 'Invalidation.Id' --output text
echo "Published live cache to s3://${BUCKET}/data/"
