async page => {
  await page.addInitScript(() => {
    window.isTauri = true;
    window.__steamCalls = [];
    window.__steamInstalled = false;
    window.__steamHistory = [];
    window.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener() {} };
    window.__TAURI_INTERNALS__ = {
      transformCallback(callback) { window.__steamEvent = callback; return 1; },
      invoke(command, args) {
        window.__steamCalls.push({ command, args });
        if (command === 'runtime_info') return Promise.resolve({appVersion:'0.1.0',platform:'windows',libraryMode:'desktop'});
        if (command === 'list_library') return Promise.resolve([{id:'steam-owned',title:'Owned Steam Game',source:'steam',owned:true,installed:window.__steamInstalled,installationId:null,played:null,lastPlayed:null,size:null,developer:null,year:null,tags:[],description:null,theme:{page:'#30343b',sidebar:'#23272d'},screenshots:[],cover:null,hero:null,logo:null}]);
        if (command === 'get_install_location') return Promise.resolve('C:\\SteamLibrary');
        if (command === 'plugin:dialog|open') throw Error('Download opened a folder picker');
        if (command === 'plugin:event|listen') return Promise.resolve(1);
        if (command === 'plugin:event|unlisten') return Promise.resolve();
        if (command === 'begin_download') { window.__steamHistory = [{id:'steam-job',gameId:args.gameId,title:'Owned Steam Game',provider:'steam',destination:args.destination,status:'downloading',progress:null,startedAt:1730000000,finishedAt:null,error:null}]; return Promise.resolve('steam-job'); }
        if (command === 'list_downloads') return Promise.resolve([...window.__steamHistory]);
        if (command === 'finish_download') { window.__steamHistory[0].status = args.status; return Promise.resolve(); }
        if (command === 'steam_connect') return new Promise(resolve => { window.__finishSteamLogin = resolve; });
        if (command === 'steam_sync') return Promise.resolve({connected:true,count:1});
        if (command === 'steam_install') { window.__steamInstalled = true; return Promise.resolve(); }
        if (command === 'steam_uninstall') { window.__steamInstalled = false; return Promise.resolve(); }
        if (command === 'refresh_artwork') return Promise.resolve({updated:0,unavailable:2});
        throw Error('Unexpected command: ' + command);
      },
    };
  });
  await page.reload();
  await page.getByRole('button', {name:'Settings'}).click();
  await page.getByRole('button', {name:'Connect Steam'}).click();
  await page.waitForFunction(() => typeof window.__steamEvent === 'function' && typeof window.__finishSteamLogin === 'function');
  await page.evaluate(() => window.__steamEvent({payload:{status:'qr',url:'https://s.team/q/test-challenge'}}));
  await page.locator('.steam-auth img:not([hidden])').waitFor();
  const qr = await page.locator('.steam-auth img').getAttribute('src');
  if (!qr?.startsWith('data:image/png;base64,')) throw Error('Steam QR image was not rendered');
  await page.evaluate(() => window.__finishSteamLogin());
  await page.getByRole('heading', {name:'Steam library updated'}).waitFor();
  await page.getByRole('button', {name:'Close'}).click();
  await page.locator('nav [data-nav="steam"]').click();
  await page.getByRole('button', {name:'View Owned Steam Game'}).click({position:{x:20,y:20}});
  await page.getByRole('button', {name:'Download', exact:true}).click();
  await page.getByText('Completed', {exact:true}).waitFor();
  await page.locator('nav [data-nav="steam"]').click();
  await page.getByRole('button', {name:'View Owned Steam Game'}).click({position:{x:20,y:20}});
  await page.getByRole('button', {name:'More game actions'}).click();
  await page.getByRole('button', {name:'Refresh artwork'}).click();
  await page.getByRole('heading', {name:'Artwork refreshed'}).waitFor();
  await page.getByRole('button', {name:'Close'}).click();
  await page.getByRole('button', {name:'More game actions'}).click();
  await page.getByRole('button', {name:'Uninstall game'}).click();
  await page.getByRole('heading', {name:'Uninstall Owned Steam Game?'}).waitFor();
  await page.getByRole('button', {name:'Cancel'}).click();
  if (await page.evaluate(() => window.__steamCalls.some(call => call.command === 'steam_uninstall'))) throw Error('Cancel uninstalled the game');
  await page.getByRole('button', {name:'More game actions'}).click();
  await page.getByRole('button', {name:'Uninstall game'}).click();
  await page.getByRole('button', {name:'Uninstall game'}).click();
  await page.getByRole('heading', {name:'Game uninstalled'}).waitFor();
  const calls = await page.evaluate(() => window.__steamCalls);
  if (!calls.some(call => call.command === 'steam_connect')) throw Error('Steam connect missing');
  if (calls.find(call => call.command === 'steam_install')?.args.destination !== 'C:\\SteamLibrary') throw Error('Steam library folder missing');
  const refresh = calls.find(call => call.command === 'refresh_artwork' && call.args.force);
  if (refresh?.args.gameId !== 'steam-owned') throw Error('Per-game refresh did not target this game');
  if (calls.filter(call => call.command === 'steam_uninstall').length !== 1) throw Error('Expected one confirmed uninstall');
  return {qr:'passed',accountSync:'passed',ownedDownload:'passed',perGameArtwork:'passed',uninstall:'passed'};
}
