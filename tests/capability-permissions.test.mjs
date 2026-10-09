import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('desktop event listeners used by account and download flows are permitted', () => {
  const capability = JSON.parse(readFileSync(new URL('../src-tauri/capabilities/main.json', import.meta.url), 'utf8'));
  assert.ok(capability.permissions.includes('core:event:allow-listen'));
  assert.ok(capability.permissions.includes('core:event:allow-unlisten'));
});
