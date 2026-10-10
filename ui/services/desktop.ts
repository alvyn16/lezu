import { invoke, isTauri } from '@tauri-apps/api/core';

export interface RuntimeInfo {
  appVersion: string;
  platform: 'windows';
  libraryMode: 'desktop';
}

export function isDesktop(): boolean {
  return isTauri();
}

export async function getRuntimeInfo(): Promise<RuntimeInfo | null> {
  if (!isDesktop()) return null;
  return invoke<RuntimeInfo>('runtime_info');
}

export interface DesktopError { code: string; message: string; retryable: boolean }

export function desktopErrorMessage(value: unknown): string {
  if (typeof value === 'string') {
    try {
      return desktopErrorMessage(JSON.parse(value));
    } catch {
      if (/command\s+epic_connect\s+not found|unknown command.*epic_connect/i.test(value)) {
        return 'This copy of Lezu does not include Epic sign-in. Open the latest Lezu build.';
      }
      if (/command\s+(gog_connect|steam_connect)\s+not found|unknown command.*(gog_connect|steam_connect)/i.test(value)) {
        return 'This copy of Lezu does not include this store sign-in. Open the latest Lezu build.';
      }
      return 'The desktop action failed. ' + value.slice(0, 300);
    }
  }
  if (value && typeof value === 'object' && 'message' in value && typeof value.message === 'string') return value.message;
  return 'The desktop action could not be completed.';
}

export async function listLibrary() {
  return invoke<import('../domain/models').Game[]>('list_library');
}

export interface LibraryArtwork { gameId: string; kind: 'cover' | 'hero'; image: string }

export async function getLibraryArtwork(gameIds: string[], kind: 'cover' | 'hero'): Promise<LibraryArtwork[]> {
  return invoke<LibraryArtwork[]>('get_library_artwork', { gameIds, kind });
}

export async function epicConnect(code: string): Promise<void> {
  return invoke<void>('epic_connect', { code });
}

export async function epicSync(): Promise<{ connected: boolean; count: number }> {
  return invoke<{ connected: boolean; count: number }>('epic_sync');
}

export async function epicDisconnect(): Promise<void> {
  return invoke<void>('epic_disconnect');
}

export async function epicInstall(gameId: string, destination: string): Promise<void> {
  return invoke<void>('epic_install', { gameId, destination });
}

export async function epicCancelDownload(): Promise<void> {
  return invoke<void>('epic_cancel_download');
}

export async function epicLaunch(gameId: string): Promise<void> {
  return invoke<void>('epic_launch', { gameId });
}

export async function gogConnect(code: string): Promise<void> {
  return invoke<void>('gog_connect', { code });
}

export async function gogSync(): Promise<{ connected: boolean; count: number }> {
  return invoke<{ connected: boolean; count: number }>('gog_sync');
}

export async function gogDisconnect(): Promise<void> {
  return invoke<void>('gog_disconnect');
}

export async function gogInstall(gameId: string, destination: string): Promise<void> {
  return invoke<void>('gog_install', { gameId, destination });
}

export async function gogCancelDownload(): Promise<void> {
  return invoke<void>('gog_cancel_download');
}

export async function gogLaunch(gameId: string): Promise<void> {
  return invoke<void>('gog_launch', { gameId });
}

export async function steamConnect(): Promise<void> {
  return invoke<void>('steam_connect');
}

export async function steamCancel(): Promise<void> {
  return invoke<void>('steam_cancel');
}

export async function steamSync(): Promise<{ connected: boolean; count: number }> {
  return invoke<{ connected: boolean; count: number }>('steam_sync');
}

export async function steamDisconnect(): Promise<void> {
  return invoke<void>('steam_disconnect');
}

export async function steamInstall(gameId: string, destination: string): Promise<void> {
  return invoke<void>('steam_install', { gameId, destination });
}

export async function steamLaunch(gameId: string): Promise<void> {
  return invoke<void>('steam_launch', { gameId });
}

export async function addManualGame(path: string, title: string, workingDirectory: string): Promise<string> {
  return invoke<string>('add_manual_game', { executablePath: path, title, workingDirectory });
}

export async function launchInstallation(installationId: string): Promise<void> {
  return invoke<void>('launch_installation', { installationId });
}

export async function revealInstallation(installationId: string): Promise<void> {
  return invoke<void>('reveal_installation', { installationId });
}

export interface ScanCandidate { title: string; executablePath: string }
export interface ScanReport {
  root: string;
  entriesChecked: number;
  candidates: ScanCandidate[];
  warnings: number;
  truncated: boolean;
  cancelled: boolean;
}

export async function scanFolderPreview(root: string): Promise<ScanReport> {
  return invoke<ScanReport>('scan_folder_preview', { root });
}

export async function cancelScan(): Promise<void> {
  return invoke<void>('cancel_scan');
}

export interface StoreCandidate {
  source: 'steam' | 'epic' | 'gog';
  storeId: string | null;
  title: string;
  executablePath: string;
  workingDirectory: string;
}
export interface StoreReport {
  candidates: StoreCandidate[];
  warnings: number;
  cancelled: boolean;
}
export async function discoverStores(): Promise<StoreReport> {
  return invoke<StoreReport>('discover_stores');
}
export async function importStoreGames(candidates: StoreCandidate[]): Promise<number> {
  return invoke<number>('import_store_games', { candidates });
}

export interface ArtworkReport { updated: number; unavailable: number }
export async function refreshArtwork(gameId?: string, force = false): Promise<ArtworkReport> {
  return invoke<ArtworkReport>('refresh_artwork', { gameId: gameId ?? null, force });
}
export async function steamGridDbKeyStatus(): Promise<boolean> {
  return invoke<boolean>('steamgriddb_key_status');
}
export async function setSteamGridDbKey(key: string): Promise<boolean> {
  return invoke<boolean>('set_steamgriddb_key', { key });
}
