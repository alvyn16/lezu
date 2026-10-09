# Lezu — fresh start

A fresh Windows game-library project built around the user's Home and Sifu detail references. The interface uses TypeScript and Vite; the Windows app uses Tauri 2 and Rust.

## Selected desktop stack

The user selected **Tauri 2 + Rust + TypeScript**. The [desktop app plan](tasks/plan.md) and [ordered task checklist](tasks/todo.md) describe the implementation stages.

The browser preview uses sample games. The Windows app uses a separate SQLite library in the user's app data folder. Select an installed game's `.exe` and review its title and working folder; the entry remains across restarts. You can launch the game and open its installation folder. Settings offers a cancellable nested-folder scan and a Steam, Epic Games, and GOG scan. Store results are reviewed before import; rescans flag missing installations and restore them when found again. Nothing is deleted during a rescan.

The Windows app also has an initial **Epic account** path. In Settings, choose **Connect Epic Games** to sign in through Legendary's Epic webview, then **Refresh Epic library** to fetch owned Windows games. Owned titles appear even before installation. Open a title and choose **Download** to select an install folder; Lezu runs the download, shows reported progress, and can cancel it. Epic sessions are stored in Lezu's isolated Legendary configuration folder, not in the browser preview. **Sign out of Epic** removes the session and owned entries without deleting game files. Steam and GOG account sign-in and in-app downloads remain in development; their existing local installation scans still work. See the [account library plan](docs/account-library-plan.md).

Legendary is a community engine licensed under GPL-3.0. Lezu downloads the pinned Windows release on first use from [the Legendary project](https://github.com/legendary-gl/legendary), verifies its SHA-256 digest before execution, and stores it in Lezu's local app data. Store passwords are not entered into Lezu. Epic sign-in, ownership sync, and a real game download still need a manual Windows account test before release.

Build the local desktop executable on Windows with `npm ci` then `npm run tauri build -- --no-bundle`. Run `src-tauri/target/release/lezu.exe`. Rust 1.90 or newer with the MSVC toolchain and WebView2 are required. `npm run tauri dev` runs the native development window, while `npm run dev` runs the browser preview. The native window checks are in [the Windows checklist](docs/windows-window-checklist.md). For an installer and signed updater artifact, follow [the release guide](docs/windows-release.md).

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

The desktop host has a dark native Windows title bar and restores its last window size and position. The folder scan checks up to 20,000 entries, descends at most 10 levels, returns up to 250 candidates, and skips reparse points and common installer tools. Store scanning reads Steam, Epic Games, and GOG installation metadata in common Windows locations; unusual installations may need **Scan a folder**. Artwork refresh checks a game's local `cover`/`poster` and `hero`/`background` files, Steam's local cache, then Steam's artwork CDN. An optional IGDB Client ID and secret in Settings enable cover and screenshot lookup for other games; credentials are used for that refresh and are not saved. Preview changes reset on reload. No repository remote is configured.

## Verify

```powershell
node --test tests/*.test.mjs
cargo test --manifest-path src-tauri/Cargo.toml
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
