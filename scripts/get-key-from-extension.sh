#!/bin/bash
# Script to extract public key from a published Chrome extension
# Usage: ./get-key-from-extension.sh <extension-id>

EXT_ID="${1:-fneojnnbgbogeopngljlphapcakjglhe}"

echo "Getting public key for extension ID: $EXT_ID"
echo ""

# Method 1: If you have the .crx file
if [ -f "${EXT_ID}.crx" ]; then
    echo "Found .crx file, extracting key..."
    unzip -p "${EXT_ID}.crx" manifest.json | grep -o '"key":"[^"]*"' | cut -d'"' -f4
    exit 0
fi

# Method 2: If you have the unpacked extension directory
if [ -d "dist" ] && [ -f "dist/manifest.json" ]; then
    echo "Checking dist/manifest.json..."
    if grep -q '"key"' dist/manifest.json; then
        grep -o '"key":"[^"]*"' dist/manifest.json | cut -d'"' -f4
        exit 0
    fi
fi

echo "To get the public key for extension ID $EXT_ID:"
echo ""
echo "Option 1: If you have the .pem file:"
echo "  ./extract-public-key.sh your-key.pem"
echo ""
echo "Option 2: If you have the published extension:"
echo "  1. Download the .crx file from Chrome Web Store"
echo "  2. Rename it to ${EXT_ID}.crx"
echo "  3. Run: unzip -p ${EXT_ID}.crx manifest.json | grep -o '\"key\":\"[^\"]*\"' | cut -d'\"' -f4"
echo ""
echo "Option 3: If the extension is already loaded in Chrome:"
echo "  1. Go to chrome://extensions/"
echo "  2. Find extension with ID $EXT_ID"
echo "  3. Click 'Pack extension'"
echo "  4. Extract the key from the generated .crx file"
echo ""

