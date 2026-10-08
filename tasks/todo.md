# Fresh UI prototype tasks

## 1. Shared shell and design tokens

- [x] Create the preview entry point, shell module, and shared token stylesheet.
- [x] Sidebar rows, selected state, provider marks, and top search follow the reference layout.
- [x] Keyboard focus and accessible control names work.
- Verify: run the local preview command and compare a 980 × 760 screenshot with the supplied Home image.
- Dependencies: approved plan.
- Likely files: `ui/index.html`, `ui/app.js`, `ui/shell.js`, `ui/tokens.css`, `ui/shell.css`.

## 2. Home screen

- [x] Hero, game title/logo, Play/info controls, horizontal covers, and Stores follow the design contract.
- [x] Two fixture games show different complete-shell themes.
- [x] Search and source filtering have a meaningful empty state.
- Verify: inspect Home at 980 × 760 and 1920 × 1080; navigate the cover shelf with the keyboard.
- Dependencies: 1.
- Likely files: `ui/home.js`, `ui/home.css`, `ui/fixtures.js`, `ui/state.js`.

## Checkpoint: Home review

- [x] Reference comparison records typography, icon, spacing, and position differences.
- [x] Correct visible differences before proceeding to Details.

## 3. Details screen

- [x] Back/search, game artwork, action row, stats, About, and screenshot strip follow the Details reference.
- [x] Game selection updates the theme and facts; unknown facts have honest states.
- [x] Stats and description reflow in narrow windows without overlap.
- Verify: open each fixture game, return to Home, and compare a screenshot with the supplied Details image.
- Dependencies: 2.
- Likely files: `ui/details.js`, `ui/details.css`, `ui/app.js`, `ui/fixtures.js`.

## 4. State and accessibility verification

- [x] Focus survives navigation and source switching; offscreen covers become visible when focused.
- [x] Empty results, missing artwork, disabled sources, and long names behave correctly.
- [x] Fixture/state checks pass with `node --test tests/*.test.mjs`.
- Verify: focused state tests and a complete keyboard walkthrough.
- Dependencies: 3.
- Likely files: `tests/state.test.mjs`, `ui/state.js`, `ui/app.js`.

## 5. Resolution and visual finish

- [x] Compare Home/details at the reference size, compact size, standard Windows sizes, and 4K.
- [x] Check 100%, 125%, 150%, and 200% scaling, reduced motion, and text contrast.
- [x] Deliver the preview and screenshots with an honest list of remaining differences and unavailable native actions.
- Verify: browser render/interaction checks and saved screenshots; no console errors or horizontal page overflow.
- Dependencies: 4.
- Likely files: shared/screen CSS files and `docs/verification.md`.

## Checkpoint: UI approval

- [ ] The user approves the visible UI before native hosting, real game discovery, launching, or publication.

---

# Windows desktop app tasks — Tauri 2 + Rust + TypeScript

Prepared October 7, 2026. Stack selected by the user; desktop implementation has not started. Preserve the prototype checklist above. Full decisions and scope are in `plan.md`.

For each task, run the focused verification below and the applicable type/build checks. Commands referring to new scripts are planned until D01/D04/D05 introduce them. Each task targets a small (1–2 files) or medium (3–5 files) change; the listed paths are estimates, not a reason to exceed the scope. Split a task if implementation grows. Task numbers are stable identifiers.

## Stage 1: Typed interface and Windows host

### D01 — Frontend build setup

- [ ] Add strict TypeScript and Vite configuration without changing the rendered interface; preserve current tests while JS and TS coexist.
- [ ] Development/preview uses loopback and a strict port; production assets resolve without the Python server.
- Verify: `npm run typecheck`, `npm run build`, existing `npm test`; compare Home preview with baseline.
- Dependencies: none. Files: `package.json`, `package-lock.json`, `tsconfig.json`, `vite.config.ts`, `.gitignore`. Scope: medium.

### D02 — Typed library view model

- [ ] Define nullable game/installation/artwork DTOs and migrate fixture/state modules to strict TS; no untyped escape hatches for library records.
- [ ] Current demo counts, filtering, featured game and missing values behave identically; real/demo source modes are explicit.
- Verify: migrated focused state tests and typecheck; demo fixture counts remain correct.
- Dependencies: D01. Files: `ui/domain/models.ts`, `ui/fixtures.ts`, `ui/state.ts`, `tests/state.test.mjs`, `ui/services/demo.ts`. Scope: medium.

