import { loadSources, handleSourceSubmit } from './sources.js';
import { loadTrackedShows, loadShows, handleAddShowDetailsSubmit, handleEditShowSubmit, resetAddShowModal } from './shows.js';
import { loadSchedule } from './schedule.js';
import { loadSettings, handleGeneralSettingsSubmit, handleTransmissionSettingsSubmit, handleCleanupArtwork, checkSetup, handleSetupSubmit, handlePathInput, handlePathKeydown } from './settings.js';
import { closeModal } from './ui.js';

// Tab navigation
document.querySelectorAll('.nav-tab').forEach(button => {
    button.addEventListener('click', () => {
        const tabName = button.dataset.tab;

        // Update active tab button
        document.querySelectorAll('.nav-tab').forEach(btn => btn.classList.remove('active'));
        button.classList.add('active');

        // Update active tab content
        document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
        document.getElementById(`${tabName}-tab`).classList.add('active');

        // Load data for the tab
        if (tabName === 'sources') loadSources();
        else if (tabName === 'shows') loadTrackedShows();
        else if (tabName === 'schedule') loadSchedule();
    });
});

// Settings tabs
document.querySelectorAll('.settings-tab').forEach(button => {
    button.addEventListener('click', () => {
        const tabName = button.dataset.tab;
        document.querySelectorAll('.settings-tab').forEach(btn => btn.classList.remove('active'));
        button.classList.add('active');
        document.querySelectorAll('.settings-tab-content').forEach(content => content.classList.remove('active'));
        document.getElementById(`${tabName}-settings-tab`).classList.add('active');
    });
});

// Global Event Listeners
document.getElementById('settings-btn').onclick = () => {
    document.getElementById('settings-modal').classList.add('visible');
    loadSettings();
};

document.getElementById('general-settings-form').onsubmit = handleGeneralSettingsSubmit;
document.getElementById('transmission-form').onsubmit = handleTransmissionSettingsSubmit;
document.getElementById('cleanup-artwork-btn').onclick = handleCleanupArtwork;
document.getElementById('source-form').onsubmit = handleSourceSubmit;
document.getElementById('add-show-details-form').onsubmit = handleAddShowDetailsSubmit;
document.getElementById('edit-show-form').onsubmit = handleEditShowSubmit;
document.getElementById('setup-form').onsubmit = handleSetupSubmit;

// Path autocompletion
document.getElementById('download-directory').oninput = handlePathInput;
document.getElementById('download-directory').onkeydown = handlePathKeydown;
document.getElementById('setup-download-directory').oninput = handlePathInput;
document.getElementById('setup-download-directory').onkeydown = handlePathKeydown;

document.querySelector('.close-settings').onclick = () => closeModal('settings-modal');
document.querySelector('.close-add').onclick = resetAddShowModal;
document.querySelector('.close-edit').onclick = () => closeModal('source-modal');
document.querySelector('.close-edit-show').onclick = () => closeModal('edit-show-modal');

document.getElementById('add-show-back-btn').onclick = () => {
    document.getElementById('add-show-page-2').style.display = 'none';
    document.getElementById('add-show-page-1').style.display = 'block';
};

// Search functionality
let searchTimeout;
document.getElementById('show-search').oninput = (e) => {
    const clearBtn = document.getElementById('clear-search-btn');
    clearBtn.style.display = e.target.value ? 'block' : 'none';

    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
        loadShows(e.target.value);
    }, 300);
};

document.getElementById('clear-search-btn').onclick = () => {
    const input = document.getElementById('show-search');
    input.value = '';
    document.getElementById('clear-search-btn').style.display = 'none';
    loadShows('');
};

// Modal close on outside click
window.addEventListener('click', (e) => {
    if (e.target.id === 'add-show-modal') resetAddShowModal();
    else if (e.target.id === 'settings-modal') closeModal('settings-modal');
    else if (e.target.id === 'source-modal') closeModal('source-modal');
    else if (e.target.id === 'edit-show-modal') closeModal('edit-show-modal');
});

// Initial load
checkSetup();
