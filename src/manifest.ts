import { defineManifest } from '@crxjs/vite-plugin'

// To get a stable extension ID, add your public key here
// See README for instructions on how to get the public key
// Format: "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA..."
// NOTE: This should be the PUBLIC KEY (long base64 string), NOT the extension ID
// If you have a .pem file, extract the public key using: openssl rsa -in key.pem -pubout -outform DER | base64
const EXTENSION_PUBLIC_KEY: string | undefined = process.env.EXTENSION_PUBLIC_KEY || undefined;
import packageData from '../package.json';

// Check if we're in development mode
interface ImportMetaEnv {
  MODE?: string;
}

interface ImportMeta {
  env?: ImportMetaEnv;
}

const isDev = (import.meta as ImportMeta).env?.MODE === 'development';

// Build manifest with optional key field
interface PackageData {
  name: string;
  version: string;
  displayName?: string;
  description?: string;
}

const packageDataTyped = packageData as PackageData;
const manifestConfig: {
  name: string;
  description: string;
  version: string;
  manifest_version: number;
  key?: string;
} = {
  name: `${packageDataTyped.displayName || packageDataTyped.name}${isDev ? ` ➡️ Dev` : ''}`,
  description: packageDataTyped.description || 'Bulk edit and manage your Etsy listings with CSV import/export',
  version: packageDataTyped.version,
  manifest_version: 3,
}

// Add key field for stable extension ID (if public key is provided)
if (EXTENSION_PUBLIC_KEY) {
  manifestConfig.key = EXTENSION_PUBLIC_KEY
}

export default defineManifest({
  ...manifestConfig,
  background: {
    service_worker: 'src/background.ts',
    type: 'module',
  },
  action: {
    default_icon: {
      16: 'public/pwa-192x192.png',
      32: 'public/pwa-192x192.png',
      48: 'public/pwa-192x192.png',
      128: 'public/pwa-512x512.png',
    },
    default_title: 'Open Clipsy Dashboard',
  },
  icons: {
    16: 'public/pwa-192x192.png',
    32: 'public/pwa-192x192.png',
    48: 'public/pwa-192x192.png',
    128: 'public/pwa-512x512.png',
  },
  permissions: [
    'storage',
    'tabs',
    'identity',
  ],
  host_permissions: [
    'https://api.etsy.com/*',
    'https://openapi.etsy.com/*',
    'https://www.etsy.com/*',
    'https://generativelanguage.googleapis.com/*',
  ],
  content_scripts: [
    {
      matches: ['https://www.etsy.com/your/shops/me/listing-editor/edit/*'],
      js: ['src/content/etsyEditor.ts'],
      run_at: 'document_idle',
    },
  ],
  web_accessible_resources: [
    {
      resources: [
        'dashboard.html',
        'public/*',
      ],
      matches: ['<all_urls>'],
    },
  ],
})

