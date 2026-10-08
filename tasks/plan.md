# Implementation plan: Lezu Windows desktop app

Status: desktop plan prepared for review on October 7, 2026. The user selected Tauri 2 + Rust + TypeScript. This document plans the work; it does not claim desktop functionality has been implemented.

## Current baseline

The fresh HTML/CSS/JavaScript prototype is the starting point. Preserve its current typography, enlarged covers, mouse-wheel shelf navigation, frosted sidebar/search, game colors, and reference control placement. No code or configuration from the deleted project will be imported. The completed prototype plan remains below for history.

## Product goal

Build a Windows game library that discovers installed Steam, GOG, Epic, and manually added games, displays consistent artwork, searches nested game directories, and launches a selected installation. The application works locally without requiring an account. Its interface follows the user's supplied Home and Details references.

### Initial scope

- Home, Library, Details, search, source filters, Settings, and existing reference navigation.
- Windows desktop window with a black title bar, Windows caption controls, system dragging, maximize/restore, and Snap.
- Persistent local library, preferences, favorites, and featured game.
- Installed-game discovery from Steam, GOG Galaxy/standalone GOG evidence, and Epic's local installation metadata. Additional game roots can be on C: or other drives.
- Recursive scanning of user-selected game folders; uncertain discoveries require review before launching.
- Local artwork cache, failed-image recovery, and game-dependent palettes.
- A local Windows installer and a repeatable candidate verification process.

Account-owned but uninstalled catalogs, downloading/installing games, launcher replacement, cloud synchronization, achievements, automatic updating, additional providers, and Couch mode are outside the first release. Keep the reference Downloads position, with a clear unavailable state until a real download capability exists. Preserve Home's Stores cards and sidebar source filters; keep duplicate Stores cards out of Library/search.

## Assumptions and decisions

1. Windows x64 is the first build target. Verify on the maintainer's Windows machine first; Windows 11 is the primary acceptance environment. Windows 10 compatibility is a separate test result, not a promise. ARM64 is later work.
2. Keep plain component modules, HTML, and CSS. Convert JavaScript to strict TypeScript incrementally; use Vite for development/build. A frontend framework rewrite is unnecessary for the first release.
3. Use Tauri 2 and the Rust stable MSVC toolchain. Verify prerequisites before installing anything. Select compatible stable dependency versions when implementing, then commit npm and Cargo lockfiles.
4. Use SQLite through a Rust repository layer, initially with rusqlite and serialized database writes. The frontend cannot issue arbitrary SQL.
5. Real desktop mode starts with an empty library and onboarding. Explicit demo mode remains available for visual testing and never writes sample games into the real database.
6. Keep the current UI approval checkpoint open until the maintainer reviews the latest prototype. Preparing this plan does not count as native UI approval or publication approval.

## Capability map

| Module id | Responsibility | Depends on |
|---|---|---|
| domain | Game/installation models, typed errors, command/event contracts | — |
| desktop-host | Window lifecycle, caption controls, native dialog bridge, command registration | domain |
| library-store | SQLite migrations, persistent records and preferences | domain |
| discovery | Provider readers, folder traversal, scan jobs and reconciliation | domain, library-store |
| launch | Validate and launch a stored installation, reveal its folder | domain, library-store |
| artwork | Cache/refresh artwork, resolve failures, extract readable palettes | domain, library-store |
| interface | Home/Library/Details, dialogs, source filters, progress and errors | domain; desktop-host exposes backend services |
| distribution | Windows installer, build gates, candidate documentation | completed desktop application |

Rust service modules do not depend on frontend rendering. Discovery stores launch evidence; it never launches a discovered executable. The UI calls application commands through one typed bridge.

## Architecture

```text
TypeScript UI / HTML / CSS
          |
          | typed commands + scan/artwork events
          v
Tauri command boundary
          |
          +-- library and settings services --> SQLite
          +-- scan coordinator --> Steam / GOG / Epic / folder readers
          +-- launch service --> Windows process / verified launcher URI
          +-- artwork service --> local cache + selected remote providers
```

### Data model

- `games`: stable local ID, title, optional verified external identity, nullable metadata. Never use title alone as identity.
- `installations`: game ID, provider, provider game ID when known, install root, validated launch target, working directory, installation state, last successful observation, evidence source.
- `scan_roots`: selected root, provider hint, recursion policy, enabled state.
- `scan_runs`: job ID, scope, completion state, counts, readable warnings. Retain enough scope information for safe reconciliation.
- `artwork`: game ID, role (cover/hero/logo/screenshot), source, local cache key, revision/status; derived palette is cached with its source revision.
- `preferences` and user annotations: favorites, featured game, source visibility and display settings. Discovery cannot overwrite these.

