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
        
        // Load replacement settings
        const replacementSettings = await api.getReplacementSettings();
        document.getElementById('auto-replace-v2').checked = replacementSettings.auto_replace_v2 !== false;
        
        // Load notification settings
        const notificationSettings = await api.getNotificationSettings();
        document.getElementById('notifications-enabled').checked = notificationSettings.notifications_enabled === true;
    } catch (error) {
        console.error('Error loading settings:', error);
    }
}

export async function handleGeneralSettingsSubmit(e) {
    e.preventDefault();
    const data = {
        download_directory: document.getElementById('download-directory').value
    };
    
    // Save replacement settings separately
    const replacementData = {
        auto_replace_v2: document.getElementById('auto-replace-v2').checked
    };
    
    // Save notification settings
    const notificationData = {
        notifications_enabled: document.getElementById('notifications-enabled').checked
    };
    
    try {
        await Promise.all([
            api.saveSettings(data),
            api.saveReplacementSettings(replacementData),
            api.saveNotificationSettings(notificationData)
        ]);
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

let pathTimeout;
let selectedIndex = -1;
let currentSuggestions = [];

export async function handlePathInput(e) {
    const input = e.target;
    const path = input.value;
    const dropdown = input.nextElementSibling;
    
    clearTimeout(pathTimeout);
    selectedIndex = -1;
    
    if (!path) {
        dropdown.innerHTML = '';
        dropdown.style.display = 'none';
        currentSuggestions = [];
        return;
    }

    pathTimeout = setTimeout(async () => {
        try {
            currentSuggestions = await api.getPathSuggestions(path);
            
            if (currentSuggestions.length > 0) {
                dropdown.innerHTML = currentSuggestions.map((s, i) => `
                    <div class="path-suggestion-item" data-value="${s}" data-index="${i}">${s}</div>
                `).join('');
                dropdown.style.display = 'block';
                
                // Add click handlers
                dropdown.querySelectorAll('.path-suggestion-item').forEach(item => {
                    item.onclick = () => {
                        input.value = item.dataset.value;
                        dropdown.style.display = 'none';
                        input.dispatchEvent(new Event('input'));
                    };
                });
            } else {
                dropdown.style.display = 'none';
                currentSuggestions = [];
            }
        } catch (error) {
            console.error('Error fetching path suggestions:', error);
        }
    }, 200);
}

function getLongestCommonPrefix(strings) {
    if (!strings || strings.length === 0) return '';
    let prefix = strings[0];
    for (let i = 1; i < strings.length; i++) {
        while (strings[i].indexOf(prefix) !== 0) {
            prefix = prefix.substring(0, prefix.length - 1);
            if (prefix === "") return "";
        }
    }
    return prefix;
}

export function handlePathKeydown(e) {
    const input = e.target;
    const dropdown = input.nextElementSibling;
    const items = dropdown.querySelectorAll('.path-suggestion-item');

    if (dropdown.style.display !== 'block') return;

    if (e.key === 'Tab') {
        e.preventDefault();
        if (selectedIndex >= 0 && items[selectedIndex]) {
            input.value = items[selectedIndex].dataset.value;
        } else if (currentSuggestions.length > 0) {
            const lcp = getLongestCommonPrefix(currentSuggestions);
            if (lcp.length > input.value.length) {
                input.value = lcp;
            } else if (currentSuggestions.length === 1) {
                input.value = currentSuggestions[0];
            } else {
                // If we can't complete further with LCP, maybe just pick the first?
                // User said "complete to next divergence", which is LCP.
                // If input matches LCP, Tab should probably cycle or pick first.
                // Let's stick to user request: LCP if nothing selected.
            }
        }
        dropdown.style.display = 'none';
        input.dispatchEvent(new Event('input'));
    } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        selectedIndex = (selectedIndex + 1) % items.length;
        updateSelection(items);
    } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        selectedIndex = (selectedIndex - 1 + items.length) % items.length;
        updateSelection(items);
    } else if (e.key === 'Enter') {
        if (selectedIndex >= 0 && items[selectedIndex]) {
            e.preventDefault();
            input.value = items[selectedIndex].dataset.value;
            dropdown.style.display = 'none';
            input.dispatchEvent(new Event('input'));
        }
    } else if (e.key === 'Escape') {
        dropdown.style.display = 'none';
    }
}

function updateSelection(items) {
    items.forEach((item, i) => {
        if (i === selectedIndex) {
            item.classList.add('selected');
            item.scrollIntoView({ block: 'nearest' });
        } else {
            item.classList.remove('selected');
        }
    });
}

// Close dropdowns when clicking elsewhere
window.addEventListener('click', (e) => {
    if (!e.target.closest('.path-suggestions-wrapper')) {
        document.querySelectorAll('.path-suggestions-dropdown').forEach(d => {
            d.style.display = 'none';
        });
    }
});
