import { shell } from './shell.js';
import { games } from './fixtures.js';
import { initialState, visibleGames, activeGame, counts, navigate, toggleSource } from './state.js';
import { home, library } from './home.js';
document.querySelector('#app').innerHTML = shell();
let state = initialState();
const notice = document.querySelector('#notice');
function notify(title, copy) {
  document.querySelector('#notice-title').textContent = title;
  document.querySelector('#notice-copy').textContent = copy;
  notice.showModal();
}
function render(focusKey) {
  const game = activeGame(games, state);
  document.documentElement.style.setProperty('--page', game?.theme.page ?? '#30343b');
  document.documentElement.style.setProperty('--sidebar', game?.theme.sidebar ?? '#23272d');
  document.querySelector('#screen').innerHTML = state.view === 'home' && !state.query ? home(game, visibleGames(games, state), state) : library(visibleGames(games, state), state);
  const selected = state.view === 'home' ? 'home' : state.installedOnly ? 'installed' : state.source;
  document.querySelectorAll('[data-nav]').forEach(button => {
    button.removeAttribute('aria-current');
    if (button.closest('nav') && button.dataset.nav === selected) button.setAttribute('aria-current', 'page');
  });
  for (const [id, count] of Object.entries(counts(games, state))) document.querySelector(`[data-count="${id}"]`).textContent = count;
  document.querySelector('#location h1').textContent = selected === 'home' ? 'Home' : 'Library';
  document.querySelector('#search').value = state.query;
  if (focusKey) document.querySelector(`[data-source="${focusKey}"]`)?.focus({ preventScroll: true });
}
document.querySelector('#search').addEventListener('input', event => { state = { ...state, query: event.target.value }; render(); });
document.addEventListener('click', event => {
  const button = event.target.closest('button');
  if (!button) return;
  const { nav, source, play, game, action } = button.dataset;
  if (nav === 'downloads') notify('Downloads', 'Downloads are not available in this UI prototype. Nothing is being downloaded.');
  else if (nav) { state = navigate(state, nav); render(); window.scrollTo(0, 0); }
  else if (source) { state = toggleSource(state, source); render(source); }
  else if (play) notify('Play — preview only', 'Native game launching will follow UI approval. This button has not launched a game.');
  else if (game) notify('Game details', 'The Home screen is ready. Details are being added in the next increment.');
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
}, true);
render();
