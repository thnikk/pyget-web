let toastCounter = 0;

export function showNotification(message, type = 'info', duration = 5000) {
    const toast = createToast(message, type, duration);
    const container = getToastContainer();
    
    container.appendChild(toast);
    
    // Trigger animation
    requestAnimationFrame(() => {
        toast.classList.add('show');
    });
    
    // Auto remove after duration
    if (duration > 0) {
        startToastProgress(toast, duration);
        setTimeout(() => {
            removeToast(toast);
        }, duration);
    }
    
    return toast;
}

function createToast(message, type, duration) {
    const toast = document.createElement('div');
    const toastId = `toast-${++toastCounter}`;
    toast.id = toastId;
    toast.className = `toast ${type}`;
    
    const icon = getIconForType(type);
    
    toast.innerHTML = `
        <div class="toast-icon">
            <i class="fa-solid ${icon}"></i>
        </div>
        <div class="toast-message">${escapeHtml(message)}</div>
        ${duration > 0 ? '<div class="toast-progress"></div>' : ''}
        <button class="toast-close" onclick="removeToast(document.getElementById('${toastId}'))">
            <i class="fa-solid fa-xmark"></i>
        </button>
    `;
    
    return toast;
}

function getIconForType(type) {
    const icons = {
        success: 'fa-circle-check',
        error: 'fa-circle-xmark',
        warning: 'fa-triangle-exclamation',
        info: 'fa-circle-info'
    };
    return icons[type] || 'fa-circle-info';
}

function getToastContainer() {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        container.className = 'toast-container';
        document.body.appendChild(container);
    }
    return container;
}

function startToastProgress(toast, duration) {
    const progressBar = toast.querySelector('.toast-progress');
    if (!progressBar) return;
    
    progressBar.style.width = '100%';
    progressBar.style.transition = `width ${duration}ms linear`;
    
    requestAnimationFrame(() => {
        progressBar.style.width = '0%';
    });
}

export function removeToast(toast) {
    if (!toast) return;
    
    toast.classList.add('hide');
    
    setTimeout(() => {
        if (toast.parentNode) {
            toast.parentNode.removeChild(toast);
        }
    }, 300);
}

export function clearAllToasts() {
    const container = getToastContainer();
    const toasts = container.querySelectorAll('.toast');
    
    toasts.forEach(toast => {
        removeToast(toast);
    });
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

export function contrastColor(hex) {
    // Returns '#ffffff' or '#000000' based on the luminance of a hex color,
    // maximizing text contrast on the given background.
    let h = (hex || '').trim();
    if (!/^#?[0-9a-f]{3}$/i.test(h) && !/^#?[0-9a-f]{6}$/i.test(h)) {
        h = '#88c0d0';
    }
    h = h.replace('#', '');
    if (h.length === 3) {
        h = h.split('').map(c => c + c).join('');
    }
    const r = parseInt(h.slice(0, 2), 16) / 255;
    const g = parseInt(h.slice(2, 4), 16) / 255;
    const b = parseInt(h.slice(4, 6), 16) / 255;
    const lin = c => c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    const lum = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
    return lum > 0.179 ? '#000000' : '#ffffff';
}

export function openModal(id) {
    document.getElementById(id).classList.add('visible');
}

export function closeModal(id) {
    document.getElementById(id).classList.remove('visible');
}
