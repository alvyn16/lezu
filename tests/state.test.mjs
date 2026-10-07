import test from 'node:test';
import assert from 'node:assert/strict';
import { games } from '../ui/fixtures.js';
import { initialState, visibleGames, counts, featuredGame, activeGame, navigate, openGame, toggleSource } from '../ui/state.js';
import { escape } from '../ui/home.js';

test('Search matches case-insensitively with surrounding whitespace', () => {
  assert.deepEqual(visibleGames(games, { ...initialState(), query: '  WITCHER  ' }).map(g => g.id), ['witcher']);
});
test('Search combines with the selected source and installation filter', () => {
  const epic = navigate(initialState(), 'epic');
  assert.deepEqual(visibleGames(games, { ...epic, query: 'witcher' }), []);
  assert.ok(visibleGames(games, navigate(initialState(), 'installed')).every(g => g.installed));
});
test('Disabled sources disappear from results and counts without mutating previous state', () => {
  const before = initialState();
  const after = toggleSource(before, 'epic');
  assert.equal(before.enabled.epic, true);
  assert.ok(visibleGames(games, after).every(g => g.source !== 'epic'));
  assert.equal(counts(games, after).epic, 0);
  assert.equal(counts(games, after).all, 6);
});
test('Featured game falls back when its source is disabled', () => {
  const state = toggleSource(initialState(), 'epic');
  assert.equal(featuredGame(games, state).id, 'witcher');
});
test('All disabled sources produce an explicit empty library and no featured game', () => {
  const state = ['steam', 'epic', 'gog'].reduce(toggleSource, initialState());
  assert.deepEqual(visibleGames(games, state), []);
  assert.equal(featuredGame(games, state), null);
});
test('Searching does not unexpectedly change the Home theme', () => {
  assert.equal(activeGame(games, { ...initialState(), query: 'elden' }).id, 'alan');
});
test('Details use the selected game theme instead of the featured game theme', () => {
  assert.equal(activeGame(games, openGame(initialState(), 'sifu')).id, 'sifu');
  assert.notEqual(games[0].theme.page, games[1].theme.page);
});
test('Navigation clears stale search and filters while preserving store choices', () => {
  const state = navigate({ ...toggleSource(initialState(), 'gog'), query: 'sifu' }, 'steam');
  assert.equal(state.query, '');
  assert.equal(state.source, 'steam');
  assert.equal(state.enabled.gog, false);
});
test('Unknown source switches leave state unchanged', () => {
  const state = initialState(); assert.equal(toggleSource(state, 'unknown'), state);
});
test('Missing artwork fixture uses neutral colors and null unavailable metadata', () => {
  const game = games.find(g => g.id === 'missing');
  assert.equal(game.cover, null); assert.equal(game.size, null); assert.equal(game.developer, null);
});
test('Text rendering escapes HTML and quote characters', () => {
  assert.equal(escape('<img onerror="x"> & \'test\''), '&lt;img onerror=&quot;x&quot;&gt; &amp; &#39;test&#39;');
});
const luminance = hex => {
  const channels = hex.match(/[a-f\d]{2}/gi).map(h => parseInt(h, 16) / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
  return channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722;
};
test('Normal muted text meets 4.5:1 against every fixture page and sidebar palette', () => {
  for (const game of games) for (const color of Object.values(game.theme)) {
    const ratio = (luminance('#e6dce0') + .05) / (luminance(color) + .05);
    assert.ok(ratio >= 4.5, `${game.id} ${color} contrast ${ratio.toFixed(2)}`);
  }
});
