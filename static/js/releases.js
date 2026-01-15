import { api } from './api.js';
import { formatDate, escapeHtml } from './ui.js';

let downloadDirectory = null;

async function getDownloadDirectory() {
    if (downloadDirectory) return downloadDirectory;
    
    try {
        const settings = await api.getSettings();
        downloadDirectory = settings.download_directory || '';
        return downloadDirectory;
    } catch (error) {
        console.error('Failed to get download directory:', error);
        return '';
    }
}

// Global function for qutebrowser compatibility
window.openMPV = async function(filename, showName, seasonName) {
    if (!filename) {
        console.error('No filename provided for MPV');
        return false;
    }
    
    try {
        const downloadDir = await getDownloadDirectory();
        
        // Build full path: download_directory/show_name/season/filename
        let fullPath = downloadDir;
        if (showName) {
            fullPath += '/' + showName;
            if (seasonName) {
                fullPath += '/' + seasonName;
            }
        }
        fullPath += '/' + filename;
        
        // Create mpv:// URL and open it
        const mpvUrl = `mpv://localhost/${encodeURIComponent(fullPath)}`;
        
        // Try to open the URL using a link element
        const link = document.createElement('a');
        link.href = mpvUrl;
        link.target = '_self';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        return true;
    } catch (error) {
        console.error('Failed to open MPV:', error);
        return false;
    }
};

// Helper function to truncate show name with ellipsis
function truncateShowName(showName, maxLength = 20) {
    return showName.length > maxLength ? showName.substring(0, maxLength) + '...' : showName;
}

// Export all functions needed by main.js
export const API_BASE = '/api';

export async function loadReleases() {
    const container = document.getElementById('releases-list');
    container.innerHTML = '<div class="loading">Loading releases...</div>';

    try {

        const releases = await api.getReleases();

        if (releases.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <p>No releases found. Downloads will appear here once available.</p>
                </div>
            `;
            return;
        }

        const releasesHtml = releases.map((release, index) => {

            // Build release card in the same style as upcoming cards but wider
            try {
                // Build card structure like upcoming-card
                let releaseHtml = '<div class="upcoming-card">';
                
                // Artwork on the left
                releaseHtml += '<div class="upcoming-card-image">';
                if (release.image_path) {
                    releaseHtml += `<img src="${release.image_path}" alt="${escapeHtml(release.show_name || release.torrent_name)}" style="width: 100%; height: 100%; object-fit: cover;">`;
                } else {
                    // Use show name or first 2 letters of torrent name
                    const displayName = release.show_name || release.torrent_name;
                    const initials = displayName.substring(0, 2).toUpperCase();
                    releaseHtml += `<div style="width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; background: var(--nord1); color: var(--nord4); font-weight: bold;">
                        ${initials}
                    </div>`;
                }
                releaseHtml += '</div>';
                
                // Info in the middle
                releaseHtml += '<div class="upcoming-card-info">';
                releaseHtml += '<div class="upcoming-card-title">' + escapeHtml(release.show_name || release.torrent_name) + '</div>';
                
                // Use extracted episode if available, fallback to database episode_number
                const episodeNum = release.extracted_episode || release.episode_number;
                if (episodeNum) {
                    releaseHtml += '<div class="upcoming-card-date">Episode ' + episodeNum + '</div>';
                }
                
                releaseHtml += '<div class="upcoming-card-date">' + formatDate(release.added_at) + '</div>';
                if (release.subgroup) {
                    releaseHtml += '<div style="font-size: 0.9em; color: var(--nord4); margin-top: 4px;">' + escapeHtml(release.subgroup) + '</div>';
                }
                releaseHtml += '</div>';
                
                // Play button on the right
                releaseHtml += '<button class="release-launch-btn" onclick="openMPV(\'' + escapeHtml(release.likely_filename) + '\', \'' + escapeHtml(release.show_name || '') + '\', \'' + escapeHtml(release.season_name || '') + '\')" title="Open in MPV" style="margin-left: auto; padding: 8px; background: var(--nord8); border: none; border-radius: 4px; cursor: pointer; display: flex; align-items: center; justify-content: center;"><span class="material-icons">play_arrow</span></button>';
                
                releaseHtml += '</div>';
                

                return releaseHtml;
            } catch (templateError) {
                console.error('Template generation error:', templateError);
                throw templateError;
            }
        });

        container.innerHTML = releasesHtml.join('');

    } catch (error) {
        container.innerHTML = `
            <div class="empty-state">
                <p>Error loading releases</p>
            </div>
        `;
    }
}