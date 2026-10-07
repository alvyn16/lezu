async page => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.reload();
  const card = page.getByRole('button', { name: 'View Sifu', exact: true });
  await card.focus(); await card.press('Enter');
  await page.getByRole('heading', { name: 'Sifu', exact: true }).waitFor();
  if (!(await page.getByRole('button', { name: 'Back to library' }).evaluate(el => el === document.activeElement))) throw Error('Details focus failed');
  const sifuTheme = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--page'));
  await page.screenshot({ path: 'docs/screenshots/details-980.png' });
  await page.getByRole('button', { name: 'Back to library' }).click();
  if (!(await card.evaluate(el => el === document.activeElement))) throw Error('Return focus failed');
  await card.press('Enter');
  await page.getByRole('button', { name: 'More game actions' }).click();
  await page.getByRole('button', { name: 'Feature on Home' }).click();
  const homeTheme = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--page'));
  if (homeTheme !== sifuTheme) throw Error('Featured theme not applied to Home');
  await page.getByRole('button', { name: 'About Sifu' }).click();
  await page.getByRole('searchbox').fill('witcher');
  await page.getByRole('heading', { name: 'Search results' }).waitFor();
  await page.getByRole('button', { name: 'View The Witcher 3: Wild Hunt — Complete Edition', exact: true }).focus();
  await page.keyboard.press('Enter');
  const witcherTheme = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--page'));
  if (sifuTheme === witcherTheme) throw Error('Theme did not change across games');
  if (errors.length) throw Error(errors.join('\n'));
  return { errors, details: 'passed', returnFocus: 'passed', themeChanges: 'passed', searchFromDetails: 'passed' };
}