### Checkpoint — Typed data

- [ ] Existing frontend checks pass; current visual appearance and demo labeling remain intact.

### D03 — Typed shell and Home

- [ ] Convert shell/Home/shelf modules to TS, preserving typography, control placement, enlarged covers and blur.
- [ ] Mouse wheel, keyboard access, See All and source switches retain current behavior.
- Verify: Home/wheel browser regressions and screenshots at 980×760 and 1920×1080.
- Dependencies: D02. Files: `ui/shell.ts`, `ui/home.ts`, `ui/shelf-scroll.ts`, `tests/home-browser.cjs`, `tests/wheel-browser.cjs`. Scope: medium.

### D04 — Typed Details and application entry

- [ ] Convert Details and the app entry, handling nullable metadata and DOM types explicitly.
- [ ] Navigation/focus, artwork failure/title fallback, dialogs and Library layouts remain correct; add a repeatable `test:ui` script.
- Verify: Details/edge/title-fallback/resolution regressions, `npm run typecheck`, `npm run build`, `npm run test:ui`.
- Dependencies: D03. Files: `ui/details.ts`, `ui/app.ts`, `ui/index.html`, `package.json`, `tests/run-ui.mjs`. Scope: medium.

### Checkpoint — Latest UI review

- [ ] Latest typed preview passes the visual checks and the user approves its appearance before native integration, as required by AGENTS.md.
- [ ] Record which current visual revision was reviewed; the earlier unchecked UI gate remains traceable.

### D05 — Minimal Tauri host

- [ ] Verify Rust/MSVC/WebView2 prerequisites; create the Tauri 2 host for Windows x64 using the existing frontend distribution.
- [ ] Native development and a production executable open the UI; the production executable works after the dev server stops.
- Verify: `npm run build`, `cargo check --manifest-path src-tauri/Cargo.toml`, `cargo run --manifest-path src-tauri/Cargo.toml` and production native smoke. The CLI development script follows in D06.
- Dependencies: D04 and UI checkpoint. Files: `src-tauri/Cargo.toml`, `src-tauri/build.rs`, `src-tauri/src/lib.rs`, `src-tauri/src/main.rs`, `src-tauri/tauri.conf.json`. Scope: medium; add generated Cargo lockfile with this task.

### D06 — Restricted desktop bridge

- [ ] Add the npm Tauri entry script/API dependency and minimal capabilities/CSP; frontend bridge distinguishes native from explicit demo mode.
- [ ] Verify a typed harmless command round trip; remote content cannot invoke native commands and invalid payloads produce readable errors.
- Verify: bridge contract test, `npm run tauri dev`, native smoke, review effective command/window permissions.
- Dependencies: D05. Files: `package.json`, `package-lock.json`, `src-tauri/capabilities/main.json`, `src-tauri/src/lib.rs`, `ui/services/desktop.ts`. Scope: medium.

### Checkpoint — Native startup

- [ ] Production app opens offline with local assets; native bridge works and demo data remains isolated.

### D07 — Windows title bar

- [ ] Use a black title bar with Windows caption buttons; choose native or extended implementation based on actual host behavior.
- [ ] Dragging, double-click, resize, maximize/restore, minimize and close work; caption controls never disappear when maximized.
- Verify: native window smoke plus Win+Arrow, Alt+Space, drag-to-top, Snap layouts and restore-by-drag on Windows.
- Dependencies: D06. Files: `src-tauri/src/window.rs`, `src-tauri/src/lib.rs`, `src-tauri/tauri.conf.json`, `ui/shell.css`, `docs/windows-window-checklist.md`. Scope: medium.

### D08 — Native scaling and placement

- [ ] Restore window bounds on an available monitor; enforce a tested minimum size and respect work area/taskbar bounds.
- [ ] No white frame, hidden controls, overlap, double-scaled text or broken blur at 100/125/150/200% scale and monitor transitions.
- Verify: native resolution matrix and compare WebView2 Home/Details with browser references; record actual machine/display conditions.
- Dependencies: D07. Files: `src-tauri/src/window.rs`, `ui/shell.css`, `docs/windows-window-checklist.md`, `docs/verification.md`. Scope: medium.

