import { api } from './api.js';
import { formatDate, escapeHtml } from './ui.js';

export async function loadSchedule() {
    const grid = document.getElementById('calendar-grid');
    const upcomingContainer = document.getElementById('upcoming-list');
    const monthYearDisplay = document.getElementById('calendar-month-year');
    
    grid.innerHTML = '<div class="loading">Loading calendar...</div>';
    upcomingContainer.innerHTML = '';

    try {
        const data = await api.getSchedule();

        const now = new Date();
        const currentMonth = now.getMonth();
        const currentYear = now.getFullYear();
        
        monthYearDisplay.textContent = now.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

        // Get first day of month and total days
        const firstDay = new Date(currentYear, currentMonth, 1).getDay();
        const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();

        // Calendar Headers
        const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        let html = days.map(d => `<div class="calendar-header-day">${d}</div>`).join('');

        // Empty days before month starts
        for (let i = 0; i < firstDay; i++) {
            html += '<div class="calendar-day empty"></div>';
        }

        // Days of the month
        for (let d = 1; d <= daysInMonth; d++) {
            const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
            const isToday = d === now.getDate() && currentMonth === now.getMonth() && currentYear === now.getFullYear();
            
            let eventsHtml = '';
            
            data.forEach(show => {
                // Check history for releases on this day
                show.history.forEach(rel => {
                    if (rel.release_date.startsWith(dateStr)) {
                        eventsHtml += `
                            <div class="calendar-event downloaded" style="border-left-color: ${show.color || 'var(--nord8)'}" title="${rel.torrent_name}">
                                ${show.show_name} ${rel.episode ? ` - ${rel.episode}` : ''}
                            </div>
                        `;
                    }
                });

                // Check predicted future releases
                if (show.predictions) {
                    show.predictions.forEach(pred => {
                        if (pred.date.startsWith(dateStr)) {
                            eventsHtml += `
                                <div class="calendar-event predicted" style="border-left-color: ${show.color || 'var(--nord8)'}" title="Predicted: ${show.show_name} - ${pred.episode}">
                                    ${show.show_name} - ${pred.episode} (est)
                                </div>
                            `;
                        }
                    });
                }
            });

            html += `
                <div class="calendar-day ${isToday ? 'today' : ''}">
                    <div class="calendar-day-number">${d}</div>
                    ${eventsHtml}
                </div>
            `;
        }

        grid.innerHTML = html;

        // Populate Upcoming List (next predicted episode for each show)
        let nextEpisodes = [];
        data.forEach(show => {
            if (show.predictions && show.predictions.length > 0) {
                const nextPred = show.predictions[0];
                nextEpisodes.push({
                    ...show,
                    next_episode: nextPred.episode,
                    next_release: nextPred.date
                });
            }
        });

        nextEpisodes.sort((a, b) => new Date(a.next_release + 'Z') - new Date(b.next_release + 'Z'));

        if (nextEpisodes.length === 0) {
            upcomingContainer.innerHTML = '<div class="empty-state">No upcoming releases predicted yet.</div>';
        } else {
            upcomingContainer.innerHTML = nextEpisodes.map(item => {
                const nextDate = new Date(item.next_release + 'Z');
                const isOverdue = nextDate < new Date();
                
                return `
                    <div class="upcoming-card">
                        <div class="upcoming-card-image">
                            ${item.image_path ? 
                                `<img src="${item.image_path}" alt="${escapeHtml(item.show_name)}" style="width: 100%; height: 100%; object-fit: cover;">` :
                                `<div style="width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; background: var(--nord1); color: var(--nord4); font-weight: bold;">
                                    ${item.show_name.substring(0, 2).toUpperCase()}
                                </div>`
                            }
                        </div>
                        <div class="upcoming-card-info">
                            <div class="upcoming-card-title">${item.show_name} ${item.next_episode ? ` - ${item.next_episode}` : ''}</div>
                            <div class="upcoming-card-date ${isOverdue ? 'overdue' : ''}">
                                ${formatDate(item.next_release)} ${isOverdue ? '(Expected)' : ''}
                            </div>
                        </div>
                    </div>
                `;
            }).join('');
        }

    } catch (error) {
        console.error('Error loading schedule:', error);
        grid.innerHTML = '<div class="empty-state">Error loading calendar data</div>';
    }
}
