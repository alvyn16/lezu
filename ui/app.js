import { shell } from './shell.js';
import { asset, games } from './fixtures.js';
import { initialState, visibleGames, activeGame, counts, navigate, toggleSource, openGame } from './state.js';
import { home, library } from './home.js';
import { details, detailsLocation } from './details.js';
document.querySelector('#app').innerHTML = shell();
let state = initialState();
let previousState = state;
let returnFocus = null;
let returnScroll = { page: 0, shelf: 0 };
const notice = document.querySelector('#notice');
function notify(title, copy) {
  notice.querySelector('.notice-image')?.remove();
  notice.querySelector('.dialog-actions')?.remove();
  document.querySelector('#notice-title').textContent = title;
  document.querySelector('#notice-copy').textContent = copy;
  notice.showModal();
}
function render(focusKey) {
  const game = activeGame(games, state);
  document.documentElement.style.setProperty('--page', game?.theme.page ?? '#30343b');
  document.documentElement.style.setProperty('--sidebar', game?.theme.sidebar ?? '#23272d');
  if (state.view === 'details' && game) document.querySelector('#screen').innerHTML = details(game);
  else if (state.view === 'home' && !state.query) document.querySelector('#screen').innerHTML = home(game, visibleGames(games, state), state);
  else document.querySelector('#screen').innerHTML = library(visibleGames(games, state), state);
  const context = state.view === 'details' ? previousState : state;
  const selected = context.view === 'home' ? 'home' : context.installedOnly ? 'installed' : context.source;
  document.querySelectorAll('[data-nav]').forEach(button => {
    button.removeAttribute('aria-current');
    if (button.closest('nav') && button.dataset.nav === selected) button.setAttribute('aria-current', 'page');
  });
  for (const [id, count] of Object.entries(counts(games, state))) document.querySelector(`[data-count="${id}"]`).textContent = count;
  document.querySelector('#location').innerHTML = state.view === 'details' && game ? detailsLocation(game) : `<h1>${selected === 'home' ? 'Home' : 'Library'}</h1>`;
  document.title = `${state.view === 'details' && game ? game.title : 'Lezu'} — UI preview`;
  document.querySelector('#search').value = state.query;
  if (focusKey) document.querySelector(`[data-source="${focusKey}"]`)?.focus({ preventScroll: true });
}
document.querySelector('#search').addEventListener('input', event => { state = { ...state, view: state.view === 'details' ? 'library' : state.view, query: event.target.value }; render(); window.scrollTo(0, 0); });
document.addEventListener('click', event => {
  const button = event.target.closest('button');
  if (!button) return;
  const { nav, source, play, game, action, screenshot } = button.dataset;
  if (nav === 'downloads') notify('Downloads', 'Downloads are not available in this UI prototype. Nothing is being downloaded.');
  else if (nav) {
    const fromSidebar = !!button.closest('nav');
    state = navigate(state, nav); render(); window.scrollTo(0, 0);
    if (!fromSidebar) document.querySelector(`nav [data-nav="${nav}"]`)?.focus();
  }
  else if (source) { state = toggleSource(state, source); render(source); }
  else if (play) notify('Play — preview only', 'Native game launching will follow UI approval. This button has not launched a game.');
  else if (game) {
    previousState = state;
    returnFocus = button.classList.contains('cover-button') ? `[data-game="${game}"].cover-button` : `[data-game="${game}"]`;
    returnScroll = { page: window.scrollY, shelf: document.querySelector('.cover-shelf')?.scrollLeft ?? 0 };
    state = openGame(state, game); render(); window.scrollTo(0, 0);
    document.querySelector('[data-action="back"]').focus({ preventScroll: true });
  }
  else if (action === 'back') {
    state = previousState; render();
    const shelf = document.querySelector('.cover-shelf');
    if (shelf) shelf.scrollLeft = returnScroll.shelf;
    window.scrollTo(0, returnScroll.page);
    if (returnFocus) document.querySelector(returnFocus)?.focus({ preventScroll: true });
  }
  else if (action === 'folder') notify('Game folder — preview only', 'No installation directory is linked to this sample. Folder access will be implemented with the Windows host.');
  else if (action === 'more') {
    notify('Game actions', 'Choose the featured game for the Home preview.');
    const actions = document.createElement('div'); actions.className = 'dialog-actions';
    const feature = document.createElement('button'); feature.textContent = 'Feature on Home'; feature.dataset.action = 'feature';
    actions.append(feature); notice.querySelector('form').before(actions);
  }
  else if (action === 'feature') {
    state = { ...navigate(state, 'home'), featuredId: state.selectedId };
    notice.close(); render(); window.scrollTo(0, 0); document.querySelector('nav [data-nav="home"]').focus();
  }
  else if (screenshot) {
    notify('Game screenshot', 'Artwork shown from the game’s official media.');
    const image = document.createElement('img'); image.className = 'notice-image'; image.src = asset(screenshot); image.alt = button.getAttribute('aria-label');
    notice.querySelector('form').before(image);
  }
  else if (action === 'reset') { state = initialState(); render(); document.querySelector('#search').focus(); }
  else if (action === 'settings') notify('Lezu UI preview', 'This is a fresh rebuild with a sample library. Search, store filters, and switches work locally. Scanning, downloads, and Windows window controls will follow visual approval.');
});
document.addEventListener('focusin', event => {
  const card = event.target.closest('.game-card');
  if (card) card.scrollIntoView({ block: 'nearest', inline: 'nearest' });
});
document.addEventListener('error', event => {
  const img = event.target;
  if (!(img instanceof HTMLImageElement)) return;
  img.hidden = true;
  if (img.closest('.cover-button')) img.closest('.cover-button').insertAdjacentHTML('beforeend', '<span class="cover-fallback">Artwork unavailable</span>');
  else if (img.classList.contains('game-logo')) {
    const title = document.createElement('h2'); title.className = img.className.replace('game-logo', 'game-title'); title.textContent = img.alt;
    img.replaceWith(title);
  }
}, true);
render();
