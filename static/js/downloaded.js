import { api } from './api.js';
import { showNotification, escapeHtml } from './ui.js';

let downloadDirectory = '';

async function getDownloadDirectory() {
    if (!downloadDirectory) {
        try {
            const settings = await api.getSettings();
            downloadDirectory = settings.download_directory || '/downloads';
        } catch (error) {
            console.error('Error getting download directory:', error);
            downloadDirectory = '/downloads';
        }
    }
    return downloadDirectory;
}

function constructMpvUri(showName, seasonName, fileName) {
    const baseDir = downloadDirectory || '/downloads';
    const season = seasonName || 'Season 01';
    const path = `${baseDir}/${showName}/${season}/${fileName}`;
    return `mpv://localhost/${encodeURIComponent(path)}`;
}

function extractFileName(torrentName) {
    // Just return the torrent name as-is since it's already the correct filename
    return torrentName;
}

window.openEpisode = async function(showName, seasonName, torrentName) {
    await getDownloadDirectory();
    const fileName = extractFileName(torrentName);
    const mpvUri = constructMpvUri(showName, seasonName, fileName);
    
    // Try to open the URI
    try {
        window.location.href = mpvUri;
        showNotification('Opening episode in MPV...', 'info');
    } catch (error) {
        console.error('Error opening MPV URI:', error);
        showNotification('Failed to open MPV URI', 'error');
    }
};

export async function loadDownloaded() {
    const container = document.getElementById('downloaded-list');
    container.innerHTML = '<div class="loading">Loading downloaded episodes...</div>';
    
    // Ensure we have the download directory
    await getDownloadDirectory();

    try {
        const response = await api.getDownloaded();
        const downloaded = response.downloaded || [];

        if (downloaded.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <p>No downloaded episodes yet. Episodes will appear here once downloaded.</p>
                </div>
            `;
            return;
        }

        // Group episodes by show
        const shows = {};
        downloaded.forEach(episode => {
            if (!shows[episode.tracked_show_id]) {
                shows[episode.tracked_show_id] = {
                    id: episode.tracked_show_id,
                    show_name: episode.show_name,
                    season_name: episode.season_name,
                    image_path: episode.image_path,
                    profile_color: episode.profile_color,
                    profile_name: episode.profile_name,
                    episodes: []
                };
            }
            shows[episode.tracked_show_id].episodes.push(episode);
        });

        // Sort episodes within each show by published_at/added_at (newest first)
        Object.values(shows).forEach(show => {
            show.episodes.sort((a, b) => {
                const dateA = new Date(a.published_at || a.added_at);
                const dateB = new Date(b.published_at || b.added_at);
                return dateB - dateA;
            });
        });

        // Sort shows by most recent episode
        const sortedShows = Object.values(shows).sort((a, b) => {
            const latestA = new Date(a.episodes[0]?.published_at || a.episodes[0]?.added_at);
            const latestB = new Date(b.episodes[0]?.published_at || b.episodes[0]?.added_at);
            return latestB - latestA;
        });

        const content = sortedShows.map(show => `
            <div class="downloaded-show-card" id="downloaded-show-${show.id}">
                <div class="downloaded-show-header">
                    <div class="downloaded-show-image">
                        ${show.image_path ? 
                            `<img src="${show.image_path}" alt="${escapeHtml(show.show_name)}" style="width: 100%; height: 100%; object-fit: cover;">` :
                            show.show_name.substring(0, 2).toUpperCase()
                        }
                    </div>
                    <div class="downloaded-show-info">
                        <h3 class="downloaded-show-title">${escapeHtml(show.show_name)}</h3>
                        <div class="downloaded-show-meta">
                            <div class="downloaded-show-badge" style="background-color: ${show.profile_color || '#88c0d0'}">
                                ${show.profile_name}
                            </div>
                            <div class="downloaded-show-count">${show.episodes.length} episode${show.episodes.length !== 1 ? 's' : ''}</div>
                        </div>
                    </div>
                </div>
                <div class="downloaded-episodes-list">
                    ${show.episodes.map(episode => `
                        <div class="downloaded-episode-card ${episode.is_deleted ? 'deleted' : ''} ${episode.replaced_by ? 'replaced' : ''}" 
                             id="episode-${episode.id}">
                            <div class="downloaded-episode-info">
                                <div class="downloaded-episode-title">
                                    ${episode.episode_number ? `Episode ${episode.episode_number}` : escapeHtml(episode.torrent_name)}
                                </div>
                                <div class="downloaded-episode-meta">
                                    ${episode.version && episode.version > 1 ? `<span class="episode-version">v${episode.version}</span>` : ''}
                                    ${episode.subgroup ? `<span class="episode-subgroup">${escapeHtml(episode.subgroup)}</span>` : ''}
                                </div>
                                <div class="downloaded-episode-date">
                                    ${formatDate(episode.published_at || episode.added_at)}
                                </div>
                            </div>
                            <div class="downloaded-episode-actions">
                                <div class="downloaded-episode-status">
                                    ${episode.replaced_by ? 
                                        `<span class="status-badge replaced" title="Replaced by newer version">Replaced</span>` : 
                                        episode.is_deleted ? 
                                        `<span class="status-badge deleted" title="Deleted from disk">Deleted</span>` :
                                        `<span class="status-badge active" title="Currently downloaded">Active</span>`
                                    }
                                </div>
                                <button class="play-button" 
                                        onclick="openEpisode('${escapeHtml(show.show_name)}', '${escapeHtml(show.season_name || '')}', '${escapeHtml(episode.torrent_name)}')"
                                        title="Play in MPV">
                                    <span class="material-icons">play_arrow</span>
                                </button>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `).join('');

        container.innerHTML = content;

    } catch (error) {
        console.error('Error loading downloaded episodes:', error);
        container.innerHTML = `
            <div class="error-state">
                <p>Error loading downloaded episodes. Please try again.</p>
            </div>
        `;
        showNotification('Error loading downloaded episodes', 'error');
    }
}

function formatDate(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const diffTime = Math.abs(now - date);
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) {
        const diffHours = Math.floor(diffTime / (1000 * 60 * 60));
        if (diffHours === 0) {
            const diffMinutes = Math.floor(diffTime / (1000 * 60));
            return diffMinutes <= 1 ? 'Just now' : `${diffMinutes} minutes ago`;
        }
        return diffHours === 1 ? '1 hour ago' : `${diffHours} hours ago`;
    } else if (diffDays === 1) {
        return 'Yesterday';
    } else if (diffDays < 7) {
        return `${diffDays} days ago`;
    } else {
        return date.toLocaleDateString('en-US', { 
            year: 'numeric', 
            month: 'short', 
            day: 'numeric' 
        });
    }
}