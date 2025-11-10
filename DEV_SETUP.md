# Development Setup with Live Reload

## Quick Start

1. **Start the dev server in watch mode:**
   ```bash
   npm run dev
   ```
   This runs `vite build --watch` which will automatically rebuild when you save files.

2. **Load the extension in Chrome:**
   - Open Chrome and go to `chrome://extensions/`
   - Enable "Developer mode" (toggle in top right)
   - Click "Load unpacked"
   - Select the `dist/` folder from this project
   - The extension will load

3. **Make changes:**
   - Edit any file in `src/`
   - Save the file
   - The extension will automatically rebuild (watch the terminal for "build completed")
   - **Reload the extension** in `chrome://extensions/` by clicking the reload button (🔄)
   - Your changes will be live!

## How Live Reload Works

The `@crxjs/vite-plugin` automatically:
- ✅ Watches for file changes
- ✅ Rebuilds the extension on save
- ✅ Outputs to `dist/` directory

**Important:** Chrome extensions don't auto-reload by default. After the build completes:
- You'll see a notification in the terminal when files change
- Click the reload button (🔄) in `chrome://extensions/` to see your changes
- Or use a Chrome extension like "Extensions Reloader" for automatic reloading

## Content Scripts

Content scripts (like `etsyEditor.ts`) that inject into Etsy pages:
- Will rebuild automatically
- **Require a page refresh** to see changes (the Etsy page needs to reload)

## Tips

- Keep the dev server running while developing
- Watch the terminal for build errors
- The `dist/` folder is automatically generated - don't edit it directly
- If you see build errors, check the terminal output

## Troubleshooting

**Extension not reloading?**
- Manually click the reload button in `chrome://extensions/`
- Or install "Extensions Reloader" Chrome extension

**Changes not appearing?**
- Make sure the dev server is running (`npm run dev`)
- Check that you're reloading the correct extension in Chrome
- Clear browser cache if needed

**Build errors?**
- Check the terminal output for specific error messages
- Make sure all dependencies are installed (`npm install`)

