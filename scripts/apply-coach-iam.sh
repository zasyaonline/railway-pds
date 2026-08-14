#!/usr/bin/env bash
# Permanent coach poller access for PDS Lambdas.
#
# 1) CloudFormation (preferred): infra/template.yaml adds CoachBucketAccess on LambdaRole.
#    Run: ./scripts/deploy.sh
#
# 2) IAM inline policy (needs iam:PutRolePolicy): ./scripts/apply-coach-iam.sh
#
# 3) S3 bucket policy (works when IAM role changes are blocked): this script.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REGION="${AWS_REGION:-ap-south-1}"
STACK="${STACK_NAME:-railway-pds-chz}"
STATION="${STATION_CODE:-CHZ}"
COACH_BUCKET="${COACH_BUCKET_NAME:-railway-coach-position-site-884000107109}"
COACH_ADMIN_KEY="${COACH_ADMIN_KEY:-coach-ops}"

unset HTTP_PROXY HTTPS_PROXY http_proxy https_proxy 2>/dev/null || true

if [ -n "${GITHUB_ACTIONS:-}" ] || [ -n "${AWS_ACCESS_KEY_ID:-}" ]; then
  unset AWS_PROFILE
else
  export AWS_PROFILE="${AWS_PROFILE:-cursoruser}"
fi

apply_bucket_policy() {
  echo "==> Applying S3 bucket policy on ${COACH_BUCKET} (PDS Lambda read/write)"
  aws s3api put-bucket-policy \
    --bucket "$COACH_BUCKET" \
    --region "$REGION" \
    --policy "file://${ROOT}/infra/coach-site-bucket-policy.json"
}

apply_iam_role_policy() {
  ROLE_NAME=$(aws cloudformation describe-stack-resource \
    --stack-name "$STACK" \
    --logical-resource-id LambdaRole \
    --region "$REGION" \
    --query 'StackResourceDetail.PhysicalResourceId' \
    --output text 2>/dev/null || true)

  if [ -z "$ROLE_NAME" ] || [ "$ROLE_NAME" = "None" ]; then
    ROLE_NAME="railway-pds-${STATION}-LambdaRole-VqR4GQtL5NPA"
    echo "Stack role lookup failed; using fallback role name: $ROLE_NAME"
  fi

  POLICY_DOC=$(sed "s/railway-coach-position-site-884000107109/${COACH_BUCKET}/g" \
    "${ROOT}/infra/coach-bucket-iam-policy.json")

  echo "==> Attaching CoachBucketAccess to role: $ROLE_NAME"
  aws iam put-role-policy \
    --role-name "$ROLE_NAME" \
    --policy-name CoachBucketAccess \
    --policy-document "$POLICY_DOC"
}

update_lambda_env() {
  REFRESH_FN="railway-pds-${STATION}-refresh"
  API_FN="railway-pds-${STATION}-api"
  PDS_BUCKET=$(aws cloudformation describe-stacks \
    --stack-name "$STACK" --region "$REGION" \
    --query "Stacks[0].Outputs[?OutputKey=='BucketName'].OutputValue" --output text)

  echo "==> Ensuring Lambda env on $REFRESH_FN (timeout 300, COACH_BUCKET)"
  aws lambda update-function-configuration \
    --function-name "$REFRESH_FN" \
    --region "$REGION" \
    --timeout 300 \
    --environment "Variables={BUCKET_NAME=${PDS_BUCKET},COACH_BUCKET=${COACH_BUCKET}}"

  echo "==> Ensuring Lambda env on $API_FN"
  aws lambda update-function-configuration \
    --function-name "$API_FN" \
    --region "$REGION" \
    --environment "Variables={BUCKET_NAME=${PDS_BUCKET},REFRESH_RULE_NAME=railway-pds-${STATION}-refresh-schedule,ADMIN_KEY=${ADMIN_KEY:-chz-ops},COACH_BUCKET=${COACH_BUCKET},COACH_ADMIN_KEY=${COACH_ADMIN_KEY}}"
}

verify() {
  REFRESH_FN="railway-pds-${STATION}-refresh"
  echo "==> Invoking $REFRESH_FN to verify coach poller..."
  aws lambda invoke \
    --function-name "$REFRESH_FN" \
    --region "$REGION" \
    --payload '{}' \
    /tmp/coach-iam-verify.json > /dev/null
  cat /tmp/coach-iam-verify.json
  echo ""
  echo "==> Coach board API smoke test..."
  curl -sS "https://2j7ifmjjyb.execute-api.ap-south-1.amazonaws.com/api/coach/board?station=BG&display=entrance-main" \
    | python3 -c "import sys,json; d=json.load(sys.stdin); print('trains', len(d.get('stationBoard',[])), 'error', d.get('error'))"
}

MODE="${1:-bucket}"
case "$MODE" in
  iam)
    apply_iam_role_policy
    ;;
  bucket)
    apply_bucket_policy
    ;;
  both)
    apply_iam_role_policy || echo "IAM attach failed; continuing with bucket policy..."
    apply_bucket_policy
    ;;
  *)
    echo "Usage: $0 [bucket|iam|both]"
    exit 1
    ;;
esac

update_lambda_env
verify
echo "Done."
