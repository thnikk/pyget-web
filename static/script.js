// API base URL
const API_BASE = 'http://localhost:5000/api';

// Settings modal
document.getElementById('settings-btn').addEventListener('click', () => {
    document.getElementById('settings-modal').classList.add('visible');
    loadProfiles();
    loadTransmissionSettings();
});

document.querySelector('.close-settings').addEventListener('click', () => {
    document.getElementById('settings-modal').classList.remove('visible');
});

// Settings tabs
document.querySelectorAll('.settings-tab-btn').forEach(button => {
    button.addEventListener('click', () => {
        const tabName = button.dataset.settingsTab;

        document.querySelectorAll('.settings-tab-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        button.classList.add('active');

        document.querySelectorAll('.settings-tab-content').forEach(content => {
            content.classList.remove('active');
        });
        document.getElementById(`${tabName}-settings-tab`)
            .classList.add('active');
    });
});

// Profile management
document.getElementById('profile-form')
    .addEventListener('submit', async (e) => {
        e.preventDefault();

        const data = {
            name: document.getElementById('profile-name').value,
            base_url: document.getElementById('base-url').value,
            uploader: document.getElementById('uploader').value || null,
            quality: document.getElementById('quality').value || null
        };

        try {
            const response = await fetch(`${API_BASE}/profiles`, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(data)
            });

            if (response.ok) {
                e.target.reset();
                loadProfiles();
                showNotification('Profile added successfully', 'success');
            }
        } catch (error) {
            showNotification('Error adding profile', 'error');
        }
    });

async function loadProfiles() {
    const container = document.getElementById('profiles-list');
    container.innerHTML = '<div class="loading">Loading profiles...</div>';

    try {
        const response = await fetch(`${API_BASE}/profiles`);
        const profiles = await response.json();

        if (profiles.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <p>No profiles yet. Add one above!</p>
                </div>
            `;
            return;
        }

        container.innerHTML = profiles.map(profile => `
            <div class="list-item">
                <div class="list-item-header">
                    <div class="list-item-title">${profile.name}</div>
                    <button class="btn btn-danger"
                            onclick="deleteProfile(${profile.id})">
                        Delete
                    </button>
                </div>
                <div class="list-item-meta">
                    Base URL: ${profile.base_url}
                </div>
                ${profile.uploader ? `
                    <div class="list-item-meta">
                        Uploader: ${profile.uploader}
                    </div>
                ` : ''}
                ${profile.quality ? `
                    <div class="list-item-meta">
                        Quality: ${profile.quality}
                    </div>
                ` : ''}
            </div>
        `).join('');
    } catch (error) {
        container.innerHTML = `
            <div class="empty-state">
                <p>Error loading profiles</p>
            </div>
        `;
    }
}

async function deleteProfile(id) {
    if (!confirm('Delete this profile?')) return;

    try {
        await fetch(`${API_BASE}/profiles/${id}`, {method: 'DELETE'});
        loadProfiles();
        showNotification('Profile deleted', 'success');
    } catch (error) {
        showNotification('Error deleting profile', 'error');
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
                         'No shows found. Add some feed profiles first!'}</p>
                </div>
            `;
            return;
        }

        container.innerHTML = shows.map(show => `
            <div class="list-item show-item"
                 onclick="showSourceModal('${escapeHtml(show.name)}',
                          ${JSON.stringify(show.sources)
                                .replace(/"/g, '&quot;')})">
                <div class="list-item-header">
                    <div class="list-item-title">${show.name}</div>
                    <div class="list-item-meta">
                        ${show.sources.length} source(s)
                    </div>
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

function showSourceModal(showName, sources) {
    const modal = document.getElementById('source-modal');
    document.getElementById('modal-title').textContent =
        `Select Source for: ${showName}`;

    const modalBody = document.getElementById('modal-body');
    modalBody.innerHTML = sources.map(source => `
        <div class="list-item"
             style="cursor: pointer;"
             onclick="trackShow('${escapeHtml(showName)}',
                      ${source.profile_id})">
            <div class="list-item-title">${source.profile_name}</div>
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

    modal.classList.add('visible');
}

// Modal close
document.querySelector('.close').addEventListener('click', () => {
    document.getElementById('source-modal').classList.remove('visible');
});

window.addEventListener('click', (e) => {
    const sourceModal = document.getElementById('source-modal');
    const addModal = document.getElementById('add-show-modal');
    const settingsModal = document.getElementById('settings-modal');

    if (e.target === sourceModal) {
        sourceModal.classList.remove('visible');
    }
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
            document.getElementById('source-modal')
                .classList.remove('visible');
            document.getElementById('add-show-modal')
                .classList.remove('visible');
            showNotification('Show tracked successfully', 'success');
            loadTrackedShows();
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
                <div class="show-card-badge">
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

function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

function showNotification(message, type) {
    // Simple console notification
    // Could be enhanced with a toast/snackbar UI component
    console.log(`[${type.toUpperCase()}] ${message}`);
}

// Initial load
loadTrackedShows();
