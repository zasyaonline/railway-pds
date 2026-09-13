#!/usr/bin/env bash
# Re-enable AWS Railway PDS + Coach CloudFront and the NTES EventBridge poller.
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

echo "==> Enable CloudFront $PDS_DIST (platform.zasya.online)"
set_distribution_enabled "$PDS_DIST" True

echo "==> Enable CloudFront $COACH_DIST (coach-position.zasya.online)"
set_distribution_enabled "$COACH_DIST" True

echo "==> Enable EventBridge $RULE"
aws events enable-rule --name "$RULE" --region "$AWS_REGION"
aws events describe-rule --name "$RULE" --region "$AWS_REGION" --query '{Name:Name,State:State}' --output table

echo ""
echo "Resume requested. Wait until CloudFront Status=Deployed and Enabled=true, then:"
echo "  curl -sS https://platform.zasya.online/api/health"
echo "See docs/aws-pause-and-restore.md"
