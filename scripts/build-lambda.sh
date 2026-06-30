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
cp "$LAMBDA_DIR/refresh.js" "$LAMBDA_DIR/api.js" "$DIST/lambda-build/"
cp -r "$LAMBDA_DIR/lib" "$DIST/lambda-build/"

# Copy shared services (NTES fetch logic)
cp -r "$ROOT/services" "$DIST/lambda-build/services"

# Install production dependencies
cp "$LAMBDA_DIR/package.json" "$DIST/lambda-build/"
cd "$DIST/lambda-build"
npm install --omit=dev --silent

# Zip (exclude junk)
zip -r -q "$DIST/lambda.zip" . -x "*.git*"

echo "==> Built $DIST/lambda.zip ($(du -h "$DIST/lambda.zip" | cut -f1))"
