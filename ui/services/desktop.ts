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

export async function addManualGame(path: string): Promise<string> {
  return invoke<string>('add_manual_game', { executablePath: path });
}

export async function launchInstallation(installationId: string): Promise<void> {
  return invoke<void>('launch_installation', { installationId });
}

export async function revealInstallation(installationId: string): Promise<void> {
  return invoke<void>('reveal_installation', { installationId });
}
