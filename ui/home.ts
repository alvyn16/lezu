import type { Game, LibraryMode, LibraryState } from './domain/models';
import { icon, providers, providerMark } from './shell.js';
import { asset } from './fixtures.js';
const entities: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const escape = (value: unknown): string => String(value).replace(/[&<>"']/g, char => entities[char] ?? char);
export function heroArt(game: Game | null) {
  return game?.hero ? `<img class="hero-art" src="${asset(game.hero)}" alt="" fetchpriority="high">` : '';
}
export function gameTitle(game: Game, className = '') {
  return game.logo ? `<img class="game-logo ${className}" src="${asset(game.logo)}" alt="${escape(game.title)}">`
    : `<h2 class="game-title ${className}" title="${escape(game.title)}">${escape(game.title)}</h2>`;
}
export function gameCard(game: Game, mode: LibraryMode = 'demo') {
  const provider = providers.find(provider => provider.id === game.source);
  return `<article class="game-card">
    <div class="cover-wrap">
      <button class="cover-button" data-game="${game.id}" aria-label="View ${escape(game.title)}">
        ${game.cover ? `<img src="${asset(game.cover)}" alt="" loading="lazy">` : `<span class="cover-fallback">${icon('grid')}<span>${game.artworkPending ? 'Loading artwork…' : 'Artwork unavailable'}</span></span>`}
      </button>
      ${game.installed ? `<button class="cover-play primary" data-play="${game.id}" aria-label="Play ${escape(game.title)}">${icon('play')} Play</button>` : ''}
    </div>
    <h3 title="${escape(game.title)}">${escape(game.title)}</h3>
    <p class="card-caption">${providerMark(game.source)} ${provider?.name ?? 'Manual'} <span>· ${game.installed ? (game.size ?? (mode === 'demo' ? 'Demo game' : 'Installed')) : game.owned ? 'Owned · Not installed' : 'Not installed'}</span></p>
  </article>`;
}
export function shelf(games: readonly Game[], mode: LibraryMode = 'demo') {
  return games.length ? `<div class="cover-shelf" aria-label="${mode === 'demo' ? 'Sample' : 'Your'} game library">${games.map(game => gameCard(game, mode)).join('')}</div>`
    : mode === 'desktop' ? `<div class="empty-state" role="status"><h2>No games found</h2><p>Add a game or change your search.</p><button data-action="add-manual">Add a game</button></div>`
      : `<div class="empty-state" role="status"><h2>No games found</h2><p>Try another search or reset your filters.</p><button data-action="reset">Reset filters</button></div>`;
}
export function stores(state: LibraryState) {
  return `<section class="stores" aria-labelledby="stores-heading"><h2 id="stores-heading">Stores</h2>
    <div class="store-list">${providers.map(provider => `<article class="store-card">
      <div class="store-mark ${provider.id}">${providerMark(provider.id)}</div>
      <button class="switch" role="switch" aria-checked="${state.enabled[provider.id]}" data-source="${provider.id}" aria-label="Show games from ${provider.name}"><span></span></button>
      <h3>${provider.name}</h3><p>${provider.description}</p>
    </article>`).join('')}</div></section>`;
}
export function home(game: Game | null, games: readonly Game[], state: LibraryState, mode: LibraryMode = 'demo') {
  return `<section class="home-hero" aria-label="Continue playing">
    ${heroArt(game)}<div class="hero-shade"></div>
    ${game ? `${gameTitle(game, 'home-logo')}
      <div class="hero-actions">${!game.installed && game.owned && (game.source === 'epic' || game.source === 'gog' || game.source === 'steam')
        ? `<button class="primary" data-action="install-${game.source}" data-id="${escape(game.id)}">${icon('download')} Download</button>`
        : `<button class="primary" data-play="${game.id}" ${!game.installed ? 'disabled title="This game is not installed"' : ''}>${icon('play')} ${game.installed ? 'Play' : 'Not installed'}</button>`}<button class="icon-button" data-game="${game.id}" aria-label="About ${escape(game.title)}">${icon('info')}</button></div>`
      : mode === 'desktop' ? '<div class="hero-empty"><p>Your library is empty.</p><button class="primary" data-action="add-manual">Add a game</button></div>' : '<p class="hero-empty">Turn on a store below to show its demo games.</p>'}
    </section>
    <section class="ready-section" aria-labelledby="ready-heading"><div class="section-head"><h2 id="ready-heading">Ready to Play</h2><button class="text-button" data-nav="all">See All <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="m9 5 7 7-7 7"/></svg></button></div>${shelf(games.filter(game => game.installed), mode)}</section>
    ${stores(state)}`;
}
export function library(games: readonly Game[], state: LibraryState, mode: LibraryMode = 'demo') {
  const title = state.query ? 'Search results' : state.installedOnly ? 'Installed' : providers.find(p => p.id === state.source)?.name ?? 'All Games';
  const content = mode === 'desktop' && state.source === 'epic' && !games.length && !state.query
    ? '<div class="empty-state" role="status"><h2>Your Epic library is empty</h2><p>Connect your Epic account to see owned games.</p><button data-action="connect-epic">Connect Epic Games</button></div>'
    : mode === 'desktop' && state.source === 'gog' && !games.length && !state.query
      ? '<div class="empty-state" role="status"><h2>Your GOG library is empty</h2><p>Connect your GOG account to see owned games.</p><button data-action="connect-gog">Connect GOG</button></div>'
      : mode === 'desktop' && state.source === 'steam' && !games.length && !state.query
        ? '<div class="empty-state" role="status"><h2>Your Steam library is empty</h2><p>Connect your Steam account to see owned games.</p><button data-action="connect-steam">Connect Steam</button></div>'
    : shelf(games, mode);
  return `<section class="library-section"><div class="section-head"><h2>${title}</h2><p class="results-count" role="status">${games.length} ${games.length === 1 ? 'game' : 'games'}</p></div>${content}</section>`;
}