### Checkpoint — Desktop shell

- [ ] Maintainer verifies the native title bar, Snap, scaling and approved UI on their Windows machine.

## Stage 2: A persistent real game

### D09 — SQLite foundation

- [ ] Create versioned migrations for the minimal game/installation/preferences model in per-user app data; add remaining tables with the relevant later slices.
- [ ] Migration failures roll back; restart preserves valid records and never seeds fixtures into the real library.
- Verify: fresh/open-again/migration-failure tests with temporary databases; `cargo test --manifest-path src-tauri/Cargo.toml`.
- Dependencies: D06. Files: `src-tauri/Cargo.toml`, `src-tauri/src/library/mod.rs`, `src-tauri/src/library/migrations.rs`, `src-tauri/src/domain/mod.rs`, `src-tauri/tests/storage.rs`. Scope: medium; update lockfile with dependency changes.

### D10 — Library query commands

- [ ] Expose library/detail/settings queries with stable IDs and structured errors; one game can retain multiple installation records.
- [ ] Representative Rust payloads match TS contracts, including unknown metadata and missing-install states.
- Verify: repository/DTO contract tests, invalid-ID errors and native bridge readback.
- Dependencies: D09, D02. Files: `src-tauri/src/commands/library.rs`, `src-tauri/src/lib.rs`, `ui/services/desktop.ts`, `ui/domain/models.ts`, `src-tauri/tests/contracts.rs`. Scope: medium.

### D11 — Real library interface

- [ ] Connect Home/Library/Details to desktop library queries; initial empty state offers scanning/manual addition.
- [ ] Loading/error/retry states preserve focus and navigation; unavailable metadata is never filled with demo values.
- Verify: empty/populated/multiple-install/error UI cases and native restart smoke.
- Dependencies: D10, D04. Files: `ui/app.ts`, `ui/home.ts`, `ui/details.ts`, `ui/state.ts`, `tests/library-browser.cjs`. Scope: medium.

### Checkpoint — Persistent library

- [ ] Empty real mode, explicit demo mode, persistence and query error states work end to end.

### D12 — Manual game entry

- [ ] Native picker and small dialog let the user select a game executable, title and working directory; validate paths in Rust.
- [ ] Saved entry survives restart, supports spaces/Unicode and duplicate review, and appears in All Games/Installed without a false provider identity.
- Verify: manual import integration test and native picker/save/restart walkthrough.
- Dependencies: D11. Files: `src-tauri/src/commands/manual.rs`, `src-tauri/src/lib.rs`, `ui/app.ts`, `ui/services/desktop.ts`, `src-tauri/capabilities/main.json`. Scope: medium.

### D13 — Validated launch and folder reveal

- [ ] Launch by stored installation ID with a validated executable and argument vector; reveal its existing install folder.
- [ ] Missing/invalid targets and duplicate in-flight requests have honest errors; successful dispatch does not claim measured playtime.
- Verify: harmless test executable records working directory/arguments; missing-file tests; maintainer manually launches one chosen game.
- Dependencies: D12. Files: `src-tauri/src/launch/mod.rs`, `src-tauri/src/commands/launch.rs`, `src-tauri/src/lib.rs`, `ui/app.ts`, `src-tauri/tests/launch.rs`. Scope: medium.

### Checkpoint — First useful desktop app

- [ ] Add a real game, restart Lezu, open Details, reveal its folder and dispatch Play successfully.

## Stage 3: Nested folder discovery

### D14 — Scan jobs

- [ ] Add persisted scan roots/run records, typed job status/progress, cancel command and a bounded background coordinator.
- [ ] Job IDs prevent stale updates; duplicate scans are controlled, and cancellation reaches a terminal state without losing existing records.
- Verify: coordinator cancellation/concurrency/status tests and native progress round trip.
- Dependencies: D11. Files: `src-tauri/src/discovery/mod.rs`, `src-tauri/src/commands/scan.rs`, `src-tauri/src/library/migrations.rs`, `ui/services/desktop.ts`, `src-tauri/tests/scan_jobs.rs`. Scope: medium; command registration is a separate small follow-up if needed.

### D15 — Recursive folder walker

