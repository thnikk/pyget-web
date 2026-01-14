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
    
    getSchedule: () => request('/schedule')
};
