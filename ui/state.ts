import { isProviderId, type Game, type LibraryState } from './domain/models';

export function initialState(): LibraryState {
  return { view: 'home', query: '', source: 'all', installedOnly: false, selectedId: null, featuredId: 'alan', enabled: { steam: true, epic: true, gog: true } };
}
export function visibleGames(games: readonly Game[], state: LibraryState): Game[] {
  const query = state.query.trim().toLocaleLowerCase();
  return games.filter(game => (game.source === 'manual' || state.enabled[game.source])
    && (state.source === 'all' || game.source === state.source)
    && (!state.installedOnly || game.installed)
    && game.title.toLocaleLowerCase().includes(query));
}
export function featuredGame(games: readonly Game[], state: LibraryState): Game | null {
  const visible = visibleGames(games, { ...state, query: '' });
  return visible.find(game => game.id === state.featuredId) ?? visible[0] ?? null;
}
export function activeGame(games: readonly Game[], state: LibraryState): Game | null {
  return state.view === 'details' ? games.find(game => game.id === state.selectedId) ?? null : featuredGame(games, state);
}
export function counts(games: readonly Game[], state: LibraryState) {
  const enabled = games.filter(game => game.source === 'manual' || state.enabled[game.source]);
  return { all: enabled.length, installed: enabled.filter(game => game.installed).length,
    steam: enabled.filter(game => game.source === 'steam').length,
    epic: enabled.filter(game => game.source === 'epic').length,
    gog: enabled.filter(game => game.source === 'gog').length };
}
export function navigate(state: LibraryState, destination: string): LibraryState {
  const isSource = isProviderId(destination);
  return { ...state, view: destination === 'home' ? 'home' : destination === 'downloads' ? 'downloads' : 'library', selectedId: null,
    query: '', source: isSource ? destination : 'all', installedOnly: destination === 'installed' };
}
export function openGame(state: LibraryState, id: string): LibraryState { return { ...state, view: 'details', selectedId: id }; }
export function toggleSource(state: LibraryState, source: string): LibraryState {
  if (!isProviderId(source)) return state;
  return { ...state, enabled: { ...state.enabled, [source]: !state.enabled[source] } };
}
