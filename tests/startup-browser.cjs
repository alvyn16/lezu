async page => {
  await page.addInitScript(() => {
    window.isTauri = true;
    window.__TAURI_INTERNALS__ = {
      invoke(command, args) {
        if (command === 'runtime_info') return Promise.resolve({appVersion:'0.1.0',platform:'windows',libraryMode:'desktop'});
        if (command === 'list_library') return Promise.resolve([{id:'startup-game',title:'Startup Game',source:'gog',installed:true,owned:true,installationId:null,played:null,lastPlayed:null,size:null,developer:null,year:null,tags:[],description:null,theme:{page:'#30343b',sidebar:'#23272d'},screenshots:[],cover:null,hero:null,logo:null}]);
        if (command === 'get_library_artwork') {
          if (args.kind === 'hero') return Promise.resolve([]);
          return new Promise(resolve => { window.__deliverCover = () => resolve([{gameId:'startup-game',kind:'cover',image:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6T6AAAAAASUVORK5CYII='}]); });
        }
        throw Error('Unexpected command: ' + command);
      },
    };
  });
  await page.reload();
  await page.getByRole('button', {name:'View Startup Game'}).waitFor();
  await page.waitForFunction(() => typeof window.__deliverCover === 'function');
  await page.getByText('Loading artwork…').waitFor();
  if (await page.locator('.cover-button[data-game="startup-game"] img').count()) throw Error('Cover arrived before test released it');
  await page.evaluate(() => window.__deliverCover());
  await page.locator('.cover-button[data-game="startup-game"] img').waitFor();
  if (await page.getByText('Your library is empty.').count()) throw Error('Library still looks empty after metadata loaded');
  return {metadataBeforeArtwork:'passed',coverAfterArtwork:'passed'};
}
