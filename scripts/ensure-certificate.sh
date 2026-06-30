#!/usr/bin/env bash
# Obtain or reuse ACM certificate for CloudFront (us-east-1)
set -euo pipefail

CUSTOM_DOMAIN="${1:-platform.zasya.online}"
CERT_REGION="us-east-1"

CERT_ARN=$(aws acm list-certificates --region "$CERT_REGION" \
  --query "CertificateSummaryList[?DomainName=='${CUSTOM_DOMAIN}'].CertificateArn | [0]" \
  --output text)

if [ -z "$CERT_ARN" ] || [ "$CERT_ARN" = "None" ]; then
  echo "==> Requesting new ACM certificate for ${CUSTOM_DOMAIN}..."
  CERT_ARN=$(aws acm request-certificate \
    --domain-name "$CUSTOM_DOMAIN" \
    --validation-method DNS \
    --region "$CERT_REGION" \
    --query CertificateArn --output text)
fi

STATUS=$(aws acm describe-certificate \
  --certificate-arn "$CERT_ARN" --region "$CERT_REGION" \
  --query 'Certificate.Status' --output text)

echo "CertificateArn=$CERT_ARN"
echo "Status=$STATUS"

if [ "$STATUS" = "PENDING_VALIDATION" ]; then
  echo ""
  echo "Add this CNAME in Cloudflare (DNS only / grey cloud):"
  aws acm describe-certificate \
    --certificate-arn "$CERT_ARN" --region "$CERT_REGION" \
    --query 'Certificate.DomainValidationOptions[0].ResourceRecord' \
    --output table
fi
