async page => {
  await page.addInitScript(() => {
    window.isTauri = true;
    window.__scanPending = [];
    window.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener() {} };
    window.__TAURI_INTERNALS__ = {
      transformCallback() { return 1; },
      invoke(command) {
        if (command === 'runtime_info') return Promise.resolve({appVersion:'0.1.0',platform:'windows',libraryMode:'desktop'});
        if (command === 'list_library') return Promise.resolve([]);
        if (command === 'plugin:dialog|open') return Promise.resolve('C:\\Games');
        if (command === 'scan_folder_preview') return new Promise(resolve => window.__scanPending.push(resolve));
        if (command === 'plugin:event|listen') return Promise.resolve(1);
        if (command === 'plugin:event|unlisten' || command === 'cancel_scan') return Promise.resolve();
        throw Error(`Unexpected desktop command: ${command}`);
      },
    };
  });
  await page.reload();
  const scan = async () => {
    await page.getByRole('button', {name:'Settings'}).click();
    await page.getByRole('button', {name:'Scan a folder'}).click();
    await page.getByRole('heading', {name:'Scanning folder'}).waitFor();
  };
  await scan();
  await page.keyboard.press('Escape');
  await scan();
  const report = {root:'C:\\Games',entriesChecked:2,candidates:[{title:'Game',executablePath:'\\\\?\\C:\\Games\\Game.exe'}],warnings:0,truncated:false,cancelled:false};
  await page.evaluate(value => window.__scanPending.shift()(value), report);
  await page.getByRole('heading', {name:'Scanning folder'}).waitFor();
  if (await page.getByRole('heading', {name:'Review scan results'}).count()) throw Error('Stale scan replaced active notice');
  await page.evaluate(value => window.__scanPending.shift()(value), report);
  await page.getByRole('heading', {name:'Review scan results'}).waitFor();
  const visiblePath = await page.locator('.scan-result small').textContent();
  if (visiblePath !== 'C:\\Games\\Game.exe') throw Error('Windows path rendered incorrectly: ' + visiblePath);
  return {staleResult:'ignored',activeResult:'shown',pathDisplay:'clean'};
}
