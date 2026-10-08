# Windows release

Lezu distributes an NSIS installer for the current user. The updater uses a separate Tauri signature to verify releases; this does not make the Windows installer Authenticode signed.

## Build and verify locally

Install Node dependencies with `npm ci` and use Rust 1.90+ with the MSVC toolchain. Keep the updater private key outside the repository and back it up securely. The public key is already in `src-tauri/tauri.conf.json`.

```powershell
$env:TAURI_SIGNING_PRIVATE_KEY = Join-Path $env:USERPROFILE '.tauri\lezu-updater.key'
npm run tauri build
Remove-Item Env:TAURI_SIGNING_PRIVATE_KEY
```

The build creates `src-tauri/target/release/bundle/nsis/Lezu_<version>_x64-setup.exe` and its `.sig`. Run `npm test`, `npm run test:ui` with a preview server, and `cargo test --manifest-path src-tauri/Cargo.toml`; test the exact installer on Windows before release.

To prepare a GitHub static updater manifest for a matching version and tag:

```powershell
npm run release:manifest -- alvyn16/lezu v0.1.0
```

This writes `latest.json` beside the installer. It validates that the tag matches the app version and the updater endpoint matches the repository. A release must contain the installer and this `latest.json` under the matching tag; the app checks the latest release URL. Keep the `.sig` with the local build record. Each new version needs a new signed build and manifest. Never upload the private key.

The `alvyn16/lezu` endpoint is the current configuration and must be changed if releases move. The update button only works once a newer signed release exists at that endpoint. A browser preview cannot check or install desktop updates.
