import { api } from './api.js';
import { openModal, closeModal, showNotification } from './ui.js';

export async function loadSources() {
    const container = document.getElementById('sources-list');
    container.innerHTML = '<div class="loading">Loading sources...</div>';

    try {
        const sources = await api.getProfiles();

        let content = `
            <div class="add-source-card" id="add-source-card-btn">
                <span class="material-icons">add</span>
            </div>
        `;

        content += sources.map(source => `
            <div class="source-card" data-source='${JSON.stringify(source)}'>
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
                <div class="source-card-meta">
                    Check Interval: ${source.interval || 30} minutes
                </div>
            </div>
        `).join('');
        container.innerHTML = content;
        
        // Add event listeners
        document.getElementById('add-source-card-btn').onclick = () => openSourceModal();
        container.querySelectorAll('.source-card').forEach(card => {
            card.onclick = () => openSourceModal(JSON.parse(card.dataset.source));
        });

    } catch (error) {
        container.innerHTML = `
            <div class="empty-state">
                <p>Error loading sources</p>
            </div>
        `;
    }
}

export function openSourceModal(source = null) {
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
        document.getElementById('source-interval').value = source.interval || 30;
        deleteBtn.style.display = 'block';
        deleteBtn.onclick = () => {
            deleteSource(source.id);
            closeModal('source-modal');
        };
    } else {
        modalTitle.textContent = 'Add Source';
        document.getElementById('source-form').reset();
        document.getElementById('source-color').value = '#88c0d0';
        document.getElementById('source-interval').value = 30;
        deleteBtn.style.display = 'none';
    }

    openModal('source-modal');
}

export async function deleteSource(id) {
    if (!confirm('Delete this source?')) return;

    try {
        await api.deleteProfile(id);
        loadSources();
        showNotification('Source deleted', 'success');
    } catch (error) {
        showNotification('Error deleting source', 'error');
    }
}

export async function handleSourceSubmit(e) {
    e.preventDefault();

    const sourceId = document.getElementById('source-id').value;
    const isEdit = !!sourceId;

    const data = {
        name: document.getElementById('source-name').value,
        base_url: document.getElementById('base-url').value,
        uploader: document.getElementById('uploader').value || null,
        quality: document.getElementById('quality').value || null,
        color: document.getElementById('source-color').value,
        interval: parseInt(document.getElementById('source-interval').value) || 30,
    };

    try {
        if (isEdit) {
            await api.updateProfile(sourceId, data);
        } else {
            await api.createProfile(data);
        }

        closeModal('source-modal');
        loadSources();
        showNotification(`Source ${isEdit ? 'updated' : 'added'} successfully`, 'success');
    } catch (error) {
        showNotification(`Error ${isEdit ? 'updating' : 'adding'} source`, 'error');
    }
}
