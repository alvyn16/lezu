async page => {
  const sizes = [[800,600], [980,760], [1024,768], [1366,768], [1920,1080], [3840,2160], [320,740]];
  const results = [];
  for (const dpr of [1, 1.25, 1.5, 2]) for (const [width,height] of sizes) {
    const context = await page.context().browser().newContext({ viewport: {width,height}, deviceScaleFactor: dpr, reducedMotion: 'reduce' });
    try {
      const preview = await context.newPage();
      const errors = [];
      preview.on('pageerror', e => errors.push(e.message));
      preview.on('console', e => { if (e.type() === 'error') errors.push(e.text()); });
      preview.on('response', r => { if (r.status() >= 400) errors.push(`HTTP ${r.status()} ${r.url()}`); });
      await preview.goto('http://127.0.0.1:4173');
      await preview.getByRole('heading', {name:'Ready to Play'}).waitFor();
      for (const screen of ['home','details']) {
        if (screen === 'details') {
          const card = preview.getByRole('button',{name:'View Sifu',exact:true});
          await card.focus(); await card.press('Enter');
          await preview.getByRole('heading',{name:'Sifu',exact:true}).waitFor();
        }
        const layout = await preview.evaluate(() => {
          const rect = el => el.getBoundingClientRect();
          const header = document.querySelector('.topbar');
          const search = document.querySelector('.search');
          const location = document.querySelector('#location');
          return { overflow: document.documentElement.scrollWidth > innerWidth,
            overlap: rect(location).right > rect(search).left,
            searchOutside: rect(search).right > innerWidth,
            sidebarWidth: rect(document.querySelector('.sidebar')).width,
            font: getComputedStyle(header).fontSize,
            dpr: devicePixelRatio };
        });
        if (layout.overflow || layout.overlap || layout.searchOutside) throw Error(`${screen} ${width}x${height}@${dpr}: ${JSON.stringify(layout)}`);
        if (dpr === 1 && [800,980,1920].includes(width)) {
          await preview.mouse.move(0,0);
          await preview.screenshot({ path:`docs/screenshots/${screen}-${width}.png`, scale:'css' });
        }
        if (dpr === 2 && width === 980) await preview.screenshot({path:`docs/screenshots/${screen}-980-200pct.png`,scale:'device'});
        results.push({ screen, width, height, dpr, passed:true });
      }
      if (errors.length) throw Error(errors.join('\n'));
    } finally { await context.close(); }
  }
  return { checks: results.length, passed: results.every(r=>r.passed), sizes, density:[1,1.25,1.5,2] };
}
