import { shell } from './shell.js';
import { asset, games as demoGames } from './fixtures.js';
import type { Game, LibraryMode } from './domain/models';
import { initialState, visibleGames, activeGame, counts, navigate, toggleSource, openGame } from './state.js';
import { home, library } from './home.js';
import { details, detailsLocation } from './details.js';
import { downloads } from './downloads.js';
import { enableWheelScrolling } from './shelf-scroll.js';
import { addManualGame, beginDownload, cancelScan, clearDownloadHistory, desktopErrorMessage, discoverStores, epicCancelDownload, epicConnect, epicDisconnect, epicInstall, epicLaunch, epicSync, finishDownload, getInstallLocation, gogCancelDownload, gogConnect, gogDisconnect, gogInstall, gogLaunch, gogSync, steamCancel, steamConnect, steamDisconnect, steamInstall, steamLaunch, steamSync, getLibraryArtwork, getRuntimeInfo, importStoreGames, isDesktop, launchInstallation, listDownloads, listLibrary, refreshArtwork, revealInstallation, scanFolderPreview, setDownloadProgress, setInstallLocation, setSteamGridDbKey, steamGridDbKeyStatus, type DownloadRecord, type ScanCandidate, type StoreCandidate } from './services/desktop';
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
let libraryLoading = mode === 'desktop';
let libraryRequest = 0;
let artworkRequest = 0;
const artworkCache = new Map<string, { cover?: string | null; hero?: string | null }>();
const loadingHeroes = new Map<string, number>();
const launchRequests = new Set<string>();
let scanCandidates: ScanCandidate[] = [];
let storeCandidates: StoreCandidate[] = [];
let availableUpdate: Awaited<ReturnType<typeof check>> = null;
let activeDownload: string | null = null;
let activeDownloadJob: string | null = null;
let startingDownload = false;
let downloadRecords: DownloadRecord[] = [];
let downloadsLoading = false;
let downloadsProblem: string | null = null;
let downloadsRequest = 0;
let steamSigningIn = false;
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
  const game = state.view === 'downloads' ? null : activeGame(games, state);
  document.documentElement.style.setProperty('--page', game?.theme.page ?? '#30343b');
  document.documentElement.style.setProperty('--sidebar', game?.theme.sidebar ?? '#23272d');
  document.documentElement.style.setProperty('--theme-art', game?.hero ? `url("${asset(game.hero)}")` : 'none');
  if (state.view === 'downloads') required('#screen').innerHTML = downloads(downloadRecords, mode, downloadsLoading, downloadsProblem);
  else if (libraryLoading) required('#screen').innerHTML = '<section class="library-section"><div class="empty-state" role="status"><h2>Loading your library…</h2></div></section>';
  else if (state.view === 'details' && game) required('#screen').innerHTML = details(game, mode);
  else if (state.view === 'home' && !state.query) required('#screen').innerHTML = home(game, visibleGames(games, state), state, mode);
  else required('#screen').innerHTML = library(visibleGames(games, state), state, mode);
  document.querySelectorAll<HTMLElement>('.cover-shelf').forEach(enableWheelScrolling);
  const context = state.view === 'details' ? previousState : state;
  const selected = state.view === 'downloads' ? 'downloads' : context.view === 'home' ? 'home' : context.installedOnly ? 'installed' : context.source;
  document.querySelectorAll<HTMLElement>('[data-nav]').forEach(button => {
    button.removeAttribute('aria-current');
    if (button.closest('nav') && button.dataset.nav === selected) button.setAttribute('aria-current', 'page');
  });
  for (const [id, count] of Object.entries(counts(games, state))) required(`[data-count="${id}"]`).textContent = String(count);
  required('#location').innerHTML = state.view === 'details' && game ? detailsLocation(game) : `<h1>${selected === 'home' ? 'Home' : selected === 'downloads' ? 'Downloads' : 'Library'}</h1>`;
  document.title = `${state.view === 'details' && game ? game.title : 'Lezu'} — ${mode === 'desktop' ? 'Game library' : 'UI preview'}`;
  search.value = state.query;
  required<HTMLElement>('.search').hidden = state.view === 'downloads';
  if (focusKey) document.querySelector<HTMLElement>(`[data-source="${focusKey}"]`)?.focus({ preventScroll: true });
  if (mode === 'desktop' && game && !game.hero) void loadHero(game.id);
}
function updateCover(gameId: string, image: string | null) {
  document.querySelectorAll<HTMLButtonElement>('.cover-button[data-game]').forEach(button => {
    if (button.dataset.game !== gameId) return;
    if (!image) {
      const label = button.querySelector('.cover-fallback span');
      if (label) label.textContent = 'Artwork unavailable';
      return;
    }
    button.querySelector('.cover-fallback')?.remove();
    const cover = button.querySelector('img') ?? document.createElement('img');
    cover.src = asset(image);
    cover.alt = '';
    cover.loading = 'lazy';
    if (!cover.isConnected) button.prepend(cover);
  });
}
async function loadHero(gameId: string) {
  if (loadingHeroes.get(gameId) === artworkRequest || artworkCache.get(gameId)?.hero !== undefined) return;
  const request = artworkRequest;
  loadingHeroes.set(gameId, request);
  try {
    const image = (await getLibraryArtwork([gameId], 'hero'))?.[0]?.image ?? null;
    if (request !== artworkRequest) return;
    artworkCache.set(gameId, { ...artworkCache.get(gameId), hero: image });
    const game = games.find(entry => entry.id === gameId);
    if (game) game.hero = image;
    if (image && activeGame(games, state)?.id === gameId) {
      document.documentElement.style.setProperty('--theme-art', `url("${asset(image)}")`);
      const hero = document.querySelector('.home-hero, .details-hero');
      if (hero && !hero.querySelector('.hero-art')) {
        const picture = document.createElement('img');
        picture.className = 'hero-art'; picture.src = asset(image); picture.alt = '';
        hero.prepend(picture);
      }
    }
  } catch { /* Library metadata remains usable if artwork is unavailable. */ }
  finally { if (loadingHeroes.get(gameId) === request) loadingHeroes.delete(gameId); }
}
async function loadCovers(request: number) {
  const pending = games.filter(game => artworkCache.get(game.id)?.cover === undefined).map(game => game.id);
  for (let index = 0; index < pending.length && request === artworkRequest; index += 12) {
    const ids = pending.slice(index, index + 12);
    try {
      const found = await getLibraryArtwork(ids, 'cover');
      if (request !== artworkRequest) return;
      const byId = new Map((found ?? []).map(entry => [entry.gameId, entry.image]));
      for (const id of ids) {
        const image = byId.get(id) ?? null;
        artworkCache.set(id, { ...artworkCache.get(id), cover: image });
        const game = games.find(entry => entry.id === id);
        if (game) { game.cover = image; game.artworkPending = false; }
        updateCover(id, image);
      }
    } catch {
      for (const id of ids) {
        const game = games.find(entry => entry.id === id);
        if (game) game.artworkPending = false;
        updateCover(id, null);
      }
      return;
    }
  }
}
async function refreshLibrary(artworkChanged: boolean | string = false) {
  if (mode !== 'desktop') return;
  const request = ++libraryRequest;
  try {
    const nextGames = await listLibrary();
    if (request !== libraryRequest) return;
    if (typeof artworkChanged === 'string') artworkCache.delete(artworkChanged);
    else if (artworkChanged) artworkCache.clear();
    artworkRequest++;
    games = nextGames.map(game => ({ ...game, cover: artworkCache.get(game.id)?.cover ?? null, hero: artworkCache.get(game.id)?.hero ?? null, artworkPending: artworkCache.get(game.id)?.cover === undefined }));
    libraryLoading = false;
    render();
    void loadCovers(artworkRequest);
  } catch (reason) {
    if (request !== libraryRequest) return;
    libraryLoading = false;
    render();
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
    if (count) void refreshArtwork().then(() => refreshLibrary(true)).catch(() => {});
  } catch (reason) {
    notify('Could not add games', desktopErrorMessage(reason));
  }
}
async function updateArtwork(gameId?: string) {
  notify('Refreshing artwork', gameId ? 'Checking this game’s artwork sources…' : 'Checking artwork sources for every game…');
  try {
    const report = await refreshArtwork(gameId, true);
    await refreshLibrary(gameId ?? true);
    notify('Artwork refreshed', report.updated + ' images updated. ' + report.unavailable + ' images are still unavailable. Add cover.jpg or hero.jpg to a game folder, or configure SteamGridDB in Settings, and try again.');
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
    void refreshArtwork().then(() => refreshLibrary(true)).catch(() => {});
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
    void refreshArtwork().then(() => refreshLibrary(true)).catch(() => {});
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
    void refreshArtwork().then(() => refreshLibrary(true)).catch(() => {});
  } catch (reason) { notify('GOG library unavailable', desktopErrorMessage(reason)); }
}
async function disconnectGog() {
  notify('Signing out of GOG', 'Removing the GOG session and owned-game entries…');
  try { await gogDisconnect(); await refreshLibrary(); notify('GOG signed out', 'Installed game files were left in place.'); }
  catch (reason) { notify('GOG sign-out failed', desktopErrorMessage(reason)); }
}
async function refreshDownloadHistory() {
  if (mode !== 'desktop') return;
  const request = ++downloadsRequest;
  downloadsLoading = true; downloadsProblem = null;
  if (state.view === 'downloads') render();
  try {
    const records = await listDownloads();
    if (request !== downloadsRequest) return;
    downloadRecords = records;
  } catch (reason) {
    if (request !== downloadsRequest) return;
    downloadsProblem = desktopErrorMessage(reason);
  } finally {
    if (request === downloadsRequest) {
      downloadsLoading = false;
      if (state.view === 'downloads') render();
    }
  }
}
function openDownloads() {
  state = navigate(state, 'downloads');
  render(); window.scrollTo(0, 0);
  void refreshDownloadHistory();
}
function wasCancelled(reason: unknown) {
  if (typeof reason === 'string') {
    try { return wasCancelled(JSON.parse(reason)); } catch { return false; }
  }
  return !!reason && typeof reason === 'object' && 'code' in reason && reason.code === 'download_cancelled';
}
async function runDownload(id: string, source: 'steam' | 'epic' | 'gog') {
  if (activeDownload || startingDownload) { if (activeDownload) openDownloads(); return; }
  const selected = games.find(game => game.id === id);
  if (!selected?.owned || selected.source !== source) return;
  let job: string;
  let folder: string;
  startingDownload = true;
  try {
    folder = await getInstallLocation(source);
    job = await beginDownload(id, folder);
  } catch (reason) {
    notify('Could not start download', desktopErrorMessage(reason));
    const actions = document.createElement('div'); actions.className = 'dialog-actions';
    const settings = document.createElement('button'); settings.textContent = 'Install locations'; settings.dataset.action = 'settings';
    actions.append(settings); required('form', notice).before(actions);
    return;
  }
  finally { startingDownload = false; }
  activeDownload = id; activeDownloadJob = job;
  openDownloads();
  let unlisten: (() => void) | null = null;
  let savedProgress = -1;
  let failure: unknown = null;
  try {
    if (source === 'epic') {
      unlisten = await listen<{ gameId: string; percent: number | null }>('epic-download-progress', event => {
        if (event.payload.gameId !== activeDownload || !Number.isFinite(event.payload.percent)) return;
        const percent = Math.max(0, Math.min(100, Math.round(event.payload.percent!)));
        const current = downloadRecords.find(record => record.id === activeDownloadJob);
        if (current) current.progress = percent;
        if (state.view === 'downloads') render();
        if (percent >= savedProgress + 5 || percent === 100) {
          savedProgress = percent;
          void setDownloadProgress(job, percent).catch(() => {});
        }
      });
    }
    if (source === 'steam') await steamInstall(id, folder);
    else if (source === 'gog') await gogInstall(id, folder);
    else await epicInstall(id, folder);
  } catch (reason) { failure = reason; }
  finally { unlisten?.(); }
  const status = failure ? (wasCancelled(failure) ? 'cancelled' : 'failed') : 'completed';
  try { await finishDownload(job, status, failure ? desktopErrorMessage(failure) : undefined); }
  catch (reason) { notify('Download history unavailable', desktopErrorMessage(reason)); }
  activeDownload = null; activeDownloadJob = null;
  if (!failure) await refreshLibrary();
  await refreshDownloadHistory();
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
    openDownloads();
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
  else if (action === 'refresh-game-artwork' && mode === 'desktop' && state.selectedId) void updateArtwork(state.selectedId);
  else if (action === 'save-steamgriddb-key' && mode === 'desktop') {
    const key = required<HTMLInputElement>('#steamgriddb-key', notice).value.trim();
    void setSteamGridDbKey(key).then(() => {
      required<HTMLInputElement>('#steamgriddb-key', notice).value = '';
      required<HTMLElement>('#steamgriddb-status', notice).textContent = key ? 'API key saved on this PC.' : 'API key removed.';
    }).catch(reason => { required<HTMLElement>('#steamgriddb-status', notice).textContent = desktopErrorMessage(reason); });
  }
  else if (action === 'clear-steamgriddb-key' && mode === 'desktop') {
    void setSteamGridDbKey('').then(() => {
      required<HTMLInputElement>('#steamgriddb-key', notice).value = '';
      required<HTMLElement>('#steamgriddb-status', notice).textContent = 'API key removed.';
    }).catch(reason => { required<HTMLElement>('#steamgriddb-status', notice).textContent = desktopErrorMessage(reason); });
  }
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
  else if (action === 'install-epic' && mode === 'desktop' && button.dataset.id) void runDownload(button.dataset.id, 'epic');
  else if (action === 'install-gog' && mode === 'desktop' && button.dataset.id) void runDownload(button.dataset.id, 'gog');
  else if (action === 'install-steam' && mode === 'desktop' && button.dataset.id) void runDownload(button.dataset.id, 'steam');
  else if (action === 'cancel-download' && mode === 'desktop' && activeDownload) {
    button.textContent = 'Cancelling…'; (button as HTMLButtonElement).disabled = true;
    const selected = games.find(entry => entry.id === activeDownload);
    const cancel = selected?.source === 'epic' ? epicCancelDownload : selected?.source === 'gog' ? gogCancelDownload : steamCancel;
    void cancel().catch(reason => notify('Could not cancel download', desktopErrorMessage(reason)));
  }
  else if (action === 'clear-download-history' && mode === 'desktop') {
    void clearDownloadHistory().then(() => refreshDownloadHistory()).catch(reason => { downloadsProblem = desktopErrorMessage(reason); render(); });
  }
  else if (action === 'choose-install-location' && mode === 'desktop') {
    const provider = button.dataset.provider;
    if (provider !== 'steam' && provider !== 'epic' && provider !== 'gog') return;
    const pathLabel = required<HTMLElement>(`[data-install-path="${provider}"]`, notice);
    void openFile({ multiple: false, directory: true, title: `Choose ${provider === 'epic' ? 'Epic Games' : provider === 'gog' ? 'GOG' : 'Steam'} install location` })
      .then(path => typeof path === 'string' ? setInstallLocation(provider, path) : null)
      .then(path => { if (path && pathLabel.isConnected) pathLabel.textContent = displayWindowsPath(path); })
      .catch(reason => { if (pathLabel.isConnected) pathLabel.textContent = desktopErrorMessage(reason); });
  }
  else if (action === 'retry-download-history' && mode === 'desktop') void refreshDownloadHistory();
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
    actions.append(feature);
    if (mode === 'desktop') {
      const refresh = document.createElement('button'); refresh.type = 'button'; refresh.textContent = 'Refresh artwork'; refresh.dataset.action = 'refresh-game-artwork';
      actions.append(refresh);
    }
    required('form', notice).before(actions);
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
        ['Refresh artwork', 'Recheck covers and backgrounds for every game.', 'refresh-artwork'],
      ] as const) {
        const button = document.createElement('button'); button.type = 'button'; button.className = 'settings-tool'; button.dataset.action = action;
        const heading = document.createElement('strong'); heading.textContent = title;
        const copy = document.createElement('span'); copy.textContent = description;
        button.append(heading, copy); tools.append(button);
      }
      librarySection.append(libraryHeading, tools);
      const locations = document.createElement('section'); locations.className = 'settings-section';
      const locationsHeading = document.createElement('h3'); locationsHeading.textContent = 'Install locations';
      const locationsHelp = document.createElement('p'); locationsHelp.className = 'settings-help';
      locationsHelp.textContent = 'Downloads install here automatically. Steam uses an existing Steam library.';
      const locationList = document.createElement('div'); locationList.className = 'settings-accounts';
      for (const [name, provider] of [['Steam', 'steam'], ['Epic Games', 'epic'], ['GOG', 'gog']] as const) {
        const row = document.createElement('div'); row.className = 'settings-account';
        const identity = document.createElement('div'); identity.className = 'settings-account-name settings-location-name';
        const label = document.createElement('strong'); label.textContent = name;
        const pathLabel = document.createElement('span'); pathLabel.dataset.installPath = provider; pathLabel.textContent = 'Finding location…';
        identity.append(label, pathLabel);
        const change = document.createElement('button'); change.type = 'button'; change.className = 'settings-location-change'; change.textContent = 'Change';
        change.dataset.action = 'choose-install-location'; change.dataset.provider = provider;
        change.setAttribute('aria-label', `Change ${name} install location`);
        row.append(identity, change); locationList.append(row);
        void getInstallLocation(provider).then(path => { if (pathLabel.isConnected) pathLabel.textContent = displayWindowsPath(path); })
          .catch(reason => { if (pathLabel.isConnected) pathLabel.textContent = desktopErrorMessage(reason); });
      }
      locations.append(locationsHeading, locationsHelp, locationList);
      const artworkSection = document.createElement('section'); artworkSection.className = 'settings-section';
      const artworkHeading = document.createElement('h3'); artworkHeading.textContent = 'Artwork fallback';
      const artworkCopy = document.createElement('p'); artworkCopy.className = 'settings-help'; artworkCopy.textContent = 'SteamGridDB is optional. Local files and store artwork work without a key.';
      const keyRow = document.createElement('div'); keyRow.className = 'settings-key-row';
      const keyInput = document.createElement('input'); keyInput.id = 'steamgriddb-key'; keyInput.type = 'password'; keyInput.placeholder = 'SteamGridDB API key'; keyInput.autocomplete = 'off'; keyInput.setAttribute('aria-label', 'SteamGridDB API key');
      const saveKey = document.createElement('button'); saveKey.type = 'button'; saveKey.textContent = 'Save key'; saveKey.dataset.action = 'save-steamgriddb-key';
      const clearKey = document.createElement('button'); clearKey.type = 'button'; clearKey.textContent = 'Remove'; clearKey.dataset.action = 'clear-steamgriddb-key';
      keyRow.append(keyInput, saveKey, clearKey);
      const keyStatus = document.createElement('p'); keyStatus.id = 'steamgriddb-status'; keyStatus.className = 'settings-help'; keyStatus.textContent = 'Checking key status…';
      artworkSection.append(artworkHeading, artworkCopy, keyRow, keyStatus);
      void steamGridDbKeyStatus().then(configured => { if (keyStatus.isConnected) keyStatus.textContent = configured ? 'API key saved on this PC.' : 'No API key configured.'; }).catch(() => { if (keyStatus.isConnected) keyStatus.textContent = 'Could not read key status.'; });
      const update = document.createElement('button'); update.type = 'button'; update.className = 'settings-update';
      update.textContent = 'Check for updates'; update.dataset.action = 'check-update';
      content.append(accounts, locations, librarySection, artworkSection, update); required('form', notice).before(content);
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
