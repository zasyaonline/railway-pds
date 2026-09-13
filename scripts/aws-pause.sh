#!/usr/bin/env bash
# Pause AWS Railway PDS + Coach CloudFront and the NTES EventBridge poller.
# Does not delete stacks, buckets, certs, DNS, or Lambda env.
set -euo pipefail
export AWS_PROFILE="${AWS_PROFILE:-cursoruser}"
export AWS_REGION="${AWS_REGION:-ap-south-1}"
unset HTTP_PROXY HTTPS_PROXY http_proxy https_proxy 2>/dev/null || true

PDS_DIST="${PDS_CF_DIST:-EVTX6GW0ROE2O}"
COACH_DIST="${COACH_CF_DIST:-E12U4PGOD25ISI}"
RULE="${REFRESH_RULE_NAME:-railway-pds-CHZ-refresh-schedule}"

set_distribution_enabled() {
  local id="$1" enabled="$2"
  local tmp etag
  tmp="$(mktemp)"
  aws cloudfront get-distribution-config --id "$id" --output json > "$tmp"
  etag="$(python3 -c "import json; print(json.load(open('$tmp'))['ETag'])")"
  python3 -c "
import json
doc = json.load(open('$tmp'))
cfg = doc['DistributionConfig']
cfg['Enabled'] = $enabled
json.dump(cfg, open('$tmp', 'w'))
"
  aws cloudfront update-distribution \
    --id "$id" \
    --if-match "$etag" \
    --distribution-config "file://$tmp" \
    --query 'Distribution.{Id:Id,Enabled:DistributionConfig.Enabled,Status:Status}' \
    --output table
  rm -f "$tmp"
}

echo "==> Disable EventBridge $RULE"
aws events disable-rule --name "$RULE" --region "$AWS_REGION"
aws events describe-rule --name "$RULE" --region "$AWS_REGION" --query '{Name:Name,State:State}' --output table

echo "==> Disable CloudFront $PDS_DIST (platform.zasya.online)"
set_distribution_enabled "$PDS_DIST" False

echo "==> Disable CloudFront $COACH_DIST (coach-position.zasya.online)"
set_distribution_enabled "$COACH_DIST" False

echo ""
echo "Paused. Stack, S3, ACM, DNS, and Lambda env are unchanged."
echo "CloudFront needs a few minutes to finish deploying."
echo "Resume with: bash scripts/aws-resume.sh"
