export function initialState() {
  return { view: 'home', query: '', source: 'all', installedOnly: false, selectedId: null, featuredId: 'alan', enabled: { steam: true, epic: true, gog: true } };
}
export function visibleGames(games, state) {
  const query = state.query.trim().toLocaleLowerCase();
  return games.filter(game => state.enabled[game.source]
    && (state.source === 'all' || game.source === state.source)
    && (!state.installedOnly || game.installed)
    && game.title.toLocaleLowerCase().includes(query));
}
export function featuredGame(games, state) {
  const visible = visibleGames(games, { ...state, query: '' });
  return visible.find(game => game.id === state.featuredId) ?? visible[0] ?? null;
}
export function activeGame(games, state) {
  return state.view === 'details' ? games.find(game => game.id === state.selectedId) ?? null : featuredGame(games, state);
}
export function counts(games, state) {
  const enabled = games.filter(game => state.enabled[game.source]);
  return { all: enabled.length, installed: enabled.filter(game => game.installed).length,
    steam: enabled.filter(game => game.source === 'steam').length,
    epic: enabled.filter(game => game.source === 'epic').length,
    gog: enabled.filter(game => game.source === 'gog').length };
}
export function navigate(state, destination) {
  const isSource = ['steam', 'epic', 'gog'].includes(destination);
  return { ...state, view: destination === 'home' ? 'home' : 'library', selectedId: null,
    query: '', source: isSource ? destination : 'all', installedOnly: destination === 'installed' };
}
export function openGame(state, id) { return { ...state, view: 'details', selectedId: id }; }
export function toggleSource(state, source) {
  if (!(source in state.enabled)) return state;
  return { ...state, enabled: { ...state.enabled, [source]: !state.enabled[source] } };
}
