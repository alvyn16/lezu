import assert from 'node:assert/strict';
import test from 'node:test';
import { desktopErrorMessage } from '../ui/services/desktop.ts';

test('desktop errors surface native command messages', () => {
  const error = { code: 'engine_download', message: 'Could not download the Epic engine from its release page.', retryable: false };
  assert.equal(desktopErrorMessage(error), error.message);
  assert.equal(desktopErrorMessage(JSON.stringify(error)), error.message);
  assert.equal(desktopErrorMessage(new Error('Epic sign-in stopped')), 'Epic sign-in stopped');
});

test('older native builds get an actionable sign-in error', () => {
  assert.match(desktopErrorMessage('Command epic_connect not found'), /latest Lezu build/);
  assert.match(desktopErrorMessage('Command gog_connect not found'), /latest Lezu build/);
  assert.match(desktopErrorMessage('Command steam_connect not found'), /latest Lezu build/);
});
