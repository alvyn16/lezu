import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('desktop event listeners used by account and download flows are permitted', () => {
  const capability = JSON.parse(readFileSync(new URL('../src-tauri/capabilities/main.json', import.meta.url), 'utf8'));
  assert.ok(capability.permissions.includes('core:event:allow-listen'));
  assert.ok(capability.permissions.includes('core:event:allow-unlisten'));
});

test('artwork settings commands are registered and permitted for the main window', () => {
  const capability = JSON.parse(readFileSync(new URL('../src-tauri/capabilities/main.json', import.meta.url), 'utf8'));
  const manifest = readFileSync(new URL('../src-tauri/build.rs', import.meta.url), 'utf8');
  const handlers = readFileSync(new URL('../src-tauri/src/lib.rs', import.meta.url), 'utf8');
  for (const command of ['refresh_artwork', 'steamgriddb_key_status', 'set_steamgriddb_key', 'get_library_artwork']) {
    assert.ok(capability.permissions.includes(`allow-${command.replaceAll('_', '-')}`));
    assert.ok(manifest.includes(`"${command}"`));
    assert.ok(handlers.includes(`${command === 'get_library_artwork' ? 'commands' : 'artwork'}::${command}`));
  }
});

test('download history commands are registered and permitted for the main window', () => {
  const capability = JSON.parse(readFileSync(new URL('../src-tauri/capabilities/main.json', import.meta.url), 'utf8'));
  const manifest = readFileSync(new URL('../src-tauri/build.rs', import.meta.url), 'utf8');
  const handlers = readFileSync(new URL('../src-tauri/src/lib.rs', import.meta.url), 'utf8');
  for (const command of ['list_downloads', 'begin_download', 'set_download_progress', 'finish_download', 'clear_download_history', 'get_install_location', 'set_install_location']) {
    assert.ok(capability.permissions.includes(`allow-${command.replaceAll('_', '-')}`));
    assert.ok(manifest.includes(`"${command}"`));
    assert.ok(handlers.includes(`downloads::${command}`));
  }
});

test('store uninstall commands are registered and permitted for the main window', () => {
  const capability = JSON.parse(readFileSync(new URL('../src-tauri/capabilities/main.json', import.meta.url), 'utf8'));
  const manifest = readFileSync(new URL('../src-tauri/build.rs', import.meta.url), 'utf8');
  const handlers = readFileSync(new URL('../src-tauri/src/lib.rs', import.meta.url), 'utf8');
  for (const provider of ['steam', 'epic', 'gog']) {
    assert.ok(capability.permissions.includes(`allow-${provider}-uninstall`));
    assert.ok(manifest.includes(`"${provider}_uninstall"`));
    assert.ok(handlers.includes(`${provider}::${provider}_uninstall`));
  }
});
