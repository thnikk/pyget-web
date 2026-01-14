import { api } from './api.js';
import { loadTrackedShows } from './shows.js';
import { openModal, closeModal, showNotification } from './ui.js';

export async function loadSettings() {
    try {
        const settings = await api.getSettings();

        document.getElementById('download-directory').value = settings.download_directory || '';
        document.getElementById('transmission-host').value =
            settings.transmission_host || 'localhost';
        document.getElementById('transmission-port').value =
            settings.transmission_port || '9091';
    } catch (error) {
        console.error('Error loading settings:', error);
    }
}

export async function handleGeneralSettingsSubmit(e) {
    e.preventDefault();
    const data = {
        download_directory: document.getElementById('download-directory').value
    };
    try {
        await api.saveSettings(data);
        showNotification('Settings saved', 'success');
        closeModal('settings-modal');
    } catch (error) {
        showNotification('Error saving settings', 'error');
    }
}

export async function handleTransmissionSettingsSubmit(e) {
    e.preventDefault();

    const data = {
        transmission_host: document.getElementById('transmission-host').value,
        transmission_port: document.getElementById('transmission-port').value
    };

    try {
        await api.saveSettings(data);
        showNotification('Transmission settings saved', 'success');
        closeModal('settings-modal');
    } catch (error) {
        showNotification('Error saving settings', 'error');
    }
}

export async function handleCleanupArtwork() {
    if (!confirm('Are you sure you want to delete all artwork files that are not associated with any tracked show?')) {
        return;
    }

    try {
        const result = await api.cleanupArtwork();
        showNotification(`Cleanup complete. Deleted ${result.count} image(s).`, 'success');
    } catch (error) {
        showNotification(`Error: ${error.message}`, 'error');
    }
}

export async function checkSetup() {
    try {
        const settings = await api.getSettings();
        
        if (settings.setup_complete !== '1') {
            openModal('setup-modal');
        } else {
            loadTrackedShows();
        }
    } catch (error) {
        console.error('Error checking setup:', error);
        loadTrackedShows();
    }
}

export async function handleSetupSubmit(e) {
    e.preventDefault();
    
    const data = {
        download_directory: document.getElementById('setup-download-directory').value,
        transmission_host: document.getElementById('setup-transmission-host').value,
        transmission_port: document.getElementById('setup-transmission-port').value,
        setup_complete: '1'
    };
    
    try {
        await api.saveSettings(data);
        closeModal('setup-modal');
        showNotification('Setup complete!', 'success');
        loadTrackedShows();
    } catch (error) {
        showNotification('Error saving setup settings', 'error');
    }
}
