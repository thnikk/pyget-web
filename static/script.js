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
        } else if (tabName === 'schedule') {
            loadSchedule();
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

document.getElementById('cleanup-artwork-btn').addEventListener('click', async () => {
    if (!confirm('Are you sure you want to delete all artwork files that are not associated with any tracked show?')) {
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/settings/artwork/cleanup`, {
            method: 'POST'
        });
        const result = await response.json();
        
        if (response.ok) {
            showNotification(`Cleanup complete. Deleted ${result.count} image(s).`, 'success');
        } else {
            showNotification(`Error: ${result.error}`, 'error');
        }
    } catch (error) {
        showNotification('Error connecting to server for cleanup', 'error');
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



function resetAddShowModal() {
    document.getElementById('add-show-modal').classList.remove('visible');
    document.getElementById('show-search').value = '';
    document.getElementById('clear-search-btn').style.display = 'none';
    document.getElementById('add-show-page-2').style.display = 'none';
    document.getElementById('add-show-page-1').style.display = 'block';
    document.getElementById('shows-list').innerHTML = '';
}

function openAddShowModal() {
    document.getElementById('add-show-modal').classList.add('visible');
    loadShows();
}

document.querySelector('.close-add').addEventListener('click', () => {
    resetAddShowModal();
});

// Search functionality
let searchTimeout;
document.getElementById('show-search')
    .addEventListener('input', (e) => {
        const clearBtn = document.getElementById('clear-search-btn');
        clearBtn.style.display = e.target.value ? 'block' : 'none';

        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
            loadShows(e.target.value);
        }, 300);
    });

document.getElementById('clear-search-btn').addEventListener('click', () => {
    const input = document.getElementById('show-search');
    input.value = '';
    document.getElementById('clear-search-btn').style.display = 'none';
    loadShows('');
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

        let customHtml = '';
        if (searchQuery) {
            const profilesResponse = await fetch(`${API_BASE}/profiles`);
            const profiles = await profilesResponse.json();
            
            customHtml = `
                <div class="add-show-modal-item">
                    <div class="add-show-modal-item-header">
                        Custom: ${searchQuery}
                    </div>
                    <div class="source-badges">
                        ${profiles.map(source => `
                            <div class="source-badge"
                                 style="background-color: ${source.color || '#88c0d0'}"
                                 onclick="trackShow('${escapeHtml(searchQuery)}', ${source.id})"
                                 title="${source.name}${source.uploader ? ' - ' + source.uploader : ''}${source.quality ? ' - ' + source.quality : ''}">
                                <span class="source-badge-name">${source.name}</span>
                                ${source.quality ? `<span class="source-badge-quality">${source.quality}</span>` : ''}
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        }

        if (shows.length === 0 && !searchQuery) {
            container.innerHTML = `
                <div class="empty-state">
                    <p>No shows found. Add some sources first!</p>
                </div>
            `;
            return;
        }

        if (shows.length === 0 && searchQuery && !customHtml) {
             container.innerHTML = `
                <div class="empty-state">
                    <p>No shows found matching your search</p>
                </div>
            `;
            return;
        }

        const showsHtml = shows.map(show => `
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

        container.innerHTML = showsHtml + customHtml;

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
            resetAddShowModal();
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

document.querySelector('.close-edit').addEventListener('click', () => {
    document.getElementById('source-modal').classList.remove('visible');
});

document.querySelector('.close-edit-show').addEventListener('click', () => {
    document.getElementById('edit-show-modal').classList.remove('visible');
});

async function trackShow(showName, profileId) {
    let finalShowName = showName;
    let finalSeason = 'Season 01';

    // Parse season from title if it ends with "Season #" or "S#"
    const seasonMatch = showName.match(/\s+(Season\s+(\d+)|S(\d+))$/i);
    if (seasonMatch) {
        const seasonNum = seasonMatch[2] || seasonMatch[3];
        finalShowName = showName.substring(0, seasonMatch.index).trim();
        finalSeason = `Season ${seasonNum.padStart(2, '0')}`;
    }

    document.getElementById('add-show-name').value = finalShowName;
    document.getElementById('add-show-profile-id').value = profileId;
    document.getElementById('add-show-season').value = finalSeason;
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
            <div class="show-card" 
                 onclick='openEditShowModal(${JSON.stringify(show)})'
                 ondragover="event.preventDefault(); this.classList.add('drag-over');"
                 ondragleave="this.classList.remove('drag-over');"
                 ondrop="handleShowDrop(event, ${show.id})">
                <div class="show-card-image">
                    ${show.image_path ? 
                        `<img src="${show.image_path}" alt="${escapeHtml(show.show_name)}" style="width: 100%; height: 100%; object-fit: cover;">` :
                        show.show_name.substring(0, 2).toUpperCase()
                    }
                </div>
                <div class="show-card-content">
                    <div class="show-card-title">${show.show_name}</div>
                    <div class="show-card-badge"
                         style="background-color: ${show.color || '#88c0d0'}">
                        ${show.profile_name}
                    </div>
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

async function handleShowDrop(e, showId) {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.classList.remove('drag-over');

    const files = e.dataTransfer.files;
    if (files.length > 0) {
        const file = files[0];
        if (!file.type.startsWith('image/')) {
            showNotification('Please drop an image file', 'error');
            return;
        }

        const formData = new FormData();
        formData.append('file', file);

        try {
            const response = await fetch(`${API_BASE}/tracked/${showId}/art`, {
                method: 'POST',
                body: formData
            });

            if (response.ok) {
                showNotification('Artwork updated', 'success');
                loadTrackedShows();
            } else {
                showNotification('Error updating artwork', 'error');
            }
        } catch (error) {
            showNotification('Error uploading file', 'error');
        }
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

async function loadSchedule() {
    const grid = document.getElementById('calendar-grid');
    const upcomingContainer = document.getElementById('upcoming-list');
    const monthYearDisplay = document.getElementById('calendar-month-year');
    
    grid.innerHTML = '<div class="loading">Loading calendar...</div>';
    upcomingContainer.innerHTML = '';

    try {
        const response = await fetch(`${API_BASE}/schedule`);
        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.error || 'Server error');
        }
        const data = await response.json();

        const now = new Date();
        const currentMonth = now.getMonth();
        const currentYear = now.getFullYear();
        
        monthYearDisplay.textContent = now.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

        // Get first day of month and total days
        const firstDay = new Date(currentYear, currentMonth, 1).getDay();
        const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();

        // Calendar Headers
        const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        let html = days.map(d => `<div class="calendar-header-day">${d}</div>`).join('');

        // Empty days before month starts
        for (let i = 0; i < firstDay; i++) {
            html += '<div class="calendar-day empty"></div>';
        }

        // Days of the month
        for (let d = 1; d <= daysInMonth; d++) {
            const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
            const isToday = d === now.getDate() && currentMonth === now.getMonth() && currentYear === now.getFullYear();
            
            let eventsHtml = '';
            
            data.forEach(show => {
                // Check history for releases on this day
                show.history.forEach(rel => {
                    if (rel.release_date.startsWith(dateStr)) {
                        eventsHtml += `
                            <div class="calendar-event downloaded" style="border-left-color: ${show.color || 'var(--nord8)'}" title="${rel.torrent_name}">
                                ${show.show_name} ${rel.episode ? ` - ${rel.episode}` : ''}
                            </div>
                        `;
                    }
                });

                // Check predicted future releases
                if (show.predictions) {
                    show.predictions.forEach(pred => {
                        if (pred.date.startsWith(dateStr)) {
                            eventsHtml += `
                                <div class="calendar-event predicted" style="border-left-color: ${show.color || 'var(--nord8)'}" title="Predicted: ${show.show_name} - ${pred.episode}">
                                    ${show.show_name} - ${pred.episode} (est)
                                </div>
                            `;
                        }
                    });
                }
            });

            html += `
                <div class="calendar-day ${isToday ? 'today' : ''}">
                    <div class="calendar-day-number">${d}</div>
                    ${eventsHtml}
                </div>
            `;
        }

        grid.innerHTML = html;

        // Populate Upcoming List (next predicted episode for each show)
        let nextEpisodes = [];
        data.forEach(show => {
            if (show.predictions && show.predictions.length > 0) {
                const nextPred = show.predictions[0];
                nextEpisodes.push({
                    ...show,
                    next_episode: nextPred.episode,
                    next_release: nextPred.date
                });
            }
        });

        nextEpisodes.sort((a, b) => new Date(a.next_release + 'Z') - new Date(b.next_release + 'Z'));

        if (nextEpisodes.length === 0) {
            upcomingContainer.innerHTML = '<div class="empty-state">No upcoming releases predicted yet.</div>';
        } else {
            upcomingContainer.innerHTML = nextEpisodes.map(item => {
                const nextDate = new Date(item.next_release + 'Z');
                const isOverdue = nextDate < new Date();
                
                return `
                    <div class="upcoming-card">
                        <div class="upcoming-card-image">
                            ${item.image_path ? 
                                `<img src="${item.image_path}" alt="${escapeHtml(item.show_name)}" style="width: 100%; height: 100%; object-fit: cover;">` :
                                `<div style="width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; background: var(--nord1); color: var(--nord4); font-weight: bold;">
                                    ${item.show_name.substring(0, 2).toUpperCase()}
                                </div>`
                            }
                        </div>
                        <div class="upcoming-card-info">
                            <div class="upcoming-card-title">${item.show_name} ${item.next_episode ? ` - ${item.next_episode}` : ''}</div>
                            <div class="upcoming-card-date ${isOverdue ? 'overdue' : ''}">
                                ${formatDate(item.next_release)} ${isOverdue ? '(Expected)' : ''}
                            </div>
                        </div>
                    </div>
                `;
            }).join('');
        }

    } catch (error) {
        console.error('Error loading schedule:', error);
        grid.innerHTML = '<div class="empty-state">Error loading calendar data</div>';
    }
}

function formatDate(dateStr) {
    const date = new Date(dateStr + 'Z');
    return date.toLocaleDateString(undefined, { 
        weekday: 'long', 
        month: 'short', 
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
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

async function checkSetup() {
    try {
        const response = await fetch(`${API_BASE}/settings`);
        const settings = await response.json();
        
        if (settings.setup_complete !== '1') {
            document.getElementById('setup-modal').classList.add('visible');
        } else {
            loadTrackedShows();
        }
    } catch (error) {
        console.error('Error checking setup:', error);
        loadTrackedShows();
    }
}

document.getElementById('setup-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const data = {
        download_directory: document.getElementById('setup-download-directory').value,
        transmission_host: document.getElementById('setup-transmission-host').value,
        transmission_port: document.getElementById('setup-transmission-port').value,
        setup_complete: '1'
    };
    
    try {
        const response = await fetch(`${API_BASE}/settings`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(data)
        });
        
        if (response.ok) {
            document.getElementById('setup-modal').classList.remove('visible');
            showNotification('Setup complete!', 'success');
            loadTrackedShows();
        } else {
            showNotification('Error saving setup settings', 'error');
        }
    } catch (error) {
        showNotification('Error connecting to server', 'error');
    }
});

// Modal close
window.addEventListener('click', (e) => {
    const addModal = document.getElementById('add-show-modal');
    const settingsModal = document.getElementById('settings-modal');
    const sourceModal = document.getElementById('source-modal');
    const editShowModal = document.getElementById('edit-show-modal');

    if (e.target === addModal) {
        resetAddShowModal();
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

// Initial load
checkSetup();
