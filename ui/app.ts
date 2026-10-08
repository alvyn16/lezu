import { shell } from './shell.js';
import { asset, games as demoGames } from './fixtures.js';
import type { Game, LibraryMode } from './domain/models';
import { initialState, visibleGames, activeGame, counts, navigate, toggleSource, openGame } from './state.js';
import { home, library } from './home.js';
import { details, detailsLocation } from './details.js';
import { enableWheelScrolling } from './shelf-scroll.js';
import { addManualGame, desktopErrorMessage, getRuntimeInfo, isDesktop, launchInstallation, listLibrary, revealInstallation, scanFolderPreview, type ScanCandidate } from './services/desktop';
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
  required('#notice-title').textContent = title;
  required('#notice-copy').textContent = copy;
  if (!notice.open) notice.showModal();
}
function dismissActiveScan() {
  if (activeScanSequence !== null) {
    activeScanSequence = null;
    scanSequence++;
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
  try {
    dismissActiveScan();
    if (notice.open) notice.close();
    const picked = await openFile({ multiple: false, directory: true, title: 'Choose a game folder to scan' });
    if (typeof picked !== 'string') return;
    sequence = ++scanSequence;
    activeScanSequence = sequence;
    scanCandidates = [];
    notify('Scanning folder', 'Searching subfolders for possible game executables…');
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
  const installationId = games.find(game => game.id === id)?.installationId;
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
  if (nav === 'downloads') notify('Downloads unavailable', 'Downloads aren’t available yet.');
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
      : 'Add Windows games to your local library. Automatic store scanning and downloads are coming later.');
    if (mode === 'desktop') {
      const actions = document.createElement('div'); actions.className = 'dialog-actions';
      const add = document.createElement('button'); add.textContent = 'Add a game'; add.dataset.action = 'add-manual';
      const scan = document.createElement('button'); scan.textContent = 'Scan a folder'; scan.dataset.action = 'scan-folder';
      actions.append(add, scan); required('form', notice).before(actions);
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
  required('.preview-label').textContent = 'Desktop · local library';
  void refreshLibrary();
  getRuntimeInfo().then(info => {
    if (info?.libraryMode !== 'desktop') notify('Desktop version mismatch', 'The desktop host and library interface are out of sync. Restart Lezu.');
  }).catch(() => notify('Desktop connection unavailable', 'Lezu could not reach its desktop service. Restart the app to try again.'));
}
