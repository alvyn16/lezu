async page => {
  await page.addInitScript(() => {
    window.isTauri = true;
    window.__storeImports = [];
    window.__artworkCalls = [];
    window.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener() {} };
    window.__TAURI_INTERNALS__ = {
      transformCallback() { return 1; },
      invoke(command, args) {
        if (command === 'runtime_info') return Promise.resolve({appVersion:'0.1.0',platform:'windows',libraryMode:'desktop'});
        if (command === 'list_library') return Promise.resolve([]);
        if (command === 'plugin:event|listen') return Promise.resolve(1);
        if (command === 'plugin:event|unlisten' || command === 'cancel_scan') return Promise.resolve();
        if (command === 'discover_stores') return Promise.resolve({
          candidates:[{source:'steam',storeId:'42',title:'Steam Game',executablePath:'C:\\Games\\Steam Game.exe',workingDirectory:'C:\\Games'}],
          warnings:0,cancelled:false,
        });
        if (command === 'import_store_games') {
          window.__storeImports.push(args.candidates);
          return Promise.resolve(args.candidates.length);
        }
        if (command === 'refresh_artwork') {
          window.__artworkCalls.push(args);
          return Promise.resolve({updated:0,unavailable:1});
        }
        throw Error('Unexpected desktop command: ' + command);
      },
    };
  });
  await page.reload();
  await page.getByRole('button', {name:'Settings'}).click();
  await page.getByRole('button', {name:'Find installed games'}).click();
  await page.getByRole('heading', {name:'Review found games'}).waitFor();
  await page.getByText('Steam Game · STEAM').waitFor();
  await page.getByRole('button', {name:'Add all found games'}).click();
  await page.getByRole('heading', {name:'Games added'}).waitFor();
  const imported = await page.evaluate(() => window.__storeImports);
  if (imported.length !== 1 || imported[0][0].storeId !== '42') throw Error('Store import contract failed');
  await page.getByRole('button', {name:'Close'}).click();
  await page.getByRole('button', {name:'Settings'}).click();
  await page.getByRole('button', {name:'Find game covers'}).click();
  await page.getByRole('heading', {name:'Artwork refreshed'}).waitFor();
  const artworkCalls = await page.evaluate(() => window.__artworkCalls);
  if (artworkCalls.length < 1 || artworkCalls.some(args => args && ('clientId' in args || 'clientSecret' in args))) throw Error('Artwork still requires credentials');
  return {storeDiscovery:'passed',reviewedImport:'passed',keylessArtwork:'passed'};
}
