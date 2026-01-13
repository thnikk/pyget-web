// API base URL
const API_BASE = 'http://localhost:5000/api';

// Tab navigation
document.querySelectorAll('.nav-tab').forEach(button => {
    button.addEventListener('click', () => {
        const tabName = button.dataset.tab;

        // Update active tab button
        document.querySelectorAll('.nav-tab').forEach(btn => {
            btn.classList.remove('active');
        });
        button.classList.add('active');

        // Update active tab content
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.remove('active');
        });
        document.getElementById(`${tabName}-tab`).classList.add('active');

        // Load data for the tab
        if (tabName === 'sources') {
            loadSources();
        } else if (tabName === 'shows') {
            loadTrackedShows();
        }
    });
});

// Settings modal
document.getElementById('settings-btn').addEventListener('click', () => {
    document.getElementById('settings-modal').classList.add('visible');
    loadTransmissionSettings();
});

document.querySelector('.close-settings').addEventListener('click', () => {
    document.getElementById('settings-modal').classList.remove('visible');
});

// Source management
document.getElementById('source-form')
    .addEventListener('submit', async (e) => {
        e.preventDefault();

        const data = {
            name: document.getElementById('source-name').value,
            base_url: document.getElementById('base-url').value,
            uploader: document.getElementById('uploader').value || null,
            quality: document.getElementById('quality').value || null,
            color: document.getElementById('source-color').value
        };

        try {
            const response = await fetch(`${API_BASE}/profiles`, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(data)
            });

            if (response.ok) {
                e.target.reset();
                document.getElementById('source-color').value = '#88c0d0';
                loadSources();
                showNotification('Source added successfully', 'success');
            }
        } catch (error) {
            showNotification('Error adding source', 'error');
        }
    });

async function loadSources() {
    const container = document.getElementById('sources-list');
    container.innerHTML = '<div class="loading">Loading sources...</div>';

    try {
        const response = await fetch(`${API_BASE}/profiles`);
        const sources = await response.json();

        if (sources.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <p>No sources yet. Add one above!</p>
                </div>
            `;
            return;
        }

        container.innerHTML = sources.map(source => `
            <div class="list-item">
                <div class="list-item-header">
                    <div class="list-item-title-with-badge">
                        <span class="source-color-indicator" 
                              style="background-color: ${source.color || '#88c0d0'}"></span>
                        <span class="list-item-title">${source.name}</span>
                    </div>
                    <button class="btn btn-danger btn-small"
                            onclick="deleteSource(${source.id})">
                        <span class="material-icons">delete</span>
                    </button>
                </div>
                <div class="list-item-meta">
                    Base URL: ${source.base_url}
                </div>
                ${source.uploader ? `
                    <div class="list-item-meta">
                        Uploader: ${source.uploader}
                    </div>
                ` : ''}
                ${source.quality ? `
                    <div class="list-item-meta">
                        Quality: ${source.quality}
                    </div>
                ` : ''}
            </div>
        `).join('');
    } catch (error) {
        container.innerHTML = `
            <div class="empty-state">
                <p>Error loading sources</p>
            </div>
        `;
    }
}

async function deleteSource(id) {
    if (!confirm('Delete this source?')) return;

    try {
        await fetch(`${API_BASE}/profiles/${id}`, {method: 'DELETE'});
        loadSources();
        showNotification('Source deleted', 'success');
    } catch (error) {
        showNotification('Error deleting source', 'error');
    }
}

// Transmission settings
document.getElementById('transmission-form')
    .addEventListener('submit', async (e) => {
        e.preventDefault();

        const data = {
            transmission_host: document.getElementById('transmission-host').value,
            transmission_port: document.getElementById('transmission-port').value
        };

        try {
            const response = await fetch(`${API_BASE}/settings`, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(data)
            });

            if (response.ok) {
                showNotification('Transmission settings saved', 'success');
                document.getElementById('settings-modal').classList.remove('visible');
            }
        } catch (error) {
            showNotification('Error saving settings', 'error');
        }
    });

async function loadTransmissionSettings() {
    try {
        const response = await fetch(`${API_BASE}/settings`);
        const settings = await response.json();

        document.getElementById('transmission-host').value =
            settings.transmission_host || 'localhost';
        document.getElementById('transmission-port').value =
            settings.transmission_port || '9091';
    } catch (error) {
        console.error('Error loading transmission settings:', error);
    }
}

// Add show modal
document.getElementById('add-show-btn')
    .addEventListener('click', () => {
        document.getElementById('add-show-modal').classList.add('visible');
        loadShows();
    });

document.querySelector('.close-add').addEventListener('click', () => {
    document.getElementById('add-show-modal').classList.remove('visible');
});

// Search functionality
let searchTimeout;
document.getElementById('show-search')
    .addEventListener('input', (e) => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
            loadShows(e.target.value);
        }, 300);
    });

// Shows management
async function loadShows(searchQuery = '') {
    const container = document.getElementById('shows-list');
    container.innerHTML = '<div class="loading">Loading shows...</div>';

    try {
        let url = `${API_BASE}/shows`;
        if (searchQuery) {
            url += `?q=${encodeURIComponent(searchQuery)}`;
        }

        const response = await fetch(url);
        const shows = await response.json();

        if (shows.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <p>${searchQuery ? 'No shows found matching your search' :
                         'No shows found. Add some sources first!'}</p>
                </div>
            `;
            return;
        }

        container.innerHTML = shows.map(show => `
            <div class="list-item">
                <div class="list-item-header">
                    <div class="list-item-title">${show.name}</div>
                </div>
                <div class="source-badges">
                    ${show.sources.map(source => `
                        <div class="source-badge"
                             style="background-color: ${source.color || '#88c0d0'}"
                             onclick="trackShow('${escapeHtml(show.name)}', ${source.profile_id})"
                             title="${source.profile_name}${source.uploader ? ' - ' + source.uploader : ''}${source.quality ? ' - ' + source.quality : ''}">
                            <span class="source-badge-name">${source.profile_name}</span>
                            ${source.quality ? `<span class="source-badge-quality">${source.quality}</span>` : ''}
                        </div>
                    `).join('')}
                </div>
            </div>
        `).join('');
    } catch (error) {
        container.innerHTML = `
            <div class="empty-state">
                <p>Error loading shows</p>
            </div>
        `;
    }
}

