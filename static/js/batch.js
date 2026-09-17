import { api } from './api.js';
import { openModal, closeModal, showNotification, escapeHtml } from './ui.js';

const STATUS_LABELS = {
    downloading: 'Downloading',
    organizing: 'Organizing',
    organized: 'Done',
    error: 'Error'
};

// Search results are kept here so a click on a result card can look
// itself back up without re-encoding the whole object into the DOM.
let lastResults = [];

export async function initBatchTab() {
    await loadBatchDownloads();
}

function hostnameFromUrl(url) {
    try {
        return new URL(url).hostname;
    } catch (error) {
        return url;
    }
}

export async function handleBatchSearch() {
    const query = document.getElementById('batch-search-input').value.trim();
    const container = document.getElementById('batch-results');

    if (!query) return;

    container.innerHTML = '<div class="loading">Searching...</div>';

    try {
        lastResults = await api.searchBatch(query);
        renderBatchResults();
    } catch (error) {
        container.innerHTML =
            '<div class="empty-state"><p>Search failed</p></div>';
    }
}

export function renderBatchResults() {
    const container = document.getElementById('batch-results');
    const onlyBatches = document.getElementById('batch-only-filter').checked;
    const filtered = onlyBatches
        ? lastResults.filter(r => r.is_batch)
        : lastResults;

    if (filtered.length === 0) {
        container.innerHTML =
            '<div class="empty-state"><p>No results found</p></div>';
        return;
    }

    container.innerHTML = filtered.map((r, i) => `
        <div class="batch-result-item" data-index="${i}">
            <div class="batch-result-title" title="${escapeHtml(r.title)}">
                ${r.is_batch ? '<span class="batch-tag">BATCH</span>' : ''}
                ${escapeHtml(r.title)}
            </div>
            <div class="batch-result-meta">
                <span>${escapeHtml(hostnameFromUrl(r.source))}</span>
                ${r.seeders !== null ?
                    `<span><i class="fa-solid fa-arrow-up"></i> ${r.seeders}</span>` :
                    ''}
                ${r.size ? `<span>${escapeHtml(r.size)}</span>` : ''}
            </div>
        </div>
    `).join('');

    container.querySelectorAll('.batch-result-item').forEach(item => {
        item.onclick = () => openBatchDownloadModal(
            filtered[item.dataset.index]
        );
    });
}

function openBatchDownloadModal(result) {
    document.getElementById('batch-torrent-url').value = result.torrent_url;
    document.getElementById('batch-torrent-name').value = result.title;
    document.getElementById('batch-show-name').value = result.suggested_name;
    document.getElementById('batch-season-name').value = 'Season 01';
    document.getElementById('batch-multi-season').checked = false;
    document.getElementById('batch-strip-underscores').checked = false;
    openModal('batch-download-modal');
}

export async function handleBatchDownloadSubmit(e) {
    e.preventDefault();

    const data = {
        show_name: document.getElementById('batch-show-name').value,
        season_name: document.getElementById('batch-season-name').value,
        multi_season:
            document.getElementById('batch-multi-season').checked,
        strip_underscores:
            document.getElementById('batch-strip-underscores').checked,
        torrent_url: document.getElementById('batch-torrent-url').value,
        torrent_name: document.getElementById('batch-torrent-name').value
    };

    try {
        await api.startBatchDownload(data);
        closeModal('batch-download-modal');
        showNotification('Download started', 'success');
        loadBatchDownloads();
        // A couple of follow-up polls to catch quick completions
        [15000, 30000].forEach(ms => setTimeout(loadBatchDownloads, ms));
    } catch (error) {
        showNotification(error.message || 'Error starting download',
                          'error');
    }
}

export async function loadBatchDownloads() {
    const container = document.getElementById('batch-downloads-list');

    try {
        const downloads = await api.getBatchDownloads();

        if (downloads.length === 0) {
            container.innerHTML =
                '<div class="empty-state"><p>No downloads yet</p></div>';
            return;
        }

        container.innerHTML = downloads.map(d => `
            <div class="batch-download-item">
                <div class="batch-download-info">
                    <div class="batch-download-title">
                        ${escapeHtml(d.show_name)} -
                        ${escapeHtml(d.season_name)}
                    </div>
                    <div class="batch-download-status status-${d.status}">
                        ${STATUS_LABELS[d.status] || d.status}
                        ${d.status === 'downloading' && d.progress !== null ?
                            ` (${Math.round(d.progress)}%)` : ''}
                    </div>
                    ${d.status_message ?
                        `<div class="batch-download-note">${escapeHtml(d.status_message)}</div>` :
                        ''}
                </div>
                <div class="batch-download-actions">
                    ${d.status === 'error' ?
                        `<button class="btn btn-secondary batch-retry-btn" data-id="${d.id}"><i class="fa-solid fa-rotate-right"></i></button>` :
                        ''}
                    <button class="btn btn-danger batch-remove-btn" data-id="${d.id}">
                        <i class="fa-solid fa-trash-can"></i>
                    </button>
                </div>
            </div>
        `).join('');

        container.querySelectorAll('.batch-retry-btn').forEach(btn => {
            btn.onclick = async () => {
                await api.retryBatchDownload(btn.dataset.id);
                showNotification('Retrying...', 'info');
                loadBatchDownloads();
            };
        });

        container.querySelectorAll('.batch-remove-btn').forEach(btn => {
            btn.onclick = async () => {
                if (!confirm(
                    'Remove this download from the list? ' +
                    'Files already downloaded are left in place.'
                )) return;
                await api.deleteBatchDownload(btn.dataset.id);
                loadBatchDownloads();
            };
        });

    } catch (error) {
        container.innerHTML =
            '<div class="empty-state"><p>Error loading downloads</p></div>';
    }
}
