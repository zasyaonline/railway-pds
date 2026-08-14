#!/usr/bin/env bash
# Deploy Coach Position stack + print Cloudflare DNS records
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REGION="${AWS_REGION:-ap-south-1}"
CERT_REGION="us-east-1"
STACK="${STACK_NAME:-railway-coach-position}"
CUSTOM_DOMAIN="${CUSTOM_DOMAIN:-coach-position.zasya.online}"
unset HTTP_PROXY HTTPS_PROXY http_proxy https_proxy 2>/dev/null || true

ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text --region "$REGION")
ARTIFACT_BUCKET="railway-pds-artifacts-${ACCOUNT_ID}"

echo "==> ACM certificate for ${CUSTOM_DOMAIN}"
CERT_ARN=$(aws acm list-certificates --region "$CERT_REGION" \
  --query "CertificateSummaryList[?DomainName=='${CUSTOM_DOMAIN}'].CertificateArn | [0]" \
  --output text)

if [ -z "$CERT_ARN" ] || [ "$CERT_ARN" = "None" ]; then
  CERT_ARN=$(aws acm request-certificate \
    --domain-name "$CUSTOM_DOMAIN" \
    --validation-method DNS \
    --region "$CERT_REGION" \
    --query CertificateArn --output text)
fi

STATUS=$(aws acm describe-certificate --certificate-arn "$CERT_ARN" --region "$CERT_REGION" \
  --query 'Certificate.Status' --output text)
echo "CertificateArn=$CERT_ARN"
echo "Status=$STATUS"

echo ""
echo "======== CLOUDFLARE DNS (add these) ========"
if [ "$STATUS" = "PENDING_VALIDATION" ]; then
  echo "1) ACM validation CNAME (DNS only / grey cloud):"
  aws acm describe-certificate --certificate-arn "$CERT_ARN" --region "$CERT_REGION" \
    --query 'Certificate.DomainValidationOptions[0].ResourceRecord' --output table
  echo ""
  echo "After validation becomes ISSUED, re-run this script to finish deploy."
  echo "Then add the site CNAME below (printed after CloudFront exists)."
  if [ "${WAIT_FOR_CERT:-false}" != "true" ]; then
    exit 0
  fi
  aws acm wait certificate-validated --certificate-arn "$CERT_ARN" --region "$CERT_REGION"
fi

chmod +x "$ROOT/scripts/build-lambda.sh"
bash "$ROOT/scripts/build-lambda.sh"
aws s3 cp "$ROOT/dist/coach-lambda.zip" "s3://${ARTIFACT_BUCKET}/coach-lambda.zip" --region "$REGION"

echo "==> CloudFormation deploy ${STACK}"
aws cloudformation deploy \
  --template-file "$ROOT/infra/template.yaml" \
  --stack-name "$STACK" \
  --region "$REGION" \
  --capabilities CAPABILITY_IAM \
  --parameter-overrides \
    LambdaCodeBucket="$ARTIFACT_BUCKET" \
    LambdaCodeKey="coach-lambda.zip" \
    CustomDomainName="$CUSTOM_DOMAIN" \
    CertificateArn="$CERT_ARN" \
    AdminKey="${ADMIN_KEY:-coach-ops}" \
  --no-fail-on-empty-changeset

BUCKET=$(aws cloudformation describe-stacks --stack-name "$STACK" --region "$REGION" \
  --query "Stacks[0].Outputs[?OutputKey=='BucketName'].OutputValue" --output text)
CF_DOMAIN=$(aws cloudformation describe-stacks --stack-name "$STACK" --region "$REGION" \
  --query "Stacks[0].Outputs[?OutputKey=='CloudFrontDomain'].OutputValue" --output text)
DIST_ID=$(aws cloudformation describe-stacks --stack-name "$STACK" --region "$REGION" \
  --query "Stacks[0].Outputs[?OutputKey=='DistributionId'].OutputValue" --output text)

mkdir -p "$ROOT/dist/public"
cp -r "$ROOT/public/"* "$ROOT/dist/public/"
cat > "$ROOT/dist/public/config.js" <<'EOF'
window.COACH_CONFIG = { API_BASE: '', REFRESH_MS: 15000, LANG_ROTATE_MS: 15000 };
EOF

aws s3 sync "$ROOT/dist/public/" "s3://${BUCKET}/" --exclude "data/*" --delete --region "$REGION"
aws s3 sync "$ROOT/data/" "s3://${BUCKET}/data/" --region "$REGION"

aws cloudfront create-invalidation --distribution-id "$DIST_ID" --paths "/*" >/dev/null

echo ""
echo "======== CLOUDFLARE SITE CNAME ========"
echo "Type   : CNAME"
echo "Name   : coach-position"
echo "Target : ${CF_DOMAIN}"
echo "Proxy  : OFF (DNS only / grey cloud)"
echo ""
echo "Site   : https://${CUSTOM_DOMAIN}/?station=BG&display=entrance-main"
echo "Admin  : https://${CUSTOM_DOMAIN}/admin.html  (key: coach-ops)"
echo "CF raw : https://${CF_DOMAIN}/?station=BG&display=entrance-main"
