async page => {
  await page.addInitScript(() => {
    window.isTauri = true;
    window.__savedArtKey = '';
    window.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener() {} };
    window.__TAURI_INTERNALS__ = {
      transformCallback() { return 1; },
      invoke(command, args) {
        if (command === 'runtime_info') return Promise.resolve({ appVersion: '0.1.0', platform: 'windows', libraryMode: 'desktop' });
        if (command === 'list_library') return Promise.resolve([]);
        if (command === 'plugin:event|listen') return Promise.resolve(1);
        if (command === 'plugin:event|unlisten') return Promise.resolve();
        if (command === 'steamgriddb_key_status') return Promise.resolve(Boolean(window.__savedArtKey));
        if (command === 'set_steamgriddb_key') { window.__savedArtKey = args.key; return Promise.resolve(Boolean(args.key)); }
        throw Error('Unexpected desktop command: ' + command);
      },
    };
  });
  await page.reload();
  await page.getByRole('button', { name: 'Settings' }).click();
  const dialog = page.getByRole('dialog', { name: 'Settings' });
  await dialog.waitFor();
  for (const label of ['Connect Steam', 'Refresh Steam', 'Sign out Steam', 'Connect Epic Games', 'Connect GOG', 'Find installed games', 'Scan a folder', 'Add a game', 'Refresh artwork', 'Save key', 'Remove', 'Check for updates']) {
    if (await dialog.getByRole('button', { name: label }).count() !== 1) throw Error(`Missing settings action: ${label}`);
  }
  await dialog.getByLabel('SteamGridDB API key').fill('example-key');
  await dialog.getByRole('button', { name: 'Save key' }).click();
  await dialog.getByText('API key saved on this PC.').waitFor();
  if (await page.evaluate(() => window.__savedArtKey) !== 'example-key') throw Error('SteamGridDB key was not saved');
  await dialog.getByRole('button', { name: 'Remove' }).click();
  await dialog.getByText('API key removed.').waitFor();
  if (await page.evaluate(() => window.__savedArtKey) !== '') throw Error('SteamGridDB key was not removed');
  for (const [width, height] of [[1366, 768], [800, 600], [320, 740]]) {
    await page.setViewportSize({ width, height });
    const bounds = await dialog.boundingBox();
    if (!bounds || bounds.x < 0 || bounds.y < 0 || bounds.x + bounds.width > width + 1 || bounds.y + bounds.height > height + 1) throw Error(`Settings dialog clipped at ${width}×${height}`);
    const overflow = await dialog.evaluate(element => element.scrollWidth > element.clientWidth + 1);
    if (overflow) throw Error(`Settings dialog has horizontal overflow at ${width}×${height}`);
  }
  await page.setViewportSize({ width: 1366, height: 768 });
  await dialog.getByRole('button', { name: 'Close' }).click();
  if (await dialog.isVisible()) throw Error('Settings dialog did not close');
  return { actions: 'passed', responsive: 'passed', close: 'passed' };
}
