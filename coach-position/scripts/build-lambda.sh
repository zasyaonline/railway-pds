#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DIST="$ROOT/dist"
BUILD="$DIST/lambda-build"
rm -rf "$BUILD" "$DIST/coach-lambda.zip"
mkdir -p "$BUILD"
cp "$ROOT/lambda/api.js" "$ROOT/lambda/refresh.js" "$BUILD/"
cp -r "$ROOT/services" "$BUILD/services"
# parent NTES client for live board + composition
mkdir -p "$BUILD/parent-services"
cp "$ROOT/../services/ntesClient.js" "$ROOT/../services/ntesCrypto.js" \
  "$ROOT/../services/sessionService.js" "$BUILD/parent-services/" 2>/dev/null || true
# rewrite require paths for lambda bundle layout
perl -pi -e "s|require\\('../../services/ntesClient'\\)|require('../parent-services/ntesClient')|g" \
  "$BUILD/services/compositionService.js" \
  "$BUILD/services/liveBoardService.js" || true
perl -pi -e "s|require\\('../../services/ntesClient'\\)|require('./parent-services/ntesClient')|g" \
  "$BUILD/api.js" || true
perl -pi -e "s|require\\('../../services/sessionService'\\)|require('./parent-services/sessionService')|g" \
  "$BUILD/api.js" || true
cp "$ROOT/lambda/package.json" "$BUILD/"
cd "$BUILD"
npm install --omit=dev --silent
zip -r -q "$DIST/coach-lambda.zip" .
echo "Built $DIST/coach-lambda.zip"
