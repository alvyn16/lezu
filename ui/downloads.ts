import type { DownloadRecord } from './services/desktop';
import type { LibraryMode } from './domain/models';
import { escape } from './home';
import { providerMark } from './shell';

const providerNames: Record<DownloadRecord['provider'], string> = {
  steam: 'Steam', epic: 'Epic Games', gog: 'GOG',
};
const statusNames: Record<DownloadRecord['status'], string> = {
  downloading: 'Downloading', completed: 'Completed', failed: 'Failed',
  cancelled: 'Cancelled', interrupted: 'Interrupted',
};

function dateLabel(seconds: number) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(seconds * 1000));
}

function downloadRow(record: DownloadRecord) {
  const active = record.status === 'downloading';
  const percent = record.progress === null ? null : Math.max(0, Math.min(100, record.progress));
  const progress = active ? `<div class="download-progress" role="progressbar" aria-label="${escape(record.title)} download" ${percent === null ? '' : `aria-valuemin="0" aria-valuemax="100" aria-valuenow="${percent}"`}>
    <span style="width:${percent ?? 35}%" class="${percent === null ? 'indeterminate' : ''}"></span></div>
    <p class="download-hint">${percent === null ? 'Downloading in Lezu · progress unavailable from this store' : `${percent}% downloaded`}</p>` : '';
  return `<li class="download-row">
    <div class="download-provider">${providerMark(record.provider)}</div>
    <div class="download-info">
      <div class="download-title-line"><h3>${escape(record.title)}</h3><span class="download-status ${record.status}">${statusNames[record.status]}</span></div>
      <p class="download-meta">${providerNames[record.provider]} <span>·</span> ${dateLabel(record.startedAt)}</p>
      <p class="download-location" title="${escape(record.destination)}">${escape(record.destination)}</p>
      ${progress}
      ${record.error ? `<p class="download-error">${escape(record.error)}</p>` : ''}
    </div>
    ${active ? '<button class="download-cancel" data-action="cancel-download">Cancel</button>' : ''}
  </li>`;
}

export function downloads(records: readonly DownloadRecord[], mode: LibraryMode, loading: boolean, problem: string | null) {
  if (mode === 'demo') return '<section class="downloads-page"><h2>Downloads</h2><p>Download management is available in the Windows app.</p></section>';
  const active = records.filter(record => record.status === 'downloading');
  const history = records.filter(record => record.status !== 'downloading');
  return `<section class="downloads-page" aria-labelledby="downloads-heading">
    <div class="downloads-heading"><div><h2 id="downloads-heading">Downloads</h2><p>Track game installs and see previous results.</p></div>
      ${history.length ? '<button data-action="clear-download-history">Clear history</button>' : ''}</div>
    ${problem ? `<p class="downloads-error" role="alert">${escape(problem)} <button data-action="retry-download-history">Try again</button></p>` : ''}
    ${loading ? '<p role="status">Loading downloads…</p>' : ''}
    ${active.length ? `<section class="downloads-group" aria-labelledby="active-downloads"><h3 id="active-downloads">Active</h3><ul>${active.map(downloadRow).join('')}</ul></section>` : ''}
    ${history.length ? `<section class="downloads-group" aria-labelledby="recent-downloads"><h3 id="recent-downloads">History</h3><ul>${history.map(downloadRow).join('')}</ul></section>` : ''}
    ${!loading && !problem && !records.length ? '<div class="downloads-empty"><h3>No downloads yet</h3><p>Open a game you own and choose Download to start an install.</p></div>' : ''}
  </section>`;
}