One game can have several installations. Automatically group only when reliable identity establishes equivalence; offer manual linking for ambiguity. Installation availability is distinct from artwork availability and account ownership. A successful launcher request is not proof that the game is running or that playtime was earned.

### Command boundary

Plan a small typed API: `list_library`, `get_game`, `get_settings`, `update_settings`, `add_manual_game`, `start_scan`, `cancel_scan`, `get_scan_status`, `review_scan_candidate`, `launch_installation`, `reveal_installation`, `set_favorite`, `set_featured_game`, and `refresh_artwork`.

- Use serializable Rust DTOs with matching TypeScript contracts; verify representative payloads in contract tests.
- Return errors with a stable code, readable message, retryability, and optional job ID. Keep internal paths/details out of normal copy unless actionable.
- Launch/reveal commands receive a stored installation ID. Rust resolves and validates the target; no general-purpose frontend shell execution.
- Scan events carry job ID and progress, including discovered/review-needed counts and terminal status. Ignore stale events, and recover current status after navigation or reconnect.
- Backend services own input validation, allowed paths/schemes, concurrency, and database transactions. Native commands must not rely on UI validation.

### Discovery and nested folders

Read installation metadata first, then scan explicitly configured roots for gaps. Provider paths and file formats must be verified with local evidence during each integration; do not hard-code speculative layouts as established support.

- Steam: discover the client/library roots and installed app manifests; support additional Steam libraries and malformed/stale manifests.
- GOG: investigate both registry views, Galaxy/local installation records where available, and standalone GOG installation evidence. Do not assume Galaxy is installed. Validate working directories and launch candidates.
- Epic: inspect local manifest evidence and validate installation paths and launch identities. Missing launcher/protocol registrations produce actionable errors.
- Folder scan: iterative recursive traversal, configurable depth and entry budgets, cancellation, bounded background workers, and recoverable permission errors. Default depth budget 12 and entry budget 100,000 per root; explicitly report limits and allow adjustment. Skip reparse points/junctions by default to avoid loops and unexpected traversal outside the selected root.
- Exclude known launcher tools, uninstallers, redistributables and setup executables from automatic game selection. Bare executable detection is only a candidate; show filename/path and let the user choose the executable when confidence is insufficient.
- Normalize Windows paths without losing Unicode or original display spelling. Deduplicate overlapping roots and repeated scans. Support spaces, non-ASCII names, multiple drives, and inaccessible/missing roots.
- Scan work runs off the UI thread. Commit discoveries without removing existing records on cancelled, failed, budget-limited, or inaccessible scopes. Mark an installation missing only after a complete authoritative rescan of its accessible source; preserve metadata and user annotations.

### Launch behavior

Use provider-approved launch mechanisms where verified; direct executables need a validated existing file, a working directory, and separate argument values. Never build shell command strings from titles or paths. Check launcher availability, report dispatch success accurately, prevent duplicate dispatch while a request is in flight, and allow choosing among multiple installations. Do not implement automatic elevation. Remember the launch request timestamp without inventing session duration.

### Artwork and colors

All screens resolve images through the same artwork records and cache service, addressing the previous grid/details mismatch. Use available local launcher art first, then a verified remote source keyed by a reliable provider identity. Optional metadata services must not block scanning/launching. Ambiguous matches require confirmation. User-chosen local artwork is supported.

Download only expected image resources with size/time limits; validate decoded content, write atomically, and use bounded retries/backoff. Preserve usable cached images on refresh failure. Extract palette colors from decoded artwork, then adjust text/control contrast; cache the result, retain a neutral fallback, and update the whole shell when the featured/opened game changes. Missing logos fall back to readable titles without overlapping actions.

### Windows controls and rendering

Test a black native title bar with system caption buttons first. If the reference requires extending the web UI into it, implement Windows hit testing and native caption behavior deliberately. A frameless web drag strip alone is not sufficient evidence of correct Snap behavior.

Verify minimize, maximize/restore, close, double-click, drag to the screen top, drag away from maximized, resize edges, Alt+Space, Win+Arrow, Windows 11 Snap layouts, taskbar boundaries, and multi-monitor restore. Restore window placement within an available monitor after a display disappears. Avoid DPI multiplication in CSS. Ensure blur/focus overlays and fonts remain clear at 100%, 125%, 150%, and 200% scale.

