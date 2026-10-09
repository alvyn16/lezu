import { shell } from './shell.js';
import { asset, games as demoGames } from './fixtures.js';
import type { Game, LibraryMode } from './domain/models';
import { initialState, visibleGames, activeGame, counts, navigate, toggleSource, openGame } from './state.js';
import { home, library } from './home.js';
import { details, detailsLocation } from './details.js';
import { enableWheelScrolling } from './shelf-scroll.js';
import { addManualGame, cancelScan, desktopErrorMessage, discoverStores, epicCancelDownload, epicConnect, epicDisconnect, epicInstall, epicLaunch, epicSync, gogCancelDownload, gogConnect, gogDisconnect, gogInstall, gogLaunch, gogSync, steamCancel, steamConnect, steamDisconnect, steamInstall, steamLaunch, steamSync, getRuntimeInfo, importStoreGames, isDesktop, launchInstallation, listLibrary, refreshArtwork, revealInstallation, scanFolderPreview, type ScanCandidate, type StoreCandidate } from './services/desktop';
import QRCode from 'qrcode';
import { listen } from '@tauri-apps/api/event';
import { check } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import { open as openFile } from '@tauri-apps/plugin-dialog';
import { openUrl } from '@tauri-apps/plugin-opener';
function required<T extends HTMLElement = HTMLElement>(selector: string, root: ParentNode = document): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`Missing interface element: ${selector}`);
  return element;
}
function displayWindowsPath(path: string): string {
  if (path.startsWith('\\\\?\\UNC\\')) return `\\\\${path.slice(8)}`;
  if (path.startsWith('\\\\?\\')) return path.slice(4);
  return path;
}
required('#app').innerHTML = shell();
const mode: LibraryMode = isDesktop() ? 'desktop' : 'demo';
let games: Game[] = mode === 'demo' ? demoGames : [];
const launchRequests = new Set<string>();
let scanCandidates: ScanCandidate[] = [];
let storeCandidates: StoreCandidate[] = [];
let availableUpdate: Awaited<ReturnType<typeof check>> = null;
let activeDownload: string | null = null;
let steamSigningIn = false;
let downloadProgress: number | null = null;
let scanSequence = 0;
let activeScanSequence: number | null = null;
let state = initialState();
let previousState = state;
let returnFocus: string | null = null;
let returnScroll = { page: 0, shelf: 0 };
const notice = required<HTMLDialogElement>('#notice');
const addGameDialog = required<HTMLDialogElement>('#add-game');
const addGameForm = required<HTMLFormElement>('#add-game-form');
const search = required<HTMLInputElement>('#search');
function notify(title: string, copy: string) {
  notice.classList.remove('settings-dialog');
  notice.querySelector('.settings-content')?.remove();
  notice.querySelector('.notice-image')?.remove();
  notice.querySelector('.dialog-actions')?.remove();
  notice.querySelector('.scan-results')?.remove();
  notice.querySelector('.epic-auth')?.remove();
  notice.querySelector('.gog-auth')?.remove();
  notice.querySelector('.steam-auth')?.remove();
  required('#notice-title').textContent = title;
  required('#notice-copy').textContent = copy;
  if (!notice.open) notice.showModal();
}
function dismissActiveScan() {
  if (activeScanSequence !== null) {
    activeScanSequence = null;
    scanSequence++;
    if (mode === 'desktop') void cancelScan().catch(() => {});
  }
}
notice.addEventListener('cancel', dismissActiveScan);
notice.addEventListener('close', () => { if (steamSigningIn) void steamCancel(); });
function render(focusKey?: string) {
  const game = activeGame(games, state);
  document.documentElement.style.setProperty('--page', game?.theme.page ?? '#30343b');
  document.documentElement.style.setProperty('--sidebar', game?.theme.sidebar ?? '#23272d');
  document.documentElement.style.setProperty('--theme-art', game?.hero ? `url("${asset(game.hero)}")` : 'none');
  if (state.view === 'details' && game) required('#screen').innerHTML = details(game, mode);
  else if (state.view === 'home' && !state.query) required('#screen').innerHTML = home(game, visibleGames(games, state), state, mode);
  else required('#screen').innerHTML = library(visibleGames(games, state), state, mode);
  document.querySelectorAll<HTMLElement>('.cover-shelf').forEach(enableWheelScrolling);
  const context = state.view === 'details' ? previousState : state;
  const selected = context.view === 'home' ? 'home' : context.installedOnly ? 'installed' : context.source;
  document.querySelectorAll<HTMLElement>('[data-nav]').forEach(button => {
    button.removeAttribute('aria-current');
    if (button.closest('nav') && button.dataset.nav === selected) button.setAttribute('aria-current', 'page');
  });
  for (const [id, count] of Object.entries(counts(games, state))) required(`[data-count="${id}"]`).textContent = String(count);
  required('#location').innerHTML = state.view === 'details' && game ? detailsLocation(game) : `<h1>${selected === 'home' ? 'Home' : 'Library'}</h1>`;
  document.title = `${state.view === 'details' && game ? game.title : 'Lezu'} — ${mode === 'desktop' ? 'Game library' : 'UI preview'}`;
  search.value = state.query;
  if (focusKey) document.querySelector<HTMLElement>(`[data-source="${focusKey}"]`)?.focus({ preventScroll: true });
}
async function refreshLibrary() {
  if (mode !== 'desktop') return;
  try {
    games = await listLibrary();
    render();
  } catch (reason) {
    notify('Library unavailable', desktopErrorMessage(reason));
    const actions = document.createElement('div'); actions.className = 'dialog-actions';
    const retry = document.createElement('button'); retry.textContent = 'Try again'; retry.dataset.action = 'refresh-library';
    actions.append(retry); required('form', notice).before(actions);
  }
}
async function chooseManualGame() {
  try {
    if (notice.open) notice.close();
    const picked = await openFile({ multiple: false, directory: false, filters: [{ name: 'Windows games', extensions: ['exe'] }] });
    if (typeof picked !== 'string') return;
    showAddGameDialog(picked);
  } catch (reason) {
    notify('Could not add game', desktopErrorMessage(reason));
  }
}
function showAddGameDialog(path: string, suggestedTitle?: string) {
  const visiblePath = displayWindowsPath(path);
  const filename = visiblePath.split(/[\\/]/).pop() ?? visiblePath;
  required<HTMLInputElement>('#add-game-name').value = suggestedTitle ?? filename.replace(/\.exe$/i, '');
  const pathInput = required<HTMLInputElement>('#add-game-path');
  pathInput.value = visiblePath;
  pathInput.dataset.rawPath = path;
  required<HTMLInputElement>('#add-game-folder').value = visiblePath.slice(0, visiblePath.length - filename.length).replace(/[\\/]$/, '');
  required('#add-game-error').hidden = true;
  addGameDialog.showModal();
  required<HTMLInputElement>('#add-game-name').focus();
}
async function scanChosenFolder() {
  let sequence: number | null = null;
  let unlisten: (() => void) | null = null;
  try {
    dismissActiveScan();
    if (notice.open) notice.close();
    const picked = await openFile({ multiple: false, directory: true, title: 'Choose a game folder to scan' });
    if (typeof picked !== 'string') return;
    sequence = ++scanSequence;
    activeScanSequence = sequence;
    scanCandidates = [];
    notify('Scanning folder', 'Searching subfolders for possible game executables…');
    unlisten = await listen<number>('scan-progress', event => {
      if (activeScanSequence === sequence && notice.open) {
        required('#notice-copy').textContent = 'Searching subfolders… ' + event.payload.toLocaleString() + ' entries checked.';
      }
    });
    if (activeScanSequence !== sequence) return;
    const report = await scanFolderPreview(picked);
    if (activeScanSequence !== sequence) return;
    activeScanSequence = null;
    scanCandidates = report.candidates;
    const limit = report.truncated ? ' The scan reached its safety limit; choose a smaller folder for more results.' : '';
    const warnings = report.warnings ? ` ${report.warnings} folder entries could not be read.` : '';
    notify('Review scan results', `${report.candidates.length} possible ${report.candidates.length === 1 ? 'game' : 'games'} found among ${report.entriesChecked} entries.${warnings}${limit} Select a game to review its title and working folder before adding it.`);
    const list = document.createElement('div'); list.className = 'scan-results';
    for (const [index, candidate] of report.candidates.entries()) {
      const row = document.createElement('div'); row.className = 'scan-result';
      const label = document.createElement('div');
      const title = document.createElement('strong'); title.textContent = candidate.title;
      const path = document.createElement('small'); path.textContent = displayWindowsPath(candidate.executablePath);
      label.append(title, path);
      const button = document.createElement('button'); button.textContent = 'Review'; button.dataset.action = 'review-candidate'; button.dataset.index = String(index);
      row.append(label, button); list.append(row);
    }
    required('form', notice).before(list);
  } catch (reason) {
    if (sequence !== null && activeScanSequence !== sequence) return;
    activeScanSequence = null;
    notify('Folder scan failed', desktopErrorMessage(reason));
  } finally {
    unlisten?.();
  }
}
async function scanStores() {
  let sequence: number | null = null;
  let unlisten: (() => void) | null = null;
  try {
    dismissActiveScan();
    if (notice.open) notice.close();
    sequence = ++scanSequence;
    activeScanSequence = sequence;
    storeCandidates = [];
    notify('Finding installed games', 'Checking Steam, Epic Games, and GOG installations…');
    unlisten = await listen<string>('store-progress', event => {
      if (activeScanSequence === sequence && notice.open) {
        required('#notice-copy').textContent = 'Checking ' + event.payload + ' installations…';
      }
    });
    if (activeScanSequence !== sequence) return;
    const report = await discoverStores();
    if (activeScanSequence !== sequence) return;
    activeScanSequence = null;
    await refreshLibrary();
    storeCandidates = report.candidates;
    const warning = report.warnings ? ' ' + report.warnings + ' entries could not be read.' : '';
    notify('Review found games', report.candidates.length + ' new installed games found.' + warning + ' Existing entries were checked for missing files.');
    if (!storeCandidates.length) return;
    const list = document.createElement('div'); list.className = 'scan-results';
    for (const [index, candidate] of storeCandidates.entries()) {
      const row = document.createElement('div'); row.className = 'scan-result';
      const label = document.createElement('div');
      const title = document.createElement('strong'); title.textContent = candidate.title + ' · ' + candidate.source.toUpperCase();
      const path = document.createElement('small'); path.textContent = displayWindowsPath(candidate.executablePath);
      label.append(title, path);
      const button = document.createElement('button'); button.textContent = 'Add'; button.dataset.action = 'import-store'; button.dataset.index = String(index);
      row.append(label, button); list.append(row);
    }
    const actions = document.createElement('div'); actions.className = 'dialog-actions';
    const addAll = document.createElement('button'); addAll.className = 'primary'; addAll.textContent = 'Add all found games';
    addAll.dataset.action = 'import-all-stores'; actions.append(addAll);
    required('form', notice).before(list, actions);
  } catch (reason) {
    if (sequence !== null && activeScanSequence !== sequence) return;
    activeScanSequence = null;
    notify('Store scan failed', desktopErrorMessage(reason));
  } finally {
    unlisten?.();
  }
}
async function addStoreGames(selected: StoreCandidate[]) {
  try {
    const count = await importStoreGames(selected);
    await refreshLibrary();
    notify('Games added', count + ' game' + (count === 1 ? '' : 's') + ' added to your library.');
    if (count) void refreshArtwork().then(() => refreshLibrary()).catch(() => {});
  } catch (reason) {
    notify('Could not add games', desktopErrorMessage(reason));
  }
}
async function updateArtwork() {
  notify('Finding game covers', 'Checking game folders and store artwork…');
  try {
    const report = await refreshArtwork();
    await refreshLibrary();
    notify('Artwork refreshed', report.updated + ' images added. ' + report.unavailable + ' images are still unavailable. For games without store artwork, add cover.jpg or hero.jpg to the game folder and try again.');
  } catch (reason) {
    notify('Artwork refresh failed', desktopErrorMessage(reason));
  }
}
async function checkForUpdates() {
  notify('Checking for updates', 'Contacting the Lezu release feed…');
  try {
    availableUpdate = await check();
    if (!availableUpdate) { notify('Lezu is up to date', 'No newer signed release is available.'); return; }
    notify('Update available', 'Version ' + availableUpdate.version + ' is ready to download and install.');
    const actions = document.createElement('div'); actions.className = 'dialog-actions';
    const install = document.createElement('button'); install.textContent = 'Install update';
    install.className = 'primary'; install.dataset.action = 'install-update';
    actions.append(install); required('form', notice).before(actions);
  } catch (reason) {
    notify('Update check failed', desktopErrorMessage(reason));
  }
}
function showEpicSignIn() {
  notify('Connect Epic Games', 'Open Epic sign-in, sign in to your account, then paste the authorizationCode shown on the page. Lezu uses it once and keeps the account session on this PC.');
  const fields = document.createElement('div'); fields.className = 'epic-auth';
  const address = document.createElement('p'); address.textContent = 'legendary.gl/epiclogin';
  const label = document.createElement('label'); label.textContent = 'Epic authorization code';
  const input = document.createElement('input'); input.type = 'text'; input.id = 'epic-code'; input.autocomplete = 'off'; input.spellcheck = false; input.maxLength = 2048; input.placeholder = 'Paste authorizationCode or the JSON response';
  label.append(input); fields.append(address, label);
  const actions = document.createElement('div'); actions.className = 'dialog-actions';
  const open = document.createElement('button'); open.type = 'button'; open.textContent = 'Open Epic sign-in'; open.dataset.action = 'open-epic-login';
  const connect = document.createElement('button'); connect.type = 'button'; connect.className = 'primary'; connect.textContent = 'Connect account'; connect.dataset.action = 'submit-epic-code';
  actions.append(open, connect); fields.append(actions);
  required('form', notice).before(fields);
}
async function connectEpic(code: string) {
  notify('Connecting Epic Games', 'Verifying your one-time code and loading your owned games…');
  try {
    await epicConnect(code);
    await syncEpic();
  } catch (reason) {
    notify('Epic sign-in failed', desktopErrorMessage(reason));
  }
}
async function syncEpic() {
  notify('Loading Epic library', 'Fetching your owned Windows games…');
  try {
    const result = await epicSync();
    await refreshLibrary();
    notify('Epic library updated', `${result.count} owned ${result.count === 1 ? 'game' : 'games'} found.`);
    void refreshArtwork().then(() => refreshLibrary()).catch(() => {});
  } catch (reason) {
    notify('Epic library unavailable', desktopErrorMessage(reason));
  }
}
async function disconnectEpic() {
  notify('Signing out of Epic', 'Removing the Epic session and owned-game entries from Lezu…');
  try {
    await epicDisconnect();
    await refreshLibrary();
    notify('Epic signed out', 'Installed game files were left in place.');
  } catch (reason) { notify('Epic sign-out failed', desktopErrorMessage(reason)); }
}
async function connectSteam() {
  if (steamSigningIn) return;
  steamSigningIn = true;
  notify('Connect Steam', 'Open Steam Mobile, choose the QR sign-in scanner, and approve this Lezu sign-in. Your password stays with Steam.');
  const area = document.createElement('div'); area.className = 'steam-auth';
  const image = document.createElement('img'); image.alt = 'Steam Mobile sign-in QR code'; image.hidden = true;
  const hint = document.createElement('p'); hint.textContent = 'Preparing a Steam QR code…';
  area.append(image, hint);
  const actions = document.createElement('div'); actions.className = 'dialog-actions';
  const cancel = document.createElement('button'); cancel.textContent = 'Cancel sign-in'; cancel.dataset.action = 'cancel-steam-login';
  actions.append(cancel); area.append(actions); required('form', notice).before(area);
  let unlisten: (() => void) | undefined;
  try {
    unlisten = await listen<{ status: string; url: string | null }>('steam-login-event', event => {
      if (!steamSigningIn) return;
      if (event.payload.status === 'qr' && event.payload.url) {
        void QRCode.toDataURL(event.payload.url, { margin: 2, width: 240, color: { dark: '#111827', light: '#ffffff' } })
          .then(url => { if (steamSigningIn) { image.src = url; image.hidden = false; hint.textContent = 'Scan with Steam Mobile and approve the sign-in.'; } });
      } else if (event.payload.status === 'scanned') {
        hint.textContent = 'QR code scanned. Approve the sign-in in Steam Mobile.';
      }
    });
    await steamConnect();
    steamSigningIn = false;
    await syncSteam();
  } catch (reason) {
    steamSigningIn = false;
    if ((reason as { code?: string })?.code !== 'steam_cancelled') notify('Steam sign-in failed', desktopErrorMessage(reason));
  } finally { unlisten?.(); }
}
async function syncSteam() {
  notify('Loading Steam library', 'Fetching your owned games…');
  try {
    const result = await steamSync();
    await refreshLibrary();
    notify('Steam library updated', `${result.count} owned ${result.count === 1 ? 'game' : 'games'} found.`);
    void refreshArtwork().then(() => refreshLibrary()).catch(() => {});
  } catch (reason) { notify('Steam library unavailable', desktopErrorMessage(reason)); }
}
async function disconnectSteam() {
  notify('Signing out of Steam', 'Removing the Steam account session and owned-game entries…');
  try { await steamDisconnect(); await refreshLibrary(); notify('Steam signed out', 'Installed game files were left in place.'); }
  catch (reason) { notify('Steam sign-out failed', desktopErrorMessage(reason)); }
}
const gogLoginUrl = 'https://auth.gog.com/auth?client_id=46899977096215655&redirect_uri=https%3A%2F%2Fembed.gog.com%2Fon_login_success%3Forigin%3Dclient&response_type=code&layout=client2';
function showGogSignIn() {
  notify('Connect GOG', 'After sign-in, GOG may leave a blank browser page. Copy its full address-bar URL containing code= and paste it below. Do not paste your email or two-step verification code.');
  const fields = document.createElement('div'); fields.className = 'gog-auth';
  const label = document.createElement('label'); label.textContent = 'Final GOG address-bar URL';
  const input = document.createElement('input'); input.type = 'text'; input.id = 'gog-code'; input.autocomplete = 'off'; input.spellcheck = false; input.maxLength = 2048; input.placeholder = 'Paste the final GOG URL or code';
  label.append(input); fields.append(label);
  const actions = document.createElement('div'); actions.className = 'dialog-actions';
  const open = document.createElement('button'); open.type = 'button'; open.textContent = 'Open GOG sign-in'; open.dataset.action = 'open-gog-login';
  const connect = document.createElement('button'); connect.type = 'button'; connect.className = 'primary'; connect.textContent = 'Connect account'; connect.dataset.action = 'submit-gog-code';
  actions.append(open, connect); fields.append(actions);
  required('form', notice).before(fields);
}
async function connectGog(code: string) {
  notify('Connecting GOG', 'Verifying your one-time code…');
  try { await gogConnect(code); await syncGog(); }
  catch (reason) { notify('GOG sign-in failed', desktopErrorMessage(reason)); }
}
async function syncGog() {
  notify('Loading GOG library', 'Fetching your owned Windows games…');
  try {
    const result = await gogSync();
    await refreshLibrary();
    notify('GOG library updated', `${result.count} owned ${result.count === 1 ? 'game' : 'games'} found.`);
    void refreshArtwork().then(() => refreshLibrary()).catch(() => {});
  } catch (reason) { notify('GOG library unavailable', desktopErrorMessage(reason)); }
}
async function disconnectGog() {
  notify('Signing out of GOG', 'Removing the GOG session and owned-game entries…');
  try { await gogDisconnect(); await refreshLibrary(); notify('GOG signed out', 'Installed game files were left in place.'); }
  catch (reason) { notify('GOG sign-out failed', desktopErrorMessage(reason)); }
}
function showDownload() {
  const selected = games.find(game => game.id === activeDownload);
  const title = selected?.title ?? 'game';
  notify('Downloading ' + title, downloadProgress === null
    ? 'Downloading game files…' : `Downloaded ${downloadProgress}% of game data.`);
  const actions = document.createElement('div'); actions.className = 'dialog-actions';
  const cancel = document.createElement('button'); cancel.textContent = 'Cancel download'; cancel.dataset.action = selected?.source === 'gog' ? 'cancel-gog-download' : selected?.source === 'steam' ? 'cancel-steam-download' : 'cancel-epic-download';
  actions.append(cancel); required('form', notice).before(actions);
}
async function downloadGog(id: string) {
  if (activeDownload) { showDownload(); return; }
  const selected = games.find(game => game.id === id);
  if (!selected?.owned || selected.source !== 'gog') return;
  try {
    const folder = await openFile({ multiple: false, directory: true, title: `Choose a library folder for ${selected.title}` });
    if (typeof folder !== 'string') return;
    activeDownload = id; downloadProgress = null; showDownload();
    await gogInstall(id, folder);
    await refreshLibrary();
    notify('Download complete', `${selected.title} is installed.`);
  } catch (reason) { notify('Download stopped', desktopErrorMessage(reason)); }
  finally { activeDownload = null; downloadProgress = null; }
}
async function downloadSteam(id: string) {
  if (activeDownload) { showDownload(); return; }
  const selected = games.find(game => game.id === id);
  if (!selected?.owned || selected.source !== 'steam') return;
  try {
    const folder = await openFile({ multiple: false, directory: true, title: `Choose a Steam library folder for ${selected.title}` });
    if (typeof folder !== 'string') return;
    activeDownload = id; downloadProgress = null; showDownload();
    await steamInstall(id, folder);
    await refreshLibrary();
    notify('Download complete', `${selected.title} is installed.`);
  } catch (reason) { notify('Download stopped', desktopErrorMessage(reason)); }
  finally { activeDownload = null; downloadProgress = null; }
}
async function downloadEpic(id: string) {
  if (activeDownload) { showDownload(); return; }
  const selected = games.find(game => game.id === id);
  if (!selected?.owned || selected.source !== 'epic') return;
  try {
    const folder = await openFile({ multiple: false, directory: true, title: `Choose where to install ${selected.title}` });
    if (typeof folder !== 'string') return;
    activeDownload = id;
    downloadProgress = null;
    showDownload();
    const unlisten = await listen<{ gameId: string; percent: number | null }>('epic-download-progress', event => {
      if (event.payload.gameId !== activeDownload) return;
      downloadProgress = event.payload.percent;
      if (notice.open) required('#notice-copy').textContent = downloadProgress === null
        ? 'Downloading…' : `Downloaded ${downloadProgress}% of game data.`;
    });
    try {
      await epicInstall(id, folder);
      await refreshLibrary();
      notify('Download complete', `${selected.title} is installed.`);
    } finally { unlisten(); }
  } catch (reason) {
    notify('Download stopped', desktopErrorMessage(reason));
  } finally { activeDownload = null; downloadProgress = null; }
}
async function installAvailableUpdate() {
  const update = availableUpdate;
  if (!update) return;
  availableUpdate = null;
  notify('Installing update', 'Downloading the signed Windows installer…');
  let downloaded = 0;
  let total = 0;
  try {
    await update.downloadAndInstall(event => {
      if (event.event === 'Started') total = event.data.contentLength ?? 0;
      if (event.event === 'Progress') downloaded += event.data.chunkLength;
      if (notice.open) required('#notice-copy').textContent = total
        ? 'Downloaded ' + Math.min(100, Math.floor(downloaded / total * 100)) + '% of the signed update.'
        : 'Downloading the signed update…';
    });
    notify('Update installed', 'Lezu will restart to finish the update.');
    await relaunch();
  } catch (reason) {
    notify('Update failed', desktopErrorMessage(reason));
  }
}
addGameForm.addEventListener('submit', event => {
  event.preventDefault();
  if (mode !== 'desktop') return;
  const submit = required<HTMLButtonElement>('button[type="submit"]', addGameForm);
  submit.disabled = true;
  const error = required('#add-game-error');
  error.hidden = true;
  void (async () => {
    try {
      const pathInput = required<HTMLInputElement>('#add-game-path');
      await addManualGame(
        pathInput.dataset.rawPath ?? pathInput.value,
        required<HTMLInputElement>('#add-game-name').value,
        required<HTMLInputElement>('#add-game-folder').value,
      );
      addGameDialog.close();
      await refreshLibrary();
      state = navigate(state, 'all');
      render();
    } catch (reason) {
      error.textContent = desktopErrorMessage(reason);
      error.hidden = false;
    } finally { submit.disabled = false; }
  })();
});
async function playGame(id: string) {
  if (launchRequests.has(id)) return;
  const selected = games.find(game => game.id === id);
  if (selected?.source === 'epic' && selected.owned && selected.installed) {
    launchRequests.add(id);
    try { await epicLaunch(id); }
    catch (reason) { notify('Game could not start', desktopErrorMessage(reason)); }
    finally { launchRequests.delete(id); }
    return;
  }
  if (selected?.source === 'gog' && selected.owned && selected.installed && !selected.installationId) {
    launchRequests.add(id);
    try { await gogLaunch(id); }
    catch (reason) { notify('Game could not start', desktopErrorMessage(reason)); }
    finally { launchRequests.delete(id); }
    return;
  }
  if (selected?.source === 'steam' && selected.owned && selected.installed && !selected.installationId) {
    launchRequests.add(id);
    try { await steamLaunch(id); }
    catch (reason) { notify('Game could not start', desktopErrorMessage(reason)); }
    finally { launchRequests.delete(id); }
    return;
  }
  const installationId = selected?.installationId;
  if (!installationId) { notify('Installation unavailable', 'Select an installed game before playing.'); return; }
  launchRequests.add(id);
  try { await launchInstallation(installationId); }
  catch (reason) { notify('Game could not start', desktopErrorMessage(reason)); }
  finally { launchRequests.delete(id); }
}
async function openGameFolder() {
  const installationId = activeGame(games, state)?.installationId;
  if (!installationId) { notify('Folder unavailable', 'This game has no installation folder.'); return; }
  try { await revealInstallation(installationId); }
  catch (reason) { notify('Folder unavailable', desktopErrorMessage(reason)); }
}
search.addEventListener('input', () => { state = { ...state, view: state.view === 'details' ? 'library' : state.view, query: search.value }; render(); window.scrollTo(0, 0); });
document.addEventListener('click', event => {
  if (!(event.target instanceof Element)) return;
  const button = event.target.closest('button');
  if (!button) return;
  const { nav, source, play, game, action, screenshot } = button.dataset;
  if (nav === 'downloads') {
    if (mode === 'demo') notify('Downloads unavailable', 'The browser preview uses sample games. Downloads are available in the Windows app for connected store accounts.');
    else if (activeDownload) showDownload();
    else notify('Downloads', 'No game is downloading right now. Open an owned game to start a download.');
  }
  else if (nav) {
    const fromSidebar = !!button.closest('nav');
    state = navigate(state, nav); render(); window.scrollTo(0, 0);
    if (!fromSidebar) document.querySelector<HTMLElement>(`nav [data-nav="${nav}"]`)?.focus();
  }
  else if (source) { state = toggleSource(state, source); render(source); }
  else if (play) {
    if (mode === 'demo') notify('Launching unavailable', 'This preview uses demo games. Game launching isn’t available yet.');
    else void playGame(play);
  }
  else if (game) {
    previousState = state;
    returnFocus = button.classList.contains('cover-button') ? `[data-game="${game}"].cover-button` : `[data-game="${game}"]`;
    returnScroll = { page: window.scrollY, shelf: document.querySelector('.cover-shelf')?.scrollLeft ?? 0 };
    state = openGame(state, game); render(); window.scrollTo(0, 0);
    required('[data-action="back"]').focus({ preventScroll: true });
  }
  else if (action === 'back') {
    state = previousState; render();
    const shelf = document.querySelector('.cover-shelf');
    if (shelf) shelf.scrollLeft = returnScroll.shelf;
    window.scrollTo(0, returnScroll.page);
    if (returnFocus) document.querySelector<HTMLElement>(returnFocus)?.focus({ preventScroll: true });
  }
  else if (action === 'folder') {
    if (mode === 'demo') notify('Folder unavailable', 'This demo game has no installation folder.');
    else void openGameFolder();
  }
  else if (action === 'add-manual' && mode === 'desktop') void chooseManualGame();
  else if (action === 'scan-folder' && mode === 'desktop') void scanChosenFolder();
  else if (action === 'scan-stores' && mode === 'desktop') void scanStores();
  else if (action === 'import-store' && mode === 'desktop') {
    const candidate = storeCandidates[Number(button.dataset.index)];
    if (candidate) void addStoreGames([candidate]);
  }
  else if (action === 'import-all-stores' && mode === 'desktop') void addStoreGames(storeCandidates);
  else if (action === 'refresh-artwork' && mode === 'desktop') void updateArtwork();
  else if (action === 'check-update' && mode === 'desktop') void checkForUpdates();
  else if (action === 'connect-epic' && mode === 'desktop') showEpicSignIn();
  else if (action === 'open-epic-login' && mode === 'desktop') void openUrl('https://legendary.gl/epiclogin').catch(reason => notify('Could not open Epic sign-in', desktopErrorMessage(reason)));
  else if (action === 'submit-epic-code' && mode === 'desktop') {
    const code = required<HTMLInputElement>('#epic-code', notice).value.trim();
    if (!code) { required<HTMLInputElement>('#epic-code', notice).focus(); return; }
    void connectEpic(code);
  }
  else if (action === 'sync-epic' && mode === 'desktop') void syncEpic();
  else if (action === 'disconnect-epic' && mode === 'desktop') void disconnectEpic();
  else if (action === 'connect-gog' && mode === 'desktop') showGogSignIn();
  else if (action === 'open-gog-login' && mode === 'desktop') void openUrl(gogLoginUrl).catch(reason => notify('Could not open GOG sign-in', desktopErrorMessage(reason)));
  else if (action === 'submit-gog-code' && mode === 'desktop') {
    const code = required<HTMLInputElement>('#gog-code', notice).value.trim();
    if (!code) { required<HTMLInputElement>('#gog-code', notice).focus(); return; }
    void connectGog(code);
  }
  else if (action === 'sync-gog' && mode === 'desktop') void syncGog();
  else if (action === 'disconnect-gog' && mode === 'desktop') void disconnectGog();
  else if (action === 'connect-steam' && mode === 'desktop') void connectSteam();
  else if (action === 'cancel-steam-login' && mode === 'desktop') { void steamCancel(); notice.close(); }
  else if (action === 'sync-steam' && mode === 'desktop') void syncSteam();
  else if (action === 'disconnect-steam' && mode === 'desktop') void disconnectSteam();
  else if (action === 'install-epic' && mode === 'desktop' && button.dataset.id) void downloadEpic(button.dataset.id);
  else if (action === 'install-gog' && mode === 'desktop' && button.dataset.id) void downloadGog(button.dataset.id);
  else if (action === 'install-steam' && mode === 'desktop' && button.dataset.id) void downloadSteam(button.dataset.id);
  else if (action === 'cancel-epic-download' && mode === 'desktop') void epicCancelDownload();
  else if (action === 'cancel-gog-download' && mode === 'desktop') void gogCancelDownload();
  else if (action === 'cancel-steam-download' && mode === 'desktop') void steamCancel();
  else if (action === 'install-update' && mode === 'desktop') void installAvailableUpdate();
  else if (action === 'review-candidate' && mode === 'desktop') {
    const candidate = scanCandidates[Number(button.dataset.index)];
    if (candidate) { notice.close(); showAddGameDialog(candidate.executablePath, candidate.title); }
  }
  else if (action === 'cancel-add') addGameDialog.close();
  else if (action === 'dismiss-notice') dismissActiveScan();
  else if (action === 'refresh-library' && mode === 'desktop') { notice.close(); void refreshLibrary(); }
  else if (action === 'more') {
    notify('Game actions', 'Choose the game shown on Home.');
    const actions = document.createElement('div'); actions.className = 'dialog-actions';
    const feature = document.createElement('button'); feature.textContent = 'Feature on Home'; feature.dataset.action = 'feature';
    actions.append(feature); required('form', notice).before(actions);
  }
  else if (action === 'feature') {
    state = { ...navigate(state, 'home'), featuredId: state.selectedId };
    notice.close(); render(); window.scrollTo(0, 0); required('nav [data-nav="home"]').focus();
  }
  else if (screenshot) {
    notify('Game screenshot', 'Artwork shown from the game’s official media.');
    const image = document.createElement('img'); image.className = 'notice-image'; image.src = asset(screenshot); image.alt = button.getAttribute('aria-label') ?? 'Game screenshot';
    required('form', notice).before(image);
  }
  else if (action === 'reset') { state = initialState(); render(); search.focus(); }
  else if (action === 'settings') {
    notify(mode === 'demo' ? 'Preview settings' : 'Settings', mode === 'demo'
      ? 'Browse demo games using search and store filters. Scanning, game launching, and downloads aren’t available yet. Changes reset when you refresh.'
      : 'Connect a store account to add owned games, or find games already installed on this PC.');
    if (mode === 'desktop') {
      notice.classList.add('settings-dialog');
      const content = document.createElement('div'); content.className = 'settings-content';
      const accounts = document.createElement('section'); accounts.className = 'settings-section';
      const accountHeading = document.createElement('h3'); accountHeading.textContent = 'Store accounts';
      const accountList = document.createElement('div'); accountList.className = 'settings-accounts';
      for (const [name, source, connect, sync, disconnect] of [
        ['Steam', 'steam', 'connect-steam', 'sync-steam', 'disconnect-steam'],
        ['Epic Games', 'epic', 'connect-epic', 'sync-epic', 'disconnect-epic'],
        ['GOG', 'gog', 'connect-gog', 'sync-gog', 'disconnect-gog'],
      ] as const) {
        const row = document.createElement('div'); row.className = 'settings-account';
        const identity = document.createElement('div'); identity.className = 'settings-account-name';
        const label = document.createElement('strong'); label.textContent = name;
        const count = document.createElement('span');
        const total = games.filter(game => game.source === source).length;
        count.textContent = `${total} ${total === 1 ? 'game' : 'games'} in library`;
        identity.append(label, count);
        const controls = document.createElement('div'); controls.className = 'settings-account-actions';
        for (const [text, action] of [['Connect', connect], ['Refresh', sync], ['Sign out', disconnect]] as const) {
          const control = document.createElement('button'); control.type = 'button'; control.textContent = text;
          control.dataset.action = action;
          control.setAttribute('aria-label', `${text} ${name}`);
          controls.append(control);
        }
        row.append(identity, controls); accountList.append(row);
      }
      accounts.append(accountHeading, accountList);
      const librarySection = document.createElement('section'); librarySection.className = 'settings-section';
      const libraryHeading = document.createElement('h3'); libraryHeading.textContent = 'On this PC';
      const tools = document.createElement('div'); tools.className = 'settings-tools';
      for (const [title, description, action] of [
        ['Find installed games', 'Check Steam, Epic Games, and GOG folders.', 'scan-stores'],
        ['Scan a folder', 'Search a folder and its subfolders.', 'scan-folder'],
        ['Add a game', 'Choose an executable yourself.', 'add-manual'],
        ['Find game covers', 'Refresh missing artwork in your library.', 'refresh-artwork'],
      ] as const) {
        const button = document.createElement('button'); button.type = 'button'; button.className = 'settings-tool'; button.dataset.action = action;
        const heading = document.createElement('strong'); heading.textContent = title;
        const copy = document.createElement('span'); copy.textContent = description;
        button.append(heading, copy); tools.append(button);
      }
      librarySection.append(libraryHeading, tools);
      const update = document.createElement('button'); update.type = 'button'; update.className = 'settings-update';
      update.textContent = 'Check for updates'; update.dataset.action = 'check-update';
      content.append(accounts, librarySection, update); required('form', notice).before(content);
    }
  }
});
document.addEventListener('focusin', event => {
  if (!(event.target instanceof Element)) return;
  const card = event.target.closest('.game-card');
  if (card) card.scrollIntoView({ block: 'nearest', inline: 'nearest' });
});
document.addEventListener('error', event => {
  const img = event.target;
  if (!(img instanceof HTMLImageElement)) return;
  img.hidden = true;
  const cover = img.closest('.cover-button');
  if (cover) cover.insertAdjacentHTML('beforeend', '<span class="cover-fallback">Artwork unavailable</span>');
  else if (img.classList.contains('game-logo')) {
    const title = document.createElement('h2'); title.className = img.className.replace('game-logo', 'game-title'); title.textContent = img.alt; title.title = img.alt;
    img.replaceWith(title);
  }
}, true);
render();
if (isDesktop()) {
  required('.preview-label').textContent = 'Desktop · your library';
  void refreshLibrary();
  getRuntimeInfo().then(info => {
    if (info?.libraryMode !== 'desktop') notify('Desktop version mismatch', 'The desktop host and library interface are out of sync. Restart Lezu.');
  }).catch(() => notify('Desktop connection unavailable', 'Lezu could not reach its desktop service. Restart the app to try again.'));
}
