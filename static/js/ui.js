export function showNotification(message, type) {
    console.log(`[${type.toUpperCase()}] ${message}`);
    // Future: implement toast notifications
}

export function escapeHtml(text) {
    if (!text) return '';
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, m => map[m]);
}

export function formatDate(dateStr) {
    const date = new Date(dateStr + 'Z');
    return date.toLocaleDateString(undefined, { 
        weekday: 'long', 
        month: 'short', 
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

export function openModal(id) {
    document.getElementById(id).classList.add('visible');
}

export function closeModal(id) {
    document.getElementById(id).classList.remove('visible');
}
