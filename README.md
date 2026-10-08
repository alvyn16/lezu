# Lezu — fresh start

A fresh Windows game-library project built around the user's Home and Sifu detail references. Its first deliverable is an interactive browser UI prototype, written from scratch in HTML, CSS, and JavaScript.

## First deliverable

A local, interactive Home and game-details prototype. Verify the appearance and navigation before introducing real library discovery, launcher integrations, or persistence.

- [UI design contract](docs/ui-design.md)
- [Implementation plan](tasks/plan.md)
- [Acceptance checklist](tasks/todo.md)

## Run the preview

From this folder, run:

```powershell
.\start-preview.ps1
```

Open [the local preview](http://127.0.0.1:4173). Stop the server with Ctrl+C. Python is required; no npm installation is needed. The underlying command is `python -m http.server 4173 --bind 127.0.0.1 --directory ui`.

## What works

- Home, sample library filtering, and game details.
- Search, store switches, counts, keyboard navigation, and screenshot dialogs.
- Per-game colors across the sidebar and content. Open a game → More → Feature on Home to change Home's featured game.
- Responsive layouts, artwork recovery, and clear empty states.

Click a cover outside its hover Play control to open details, or focus the cover and press Enter. Play explains that native launching is pending.

Hover over a game shelf and turn the mouse wheel: down moves right, up moves left. The scrollbar is hidden; horizontal trackpad gestures and keyboard navigation also work. At the ends, or when every game already fits, the wheel scrolls the page normally. Ctrl+wheel retains browser zoom.

## Prototype boundaries

The eight entries are fixtures, not a scan of your computer. Source assignments, installation flags, playtime, and last-played values are demonstration data. Missing metadata remains unavailable. Palettes are curated from artwork in the fixture module; automatic color extraction is later work.

No desktop host, executable, real scanning, launching, downloads, account integration, persistence, or native window controls exist yet. Changes reset on reload. Windows desktop integration follows visual approval under `AGENTS.md`. No repository remote is configured.

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
