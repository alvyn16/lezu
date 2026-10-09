# Account library and in-app downloads

Lezu is a Windows-only Tauri application. Store ownership is distinct from a
game found on disk. A scanned installation must never be labelled as owned.

## Capability map

| Capability | Epic Games | GOG | Steam |
| --- | --- | --- | --- |
| Sign in | Legendary browser authorization | gogdl authorization | Aurelia login |
| List owned games | Legendary JSON list | Separate GOG library API adapter required | Aurelia JSON list |
| Download in Lezu | Legendary install process | gogdl download process | Aurelia install process |
| Status | Legendary status/list-installed | gogdl installation records | Aurelia list/install list |

Each provider session stays in the engine's own data directory. Lezu does not
accept store passwords or persist tokens. Engine binaries are downloaded on
demand from pinned release assets and verified against pinned SHA-256 hashes.
Lezu runs them with argument arrays, never through a shell. Engine logs must not
be forwarded into the UI without redaction because they may include tokens.

## Delivery slices

1. Epic: verified engine bootstrap, account connection, owned-list import,
   install with progress and cancellation, and installed-state reconciliation.
2. GOG: gogdl authentication plus a GOG account library adapter, then downloads.
3. Steam: opt-in Aurelia integration, isolated from Steam's existing files until
   compatibility is verified. Its upstream marks the client experimental.
4. Downloads view: active, completed, and failed jobs with cancel/retry.
5. Windows validation: clean profile, login, ownership, download, update,
   cancel/resume, and launch for each provider.

## Acceptance

- Signed-in owned titles appear even when uninstalled.
- An uninstalled owned title can start a download from the Lezu interface.
- Progress and cancellation reflect the engine process, with no fake progress.
- Sign-out removes the account session and owned entries without deleting
  installed game files.
- Preview fixtures remain visibly separate from the desktop library.