- [ ] Scan selected roots iteratively with explicit depth/entry budgets, permission-error recovery and cancellation; skip junctions/reparse points by default.
- [ ] Nested executable evidence becomes reviewable candidates; known setup/uninstall/tool executables are excluded and overlapping roots do not duplicate candidates.
- Verify: temporary nested trees, depth/entry limits, inaccessible/missing roots, loop/reparse fixtures, mixed-case/Unicode paths.
- Dependencies: D14. Files: `src-tauri/src/discovery/folders.rs`, `src-tauri/src/discovery/path.rs`, `src-tauri/src/discovery/mod.rs`, `src-tauri/tests/folder_scan.rs`. Scope: medium.

### D16 — Review and import scan results

- [ ] Settings allows choosing roots and starting/cancelling scans; progress/warnings and candidate review explain which executable would be imported.
- [ ] Confirmed imports persist; repeating a scan is idempotent, and incomplete scans cannot delete or mark existing installations missing.
- Verify: scan nested fixture → review → import → restart → harmless launch; partial-scan reconciliation test.
- Dependencies: D15, D13. Files: `ui/settings.ts`, `ui/app.ts`, `src-tauri/src/discovery/reconcile.rs`, `src-tauri/src/commands/scan.rs`, `src-tauri/tests/reconciliation.rs`. Scope: medium.

### Checkpoint — Subfolder discovery

- [ ] C: and another configured drive work; cancellation, limits and inaccessible folders are visible and preserve the library.

## Stage 4: Provider integrations

### D17 — Steam installation reader

- [ ] Verify client discovery, library-root metadata and installed-app manifests; parse only validated installed evidence.
- [ ] Additional libraries, stale paths and malformed manifests produce scoped warnings without ending the entire scan.
- Verify: scrubbed metadata fixtures plus actual local roots; expected installed game IDs match the maintainer's inventory.
- Dependencies: D15. Files: `src-tauri/src/discovery/steam.rs`, `src-tauri/tests/steam.rs`, `tests/fixtures/steam/*`, `docs/provider-support.md`. Scope: medium; fixture files are data, keep implementation bounded.

### D18 — Steam scan-to-launch flow

- [ ] Reconcile Steam results into the shared library and derive a verified Steam launch identity; repeated scans preserve user data.
- [ ] Play dispatch and missing Steam/protocol states behave correctly; Steam is not required for manually configured executable launches.
- Verify: Steam scan/import/restart native flow, reconciliation tests, maintainer-selected real Steam launch.
- Dependencies: D17, D16. Files: `src-tauri/src/discovery/mod.rs`, `src-tauri/src/launch/steam.rs`, `src-tauri/src/launch/mod.rs`, `src-tauri/tests/steam_flow.rs`. Scope: medium.

### Checkpoint — Steam

- [ ] Installed games and paths verified on the real machine; source counts and Home/Details reflect persisted results.

### D19 — GOG installation reader

- [ ] Investigate current registry/Galaxy/local GOG evidence and standalone installations; document verified support and remaining unknown formats.
- [ ] Read both applicable registry views, validate nested roots and launch evidence, and avoid requiring Galaxy for standalone games.
- Verify: sanitized registry/metadata fixtures, malformed/stale records and actual maintainer-confirmed GOG installations.
- Dependencies: D15. Files: `src-tauri/src/discovery/gog.rs`, `src-tauri/src/discovery/registry.rs`, `src-tauri/tests/gog.rs`, `tests/fixtures/gog/*`, `docs/provider-support.md`. Scope: medium.

### D20 — GOG scan-to-launch flow

- [ ] Import supported GOG installations and select validated launch targets/working directories; uncertain executables remain review-needed.
- [ ] Repeated scans preserve annotations; missing Galaxy does not block verified direct launches.
- Verify: Galaxy-present/absent fixtures, nested GOG import/restart/folder flow, maintainer-selected real GOG launch.
- Dependencies: D19, D16. Files: `src-tauri/src/discovery/mod.rs`, `src-tauri/src/launch/gog.rs`, `src-tauri/src/launch/mod.rs`, `src-tauri/tests/gog_flow.rs`. Scope: medium.

### Checkpoint — GOG

