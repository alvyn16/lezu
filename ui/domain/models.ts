export type ProviderId = 'steam' | 'epic' | 'gog';
export type LibraryMode = 'demo' | 'desktop';

/** Display values may be unknown; demo records never represent installed games. */
export interface Game {
  id: string;
  title: string;
  source: ProviderId | 'manual';
  installed: boolean;
  owned?: boolean;
  installationId?: string | null;
  played: string | null;
  lastPlayed: string | null;
  size: string | null;
  developer: string | null;
  year: string | null;
  tags: string[];
  description: string | null;
  theme: { page: string; sidebar: string };
  screenshots: string[];
  cover: string | null;
  artworkPending?: boolean;
  hero: string | null;
  logo: string | null;
}

export interface LibraryState {
  view: 'home' | 'library' | 'details' | 'downloads';
  query: string;
  source: ProviderId | 'all';
  installedOnly: boolean;
  selectedId: string | null;
  featuredId: string | null;
  enabled: Record<ProviderId, boolean>;
}

export function isProviderId(value: string): value is ProviderId {
  return value === 'steam' || value === 'epic' || value === 'gog';
}
