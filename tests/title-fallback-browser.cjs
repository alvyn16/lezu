async page => {
  const results = [];
  await page.reload();
  await page.getByRole('button', {name:'See All',exact:true}).click();
  const missing = page.getByRole('button',{name:'View A game waiting for artwork',exact:true});
  await missing.focus(); await missing.press('Enter');
  const check = async screen => {
    for (const width of [320,980,1920]) {
      await page.setViewportSize({width,height:760});
      const layout = await page.evaluate(() => {
        const title = document.querySelector('.game-title');
        const rect = title.getBoundingClientRect();
        const actions = document.querySelector('.hero-actions').getBoundingClientRect();
        const meta = document.querySelector('.game-meta')?.getBoundingClientRect();
        return {titleBottom:rect.bottom, actionsTop:actions.top, metaTop:meta?.top, withinPage:rect.right <= innerWidth, fullTitle:title.title === title.textContent};
      });
      if (layout.titleBottom > layout.actionsTop || (layout.metaTop && layout.titleBottom > layout.metaTop) || !layout.withinPage || !layout.fullTitle) throw Error(`${screen}@${width}: ${JSON.stringify(layout)}`);
      results.push({screen,width,passed:true});
      if (screen === 'details' && width === 980) await page.screenshot({path:'docs/screenshots/type-missing.png'});
    }
  };
  await check('details');
  await page.getByRole('button',{name:'More game actions'}).click();
  await page.getByRole('button',{name:'Feature on Home'}).click();
  await check('home');
  await page.route('**/assets/sifu-logo.png', route => route.fulfill({status:404,body:'Unavailable'}));
  await page.reload();
  await page.getByRole('button',{name:'View Sifu',exact:true}).focus();
  await page.getByRole('button',{name:'View Sifu',exact:true}).press('Enter');
  await page.locator('.game-title').waitFor();
  await check('failed logo');
  await page.unroute('**/assets/sifu-logo.png');
  await page.setViewportSize({width:980,height:760});
  await page.reload();
  await page.evaluate(() => scrollTo(0,0));
  await page.screenshot({path:'docs/screenshots/type-home.png'});
  return {checks:results.length, passed:results.every(result=>result.passed)};
}
