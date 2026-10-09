async page => {
  await page.addInitScript(() => {
    window.isTauri = true;
    window.__gogCalls = [];
    window.__gogInstalled = false;
    window.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener() {} };
    window.__TAURI_INTERNALS__ = {
      transformCallback() { return 1; },
      invoke(command, args) {
        window.__gogCalls.push({ command, args });
        if (command === 'runtime_info') return Promise.resolve({appVersion:'0.1.0',platform:'windows',libraryMode:'desktop'});
        if (command === 'list_library') return Promise.resolve([{id:'gog-owned',title:'Owned GOG Game',source:'gog',owned:true,installed:window.__gogInstalled,installationId:null,played:null,lastPlayed:null,size:null,developer:null,year:null,tags:[],description:null,theme:{page:'#30343b',sidebar:'#23272d'},screenshots:[],cover:null,hero:null,logo:null}]);
        if (command === 'plugin:dialog|open') return Promise.resolve('C:\\Games');
        if (command === 'plugin:opener|open_url') return Promise.resolve();
        if (command === 'gog_connect') return Promise.resolve();
        if (command === 'gog_sync') return Promise.resolve({connected:true,count:1});
        if (command === 'gog_install') { window.__gogInstalled = true; return Promise.resolve(); }
        if (command === 'plugin:event|listen') return Promise.resolve(1);
        if (command === 'plugin:event|unlisten') return Promise.resolve();
        throw Error('Unexpected command: ' + command);
      },
    };
  });
  await page.reload();
  await page.getByRole('button', {name:'Settings'}).click();
  await page.getByRole('button', {name:'Connect GOG'}).click();
  await page.getByRole('button', {name:'Open GOG sign-in'}).click();
  await page.getByLabel('GOG redirect URL or code').fill('https://embed.gog.com/on_login_success?origin=client&code=ABC123');
  await page.getByRole('button', {name:'Connect account'}).click();
  await page.getByRole('heading', {name:'GOG library updated'}).waitFor();
  await page.getByRole('button', {name:'Close'}).click();
  await page.locator('nav [data-nav="gog"]').click();
  await page.getByRole('button', {name:'View Owned GOG Game'}).click();
  await page.getByRole('button', {name:'Download', exact:true}).click();
  await page.getByRole('heading', {name:'Download complete'}).waitFor();
  const calls = await page.evaluate(() => window.__gogCalls);
  if (calls.find(call => call.command === 'gog_connect')?.args.code !== 'https://embed.gog.com/on_login_success?origin=client&code=ABC123') throw Error('GOG code missing');
  if (calls.find(call => call.command === 'gog_install')?.args.destination !== 'C:\\Games') throw Error('GOG install folder missing');
  return {accountSync:'passed',ownedDownload:'passed'};
}
