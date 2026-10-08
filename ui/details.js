import { icon, providers } from './shell.js';
import { asset } from './fixtures.js';
import { escape, heroArt, gameTitle } from './home.js';
export function detailsLocation(game) {
  return `<button class="icon-button" data-action="back" aria-label="Back to library">${icon('back')}</button><h1 title="${escape(game.title)}">${escape(game.title)}</h1>`;
}
export function details(game) {
  const provider = providers.find(provider => provider.id === game.source);
  const facts = [ ['Developer', game.developer], ['Released', game.year], ['Rating', null], ['Played', game.played], ['Last played', game.lastPlayed], ['Size', game.size] ];
  return `<section class="details-hero" aria-label="${escape(game.title)}">
    ${heroArt(game)}<div class="hero-shade"></div>${gameTitle(game, 'details-logo')}
    <p class="game-meta">${[game.developer, game.year, game.tags[0], provider.name].filter(Boolean).map(escape).join('<span>·</span>')}</p>
    <div class="hero-actions"><button class="primary" data-play="${game.id}" ${!game.installed ? 'disabled title="This demo game is marked as not installed"' : ''}>${icon('play')} ${game.installed ? 'Play' : 'Not installed'}</button><button class="icon-button" data-action="folder" aria-label="Open game folder">${icon('folder')}</button><button class="icon-button" data-action="more" aria-label="More game actions">${icon('more')}</button></div>
  </section>
  <div class="details-body">
    <dl class="stats">${facts.map(([label, value]) => `<div><dt>${label}</dt><dd>${value ? escape(value) : '<span class="unknown" title="Not available"><span aria-hidden="true">—</span><span class="sr-only">Not available</span></span>'}</dd></div>`).join('')}</dl>
    <p class="sample-note">Demo playtime and activity. Your installed games haven’t been scanned.</p>
    <section class="about-section" aria-labelledby="about-heading"><h2 id="about-heading" class="eyebrow-label">About</h2><div>
      <p class="description${game.description ? '' : ' is-empty'}">${game.description ? escape(game.description) : 'No description available.'}</p>
      <p class="genres">${game.tags.map(escape).join('<span>/</span>')}</p>
    </div></section>
    <section class="screenshots-section" aria-labelledby="screenshots-heading"><h2 id="screenshots-heading" class="eyebrow-label">Screenshots</h2>
      <div class="screenshot-shelf">${game.screenshots.length ? game.screenshots.map((name, index) => `<button data-screenshot="${name}" aria-label="View ${escape(game.title)} screenshot ${index + 1}"><img src="${asset(name)}" alt="${escape(game.title)} gameplay screenshot ${index + 1}" loading="lazy"></button>`).join('') : '<p class="no-screenshots">No screenshots available.</p>'}</div>
    </section>
  </div>`;
}
