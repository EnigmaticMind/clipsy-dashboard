import { defineManifest } from '@crxjs/vite-plugin'

// To get a stable extension ID, add your public key here
// See README for instructions on how to get the public key
// Format: "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA..."
// NOTE: This should be the PUBLIC KEY (long base64 string), NOT the extension ID
// If you have a .pem file, extract the public key using: openssl rsa -in key.pem -pubout -outform DER | base64
// Extension ID: fneojnnbgbogeopngljlphapcakjglhe

// Extension public key (always hardcoded)
// This ensures consistent extension ID across all builds (dev and production)
const EXTENSION_PUBLIC_KEY = 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAmy1SLcuqctxsNjo+onVKxm+06xKksOjRpLfkyZZ5w2zKJgVb5IfUHO5ffS/Szvr8MekF28dZTk0hecx7gTCFTLCYTI+lwMUU9gPlLAcCV6+/Uf5LhFlZf51WXbOkjYtQiak0kXximh7BKDwo5Q5siFVkYvU8EzwURZ4Bo4a9SVE5zWfXFzJ1x1GzQWch8sd9Chep74heveyvd2QZbqT0v/LzsL1ksGnfMeQa6f3WoWZMYQbDaJ+xNocF/xvNl2s1GbK+G/BHU2WwMui7oo4x/Gel+Q8lv6l84IrkhYnuFg2YnIWVYPnhcFvMHTNNm29saZnYkCSQ/7GE8HuZaA/EFQIDAQAB'
import packageData from '../package.json';

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
  name: `Clipsy - Etsy Listing Manager (Early Demo)`,
  description: `Early demo: Bulk edit Etsy listings with CSV. Download, edit in Excel/Sheets, upload with preview. Seeking feedback & suggestions!`,
  version: packageDataTyped.version,
  manifest_version: 3,
}

// Add key field for stable extension ID
manifestConfig.key = EXTENSION_PUBLIC_KEY

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
    'sidePanel',
  ],
  oauth2: {
    client_id: '991784404129-o476qs97mc2p4cvsd35h18tg247357pc.apps.googleusercontent.com',
    scopes: [
      'https://www.googleapis.com/auth/spreadsheets',
      'https://www.googleapis.com/auth/drive.readonly'
    ]
  },
  host_permissions: [
    'https://api.etsy.com/*',
    'https://openapi.etsy.com/*',
    'https://www.etsy.com/*',
    'https://generativelanguage.googleapis.com/*',
    'https://accounts.google.com/*',
    'https://oauth2.googleapis.com/*',
    'https://www.googleapis.com/*',
    'https://sheets.googleapis.com/*',
    'https://www.googleapis.com/auth/spreadsheets',
    'https://www.googleapis.com/auth/drive.readonly',
    'https://www.googletagmanager.com/*',
    'https://www.google-analytics.com/*',
  ],
  // Content scripts disabled - focusing on core features
  // content_scripts: [
  //   {
  //     matches: ['https://www.etsy.com/your/shops/me/listing-editor/edit/*'],
  //     js: ['src/content/etsyEditor.ts'],
  //     run_at: 'document_start',
  //   },
  //   {
  //     matches: ['https://docs.google.com/spreadsheets/d/*'],
  //     js: ['src/content/googleSheets.ts'],
  //     run_at: 'document_start',
  //   },
  // ],
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

