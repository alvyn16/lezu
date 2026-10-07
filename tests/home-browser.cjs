async page => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.reload();
  await page.getByRole('heading', { name: 'Ready to Play' }).waitFor();
  await page.getByRole('searchbox').fill('no matching game');
  await page.getByRole('heading', { name: 'No games found' }).waitFor();
  if (!(await page.getByRole('searchbox').evaluate(el => el === document.activeElement))) throw Error('Search lost focus');
  await page.getByRole('searchbox').fill('');
  const epic = page.getByRole('switch', { name: 'Include Epic Games sample games' });
  await epic.click();
  if (await epic.getAttribute('aria-checked') !== 'false') throw Error('Source switch failed');
  if (!(await epic.evaluate(el => el === document.activeElement))) throw Error('Switch lost focus');
  if (await page.getByRole('button', { name: 'View Sifu', exact: true }).count()) throw Error('Disabled source still visible');
  await epic.click();
  await page.getByRole('button', { name: 'View Balatro', exact: true }).focus();
  const card = await page.getByRole('button', { name: 'View Balatro', exact: true }).boundingBox();
  if (card.x + card.width > 980) throw Error('Keyboard focus did not reveal offscreen card');
  await page.reload();
  await page.getByRole('heading', { name: 'Ready to Play' }).waitFor();
  await page.screenshot({ path: 'docs/screenshots/home-980.png' });
  if (errors.length) throw Error(errors.join('\n'));
  return { errors, search: 'passed', sourceSwitch: 'passed', keyboardReveal: 'passed' };
}
