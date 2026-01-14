import { api } from './api.js';
import { openModal, closeModal, showNotification, escapeHtml } from './ui.js';

export function resetAddShowModal() {
    closeModal('add-show-modal');
    document.getElementById('show-search').value = '';
    document.getElementById('clear-search-btn').style.display = 'none';
    document.getElementById('add-show-page-2').style.display = 'none';
    document.getElementById('add-show-page-1').style.display = 'block';
    document.getElementById('shows-list').innerHTML = '';
}

export function openAddShowModal() {
    openModal('add-show-modal');
    loadShows();
}

export async function loadShows(searchQuery = '') {
    const container = document.getElementById('shows-list');
    container.innerHTML = '<div class="loading">Loading shows...</div>';

    try {
        const shows = await api.getShows(searchQuery);

        let customHtml = '';
        if (searchQuery) {
            const profiles = await api.getProfiles();
            
            customHtml = `
                <div class="add-show-modal-item custom-item">
                    <div class="add-show-modal-item-header">
                        Custom: ${searchQuery}
                    </div>
                    <div class="source-badges">
                        ${profiles.map(source => `
                            <div class="source-badge"
                                 style="background-color: ${source.color || '#88c0d0'}"
                                 data-name="${escapeHtml(searchQuery)}"
                                 data-id="${source.id}"
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

        const showsHtml = shows.map(show => `
            <div class="add-show-modal-item">
                <div class="add-show-modal-item-header">
                    ${show.name}
                </div>
                <div class="source-badges">
                    ${show.sources.map(source => `
                        <div class="source-badge cached-badge"
                             style="background-color: ${source.color || '#88c0d0'}"
                             data-name="${escapeHtml(show.name)}"
                             data-id="${source.profile_id}"
                             title="${source.profile_name}${source.uploader ? ' - ' + source.uploader : ''}${source.quality ? ' - ' + source.quality : ''}">
                            <span class="source-badge-name">${source.profile_name}</span>
                            ${source.quality ? `<span class="source-badge-quality">${source.quality}</span>` : ''}
                        </div>
                    `).join('')}
                </div>
            </div>
        `).join('');

        container.innerHTML = showsHtml + customHtml;
        
        // Add event listeners
        container.querySelectorAll('.source-badge').forEach(badge => {
            badge.onclick = (e) => {
                e.stopPropagation();
                trackShow(badge.dataset.name, badge.dataset.id);
            };
        });

    } catch (error) {
        container.innerHTML = `
            <div class="empty-state">
                <p>Error loading shows</p>
            </div>
        `;
    }
}

export async function trackShow(showName, profileId) {
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

export async function handleAddShowDetailsSubmit(e) {
    e.preventDefault();

    const data = {
        show_name: document.getElementById('add-show-name').value,
        profile_id: document.getElementById('add-show-profile-id').value,
        season_name: document.getElementById('add-show-season').value,
        max_age: document.getElementById('add-show-max-age').value
    };

    try {
        await api.trackShow(data);
        resetAddShowModal();
        showNotification('Show tracked successfully', 'success');
        document.querySelector('.nav-tab[data-tab="shows"]').click();
    } catch (error) {
        showNotification('Error tracking show', 'error');
    }
}

export async function loadTrackedShows() {
    const container = document.getElementById('tracked-list');
    container.innerHTML = '<div class="loading">Loading tracked shows...</div>';

    try {
        const tracked = await api.getTracked();

        let content = `
            <div class="add-show-card" id="add-show-card-btn">
                <span class="material-icons">add</span>
            </div>
        `;

        if (tracked.length === 0) {
            container.innerHTML = content + `
                <div class="empty-state">
                    <p>No tracked shows yet. Click + Add Show to get started!</p>
                </div>
            `;
            document.getElementById('add-show-card-btn').onclick = () => openAddShowModal();
            return;
        }

        content += tracked.map(show => `
            <div class="show-card" 
                 data-show='${JSON.stringify(show)}'
                 id="show-card-${show.id}">
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
        
        // Add event listeners
        document.getElementById('add-show-card-btn').onclick = () => openAddShowModal();
        container.querySelectorAll('.show-card').forEach(card => {
            const show = JSON.parse(card.dataset.show);
            card.onclick = () => openEditShowModal(show);
            
            // Drag and drop handlers
            card.ondragover = (e) => { e.preventDefault(); card.classList.add('drag-over'); };
            card.ondragleave = () => card.classList.remove('drag-over');
            card.ondrop = (e) => handleShowDrop(e, show.id);
        });

    } catch (error) {
        container.innerHTML = `
            <div class="empty-state">
                <p>Error loading tracked shows</p>
            </div>
        `;
    }
}

export function openEditShowModal(show) {
    document.getElementById('edit-show-id').value = show.id;
    document.getElementById('edit-show-name').value = show.show_name;
    document.getElementById('edit-show-season').value = show.season_name || '';
    document.getElementById('edit-show-max-age').value = show.max_age || '';

    document.getElementById('untrack-show-btn').onclick = () => {
        untrackShow(show.id);
        closeModal('edit-show-modal');
    };
    
    openModal('edit-show-modal');
}

export async function handleEditShowSubmit(e) {
    e.preventDefault();

    const showId = document.getElementById('edit-show-id').value;
    const data = {
        show_name: document.getElementById('edit-show-name').value,
        season_name: document.getElementById('edit-show-season').value,
        max_age: document.getElementById('edit-show-max-age').value
    };

    try {
        await api.updateTracked(showId, data);
        closeModal('edit-show-modal');
        loadTrackedShows();
        showNotification('Show updated successfully', 'success');
    } catch (error) {
        showNotification('Error updating show', 'error');
    }
}

export async function untrackShow(id) {
    if (!confirm('Stop tracking this show?')) return;

    try {
        await api.untrackShow(id);
        loadTrackedShows();
        showNotification('Show untracked', 'success');
    } catch (error) {
        showNotification('Error untracking show', 'error');
    }
}

export async function handleShowDrop(e, showId) {
    e.preventDefault();
    e.stopPropagation();
    const card = document.getElementById(`show-card-${showId}`);
    if (card) card.classList.remove('drag-over');

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
            await api.uploadArt(showId, formData);
            showNotification('Artwork updated', 'success');
            loadTrackedShows();
        } catch (error) {
            showNotification('Error updating artwork', 'error');
        }
    }
}
