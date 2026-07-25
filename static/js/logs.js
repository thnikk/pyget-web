import { api } from './api.js';
import { showNotification } from './ui.js';

let logs = [];
let isLoading = false;

export async function initLogTab() {
    const refreshBtn = document.getElementById('refresh-logs-btn');
    const clearBtn = document.getElementById('clear-logs-btn');
    const logContainer = document.getElementById('log-container');
    const loadingEl = document.getElementById('log-loading');

    refreshBtn.addEventListener('click', loadLogs);
    clearBtn.addEventListener('click', clearLogs);

    // Initial load
    await loadLogs();
}

async function loadLogs() {
    if (isLoading) return;
    
    isLoading = true;
    const loadingEl = document.getElementById('log-loading');
    const logContainer = document.getElementById('log-container');
    
    loadingEl.style.display = 'block';
    logContainer.style.display = 'none';

    try {
        const [logResponse, torrents] = await Promise.all([
            api.getNotificationLogs(200),
            api.getTransmissionTorrents().catch(() => [])
        ]);

        const torrentMap = {};
        torrents.forEach(t => {
            torrentMap[t.name] = t;
        });

        logs = logResponse.logs.map(log => {
            if (log.torrent_name) {
                log.torrent = torrentMap[log.torrent_name] ||
                    torrents.find(t =>
                        t.name.includes(log.torrent_name) ||
                        log.torrent_name.includes(t.name)
                    );
            }
            return log;
        });
        renderLogs();
    } catch (error) {
        console.error('Error loading logs:', error);
        showNotification('Failed to load notification logs', 'error');
    } finally {
        isLoading = false;
        loadingEl.style.display = 'none';
        logContainer.style.display = '';
    }
}

function renderLogs() {
    const logContainer = document.getElementById('log-container');
    
    if (logs.length === 0) {
        logContainer.innerHTML = `
            <div class="log-empty">
                <i class="fa-solid fa-bell-slash" style="font-size: 48px; margin-bottom: 16px; display: block;"></i>
                <p>No notification history yet</p>
                <p style="font-size: 14px; margin-top: 8px;">Notifications will appear here when new torrents are added</p>
            </div>
        `;
        return;
    }

    logContainer.innerHTML = logs.map(log => {
        const icon = log.torrent ? getTorrentIcon(log.torrent) : getTypeIcon(log.type);
        
        return `
            <div class="log-entry" data-id="${log.id}">
                <div class="log-icon ${icon.class}">
                    <i class="fa-solid ${icon.name}"></i>
                </div>
                <div class="log-content">
                    <div class="log-message">
                        ${log.message}
                    </div>
                    <div class="log-timestamp">
                        ${formatTimestamp(log.timestamp, log.torrent)}
                        ${log.torrent ? formatTorrentStatus(log.torrent) : ''}
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

function getTorrentIcon(torrent) {
    const map = {
        'downloading':     { name: 'fa-download', class: 'downloading' },
        'seeding':         { name: 'fa-upload',   class: 'seeding' },
        'stopped':         { name: 'fa-pause',    class: 'stopped' },
        'check pending':   { name: 'fa-spinner',  class: 'checking' },
        'checking':        { name: 'fa-spinner',  class: 'checking' },
        'download pending':{ name: 'fa-clock',    class: 'pending' },
        'seed pending':    { name: 'fa-clock',    class: 'pending' }
    };
    return map[torrent.status] || { name: 'fa-circle', class: 'stopped' };
}

function getTypeIcon(type) {
    const map = {
        'new':          { name: 'fa-circle-check', class: 'new' },
        'replacement':  { name: 'fa-rotate',       class: 'replacement' },
        'test':         { name: 'fa-vial',         class: 'test' }
    };
    return map[type] || { name: 'fa-circle', class: '' };
}

function formatTorrentStatus(torrent) {
    const statusLabels = {
        'stopped': 'Stopped',
        'check pending': 'Check pending',
        'checking': 'Checking',
        'download pending': 'Download pending',
        'downloading': 'Downloading',
        'seed pending': 'Seed pending',
        'seeding': 'Seeding'
    };
    const label = statusLabels[torrent.status] || 'Unknown';
    let details = label;

    if (torrent.status === 'downloading') {
        const pct = Math.round(torrent.progress);
        const rate = formatSpeed(torrent.download_rate);
        details = `${label} ${pct}% (${rate})`;
    } else if (torrent.status === 'seeding') {
        const rate = formatSpeed(torrent.upload_rate);
        details = `${label} (↑ ${rate})`;
    } else if (torrent.progress > 0 && torrent.progress < 100) {
        details = `${label} ${Math.round(torrent.progress)}%`;
    }

    const statusClass = torrent.status === 'seeding' ? 'seeding' :
                        torrent.status === 'downloading' ? 'downloading' :
                        'stopped';
    return `<span class="torrent-status-badge ${statusClass}">${details}</span>`;
}

function formatSpeed(bytesPerSecond) {
    if (bytesPerSecond === 0) return '0 B/s';
    const units = ['B/s', 'KB/s', 'MB/s', 'GB/s'];
    const i = Math.floor(Math.log(bytesPerSecond) / Math.log(1024));
    const val = bytesPerSecond / Math.pow(1024, i);
    return `${val.toFixed(1)} ${units[i]}`;
}

function formatTimestamp(timestamp, torrent) {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;

    const isComplete = torrent && torrent.progress >= 100;
    const prefix = isComplete ? 'Completed on ' : 'Added on ';

    const time = date.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
        hour: '2-digit',
        minute: '2-digit'
    });

    return prefix + time;
}

async function clearLogs() {
    if (!confirm('Are you sure you want to clear all notification logs? This action cannot be undone.')) {
        return;
    }

    try {
        await api.clearNotificationLogs();
        logs = [];
        renderLogs();
        showNotification('Notification logs cleared', 'success');
    } catch (error) {
        console.error('Error clearing logs:', error);
        showNotification('Failed to clear notification logs', 'error');
    }
}