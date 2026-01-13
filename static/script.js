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
document.querySelectorAll('.settings-tab').forEach(button => {
    button.addEventListener('click', () => {
        const tabName = button.dataset.tab;

        document.querySelectorAll('.settings-tab').forEach(btn => {
            btn.classList.remove('active');
        });
        button.classList.add('active');

        document.querySelectorAll('.settings-tab-content').forEach(content => {
            content.classList.remove('active');
        });
        document.getElementById(`${tabName}-settings-tab`).classList.add('active');
    });
});

document.getElementById('settings-btn').addEventListener('click', () => {
    document.getElementById('settings-modal').classList.add('visible');
    loadSettings();
});

document.getElementById('general-settings-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = {
        download_directory: document.getElementById('download-directory').value
    };
    try {
        const response = await fetch(`${API_BASE}/settings`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(data)
        });
        if (response.ok) {
            showNotification('Settings saved', 'success');
            document.getElementById('settings-modal').classList.remove('visible');
        }
    } catch (error) {
        showNotification('Error saving settings', 'error');
    }
});

async function loadSettings() {
    try {
        const response = await fetch(`${API_BASE}/settings`);
        const settings = await response.json();

        document.getElementById('download-directory').value = settings.download_directory || '';
        document.getElementById('transmission-host').value =
            settings.transmission_host || 'localhost';
        document.getElementById('transmission-port').value =
            settings.transmission_port || '9091';
    } catch (error) {
        console.error('Error loading settings:', error);
    }
}


document.querySelector('.close-settings').addEventListener('click', () => {
    document.getElementById('settings-modal').classList.remove('visible');
});

// Source management
document.getElementById('source-form').addEventListener('submit', async (e) => {
    e.preventDefault();

    const sourceId = document.getElementById('source-id').value;
    const isEdit = !!sourceId;

    const data = {
        name: document.getElementById('source-name').value,
        base_url: document.getElementById('base-url').value,
        uploader: document.getElementById('uploader').value || null,
        quality: document.getElementById('quality').value || null,
        color: document.getElementById('source-color').value,
    };

    try {
        const url = isEdit ? `${API_BASE}/profiles/${sourceId}` : `${API_BASE}/profiles`;
        const method = isEdit ? 'PUT' : 'POST';

        const response = await fetch(url, {
            method: method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        });

        if (response.ok) {
            document.getElementById('source-modal').classList.remove('visible');
            loadSources();
            showNotification(`Source ${isEdit ? 'updated' : 'added'} successfully`, 'success');
        }
    } catch (error) {
        showNotification(`Error ${isEdit ? 'updating' : 'adding'} source`, 'error');
    }
});

async function loadSources() {
    const container = document.getElementById('sources-list');
    container.innerHTML = '<div class="loading">Loading sources...</div>';

    try {
        const response = await fetch(`${API_BASE}/profiles`);
        const sources = await response.json();

        let content = `
            <div class="add-source-card" onclick="openSourceModal()">
                <span class="material-icons">add</span>
            </div>
        `;

        content += sources.map(source => `
            <div class="source-card" onclick='openSourceModal(${JSON.stringify(source)})'>
                <div class="source-card-header">
                    <div class="source-card-title-with-badge">
                        <span class="source-color-indicator" 
                              style="background-color: ${source.color || '#88c0d0'}"></span>
                        <span class="source-card-title">${source.name}</span>
                    </div>
                </div>
                <div class="source-card-meta">
                    Base URL: ${source.base_url}
                </div>
                ${source.uploader ? `
                    <div class="source-card-meta">
                        Uploader: ${source.uploader}
                    </div>
                ` : ''}
                ${source.quality ? `
                    <div class="source-card-meta">
                        Quality: ${source.quality}
                    </div>
                ` : ''}
            </div>
        `).join('');
        container.innerHTML = content;
    } catch (error) {
        container.innerHTML = `
            <div class="empty-state">
                <p>Error loading sources</p>
            </div>
        `;
    }
}

