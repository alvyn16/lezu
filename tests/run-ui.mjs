import { spawnSync } from 'node:child_process';

// Uses the separately installed Playwright CLI and a running local preview.
// Arguments are a fixed list, never constructed from page or user input.
const commands = [
  'open http://127.0.0.1:4173 --browser=chrome',
  ...['home', 'details', 'edge', 'wheel', 'title-fallback', 'resolution', 'scan-race', 'store-scan', 'epic', 'gog', 'steam', 'downloads', 'settings', 'startup', 'featured'].flatMap(name => [
    'resize 980 760',
    `run-code --filename=tests/${name}-browser.cjs`,
  ]),
];
for (const command of commands) {
  const args = `playwright-cli -s=lezu-fresh ${command}`;
  const result = process.platform === 'win32'
    ? spawnSync('cmd.exe', ['/d', '/s', '/c', args], { encoding: 'utf8' })
    : spawnSync('playwright-cli', ['-s=lezu-fresh', ...command.split(' ')], { encoding: 'utf8' });
  const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
  if (result.error || result.status !== 0 || output.includes('### Error')) {
    console.error(output, result.error ?? '');
    process.exit(1);
  }
  console.log(`${command}: passed`);
  const summary = output.match(/### Result\r?\n([^\r\n]+)/)?.[1];
  if (summary) console.log(summary);
}
