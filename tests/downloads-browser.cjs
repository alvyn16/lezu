async page => {
  await page.addInitScript(() => {
    window.isTauri = true;
    window.__history = [];
    window.__installed = false;
    window.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener() {} };
    window.__TAURI_INTERNALS__ = {
      transformCallback() { return 1; },
      invoke(command, args) {
        if (command === 'runtime_info') return Promise.resolve({appVersion:'0.1.0',platform:'windows',libraryMode:'desktop'});
        if (command === 'list_library') return Promise.resolve([{id:'owned',title:'Download Test Game',source:'gog',owned:true,installed:window.__installed,installationId:null,played:null,lastPlayed:null,size:null,developer:null,year:null,tags:[],description:null,theme:{page:'#30343b',sidebar:'#23272d'},screenshots:[],cover:null,hero:null,logo:null}]);
        if (command === 'plugin:dialog|open') return Promise.resolve('C:\\Games');
        if (command === 'list_downloads') return Promise.resolve([...window.__history]);
        if (command === 'begin_download') {
          const id = `job-${window.__history.length + 1}`;
          window.__history.unshift({id,gameId:args.gameId,title:'Download Test Game',provider:'gog',destination:args.destination,status:'downloading',progress:null,startedAt:1730000000,finishedAt:null,error:null});
          return Promise.resolve(id);
        }
        if (command === 'gog_install') return new Promise((resolve, reject) => { window.__completeInstall = () => { window.__installed = true; resolve(); }; window.__rejectInstall = reject; });
        if (command === 'gog_cancel_download') { window.__rejectInstall({code:'download_cancelled',message:'Cancelled by user'}); return Promise.resolve(); }
        if (command === 'finish_download') { const record = window.__history.find(item => item.id === args.id); record.status = args.status; record.error = args.message ?? null; return Promise.resolve(); }
        if (command === 'clear_download_history') { window.__history = window.__history.filter(item => item.status === 'downloading'); return Promise.resolve(1); }
        throw Error('Unexpected command: ' + command);
      },
    };
  });
  await page.reload();
  await page.locator('nav [data-nav="gog"]').click();
  await page.getByRole('button', {name:'View Download Test Game'}).click();
  await page.getByRole('button', {name:'Download',exact:true}).click();
  await page.locator('#downloads-heading').waitFor();
  await page.getByText('Downloading', {exact:true}).waitFor();
  await page.getByRole('progressbar', {name:'Download Test Game download'}).waitFor();
  await page.getByRole('button', {name:'Cancel'}).click();
  await page.getByText('Cancelled', {exact:true}).waitFor();
  await page.getByRole('button', {name:'Clear history'}).click();
  await page.getByText('No downloads yet').waitFor();
  await page.locator('nav [data-nav="gog"]').click();
  await page.getByRole('button', {name:'View Download Test Game'}).click();
  await page.getByRole('button', {name:'Download',exact:true}).click();
  await page.getByText('Downloading', {exact:true}).waitFor();
  await page.evaluate(() => window.__completeInstall());
  await page.getByText('Completed', {exact:true}).waitFor();
  await page.locator('nav [data-nav="home"]').click();
  await page.locator('nav [data-nav="downloads"]').click();
  await page.getByText('Completed', {exact:true}).waitFor();
  return {active:'passed',cancelled:'passed',clear:'passed',completed:'passed',navigation:'passed'};
}
