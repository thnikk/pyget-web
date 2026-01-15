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
        const response = await api.getNotificationLogs(200);
        logs = response.logs;
        renderLogs();
    } catch (error) {
        console.error('Error loading logs:', error);
        showNotification('Failed to load notification logs', 'error');
    } finally {
        isLoading = false;
        loadingEl.style.display = 'none';
        logContainer.style.display = 'block';
    }
}

function renderLogs() {
    const logContainer = document.getElementById('log-container');
    
    if (logs.length === 0) {
        logContainer.innerHTML = `
            <div class="log-empty">
                <span class="material-icons" style="font-size: 48px; margin-bottom: 16px; display: block;">notifications_off</span>
                <p>No notification history yet</p>
                <p style="font-size: 14px; margin-top: 8px;">Notifications will appear here when new torrents are added</p>
            </div>
        `;
        return;
    }

    logContainer.innerHTML = logs.map(log => {
        const iconClass = log.type;
        const iconText = getIconText(log.type);
        
        return `
            <div class="log-entry" data-id="${log.id}">
                <div class="log-icon ${iconClass}">
                    ${iconText}
                </div>
                <div class="log-content">
                    <div class="log-message">
                        ${log.message}
                        <span class="log-type-badge ${log.type}">${log.type}</span>
                    </div>
                    <div class="log-timestamp">
                        ${formatTimestamp(log.timestamp)}
                        ${log.torrent_name ? `<div class="log-filename">${log.torrent_name}</div>` : ''}
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

function getIconText(type) {
    switch (type) {
        case 'new':
            return '✓';
        case 'replacement':
            return '↻';
        case 'test':
            return '⚙';
        default:
            return '•';
    }
}

function formatTimestamp(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;
    
    // If within last 24 hours, show relative time
    if (diff < 24 * 60 * 60 * 1000) {
        if (diff < 60 * 1000) {
            return 'Just now';
        } else if (diff < 60 * 60 * 1000) {
            const minutes = Math.floor(diff / (60 * 1000));
            return `${minutes} minute${minutes !== 1 ? 's' : ''} ago`;
        } else {
            const hours = Math.floor(diff / (60 * 60 * 1000));
            return `${hours} hour${hours !== 1 ? 's' : ''} ago`;
        }
    }
    
    // Otherwise show formatted date
    return date.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
        hour: '2-digit',
        minute: '2-digit'
    });
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