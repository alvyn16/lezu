# Lezu — fresh start

A fresh Windows game-library project built around the user's Home and Sifu detail references. The interface uses TypeScript and Vite; the Windows app uses Tauri 2 and Rust.

## Selected desktop stack

The user selected **Tauri 2 + Rust + TypeScript**. The [desktop app plan](tasks/plan.md) and [ordered task checklist](tasks/todo.md) describe how to preserve this interface, add Windows hosting, persist a real library, scan Steam/GOG/Epic and nested game folders, launch games, and recover artwork.

The browser preview uses sample games. The Windows app uses a separate SQLite library in the user's app data folder. Select an installed game's `.exe` and review its title and working folder; the entry remains across restarts. You can launch the game and open its installation folder. Steam, GOG, and Epic discovery are still planned.

Build the local desktop executable on Windows with `npm ci` then `npm run tauri build -- --no-bundle`. Run `src-tauri/target/release/lezu.exe`. Rust with the MSVC toolchain and WebView2 are required to build and run it. `npm run tauri dev` runs the native development window, while `npm run dev` runs the browser preview. The native window checks are in [the Windows checklist](docs/windows-window-checklist.md).

## Design and implementation plan

The interactive Home and Details prototype established the layout and behavior. The desktop app now shares that interface with a separate local library and manual game entry.

- [UI design contract](docs/ui-design.md)
- [Implementation plan](tasks/plan.md)
- [Acceptance checklist](tasks/todo.md)

## Run the preview

From this folder, run:

```powershell
npm ci
.\start-preview.ps1
```

Open [the local preview](http://127.0.0.1:4173). Stop the server with Ctrl+C. The script runs the local Vite development server.

## What works

- Home, sample library filtering, and game details in the browser preview.
- Search, store switches, counts, keyboard navigation, and screenshot dialogs.
- Per-game colors across the sidebar and content. Open a game → More → Feature on Home to change Home's featured game.
- Responsive layouts, artwork recovery, and clear empty states.

Click a cover outside its hover Play control to open details, or focus the cover and press Enter. The browser preview cannot launch games. In the Windows app, use **Add a game** to select an installed Windows executable, then Play from Home, Library, or Details.

Hover over a game shelf and turn the mouse wheel: down moves right, up moves left. The scrollbar is hidden; horizontal trackpad gestures and keyboard navigation also work. At the ends, or when every game already fits, the wheel scrolls the page normally. Ctrl+wheel retains browser zoom.

## Prototype boundaries

The eight entries are fixtures, not a scan of your computer. Source assignments, installation flags, playtime, and last-played values are demonstration data. Missing metadata remains unavailable. Palettes are curated from artwork in the fixture module; automatic color extraction is later work.

The desktop host has a dark native Windows title bar and restores its last window size and position. Its manually added games persist locally. Automatic scanning, artwork retrieval, downloads, and account integration are still pending. Preview changes reset on reload. No repository remote is configured.

## Verify

```powershell
node --test tests/*.test.mjs
```

For browser checks with the separately installed Playwright CLI, while the preview server is running:

```powershell
playwright-cli -s=lezu-fresh open http://127.0.0.1:4173 --browser=chrome
playwright-cli -s=lezu-fresh resize 980 760
playwright-cli -s=lezu-fresh run-code --filename=tests/home-browser.cjs
playwright-cli -s=lezu-fresh run-code --filename=tests/details-browser.cjs
playwright-cli -s=lezu-fresh run-code --filename=tests/edge-browser.cjs
playwright-cli -s=lezu-fresh run-code --filename=tests/wheel-browser.cjs
playwright-cli -s=lezu-fresh run-code --filename=tests/title-fallback-browser.cjs
playwright-cli -s=lezu-fresh run-code --filename=tests/resolution-browser.cjs
```

The `.cjs` browser files are Playwright CLI function snippets, not standalone Node programs. Browser checks are QA tooling and add no application dependency.

See [verification and remaining differences](docs/verification.md) and [artwork sources](docs/artwork-sources.md).