### Runtime permissions and files

Package local UI assets with a restrictive CSP. Enable only the native permissions required by the current slice, and restrict custom commands to the intended app window/origin. Do not give remote pages native access. Keep HTTP, filesystem writes and launching behind Rust services. Store data under the per-user application data directory and regenerate disposable cache safely. Escape untrusted game/manifest text before HTML rendering. Credentials for any later optional metadata service belong in Windows credential storage, not frontend bundles or logs.

## Proposed project structure

```text
ui/                         existing styles/assets; migrate JS modules to TS in place
ui/domain/                  DTOs and library view model
ui/services/                typed desktop bridge and explicit demo provider
src-tauri/                  Tauri config, capabilities, Cargo/build files
src-tauri/src/domain/       models and errors
src-tauri/src/commands/     thin native command handlers
src-tauri/src/library/      SQLite repository and migrations
src-tauri/src/discovery/    coordinator, provider readers, folder traversal
src-tauri/src/launch/       validated Windows launch service
src-tauri/src/artwork/      cache and palette extraction
tests/                      current frontend tests + migrated browser checks
src-tauri/tests/            fixture integration and persistence tests
tests/desktop/              WebView2/native automation and manual checklist
tasks/                      this plan and the single task checklist
docs/                       visual references, contracts, candidate verification
```

Keep any capability-specific implementation spec beside its implementation documentation when that slice starts. This plan is not a claim that unverified launcher formats or providers have been implemented.

## Delivery order and checkpoints

| Stage | Tasks | Reviewable outcome |
|---|---|---|
| 1. Typed UI and desktop host | D01–D08 | Current design inside a working Windows window |
| 2. Persistent/manual library | D09–D13 | Add a real game, restart, and launch it |
| 3. Nested discovery | D14–D16 | Choose a root, scan subfolders, review/import candidates |
| 4. Launcher integrations | D17–D22 | Steam, GOG, and Epic verified independently |
| 5. Artwork and settings | D23–D28 | Consistent covers, game colors, preferences and recovery |
| 6. Verification and installer | D29–D32 | Tested local installer and exact candidate report |

`tasks/todo.md` contains acceptance criteria, dependencies, affected files, and verification for each task. Checkpoints follow small groups of tasks. Keep each implementation slice roughly 2–5 files; split tasks further if a concrete implementation exceeds that scope. Do not parallelize database migrations or shared contracts. No delegation is required for this plan.

## Planned commands (not available yet)

The implementation must add/document these scripts and migrate existing tests before claiming they work:

```powershell
npm ci
npm run dev
npm run typecheck
npm test
npm run test:ui
npm run build
npm run tauri dev
cargo fmt --manifest-path src-tauri/Cargo.toml --check
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml
npm run tauri build
```

Vite's frontend preview stays on 127.0.0.1:4173 when available, with a strict port. Browser demo and native runtime modes are explicit. Tauri build uses the production frontend distribution; installed apps must not depend on a running development server, Python, Node.js, or Rust.

## Verification strategy

- Frontend tests: pure state/search and typed bridge/error mapping; retain the existing meaningful regressions during migration.
- Rust tests: parser fixtures, malformed records, path normalization, traversal limits/cancellation, deduplication, scan reconciliation, launch validation, image recovery, migrations and rollback.
- Browser checks: Home/Details reference comparison, library filtering, wheel behavior, keyboard focus, long titles, empty/error/loading states and artwork fallback.
- Desktop checks: actual WebView2 command/service flows using Tauri WebDriver where practical; native caption/Snap/DPI behavior requires real Windows manual testing as well. Browser device pixel ratio emulation is not a substitute.
- Resolution matrix: 800×600, 980×760, 1024×768, 1366×768, 1920×1080, 3840×2160 logical/physical sizes documented distinctly; 100/125/150/200% scale and multi-monitor transitions. Define and test minimum usable native window size.
- Measure a synthetic 1,000-game library and a 10,000-entry nested folder fixture. Proposed targets: visible search updates within 200 ms and no input stall longer than 100 ms during scans on the maintainer's documented hardware. Profile before optimizing; qualify these targets with measured results.
- Real-machine smoke: compare discovered installations with games the maintainer confirms exist for each provider; never require launching every game as an automated test. Test launch plumbing with a harmless test executable; real games launch only in the maintainer's manual checks.

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| Native host changes the approved appearance | Preserve current UI/CSS, establish screenshots, compare in WebView2 before backend work. |
| Repeating title-bar/Snap failures | Resolve Windows behavior early and test actual caption hit regions/scaling. |
| Unsupported or changing launcher metadata | Verify current local evidence, isolate adapters, retain fixtures and readable diagnostics. |
| Folder scanning imports tools or hangs | Candidate review, explicit roots, traversal budgets, junction policy, cancellation. |
| Failed scan makes games disappear | Completion-aware reconciliation scoped to accessible authoritative sources. |
| Artwork shows on Details but not cards | Shared cache/resolver and cross-screen recovery tests. |
| Rust/TypeScript payloads drift | Small typed bridge and serialized contract tests. |
| Missing WebView2 or offline installation | Test runtime detection/bootstrap; document an offline installer option separately. |
| Installer/update destroys library | App-data persistence and upgrade migration/rollback tests; no updater in first release. |

