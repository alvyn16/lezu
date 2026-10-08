import { icon, providers, providerMark } from './shell.js';
import { asset } from './fixtures.js';
export const escape = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
export function heroArt(game) {
  return game?.hero ? `<img class="hero-art" src="${asset(game.hero)}" alt="" fetchpriority="high">` : '';
}
export function gameTitle(game, className = '') {
  return game.logo ? `<img class="game-logo ${className}" src="${asset(game.logo)}" alt="${escape(game.title)}">`
    : `<h2 class="game-title ${className}" title="${escape(game.title)}">${escape(game.title)}</h2>`;
}
export function gameCard(game) {
  const provider = providers.find(provider => provider.id === game.source);
  return `<article class="game-card">
    <div class="cover-wrap">
      <button class="cover-button" data-game="${game.id}" aria-label="View ${escape(game.title)}">
        ${game.cover ? `<img src="${asset(game.cover)}" alt="" loading="lazy">` : `<span class="cover-fallback">${icon('grid')}<span>Artwork unavailable</span></span>`}
      </button>
      ${game.installed ? `<button class="cover-play primary" data-play="${game.id}" aria-label="Play ${escape(game.title)}">${icon('play')} Play</button>` : ''}
    </div>
    <h3 title="${escape(game.title)}">${escape(game.title)}</h3>
    <p class="card-caption">${providerMark(game.source)} ${provider.name} <span>· ${game.installed ? (game.size ?? 'Demo game') : 'Not installed'}</span></p>
  </article>`;
}
export function shelf(games) {
  return games.length ? `<div class="cover-shelf" aria-label="Sample game library">${games.map(gameCard).join('')}</div>`
    : `<div class="empty-state" role="status"><h2>No games found</h2><p>Try another search or reset your filters.</p><button data-action="reset">Reset filters</button></div>`;
}
export function stores(state) {
  return `<section class="stores" aria-labelledby="stores-heading"><h2 id="stores-heading">Stores</h2>
    <div class="store-list">${providers.map(provider => `<article class="store-card">
      <div class="store-mark ${provider.id}">${providerMark(provider.id)}</div>
      <button class="switch" role="switch" aria-checked="${state.enabled[provider.id]}" data-source="${provider.id}" aria-label="Show games from ${provider.name}"><span></span></button>
      <h3>${provider.name}</h3><p>${provider.description}</p>
    </article>`).join('')}</div></section>`;
}
export function home(game, games, state) {
  return `<section class="home-hero" aria-label="Continue playing">
    ${heroArt(game)}<div class="hero-shade"></div>
    ${game ? `${gameTitle(game, 'home-logo')}
      <div class="hero-actions"><button class="primary" data-play="${game.id}" ${!game.installed ? 'disabled title="This demo game is marked as not installed"' : ''}>${icon('play')} ${game.installed ? 'Play' : 'Not installed'}</button><button class="icon-button" data-game="${game.id}" aria-label="About ${escape(game.title)}">${icon('info')}</button></div>`
      : '<p class="hero-empty">Turn on a store below to show its demo games.</p>'}
    </section>
    <section class="ready-section" aria-labelledby="ready-heading"><div class="section-head"><h2 id="ready-heading">Ready to Play</h2><button class="text-button" data-nav="all">See All <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="m9 5 7 7-7 7"/></svg></button></div>${shelf(games.filter(game => game.installed))}</section>
    ${stores(state)}`;
}
export function library(games, state) {
  const title = state.query ? 'Search results' : state.installedOnly ? 'Installed' : providers.find(p => p.id === state.source)?.name ?? 'All Games';
  return `<section class="library-section"><div class="section-head"><h2>${title}</h2><p class="results-count" role="status">${games.length} ${games.length === 1 ? 'game' : 'games'}</p></div>${shelf(games)}</section>`;
}
