async page => {
  await page.addInitScript(() => {
    window.isTauri = true;
    window.__epicCalls = [];
    window.__epicInstalled = false;
    window.__epicHistory = [];
    window.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener() {} };
    window.__TAURI_INTERNALS__ = {
      transformCallback() { return 1; },
      invoke(command, args) {
        window.__epicCalls.push({ command, args });
        if (command === 'runtime_info') return Promise.resolve({appVersion:'0.1.0',platform:'windows',libraryMode:'desktop'});
        if (command === 'list_library') return Promise.resolve([{
          id:'epic-owned',title:'Owned Epic Game',source:'epic',owned:true,
          installed:window.__epicInstalled,installationId:null,played:null,lastPlayed:null,size:null,
          developer:null,year:null,tags:[],description:null,theme:{page:'#30343b',sidebar:'#23272d'},
          screenshots:[],cover:null,hero:null,logo:null,
        }]);
        if (command === 'plugin:event|listen') return Promise.resolve(1);
        if (command === 'plugin:event|unlisten') return Promise.resolve();
        if (command === 'plugin:opener|open_url') return Promise.resolve();
        if (command === 'get_install_location') return Promise.resolve('C:\\Games');
        if (command === 'plugin:dialog|open') throw Error('Download opened a folder picker');
        if (command === 'begin_download') { window.__epicHistory = [{id:'epic-job',gameId:args.gameId,title:'Owned Epic Game',provider:'epic',destination:args.destination,status:'downloading',progress:null,startedAt:1730000000,finishedAt:null,error:null}]; return Promise.resolve('epic-job'); }
        if (command === 'list_downloads') return Promise.resolve([...window.__epicHistory]);
        if (command === 'finish_download') { window.__epicHistory[0].status = args.status; return Promise.resolve(); }
        if (command === 'epic_install') { window.__epicInstalled = true; return Promise.resolve(); }
        if (command === 'epic_connect') return Promise.resolve();
        if (command === 'epic_sync') return Promise.resolve({connected:true,count:1});
        throw Error('Unexpected desktop command: ' + command);
      },
    };
  });
  await page.reload();
  await page.locator('nav [data-nav="epic"]').click();
  await page.getByRole('button', {name:'View Owned Epic Game'}).click();
  await page.getByRole('button', {name:'Download', exact:true}).click();
  await page.getByText('Completed', {exact:true}).waitFor();
  const calls = await page.evaluate(() => window.__epicCalls);
  const install = calls.find(call => call.command === 'epic_install');
  if (!install || install.args.gameId !== 'epic-owned' || install.args.destination !== 'C:\\Games') {
    throw Error('Owned game did not call Epic download with selected folder');
  }
  await page.getByRole('button', {name:'Settings'}).click();
  await page.getByRole('button', {name:'Connect Epic Games'}).click();
  await page.getByRole('button', {name:'Open Epic sign-in'}).click();
  await page.getByLabel('Epic authorization code').fill('abc123');
  await page.getByRole('button', {name:'Connect account'}).click();
  await page.getByRole('heading', {name:'Epic library updated'}).waitFor();
  const auth = (await page.evaluate(() => window.__epicCalls)).find(call => call.command === 'epic_connect');
  if (auth?.args.code !== 'abc123') throw Error('Epic authorization code did not reach the desktop command');
  return {ownedDownload:'passed',accountSync:'passed'};
}
