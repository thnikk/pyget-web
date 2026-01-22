import { API_BASE } from './config.js';

async function request(path, options = {}) {
    const response = await fetch(`${API_BASE}${path}`, options);
    if (!response.ok) {
        let errorMsg = 'Server error';
        try {
            const err = await response.json();
            errorMsg = err.error || errorMsg;
        } catch (e) {}
        throw new Error(errorMsg);
    }
    return response.json();
}

export const api = {
    getSettings: () => request('/settings'),
    saveSettings: (data) => request('/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    }),
    cleanupArtwork: () => request('/settings/artwork/cleanup', { method: 'POST' }),
    
    getReplacementSettings: () => request('/settings/replacements'),
    saveReplacementSettings: (data) => request('/settings/replacements', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    }),
    getReplacementHistory: () => request('/replacements/history'),
    getPendingReplacements: () => request('/replacements/pending'),
    
    getProfiles: () => request('/profiles'),
    createProfile: (data) => request('/profiles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    }),
    updateProfile: (id, data) => request(`/profiles/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    }),
    deleteProfile: (id) => request(`/profiles/${id}`, { method: 'DELETE' }),
    
    getShows: (query = '') => {
        let url = '/shows';
        if (query) url += `?q=${encodeURIComponent(query)}`;
        return request(url);
    },
    
    getTracked: () => request('/tracked'),
    trackShow: (data) => request('/tracked', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    }),
    updateTracked: (id, data) => request(`/tracked/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    }),
    untrackShow: (id) => request(`/tracked/${id}`, { method: 'DELETE' }),
    uploadArt: (id, formData) => request(`/tracked/${id}/art`, {
        method: 'POST',
        body: formData
    }),
    uploadArtFromUrl: (id, url) => request(`/tracked/${id}/art/url`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url })
    }),
    
    getSchedule: () => request('/schedule'),
    
    getPathSuggestions: (path) => request(`/utils/path-suggestions?path=${encodeURIComponent(path)}`),
    
    // Notification methods
    getNotificationSettings: () => request('/notifications/settings'),
    saveNotificationSettings: (data) => request('/notifications/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    }),
    getNotificationLogs: (limit = 100, offset = 0) => {
        let url = `/notifications/logs?limit=${limit}`;
        if (offset > 0) url += `&offset=${offset}`;
        return request(url);
    },
    clearNotificationLogs: () => request('/notifications/logs/clear', { method: 'POST' }),
    testNotification: () => request('/notifications/test', { method: 'POST' }),
    
    // Generic methods
    get: (path) => request(path),
    post: (path, data) => request(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    }),
    put: (path, data) => request(path, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    })
};
