const paths = {
  home: '<path d="m3 10 9-7 9 7M5 9v11h5v-6h4v6h5V9"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  check: '<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>',
  download: '<circle cx="12" cy="12" r="9"/><path d="M12 6v11m-4-4 4 4 4-4"/>',
  search: '<circle cx="10" cy="10" r="6"/><path d="m15 15 5 5"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="m9 3 6 0 1 3 3 1 2 5-2 5-3 1-1 3H9l-1-3-3-1-2-5 2-5 3-1Z"/>',
  back: '<path d="m14 5-7 7 7 7"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-11v1"/>',
  folder: '<path d="M3 7V5h7l2 3h9v12H3Zm0 3h18"/>',
  more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
  play: '<path fill="currentColor" stroke="none" d="m7 4 13 8-13 8Z"/>',
};
export const icon = (name) => `<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${paths[name] ?? ''}</svg>`;
export const providers = [
  { id: 'steam', name: 'Steam', description: 'Show games from Steam.' },
  { id: 'epic', name: 'Epic Games', description: 'Show games from Epic Games.' },
  { id: 'gog', name: 'GOG', description: 'Show games from GOG.' },
];
export const providerMark = (id) => `<img class="provider-mark" src="assets/${id}.svg" alt="" width="16" height="16">`;
function nav(id, label, glyph, count = '') {
  return `<button class="nav-row" data-nav="${id}">${glyph}<span>${label}</span><span class="count">${count}</span></button>`;
}
export function shell() {
  return `<aside class="sidebar" aria-label="Sidebar">
    <div class="sidebar-head"><span class="brand">Lezu</span><button class="icon-button" data-action="settings" aria-label="Preview settings">${icon('settings')}</button></div>
    <nav aria-label="Library navigation">
      ${nav('home', 'Home', icon('home'))}
      <h2 class="nav-label">Library</h2>
      ${nav('all', 'All Games', icon('grid'), '<span data-count="all">0</span>')}
      ${nav('installed', 'Installed', icon('check'), '<span data-count="installed">0</span>')}
      <h2 class="nav-label">Stores</h2>
      ${providers.map(p => nav(p.id, p.name, providerMark(p.id), `<span data-count="${p.id}">0</span>`)).join('')}
      <h2 class="nav-label">Activity</h2>
      ${nav('downloads', 'Downloads', icon('download'))}
    </nav>
    <p class="preview-label">UI preview · demo library</p>
  </aside>
  <main id="content" tabindex="-1">
    <header class="topbar"><div id="location"><h1>Home</h1></div>
      <label class="search">${icon('search')}<input id="search" type="search" placeholder="Search games" aria-label="Search games" autocomplete="off"></label>
    </header><div id="screen"><p class="shell-placeholder">Preparing your preview…</p></div>
  </main>`;
}
