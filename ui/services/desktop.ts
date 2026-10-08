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
  if (value && typeof value === 'object' && 'message' in value && typeof value.message === 'string') return value.message;
  return 'The desktop action could not be completed.';
}

export async function listLibrary() {
  return invoke<import('../domain/models').Game[]>('list_library');
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
export async function refreshArtwork(clientId?: string, clientSecret?: string): Promise<ArtworkReport> {
  return invoke<ArtworkReport>('refresh_artwork', { clientId, clientSecret });
}