function openSourceModal(source = null) {
    const modal = document.getElementById('source-modal');
    const modalTitle = document.getElementById('source-modal-title');
    const deleteBtn = document.getElementById('delete-source-btn');

    if (source) {
        modalTitle.textContent = 'Edit Source';
        document.getElementById('source-id').value = source.id;
        document.getElementById('source-name').value = source.name;
        document.getElementById('source-color').value = source.color;
        document.getElementById('base-url').value = source.base_url;
        document.getElementById('uploader').value = source.uploader || '';
        document.getElementById('quality').value = source.quality || '';
        deleteBtn.style.display = 'block';
        deleteBtn.onclick = () => {
            deleteSource(source.id);
            modal.classList.remove('visible');
        };
    } else {
        modalTitle.textContent = 'Add Source';
        document.getElementById('source-form').reset();
        document.getElementById('source-color').value = '#88c0d0';
        deleteBtn.style.display = 'none';
    }

    modal.classList.add('visible');
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



function openAddShowModal() {
    document.getElementById('add-show-modal').classList.add('visible');
    loadShows();
}

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
            <div class="add-show-modal-item">
                <div class="add-show-modal-item-header">
                    ${show.name}
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

document.getElementById('add-show-back-btn').addEventListener('click', () => {
    document.getElementById('add-show-page-2').style.display = 'none';
    document.getElementById('add-show-page-1').style.display = 'block';
});

document.getElementById('add-show-details-form').addEventListener('submit', async (e) => {
    e.preventDefault();

    const data = {
        show_name: document.getElementById('add-show-name').value,
        profile_id: document.getElementById('add-show-profile-id').value,
        season_name: document.getElementById('add-show-season').value,
        max_age: document.getElementById('add-show-max-age').value
    };

    try {
        const response = await fetch(`${API_BASE}/tracked`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(data)
        });

        if (response.ok) {
            document.getElementById('add-show-modal').classList.remove('visible');
            showNotification('Show tracked successfully', 'success');
            
            // Switch to shows tab and reload
            document.querySelector('.nav-tab[data-tab="shows"]').click();
        }
    } catch (error) {
        showNotification('Error tracking show', 'error');
    }
});

function openEditShowModal(show) {
    const modal = document.getElementById('edit-show-modal');
    modal.classList.add('visible');

    document.getElementById('edit-show-id').value = show.id;
    document.getElementById('edit-show-name').value = show.show_name;
    document.getElementById('edit-show-season').value = show.season_name || '';
    document.getElementById('edit-show-max-age').value = show.max_age || '';

    // Set the onclick for the untrack button
    document.getElementById('untrack-show-btn').onclick = () => {
        untrackShow(show.id);
        modal.classList.remove('visible'); // Close modal after untracking
    };
}

document.getElementById('edit-show-form').addEventListener('submit', async (e) => {
    e.preventDefault();

    const showId = document.getElementById('edit-show-id').value;
    const data = {
        show_name: document.getElementById('edit-show-name').value,
        season_name: document.getElementById('edit-show-season').value,
        max_age: document.getElementById('edit-show-max-age').value
    };

    try {
        const response = await fetch(`${API_BASE}/tracked/${showId}`, {
            method: 'PUT',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(data)
        });

        if (response.ok) {
            document.getElementById('edit-show-modal').classList.remove('visible');
            loadTrackedShows();
            showNotification('Show updated successfully', 'success');
        }
    } catch (error) {
        showNotification('Error updating show', 'error');
    }
});

// Modal close
window.addEventListener('click', (e) => {
    const addModal = document.getElementById('add-show-modal');
    const settingsModal = document.getElementById('settings-modal');
    const sourceModal = document.getElementById('source-modal');
    const editShowModal = document.getElementById('edit-show-modal');

    if (e.target === addModal) {
        addModal.classList.remove('visible');
    }
    if (e.target === settingsModal) {
        settingsModal.classList.remove('visible');
    }
    if (e.target === sourceModal) {
        sourceModal.classList.remove('visible');
    }
    if (e.target === editShowModal) {
        editShowModal.classList.remove('visible');
    }
});

document.querySelector('.close-edit').addEventListener('click', () => {
    document.getElementById('source-modal').classList.remove('visible');
});

document.querySelector('.close-edit-show').addEventListener('click', () => {
    document.getElementById('edit-show-modal').classList.remove('visible');
});

async function trackShow(showName, profileId) {
    document.getElementById('add-show-name').value = showName;
    document.getElementById('add-show-profile-id').value = profileId;
    document.getElementById('add-show-season').value = 'Season 01';
    document.getElementById('add-show-max-age').value = '30';



    document.getElementById('add-show-page-1').style.display = 'none';
    document.getElementById('add-show-page-2').style.display = 'block';
}

// Tracked shows
async function loadTrackedShows() {
    const container = document.getElementById('tracked-list');
    container.innerHTML = '<div class="loading">Loading tracked shows...</div>';

    try {
        const response = await fetch(`${API_BASE}/tracked`);
        const tracked = await response.json();

        let content = `
            <div class="add-show-card" onclick="openAddShowModal()">
                <span class="material-icons">add</span>
            </div>
        `;

        if (tracked.length === 0) {
            container.innerHTML = content + `
                <div class="empty-state">
                    <p>No tracked shows yet. Click + Add Show to get started!</p>
                </div>
            `;
            return;
        }

        content += tracked.map(show => `
            <div class="show-card" onclick='openEditShowModal(${JSON.stringify(show)})'>
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
        container.innerHTML = content;
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
loadTrackedShows();
