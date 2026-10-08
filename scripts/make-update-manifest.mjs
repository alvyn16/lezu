import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const [repository, tag] = process.argv.slice(2);
if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository ?? '') ||
    !/^v?\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.-]+)?$/.test(tag ?? '')) {
  throw new Error('Usage: node scripts/make-update-manifest.mjs owner/repo vX.Y.Z');
}
const config = JSON.parse(readFileSync('src-tauri/tauri.conf.json', 'utf8'));
const version = config.version;
if (tag.replace(/^v/, '') !== version) throw new Error(`Tag ${tag} does not match app version ${version}`);
const expectedEndpoint = `https://github.com/${repository}/releases/latest/download/latest.json`;
if (!config.plugins.updater.endpoints.includes(expectedEndpoint)) {
  throw new Error(`Updater endpoint must match ${expectedEndpoint}`);
}
const directory = 'src-tauri/target/release/bundle/nsis';
const installers = readdirSync(directory).filter(name => name === `Lezu_${version}_x64-setup.exe`);
if (installers.length !== 1) throw new Error(`Expected one signed NSIS installer for ${version}`);
const installer = installers[0];
const signature = readFileSync(join(directory, `${installer}.sig`), 'utf8').trim();
if (!signature) throw new Error('Installer signature is empty');
const manifest = {
  version,
  notes: `Lezu ${version}`,
  platforms: {
    'windows-x86_64': {
      signature,
      url: `https://github.com/${repository}/releases/download/${tag}/${installer}`,
    },
  },
};
const output = join(directory, 'latest.json');
writeFileSync(output, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Created ${output} for ${installer}`);
