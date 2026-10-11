async page => {
  await page.evaluate(() => localStorage.removeItem('lezu-featured-browser-test'));
  await page.addInitScript(() => {
    window.isTauri = true;
    window.__TAURI_INTERNALS__ = {
      invoke(command, args) {
        if (command === 'runtime_info') return Promise.resolve({appVersion:'0.1.0',platform:'windows',libraryMode:'desktop'});
        if (command === 'get_featured_game') return Promise.resolve(localStorage.getItem('lezu-featured-browser-test'));
        if (command === 'set_featured_game') { localStorage.setItem('lezu-featured-browser-test', args.gameId); return Promise.resolve(); }
        if (command === 'list_library') return Promise.resolve(['First Game', 'Second Game'].map((title, index) => ({
          id: index ? 'second' : 'first', title, source:'steam', owned:true, installed:true, installationId:null,
          played:null, lastPlayed:null, size:null, developer:null, year:null, tags:[], description:null,
          theme:{page:'#30343b',sidebar:'#23272d'}, screenshots:[], cover:null, hero:null, logo:null,
        })));
        if (command === 'get_library_artwork') return Promise.resolve([]);
        throw Error('Unexpected command: ' + command);
      },
    };
  });
  await page.reload();
  await page.getByRole('button', {name:'About First Game'}).waitFor();
  await page.getByRole('button', {name:'View Second Game'}).focus();
  await page.keyboard.press('Enter');
  await page.getByRole('button', {name:'More game actions'}).click();
  await page.getByRole('button', {name:'Feature on Home'}).click();
  await page.getByRole('button', {name:'About Second Game'}).waitFor();
  await page.reload();
  await page.getByRole('button', {name:'About Second Game'}).waitFor();
  await page.evaluate(() => localStorage.setItem('lezu-featured-browser-test', 'missing'));
  await page.reload();
  await page.getByRole('button', {name:'About First Game'}).waitFor();
  await page.evaluate(() => localStorage.removeItem('lezu-featured-browser-test'));
  return {persistedAfterRestart:'passed',missingGameFallback:'passed'};
}