- [ ] Installed GOG titles agree with verified local evidence, or unsupported evidence has a clear manual-root/import fallback.

### D21 — Epic installation reader

- [ ] Verify current local installed-game manifest paths/formats and parse stable provider IDs plus validated install roots.
- [ ] Missing/corrupt/stale records and custom installation locations produce scoped warnings; no account-owned catalog is invented.
- Verify: sanitized Epic fixtures and actual maintainer-confirmed installed titles/paths.
- Dependencies: D15. Files: `src-tauri/src/discovery/epic.rs`, `src-tauri/tests/epic.rs`, `tests/fixtures/epic/*`, `docs/provider-support.md`. Scope: medium.

### D22 — Epic scan-to-launch flow

- [ ] Persist Epic discoveries and use a verified launcher dispatch mechanism; ambiguous/missing launch identities need review.
- [ ] Missing launcher/protocol errors are actionable; repeated scans preserve data and multiple-source installations remain selectable.
- Verify: import/restart/missing-launcher tests plus maintainer-selected real Epic launch.
- Dependencies: D21, D16. Files: `src-tauri/src/discovery/mod.rs`, `src-tauri/src/launch/epic.rs`, `src-tauri/src/launch/mod.rs`, `src-tauri/tests/epic_flow.rs`. Scope: medium.

### Checkpoint — All three providers

- [ ] Verify Steam, GOG and Epic independently; report discovered/review-needed counts and supported evidence, without claiming untested formats.

## Stage 5: Artwork, colors and settings

### D23 — Shared local artwork resolver

- [ ] Add artwork/cache records and discover validated available local images; all screens use the same role/revision resolver.
- [ ] User-selected images work; missing/corrupt art produces a neutral fallback and never hides a game or overlaps Play controls.
- Verify: grid/Home/Details consistency, corrupt image and missing-logo regressions; restart/cache tests.
- Dependencies: D11, D18. Files: `src-tauri/src/artwork/mod.rs`, `src-tauri/src/library/migrations.rs`, `ui/services/artwork.ts`, `ui/app.ts`, `src-tauri/tests/artwork.rs`. Scope: medium.

### D24 — Artwork refresh and recovery

- [ ] Select/document supported remote art sources after verifying identifiers and access requirements; optional services never block basic game use.
- [ ] Identity-aware refresh uses bounded retries, image validation and atomic cache writes; failed refresh preserves usable art and ambiguous matches need confirmation.
- Verify: HTTP/image fixtures for timeout, bad content and retry; the same successful cover appears in Library and Details without manual per-screen repair.
- Dependencies: D23, D22. Files: `src-tauri/src/artwork/refresh.rs`, `src-tauri/src/commands/artwork.rs`, `ui/services/artwork.ts`, `src-tauri/tests/artwork_refresh.rs`, `docs/artwork-sources.md`. Scope: medium.

### D25 — Automatic game palettes

- [ ] Derive/cache palettes from real artwork and update the page, sidebar, search and controls for the featured/opened game.
- [ ] Text/control contrast passes; dark, bright and missing artwork have readable fallbacks and refreshes do not create abrupt theme flashes.
- Verify: varied palette/image fixtures, contrast assertions and native visual comparisons for distinctly colored games.
- Dependencies: D23. Files: `src-tauri/src/artwork/palette.rs`, `ui/services/artwork.ts`, `ui/tokens.css`, `src-tauri/tests/palettes.rs`, `tests/theme-browser.cjs`. Scope: medium.

### Checkpoint — Real artwork

- [ ] Covers agree across screens; game colors follow real artwork; offline cached art and failure states remain usable.

### D26 — Favorites and featured game

- [ ] Persist favorite/featured choices using stable IDs and expose them through compact existing game actions.
- [ ] Provider rescans and temporary missing installs preserve choices; if a featured game becomes unavailable, Home presents an honest fallback.
- Verify: persistence/rescan tests and keyboard action/restart walkthrough.
- Dependencies: D11, D16. Files: `src-tauri/src/commands/library.rs`, `ui/app.ts`, `ui/state.ts`, `src-tauri/tests/preferences.rs`. Scope: medium.

### D27 — Complete Settings flow