## Decisions to validate during implementation

- Exact installed GOG/Epic metadata and launch mechanisms on the maintainer's machine.
- Compatible dependency versions and whether Visual C++ build prerequisites are already installed.
- Native dark title bar versus an extended title bar, decided by the early Snap/DPI prototype.
- Local/remote artwork providers and credential requirements, with manual art usable throughout.
- Code-signing availability and any Windows 10 test environment before promising broader support.

## Release gate

All work remains local. Before publication, report the exact candidate commit, automated checks, known limitations and a short manual checklist. The maintainer must test that exact candidate and explicitly approve publication. Rebuild/retest if the candidate changes. Never push, tag, create a release or upload assets without satisfying `AGENTS.md`.

## Official technical references

- [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/): Windows toolchain and WebView2.
- [Tauri with Vite](https://v2.tauri.app/start/frontend/vite/): development/build configuration.
- [Rust commands](https://v2.tauri.app/develop/calling-rust/): frontend/backend boundary.
- [Capabilities](https://v2.tauri.app/security/capabilities/): native permission configuration.
- [Window customization](https://v2.tauri.app/learn/window-customization/): window integration options.
- [Windows testing](https://v2.tauri.app/develop/tests/webdriver/): native WebDriver coverage.
- [Windows installers](https://v2.tauri.app/distribute/windows-installer/): runtime and installer options.

---

## Historical plan: completed fresh UI prototype

## Scope

Build the first visual capability of the new Windows game-library app: shared shell, Home, and Details. Follow `docs/ui-design.md`. Use independently sourced fixture data and artwork, with no previous Lezu code.

## Assumptions

- Windows-only remains the target.
- The two supplied images remain the visual reference.
- Colors change with the featured/opened game.
- No Couch mode.
- The first deliverable is an interactive local UI preview. Real scanning and launching follow visual approval.

## Architecture

- One small HTML entry point and shared design tokens.
- Separate shell, Home, and Details modules.
- A fixture/data module owns sample games; state derives search, selected source, selected game, and palette.
- No desktop host, remote account integration, database, or package dependency in this first stage.
- Windows desktop hosting is decided after the UI is reviewed, with native dragging, snapping, and scaling treated as explicit acceptance criteria.

## Build order

1. Shared shell and tokens → 2. Home → 3. Details → 4. Interaction/state checks → 5. Visual/resolution review.

The task checklist is in `tasks/todo.md`.

## Verification checkpoints

- Shell: match sidebar and search placement at 980 × 760.
- Home: single horizontal cover shelf and matching store-card density.
- Details: reference action/stat/About placement with no text overlap.
- Completion: sample data navigation works, focused checks pass, and screenshots reviewed at the requested sizes and scales.

## Later capabilities

These are not part of this prototype. Each needs its own bounded spec before implementation:

1. Windows desktop host and packaging.
2. Persistent library model and manual game entry.
3. Steam discovery and launcher integration.
4. Epic discovery and launcher integration.
5. GOG discovery and launcher integration, including nested install directories.
6. Artwork/metadata refresh and recovery.

## Risks

| Risk | Mitigation |
|---|---|
| Another approximation of the reference | Measure the app area, compare fixed-size screenshots, and review the UI before native/backend work. |
| Repeatedly changing the design | Centralize tokens and keep a written visual contract. |
| Browser preview mistaken for a finished desktop app | Explicitly identify the preview, fixture data, and unavailable native actions. |
| Poor DPI behavior | Verify logical layout and physical render resolution separately; test the native host later on Windows. |
| Recreating the old tangled application | Separate capability boundaries and deliver one complete flow at a time. |

## Review

Approved by the user's “continue.” Implementing the first UI prototype; native integration follows visual approval.