// Modal close
window.addEventListener('click', (e) => {
    const addModal = document.getElementById('add-show-modal');
    const settingsModal = document.getElementById('settings-modal');

    if (e.target === addModal) {
        addModal.classList.remove('visible');
    }
    if (e.target === settingsModal) {
        settingsModal.classList.remove('visible');
    }
});

async function trackShow(showName, profileId) {
    try {
        const response = await fetch(`${API_BASE}/tracked`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                show_name: showName,
                profile_id: profileId
            })
        });

        if (response.ok) {
            document.getElementById('add-show-modal')
                .classList.remove('visible');
            showNotification('Show tracked successfully', 'success');
            
            // Switch to shows tab and reload
            document.querySelector('.nav-tab[data-tab="shows"]').click();
        }
    } catch (error) {
        showNotification('Error tracking show', 'error');
    }
}

// Tracked shows
async function loadTrackedShows() {
    const container = document.getElementById('tracked-list');
    container.innerHTML = '<div class="loading">Loading tracked shows...</div>';

    try {
        const response = await fetch(`${API_BASE}/tracked`);
        const tracked = await response.json();

        if (tracked.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <p>No tracked shows yet. Click + Add Show to get started!</p>
                </div>
            `;
            return;
        }

        container.innerHTML = tracked.map(show => `
            <div class="show-card">
                <button class="show-card-remove"
                        onclick="untrackShow(${show.id})"
                        title="Remove show">
                    <span class="material-icons">delete</span>
                </button>
                <div class="show-card-badge"
                     style="background-color: ${show.color || '#88c0d0'}">
                    ${show.profile_name}
                </div>
                <div class="show-card-image">
                    ${show.show_name.substring(0, 2).toUpperCase()}
                </div>
                <div class="show-card-content">
                    <div class="show-card-title">${show.show_name}</div>
                </div>
            </div>
        `).join('');
    } catch (error) {
        container.innerHTML = `
            <div class="empty-state">
                <p>Error loading tracked shows</p>
            </div>
        `;
    }
}

async function untrackShow(id) {
    if (!confirm('Stop tracking this show?')) return;

    try {
        await fetch(`${API_BASE}/tracked/${id}`, {method: 'DELETE'});
        loadTrackedShows();
        showNotification('Show untracked', 'success');
    } catch (error) {
        showNotification('Error untracking show', 'error');
    }
}

// Utility functions
function escapeHtml(text) {
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, m => map[m]);
}

function showNotification(message, type) {
    console.log(`[${type.toUpperCase()}] ${message}`);
}

// Initial load
loadSources();
