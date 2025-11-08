#!/bin/bash
# Script to extract public key from .pem file for Chrome extension manifest
# Usage: ./extract-public-key.sh [path-to-key.pem]

PEM_FILE="${1:-key.pem}"

if [ ! -f "$PEM_FILE" ]; then
    echo "Error: $PEM_FILE not found"
    echo "Usage: ./extract-public-key.sh [path-to-key.pem]"
    exit 1
fi

echo "Extracting public key from $PEM_FILE..."
echo ""

# Extract public key in DER format, then base64 encode
PUBLIC_KEY=$(openssl rsa -in "$PEM_FILE" -pubout -outform DER 2>/dev/null | base64)

if [ -z "$PUBLIC_KEY" ]; then
    echo "Error: Failed to extract public key. Make sure openssl is installed."
    exit 1
fi

echo "Public key (copy this to src/manifest.ts):"
echo ""
echo "$PUBLIC_KEY"
echo ""
echo "Extension ID that will be generated:"
# Calculate extension ID from public key (first 32 chars of base32 encoded SHA256 of public key)
EXT_ID=$(echo -n "$PUBLIC_KEY" | openssl dgst -sha256 -binary | base32 | tr '[:upper:]' '[:lower:]' | head -c 32 | sed 's/=//g')
echo "$EXT_ID"
echo ""
echo "Your redirect URL will be: https://${EXT_ID}.chromiumapp.org/auth"