- [ ] Persist source visibility, scan roots/budgets and display preferences; clear wording distinguishes hiding a source from disabling its scan.
- [ ] Changes apply without resetting navigation/focus; duplicate Stores panels stay absent from Library/search and Downloads remains honestly unavailable.
- Verify: settings/save/restart and source-count/search cases, native folder picker accessibility.
- Dependencies: D16, D22, D25. Files: `ui/settings.ts`, `ui/app.ts`, `src-tauri/src/commands/settings.rs`, `src-tauri/src/library/mod.rs`, `tests/settings-browser.cjs`. Scope: medium.

### D28 — Recovery and diagnostics

- [ ] Centralize readable errors with bounded local diagnostic logs; show useful scan warnings and retries without raw internal errors in ordinary UI copy.
- [ ] Database corruption/migration failure does not silently replace the library; offer a recovery path preserving the original data. Scan interruptions recover safely on next launch.
- Verify: database/scan/artwork failure injection, restart recovery and log-content review.
- Dependencies: D09, D24, D27. Files: `src-tauri/src/diagnostics.rs`, `src-tauri/src/lib.rs`, `ui/app.ts`, `src-tauri/tests/recovery.rs`, `docs/recovery.md`. Scope: medium.

### Checkpoint — Complete local user flow

- [ ] Scan → review → browse → search → Details → Play → restart works with real data and honest unknown values.

## Stage 6: Candidate verification and distribution

### D29 — Measured library responsiveness

- [ ] Measure 1,000-game search/render and a 10,000-entry nested scan on documented hardware; scans leave controls responsive.
- [ ] Resolve measured bottlenecks only; lazy-load/decode art and bound scan/cache work where necessary. Proposed targets are qualified by actual results.
- Verify: repeatable measurements, search target ≤200 ms and no input stall >100 ms during scan; record exceptions rather than inventing pass results.
- Dependencies: D22, D25, D27. Files: `tests/performance-browser.cjs`, `ui/home.ts`, `ui/app.ts`, `src-tauri/src/discovery/mod.rs`, `docs/performance.md`. Scope: medium.

### D30 — Windows acceptance automation

- [ ] Consolidate focused Rust/frontend/browser gates and add actual WebView2/native service smoke using Tauri WebDriver where practical.
- [ ] Manual matrix covers Snap/caption hit areas, taskbar/multi-monitor behavior, DPI, keyboard access, blur and long/missing artwork states.
- Verify: typecheck/build, Rust fmt/clippy/tests, UI suite, native smoke and documented maintainer checklist; include offline startup.
- Dependencies: D08, D28, D29. Files: `tests/desktop/smoke.mjs`, `tests/desktop/README.md`, `package.json`, `docs/windows-window-checklist.md`, `docs/verification.md`. Scope: medium.

### Checkpoint — Application acceptance

- [ ] All automated gates pass; real Windows manual results are recorded separately from browser simulations.

### D31 — Local Windows installer

- [ ] Build the initial x64 NSIS setup executable with WebView2 detection/bootstrap and complete app resources; document offline installation options and signing status.
- [ ] Fresh install, upgrade and uninstall behave as documented; upgrading preserves library data, and installed execution needs no dev server/Node/Rust/Python.
- Verify: local installer smoke, missing-runtime scenario, upgrade migration and uninstall data-retention check.
- Dependencies: D30. Files: `src-tauri/tauri.conf.json`, `src-tauri/icons/*`, `docs/install.md`, `docs/verification.md`. Scope: medium; icon assets are data.

### D32 — Exact candidate report

- [ ] Review final diff, run all relevant automated gates on the candidate and record its exact commit, installer hash, checks and limitations.
- [ ] Deliver a short maintainer checklist covering window controls, each provider, nested scan, one launch, artwork and restart. Publication remains pending until that exact candidate is locally tested and explicitly approved.
- Verify: candidate commit matches built/tested artifacts; `git diff --check`; release requirements in AGENTS.md satisfied.
- Dependencies: D31. Files: `docs/release-candidate.md`, `README.md`, `tasks/todo.md`. Scope: medium.

### Checkpoint — Publication approval

- [ ] Maintainer tests the exact candidate locally and explicitly authorizes publication after all relevant checks pass.
- [ ] Only then configure/use the intended GitHub remote, push, tag or publish as specifically authorized. A changed candidate requires renewed checks/testing/approval.
