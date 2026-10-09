import { shell } from './shell.js';
import { asset, games as demoGames } from './fixtures.js';
import type { Game, LibraryMode } from './domain/models';
import { initialState, visibleGames, activeGame, counts, navigate, toggleSource, openGame } from './state.js';
import { home, library } from './home.js';
import { details, detailsLocation } from './details.js';
import { enableWheelScrolling } from './shelf-scroll.js';
import { addManualGame, cancelScan, desktopErrorMessage, discoverStores, epicCancelDownload, epicConnect, epicDisconnect, epicInstall, epicLaunch, epicSync, getRuntimeInfo, importStoreGames, isDesktop, launchInstallation, listLibrary, refreshArtwork, revealInstallation, scanFolderPreview, type ScanCandidate, type StoreCandidate } from './services/desktop';
import { listen } from '@tauri-apps/api/event';
import { check } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import { open as openFile } from '@tauri-apps/plugin-dialog';
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
  notice.querySelector('.notice-image')?.remove();
  notice.querySelector('.dialog-actions')?.remove();
  notice.querySelector('.scan-results')?.remove();
  notice.querySelector('.artwork-settings')?.remove();
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
function showArtworkSettings() {
  notify('Find game covers', 'Steam covers can be recovered automatically. For Epic, GOG, and manually added games, you can optionally enter IGDB credentials for this refresh. They are not saved.');
  const fields = document.createElement('div'); fields.className = 'artwork-settings';
  for (const [id, labelText, type] of [
    ['igdb-client-id', 'IGDB Client ID', 'text'],
    ['igdb-secret', 'IGDB Client Secret', 'password'],
  ]) {
    const label = document.createElement('label'); label.textContent = labelText;
    const input = document.createElement('input'); input.id = id; input.type = type; input.autocomplete = 'off';
    label.append(input); fields.append(label);
  }
  const actions = document.createElement('div'); actions.className = 'dialog-actions';
  const button = document.createElement('button'); button.textContent = 'Refresh covers'; button.className = 'primary';
  button.dataset.action = 'refresh-artwork'; actions.append(button);
  required('form', notice).before(fields, actions);
}
async function updateArtwork() {
  const clientId = required<HTMLInputElement>('#igdb-client-id').value.trim();
  const clientSecret = required<HTMLInputElement>('#igdb-secret').value.trim();
  notify('Finding game covers', 'Checking local Steam artwork and available cover sources…');
  try {
    const report = await refreshArtwork(clientId || undefined, clientSecret || undefined);
    await refreshLibrary();
    notify('Artwork refreshed', report.updated + ' images added. ' + report.unavailable + ' images are still unavailable.');
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
async function connectEpic() {
  notify('Connect Epic Games', 'Sign in using the Epic window opened by the verified Legendary engine. Lezu will then load your owned Windows games.');
  try {
    await epicConnect();
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
function showDownload() {
  const title = games.find(game => game.id === activeDownload)?.title ?? 'Epic game';
  notify('Downloading ' + title, downloadProgress === null
    ? 'Preparing the download…' : `Downloaded ${downloadProgress}% of game data.`);
  const actions = document.createElement('div'); actions.className = 'dialog-actions';
  const cancel = document.createElement('button'); cancel.textContent = 'Cancel download'; cancel.dataset.action = 'cancel-epic-download';
  actions.append(cancel); required('form', notice).before(actions);
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
    if (mode === 'demo') notify('Downloads unavailable', 'The browser preview uses sample games. Downloads are available in the Windows app for connected Epic games.');
    else if (activeDownload) showDownload();
    else notify('Downloads', 'No game is downloading right now. Open an owned Epic game to start a download.');
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
  else if (action === 'artwork-settings' && mode === 'desktop') showArtworkSettings();
  else if (action === 'refresh-artwork' && mode === 'desktop') void updateArtwork();
  else if (action === 'check-update' && mode === 'desktop') void checkForUpdates();
  else if (action === 'connect-epic' && mode === 'desktop') void connectEpic();
  else if (action === 'sync-epic' && mode === 'desktop') void syncEpic();
  else if (action === 'disconnect-epic' && mode === 'desktop') void disconnectEpic();
  else if (action === 'install-epic' && mode === 'desktop' && button.dataset.id) void downloadEpic(button.dataset.id);
  else if (action === 'cancel-epic-download' && mode === 'desktop') void epicCancelDownload();
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
    notify(mode === 'demo' ? 'Preview settings' : 'Library settings', mode === 'demo'
      ? 'Browse demo games using search and store filters. Scanning, game launching, and downloads aren’t available yet. Changes reset when you refresh.'
      : 'Connect Epic Games to add owned games, or find games already installed on this PC.');
    if (mode === 'desktop') {
      const actions = document.createElement('div'); actions.className = 'dialog-actions';
      const add = document.createElement('button'); add.textContent = 'Add a game'; add.dataset.action = 'add-manual';
      const scan = document.createElement('button'); scan.textContent = 'Scan a folder'; scan.dataset.action = 'scan-folder';
      const stores = document.createElement('button'); stores.textContent = 'Find installed games'; stores.dataset.action = 'scan-stores';
      const epic = document.createElement('button'); epic.textContent = 'Connect Epic Games'; epic.dataset.action = 'connect-epic';
      const syncEpicButton = document.createElement('button'); syncEpicButton.textContent = 'Refresh Epic library'; syncEpicButton.dataset.action = 'sync-epic';
      const disconnectEpicButton = document.createElement('button'); disconnectEpicButton.textContent = 'Sign out of Epic'; disconnectEpicButton.dataset.action = 'disconnect-epic';
      const artwork = document.createElement('button'); artwork.textContent = 'Find game covers'; artwork.dataset.action = 'artwork-settings';
      const update = document.createElement('button'); update.textContent = 'Check for updates'; update.dataset.action = 'check-update';
      actions.append(epic, syncEpicButton, disconnectEpicButton, stores, add, scan, artwork, update); required('form', notice).before(actions);
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
