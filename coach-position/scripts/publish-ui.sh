#!/usr/bin/env bash
# Sync Coach Position static UI (js/css/html/img) to S3 and invalidate CloudFront.
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

aws s3 sync "$ROOT/public/" "s3://${BUCKET}/" --region "$REGION" \
  --exclude "data/*"
aws s3 cp "$ROOT/data/stations.json" "s3://${BUCKET}/data/stations.json" --region "$REGION"
aws cloudfront create-invalidation --distribution-id "$DIST" \
  --paths "/js/*" "/css/*" "/index.html" "/admin.html" "/config.js" "/img/*" "/data/stations.json" \
  --query 'Invalidation.Id' --output text
echo "Published UI to s3://${BUCKET}/"
