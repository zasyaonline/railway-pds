#!/usr/bin/env bash
# Build Lambda deployment package (services + dependencies)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LAMBDA_DIR="$ROOT/lambda"
DIST="$ROOT/dist"

echo "==> Building Lambda package..."
rm -rf "$DIST/lambda-build" "$DIST/lambda.zip"
mkdir -p "$DIST/lambda-build"

# Copy handler code
cp "$LAMBDA_DIR/refresh.js" "$LAMBDA_DIR/api.js" "$LAMBDA_DIR/coachRefresh.js" "$DIST/lambda-build/"
cp -r "$LAMBDA_DIR/lib" "$DIST/lambda-build/"

# Copy shared services (NTES fetch logic)
cp -r "$ROOT/services" "$DIST/lambda-build/services"

# Coach Position poller + Save (reuse this zip; no dedicated Coach Lambda)
mkdir -p "$DIST/lambda-build/coach-services"
cp "$ROOT/coach-position/services/"*.js "$DIST/lambda-build/coach-services/"
perl -pi -e "s|require\\('../../services/ntesClient'\\)|require('../services/ntesClient')|g" \
  "$DIST/lambda-build/coach-services/liveBoardService.js" \
  "$DIST/lambda-build/coach-services/compositionService.js" || true

# Install production dependencies
cp "$LAMBDA_DIR/package.json" "$DIST/lambda-build/"
cd "$DIST/lambda-build"
npm install --omit=dev --silent

# Zip (exclude junk)
zip -r -q "$DIST/lambda.zip" . -x "*.git*"

echo "==> Built $DIST/lambda.zip ($(du -h "$DIST/lambda.zip" | cut -f1))"
