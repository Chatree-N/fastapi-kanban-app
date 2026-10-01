const API_BASE = '/api';
const STATE = {
    tasks: [],
    trash: [],
    view: 'dashboard',
    filterDate: null, // YYYY-MM-DD
    search: '',
    settings: {
        showWeek: true,
        compact: false,
        notif: true
    },
    deletedTaskBuffer: null
};

const viewDash = document.getElementById('view-dashboard');
const viewCal = document.getElementById('view-calendar');
const viewSet = document.getElementById('view-settings');
const toast = document.getElementById('toast');
const toastMsg = document.getElementById('toast-msg');
const toastUndo = document.getElementById('toast-undo');

const P = {
    HIGH: { label: 'High', class: 'bg-gradient-to-r from-accent to-light text-primary shadow-sm' },
    MEDIUM: { label: 'Medium', class: 'bg-light/25 text-primary' },
    LOW: { label: 'Low', class: 'bg-muted/15 text-muted' }
};
const STATUS = {
    BACKLOG: { label: 'Backlog', hex: '#C8AAAA', bg: 'rgba(200,170,170,0.5)' },
    TODO: { label: 'To Do', hex: '#FFDAB3', bg: 'rgba(255,218,179,0.5)' },
    IN_PROGRESS: { label: 'In Progress', hex: '#9F8383', bg: 'rgba(159,131,131,0.5)' },
    DONE: { label: 'Done', hex: '#574964', bg: 'rgba(87,73,100,0.5)' },
    CANCELED: { label: 'Canceled', hex: '#9F8383', bg: 'rgba(159,131,131,0.5)' }
};
const COLUMNS = ['BACKLOG', 'TODO', 'IN_PROGRESS', 'DONE'];

// Project Tints
const TINT_PAIRS = [
    { bg: 'rgba(255,218,179,0.3)', border: '#FFDAB3' },
    { bg: 'rgba(200,170,170,0.25)', border: '#C8AAAA' },
    { bg: 'rgba(159,131,131,0.2)', border: '#9F8383' },
    { bg: 'rgba(87,73,100,0.1)', border: '#574964' }
];

function getProjectTint(projectName) {
    const name = projectName || 'Inbox';
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    const index = Math.abs(hash) % TINT_PAIRS.length;
    return TINT_PAIRS[index];
}

let undoTimeout = null;
let errorTimeout = null;

function showToast(msg, isUndo = false) {
    toastMsg.textContent = msg;
    toast.classList.remove('pointer-events-none');
    toast.classList.add('toast-active');
    if (isUndo) {
        toast.classList.remove('bg-red-500');
        toast.classList.add('bg-gradient-to-r', 'from-primary', 'to-[#6B5878]');
        toastUndo.classList.remove('hidden');
    } else {
        toast.classList.add('bg-red-500');
        toast.classList.remove('bg-gradient-to-r', 'from-primary', 'to-[#6B5878]');
        toastUndo.classList.add('hidden');
    }
    clearTimeout(errorTimeout);
    errorTimeout = setTimeout(() => hideToast(), 4500);
}
function hideToast() {
    toast.classList.remove('toast-active');
    toast.classList.add('pointer-events-none');
}
toastUndo.onclick = async () => {
    hideToast();
    if(STATE.deletedTaskBuffer) {
        try {
            await api(`/tasks/${STATE.deletedTaskBuffer.id}/restore`, { method: 'POST' });
            STATE.deletedTaskBuffer = null;
            await fetchTasks();
        } catch(e) {}
    }
};

const ymd = (d) => {
    const dt = new Date(d);
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
};

async function api(path, opts = {}) {
    try {
        const res = await fetch(API_BASE + path, {
            ...opts,
            headers: { 'Content-Type': 'application/json', ...opts.headers }
        });
        if (!res.ok) throw new Error('API Error');
        return await res.json();
    } catch (e) {
        showToast('Something went wrong');
        throw e;
    }
}

async function init() {
    const saved = localStorage.getItem('kb-settings');
    if (saved) Object.assign(STATE.settings, JSON.parse(saved));
    updateSettingsUI();

    const d = new Date();
    const hr = d.getHours();
    document.getElementById('header-title').textContent = hr < 12 ? 'Good morning' : hr < 18 ? 'Good afternoon' : 'Good evening';
    document.getElementById('header-date').textContent = d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

    document.querySelectorAll('.nav-btn').forEach(b => {
        b.addEventListener('click', () => setView(b.dataset.view));
    });
    
    document.getElementById('search-input').addEventListener('input', e => {
        STATE.search = e.target.value.toLowerCase();
        renderDash();
    });

    document.getElementById('clear-filter').onclick = () => {
        STATE.filterDate = null;
        renderWeek();
        renderDash();
    };

    document.getElementById('bell-btn').onclick = (e) => {
        e.stopPropagation();
        document.getElementById('notif-dropdown').classList.toggle('hidden');
    };
    document.addEventListener('click', () => {
        document.getElementById('notif-dropdown').classList.add('hidden');
    });

    await fetchTasks();
    setInterval(fetchTasks, 60000); // 1 min poll
}

function setView(v) {
    STATE.view = v;
    document.querySelectorAll('.nav-btn').forEach(b => {
        if(b.dataset.view === v) {
            b.classList.remove('bg-transparent', 'text-muted', 'hover:bg-white/50');
            b.classList.add('bg-gradient-to-br', 'from-primary', 'to-[#6B5878]', 'text-white', 'shadow-soft');
        } else {
            b.classList.add('bg-transparent', 'text-muted', 'hover:bg-white/50');
            b.classList.remove('bg-gradient-to-br', 'from-primary', 'to-[#6B5878]', 'text-white', 'shadow-soft');
        }
    });
    [viewDash, viewCal, viewSet].forEach(el => el.classList.add('hidden'));
    if (v === 'dashboard') { viewDash.classList.remove('hidden'); renderDash(); }
    if (v === 'calendar') { viewCal.classList.remove('hidden'); renderCalendar(); }
    if (v === 'settings') { viewSet.classList.remove('hidden'); fetchTrash(); }
}

async function fetchTasks() {
    STATE.tasks = await api('/tasks');
    if (STATE.view === 'dashboard') renderDash();
    if (STATE.view === 'calendar') renderCalendar();
}

function renderDash() {
    renderStats();
    renderGroups();
    renderWeek();
    renderBoard();
}

function renderStats() {
    const cont = document.getElementById('stats-container');
    const active = STATE.tasks.filter(t => t.status !== 'CANCELED');
    const total = active.length;
    const done = active.filter(t => t.status === 'DONE').length;
    const pending = active.filter(t => t.status === 'TODO').length;
    const inprog = active.filter(t => t.status === 'IN_PROGRESS').length;
    const canceled = STATE.tasks.filter(t => t.status === 'CANCELED').length;

    const pct = total === 0 ? 0 : Math.round((done / total) * 100);
    const dashOff = 125.6 - (125.6 * pct / 100);

    const ringHTML = `
        <div class="col-span-2 bg-gradient-to-br from-[#574964] via-[#6B5878] to-[#9F8383] rounded-[32px] p-6 shadow-soft flex items-center justify-between text-white relative overflow-hidden">
            <div class="absolute -bottom-10 -right-10 w-40 h-40 bg-accent/20 rounded-full blur-2xl"></div>
            <div class="flex flex-col gap-2 relative z-10">
                <div class="text-[28px] font-extrabold tracking-tight leading-none">${done} of ${total}</div>
                <div class="text-[14px] font-medium text-white/80">tasks completed</div>
                <button onclick="document.getElementById('board-container').scrollIntoView({behavior: 'smooth'})" class="mt-2 w-max px-5 py-2 rounded-full bg-white/90 text-primary text-[13px] font-bold shadow-sm hover:bg-white transition-colors">View Tasks</button>
            </div>
            <div class="relative w-20 h-20 flex items-center justify-center flex-none drop-shadow-[0_4px_12px_rgba(255,218,179,0.3)]">
                <svg class="w-20 h-20 transform -rotate-90">
                    <defs>
                        <linearGradient id="ringGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                            <stop offset="0%" stop-color="#FFDAB3" />
                            <stop offset="100%" stop-color="#C8AAAA" />
                        </linearGradient>
                    </defs>
                    <circle cx="40" cy="40" r="20" stroke="rgba(255,255,255,0.15)" stroke-width="8" fill="none" />
                    <circle cx="40" cy="40" r="20" stroke="url(#ringGrad)" stroke-width="8" fill="none" stroke-dasharray="125.6" stroke-dashoffset="${dashOff}" stroke-linecap="round" class="transition-all duration-1000 ease-out" />
                </svg>
                <div class="absolute inset-0 flex flex-col items-center justify-center">
                    <span class="text-[15px] font-extrabold leading-none shadow-sm">${pct}%</span>
                </div>
            </div>
        </div>
    `;

    const makeCard = (label, count, grad, icon) => `
        <div class="rounded-[32px] p-5 shadow-soft flex flex-col gap-2 justify-center transition-all duration-200 hover:-translate-y-0.5 hover:shadow-card border border-white/60 backdrop-blur-md" style="background: ${grad}">
            <div class="w-8 h-8 rounded-full bg-white/50 flex items-center justify-center text-primary shadow-sm">${icon}</div>
            <div class="flex flex-col gap-0.5 mt-1">
                <div class="text-[28px] font-extrabold text-primary leading-none">${count}</div>
                <div class="text-[12px] font-bold uppercase tracking-wider text-primary/70">${label}</div>
            </div>
        </div>
    `;

    const doneIcon = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
    const pendingIcon = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>`;
    const inprogIcon = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>`;
    const cancelIcon = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;

    cont.innerHTML = ringHTML + 
        makeCard('Completed', done, 'linear-gradient(135deg, rgba(255,218,179,0.5), rgba(255,255,255,0.7))', doneIcon) + 
        makeCard('Pending', pending, 'linear-gradient(135deg, rgba(200,170,170,0.35), rgba(255,255,255,0.7))', pendingIcon) + 
        makeCard('Ongoing', inprog, 'linear-gradient(135deg, rgba(159,131,131,0.2), rgba(255,255,255,0.7))', inprogIcon) + 
        makeCard('Canceled', canceled, 'linear-gradient(135deg, rgba(87,73,100,0.08), rgba(255,255,255,0.7))', cancelIcon);
}

function renderGroups() {
    const cont = document.getElementById('groups-container');
    const active = STATE.tasks.filter(t => t.status !== 'CANCELED');
    if(active.length === 0) {
        document.getElementById('groups-container-wrapper').classList.add('hidden');
        return;
    }
    document.getElementById('groups-container-wrapper').classList.remove('hidden');

    const projs = {};
    active.forEach(t => {
        const p = t.project || 'Inbox';
        if(!projs[p]) projs[p] = { total: 0, done: 0 };
        projs[p].total++;
        if(t.status === 'DONE') projs[p].done++;
    });

    const sorted = Object.keys(projs).map(k => ({ name: k, ...projs[k] })).sort((a,b) => b.total - a.total).slice(0, 4);

    cont.innerHTML = sorted.map(g => {
        const p = g.total === 0 ? 0 : (g.done / g.total) * 100;
        return `
            <div class="flex flex-col gap-2">
                <div class="flex items-center justify-between">
                    <span class="text-[14px] font-bold text-primary truncate max-w-[120px]">${escapeHtml(g.name)}</span>
                    <span class="text-[12px] font-extrabold text-primary/70">${p.toFixed(0)}%</span>
                </div>
                <div class="h-2 w-full bg-primary/10 rounded-full overflow-hidden shadow-inner">
                    <div class="h-full bg-gradient-to-r from-accent to-light rounded-full transition-all duration-500" style="width: ${p}%"></div>
                </div>
            </div>
        `;
    }).join('');
}

function renderWeek() {
    const cont = document.getElementById('week-selector-container');
    const daysEl = document.getElementById('week-days');
    const clearBtn = document.getElementById('clear-filter');
    const filterLabel = document.getElementById('filter-label');
    const filterDot = document.getElementById('filter-dot');
    
    if(!STATE.settings.showWeek) {
        cont.classList.add('hidden');
        STATE.filterDate = null;
        return;
    }
    cont.classList.remove('hidden');

    if (STATE.filterDate !== null) {
        clearBtn.classList.remove('hidden');
        filterLabel.textContent = 'Filtered by date';
        filterDot.style.background = '#FFDAB3';
        filterDot.style.boxShadow = '0 0 12px rgba(255,218,179,0.8)';
    } else {
        clearBtn.classList.add('hidden');
        filterLabel.textContent = 'Showing all tasks';
        filterDot.style.background = '#574964';
        filterDot.style.boxShadow = '0 0 8px rgba(87,73,100,0.5)';
    }

    const today = new Date();
    let html = '';
    
    // -3 to +10 days
    for(let i = -3; i <= 10; i++) {
        const d = new Date(today);
        d.setDate(today.getDate() + i);
        const yStr = ymd(d);
        const isToday = i === 0;
        const isSelected = STATE.filterDate === yStr;
        const hasTask = STATE.tasks.some(t => t.due_date && ymd(t.due_date) === yStr && t.status !== 'CANCELED');
        
        let bgClass = 'glass text-muted hover:bg-white/80';
        if (isSelected) {
            bgClass = 'bg-gradient-to-br from-accent to-light text-primary shadow-glow scale-105 border-0';
        } else if (isToday) {
            bgClass = 'glass ring-2 ring-light text-primary';
        }
        
        const dd = d.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase();
        const num = d.getDate();
        
        html += `
            <div onclick="toggleDateFilter('${yStr}')" class="flex-none w-[64px] h-[76px] rounded-[24px] flex flex-col items-center justify-center gap-1 cursor-pointer transition-all duration-250 ${bgClass}">
                <span class="text-[11px] font-extrabold tracking-widest ${isSelected ? '' : 'opacity-70'}">${dd}</span>
                <span class="text-[20px] font-extrabold leading-none ${isSelected || isToday ? 'text-primary' : ''}">${num}</span>
                <div class="w-1.5 h-1.5 rounded-full mt-0.5 ${hasTask ? (isSelected ? 'bg-primary' : 'bg-light') : 'opacity-0'}"></div>
            </div>
        `;
    }
    daysEl.innerHTML = html;
}

function toggleDateFilter(dStr) {
    STATE.filterDate = (STATE.filterDate === dStr) ? null : dStr;
    renderWeek();
    renderBoard();
}

function renderBoard() {
    const cont = document.getElementById('board-container');
    const pad = STATE.settings.compact ? 'p-4' : 'p-6';
    
    cont.innerHTML = COLUMNS.map(col => {
        let tasks = STATE.tasks.filter(t => t.status === col);
        
        if (STATE.filterDate !== null && col !== 'BACKLOG') {
            tasks = tasks.filter(t => t.due_date && ymd(t.due_date) === STATE.filterDate);
        }
        if (STATE.search) {
            tasks = tasks.filter(t => t.title.toLowerCase().includes(STATE.search));
        }

        const cards = tasks.map(t => {
            const prio = P[t.priority] || P.MEDIUM;
            const subDone = t.subtasks ? t.subtasks.filter(s => s.done).length : 0;
            const subTotal = t.subtasks ? t.subtasks.length : 0;
            const att = t.attachments ? t.attachments.length : 0;
            const isDue = t.due_date && new Date(t.due_date) < new Date();
            
            const notifDot = (STATE.settings.notif && t.status !== 'DONE' && isDue) ? 
                '<div class="absolute -top-1.5 -right-1.5 w-3.5 h-3.5 rounded-full bg-accent shadow-[0_0_8px_#FFDAB3] border-2 border-white"></div>' : '';

            const tint = getProjectTint(t.project);

            return `
                <div class="group relative glass rounded-3xl flex flex-col gap-3 shadow-card cursor-grab ${pad} transition-all duration-250 hover:-translate-y-1 hover:shadow-[0_25px_60px_-20px_rgba(87,73,100,0.3)] overflow-hidden"
                     draggable="true" ondragstart="dragStart(event, ${t.id})" onclick="openModal(${t.id})">
                    <div class="absolute top-0 left-0 bottom-0 w-1" style="background: ${tint.border}"></div>
                    ${notifDot}
                    <div class="flex items-center justify-between gap-2 z-10 relative">
                        <div class="text-[12px] font-bold text-primary truncate px-3 py-1 rounded-full shadow-sm" style="background: ${tint.bg}">${escapeHtml(t.project || 'Inbox')}</div>
                        <div class="flex gap-1.5 items-center">
                            <button onclick="editTitle(event, ${t.id})" class="opacity-0 group-hover:opacity-100 p-1.5 rounded-full hover:bg-primary/10 text-primary/70 transition-all"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg></button>
                            <button onclick="delTask(event, ${t.id})" class="opacity-0 group-hover:opacity-100 p-1.5 rounded-full hover:bg-red-50 text-red-400 hover:text-red-600 transition-all"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg></button>
                            <span class="text-[11px] font-extrabold px-3 py-1 rounded-full ${prio.class}">${prio.label}</span>
                        </div>
                    </div>
                    
                    <div class="text-[16px] font-extrabold leading-tight break-words pr-2 z-10 relative text-primary mt-1">${escapeHtml(t.title)}</div>
                    
                    <div class="flex items-center gap-3 mt-2 text-primary/70 z-10 relative">
                        ${subTotal > 0 ? `
                        <div class="flex items-center gap-1.5 text-[12px] font-bold">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 11 12 14 22 4"></polyline><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path></svg>
                            ${subDone}/${subTotal}
                        </div>` : ''}
                        ${att > 0 ? `
                        <div class="flex items-center gap-1.5 text-[12px] font-bold">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"></path></svg>
                            ${att}
                        </div>` : ''}
                    </div>
                </div>
            `;
        }).join('');

        return `
            <div class="flex flex-col gap-5 min-w-[280px] rounded-[32px] p-2 transition-all duration-300" ondragover="allowDrop(event)" ondrop="drop(event, '${col}')" ondragleave="dragLeave(event)">
                <div class="flex items-center justify-between px-2">
                    <div class="flex items-center gap-3">
                        <div class="w-3 h-3 rounded-full shadow-[0_0_12px_${STATUS[col].bg}]" style="background: ${STATUS[col].hex}"></div>
                        <div class="text-[14px] font-extrabold uppercase tracking-widest text-primary">${STATUS[col].label}</div>
                        <div class="text-[12px] font-extrabold text-primary glass px-2 py-0.5 rounded-full shadow-sm">${tasks.length}</div>
                    </div>
                </div>
                
                <button onclick="openCreateModal('${col}')" class="flex items-center gap-2 h-14 w-full border-2 border-dashed border-primary/20 rounded-[24px] bg-white/40 text-primary text-[14px] font-bold cursor-pointer hover:bg-white/60 hover:border-primary/30 transition-all justify-center shadow-sm">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                    Create task
                </button>
                
                <div class="flex flex-col gap-4 min-h-[150px]">
                    ${cards}
                </div>
            </div>
        `;
    }).join('');
}

function dragStart(ev, id) {
    ev.dataTransfer.setData('id', id);
    setTimeout(() => ev.target.classList.add('dragging'), 0);
}
function allowDrop(ev) { 
    ev.preventDefault(); 
    const colEl = ev.target.closest('.flex-col.gap-5');
    if(colEl && !colEl.classList.contains('drag-over')) colEl.classList.add('drag-over');
}
function dragLeave(ev) {
    const colEl = ev.target.closest('.flex-col.gap-5');
    if(colEl) colEl.classList.remove('drag-over');
}
async function drop(ev, col) {
    ev.preventDefault();
    document.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
    
    const id = parseInt(ev.dataTransfer.getData('id'));
    const task = STATE.tasks.find(t => t.id === id);
    if (!task || task.status === col) return;
    
    document.querySelector('.dragging')?.classList.remove('dragging');
    const old = task.status;
    task.status = col;
    renderDash();
    
    try {
        await api(`/tasks/${id}`, { method: 'PATCH', body: JSON.stringify({ status: col }) });
    } catch(e) {
        task.status = old;
        renderDash();
    }
}

async function editTitle(ev, id) {
    ev.stopPropagation();
    const t = STATE.tasks.find(x => x.id === id);
    const newVal = prompt('Edit title:', t.title);
    if (!newVal || newVal.trim() === '') return;
    
    const old = t.title;
    t.title = newVal.trim();
    renderDash();
    
    try {
        await api(`/tasks/${id}`, { method: 'PATCH', body: JSON.stringify({ title: t.title }) });
    } catch(e) {
        t.title = old;
        renderDash();
    }
}

async function delTask(ev, id) {
    if(ev && ev.stopPropagation) ev.stopPropagation();
    const idx = STATE.tasks.findIndex(x => x.id === id);
    if(idx < 0) return;
    const t = STATE.tasks[idx];
    
    STATE.deletedTaskBuffer = { ...t };
    STATE.tasks.splice(idx, 1);
    renderDash();
    
    showToast(`"${escapeHtml(t.title)}" deleted`, true);
    
    try {
        await api(`/tasks/${id}`, { method: 'DELETE' });
        if(STATE.view === 'settings') fetchTrash();
    } catch(e) {
        STATE.tasks.splice(idx, 0, t);
        renderDash();
    }
}

// Modal handling
function closeModal() {
    document.getElementById('modal-backdrop').classList.add('opacity-0', 'pointer-events-none');
    document.getElementById('task-modal').classList.add('translate-x-[calc(100%+32px)]');
    setTimeout(() => {
        document.getElementById('modal-view-content').classList.remove('hidden');
        document.getElementById('modal-create-content').classList.add('hidden');
        document.getElementById('modal-btn-create').classList.add('hidden');
        document.getElementById('modal-mark-progress').classList.remove('hidden');
        document.getElementById('modal-mark-done').classList.remove('hidden');
    }, 400);
}

document.getElementById('modal-close').onclick = closeModal;
document.getElementById('modal-backdrop').onclick = closeModal;

function openCreateModal(defaultStatus = 'TODO') {
    document.getElementById('modal-view-content').classList.add('hidden');
    document.getElementById('modal-create-content').classList.remove('hidden');
    
    document.getElementById('modal-btn-create').classList.remove('hidden');
    document.getElementById('modal-mark-progress').classList.add('hidden');
    document.getElementById('modal-mark-done').classList.add('hidden');
    document.getElementById('modal-delete').classList.add('hidden');
    document.getElementById('modal-status-label').textContent = 'Create Task';

    document.getElementById('create-title').value = '';
    document.getElementById('create-status').value = defaultStatus;
    document.getElementById('create-priority').value = 'MEDIUM';
    document.getElementById('create-project').value = '';
    document.getElementById('create-due').value = ymd(new Date());
    document.getElementById('create-desc').value = '';

    document.getElementById('modal-backdrop').classList.remove('opacity-0', 'pointer-events-none');
    document.getElementById('task-modal').classList.remove('translate-x-[calc(100%+32px)]');
}

async function submitCreate() {
    const title = document.getElementById('create-title').value.trim();
    if (!title) {
        alert('Title is required');
        return;
    }
    const data = {
        title,
        status: document.getElementById('create-status').value,
        priority: document.getElementById('create-priority').value,
        project: document.getElementById('create-project').value.trim() || 'Inbox',
        due_date: document.getElementById('create-due').value || null,
        description: document.getElementById('create-desc').value.trim() || null
    };

    closeModal();
    try {
        await api('/tasks', { method: 'POST', body: JSON.stringify(data) });
        await fetchTasks();
    } catch(e) {}
}

let activeTaskId = null;

function openModal(id) {
    const t = STATE.tasks.find(x => x.id === id);
    if (!t) return;
    activeTaskId = id;

    document.getElementById('modal-view-content').classList.remove('hidden');
    document.getElementById('modal-create-content').classList.add('hidden');
    document.getElementById('modal-btn-create').classList.add('hidden');
    document.getElementById('modal-mark-progress').classList.remove('hidden');
    document.getElementById('modal-mark-done').classList.remove('hidden');
    document.getElementById('modal-delete').classList.remove('hidden');

    document.getElementById('modal-status-label').textContent = STATUS[t.status].label;
    document.getElementById('modal-title').value = t.title;
    document.getElementById('modal-project').textContent = escapeHtml(t.project || 'Inbox');
    
    const prio = P[t.priority] || P.MEDIUM;
    const badge = document.getElementById('modal-priority-badge');
    badge.textContent = prio.label;
    badge.className = `text-[13px] font-bold px-3 py-1.5 rounded-full shadow-sm border border-white/50 ${prio.class}`;

    document.getElementById('modal-due').textContent = t.due_date ? new Date(t.due_date).toLocaleDateString() : 'No date';
    document.getElementById('modal-desc').textContent = t.description || 'No description provided.';
    
    const sDone = t.subtasks ? t.subtasks.filter(x => x.done).length : 0;
    const sTotal = t.subtasks ? t.subtasks.length : 0;
    document.getElementById('modal-subtasks-count').textContent = `${sDone}/${sTotal}`;
    
    document.getElementById('modal-subtasks-list').innerHTML = (t.subtasks || []).map(s => `
        <div class="flex items-center gap-3 py-2.5 border-b border-primary/10 last:border-0">
            <div class="w-5 h-5 rounded-full border-2 flex items-center justify-center ${s.done ? 'bg-accent border-accent text-primary shadow-sm' : 'border-muted'}">
                ${s.done ? '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg>' : ''}
            </div>
            <span class="text-[14px] font-bold ${s.done ? 'text-primary/50 line-through' : 'text-primary'}">${escapeHtml(s.title)}</span>
        </div>
    `).join('') || '<div class="text-[13px] text-muted italic font-medium">No subtasks</div>';

    document.getElementById('modal-attachments-list').innerHTML = (t.attachments || []).map(a => `
        <div class="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white shadow-sm border border-white/50">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="text-muted"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"></path></svg>
            <span class="text-[13px] font-extrabold text-primary">${escapeHtml(a.name)}</span>
        </div>
    `).join('') || '<div class="text-[13px] text-muted italic font-medium">No attachments</div>';

    document.getElementById('modal-backdrop').classList.remove('opacity-0', 'pointer-events-none');
    document.getElementById('task-modal').classList.remove('translate-x-[calc(100%+32px)]');
}

document.getElementById('modal-title').onchange = async (e) => {
    if(!activeTaskId) return;
    const newVal = e.target.value.trim();
    if(!newVal) return;
    const t = STATE.tasks.find(x => x.id === activeTaskId);
    t.title = newVal;
    renderDash();
    try { await api(`/tasks/${activeTaskId}`, { method: 'PATCH', body: JSON.stringify({ title: newVal }) }); } catch(e) {}
};

document.getElementById('modal-delete').onclick = async () => {
    if(!activeTaskId) return;
    closeModal();
    await delTask({stopPropagation:()=>{}}, activeTaskId);
};

document.getElementById('modal-mark-progress').onclick = async () => {
    if(!activeTaskId) return;
    closeModal();
    const t = STATE.tasks.find(x => x.id === activeTaskId);
    t.status = 'IN_PROGRESS';
    renderDash();
    try { await api(`/tasks/${activeTaskId}`, { method: 'PATCH', body: JSON.stringify({ status: 'IN_PROGRESS' }) }); } catch(e) {}
};

document.getElementById('modal-mark-done').onclick = async () => {
    if(!activeTaskId) return;
    closeModal();
    const t = STATE.tasks.find(x => x.id === activeTaskId);
    t.status = 'DONE';
    renderDash();
    try { await api(`/tasks/${activeTaskId}`, { method: 'PATCH', body: JSON.stringify({ status: 'DONE' }) }); } catch(e) {}
};

// Calendar
function renderCalendar() {
    const grid = document.getElementById('calendar-grid');
    grid.innerHTML = '';
    
    const today = new Date();
    document.getElementById('calendar-month').textContent = today.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    
    // Add headers
    const DOW = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
    DOW.forEach(d => {
        grid.innerHTML += `<div class="text-center text-[13px] font-extrabold tracking-widest uppercase text-muted py-2">${d}</div>`;
    });

    const yr = today.getFullYear();
    const mo = today.getMonth();
    const firstDay = new Date(yr, mo, 1);
    let startIdx = firstDay.getDay() - 1;
    if(startIdx < 0) startIdx = 6;
    
    const daysInMo = new Date(yr, mo + 1, 0).getDate();
    
    for(let i=0; i<startIdx; i++) {
        grid.innerHTML += `<div class="h-28 rounded-3xl bg-white/30"></div>`;
    }
    
    for(let d=1; d<=daysInMo; d++) {
        const cur = new Date(yr, mo, d);
        const yStr = ymd(cur);
        const dayTasks = STATE.tasks.filter(t => t.due_date && ymd(t.due_date) === yStr && t.status !== 'CANCELED');
        
        const isToday = yStr === ymd(today);
        const badge = isToday ? `<div class="w-7 h-7 rounded-full bg-primary text-white text-[12px] font-bold flex items-center justify-center shadow-sm">${d}</div>` : `<div class="text-[14px] font-extrabold text-muted">${d}</div>`;
        
        const taskChips = dayTasks.slice(0,2).map(t => `<span class="text-[11px] font-extrabold px-2 py-0.5 rounded-md bg-white/60 text-primary whitespace-nowrap overflow-hidden text-ellipsis w-full block text-center shadow-sm border border-white/50">${escapeHtml(t.title)}</span>`).join('');
        const more = dayTasks.length > 2 ? `<div class="text-[11px] font-bold text-muted text-center">+${dayTasks.length - 2} more</div>` : '';
        
        grid.innerHTML += `
            <div class="h-28 rounded-3xl glass shadow-sm p-3 flex flex-col gap-1 overflow-hidden transition-all hover:scale-105 hover:shadow-soft">
                ${badge}
                <div class="flex flex-col gap-1 mt-1">${taskChips}${more}</div>
            </div>
        `;
    }
}

// Settings
function toggleSetting(key) {
    STATE.settings[key] = !STATE.settings[key];
    localStorage.setItem('kb-settings', JSON.stringify(STATE.settings));
    updateSettingsUI();
    if(STATE.view === 'dashboard') renderDash();
}
function updateSettingsUI() {
    ['showWeek','compact','notif'].forEach(k => {
        const btn = document.getElementById('toggle-' + k);
        const circle = btn.querySelector('span');
        if(STATE.settings[k]) {
            btn.classList.add('bg-gradient-to-r', 'from-accent', 'to-light', 'shadow-glow');
            btn.classList.remove('bg-primary/20');
            circle.classList.add('translate-x-5');
        } else {
            btn.classList.remove('bg-gradient-to-r', 'from-accent', 'to-light', 'shadow-glow');
            btn.classList.add('bg-primary/20');
            circle.classList.remove('translate-x-5');
        }
    });
}
['showWeek','compact','notif'].forEach(k => {
    document.getElementById('toggle-' + k).onclick = () => toggleSetting(k);
});

document.getElementById('btn-clear-done').onclick = async () => {
    try {
        await api('/tasks?status=DONE', { method: 'DELETE' });
        await fetchTasks();
        if(STATE.view === 'settings') fetchTrash();
    } catch(e) {}
};

document.getElementById('btn-reset-data').onclick = async () => {
    try {
        await api('/trash', { method: 'DELETE' });
        await api('/tasks?status=BACKLOG', { method: 'DELETE' });
        await api('/tasks?status=TODO', { method: 'DELETE' });
        await api('/tasks?status=IN_PROGRESS', { method: 'DELETE' });
        await api('/tasks?status=DONE', { method: 'DELETE' });
        await api('/tasks?status=CANCELED', { method: 'DELETE' });
        await api('/trash', { method: 'DELETE' });
        await api('/seed', { method: 'POST' });
        await fetchTasks();
        if(STATE.view === 'settings') fetchTrash();
    } catch(e) {}
};

async function fetchTrash() {
    STATE.trash = await api('/trash');
    renderTrash();
}

function renderTrash() {
    const list = document.getElementById('trash-list');
    if (!STATE.trash || STATE.trash.length === 0) {
        list.innerHTML = "<div class=\"py-8 text-center text-[15px] font-bold text-muted\">Trash is empty</div>";
        return;
    }
    list.innerHTML = STATE.trash.map(t => {
        const delDate = new Date(t.deleted_at).toLocaleDateString('en-US', {month:'short', day:'numeric'});
        return `
            <div class="flex items-center justify-between gap-4 py-4 border-b border-primary/10 last:border-0">
                <div class="flex-1 min-w-0 flex flex-col gap-1">
                    <div class="text-[15px] font-extrabold text-primary truncate">${escapeHtml(t.title)}</div>
                    <div class="text-[13px] font-medium text-muted">${escapeHtml(t.project || 'Inbox')} • Deleted ${delDate}</div>
                </div>
                <div class="flex items-center gap-2">
                    <button onclick="restoreTrashTask(${t.id})" class="h-9 px-5 rounded-full bg-primary/10 text-primary text-[13px] font-bold hover:bg-primary/20 transition-colors">Restore</button>
                    <div class="relative">
                        <button onclick="showDeleteConfirm(${t.id})" id="btn-del-${t.id}" class="h-9 px-5 rounded-full bg-red-50 text-red-500 text-[13px] font-bold hover:bg-red-100 transition-colors">Delete</button>
                        <div id="conf-del-${t.id}" class="hidden absolute right-0 top-0 items-center gap-1 bg-white/95 backdrop-blur-xl p-1.5 rounded-full shadow-soft z-10 border border-primary/10 whitespace-nowrap">
                            <button onclick="permDelete(${t.id})" class="h-8 px-4 rounded-full bg-red-500 text-white text-[12px] font-bold hover:bg-red-600 transition-colors shadow-sm">Delete forever</button>
                            <button onclick="hideDeleteConfirm(${t.id})" class="h-8 px-4 rounded-full bg-primary/10 text-primary text-[12px] font-bold hover:bg-primary/20 transition-colors">Cancel</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

function showDeleteConfirm(id) {
    document.getElementById(`btn-del-${id}`).classList.add('hidden');
    document.getElementById(`conf-del-${id}`).classList.replace('hidden', 'flex');
}
function hideDeleteConfirm(id) {
    document.getElementById(`conf-del-${id}`).classList.replace('flex', 'hidden');
    document.getElementById(`btn-del-${id}`).classList.remove('hidden');
}
async function restoreTrashTask(id) {
    try {
        await api(`/tasks/${id}/restore`, { method: 'POST' });
        await fetchTrash();
        await fetchTasks();
    } catch(e) {}
}
async function permDelete(id) {
    try {
        await api(`/tasks/${id}/permanent`, { method: 'DELETE' });
        await fetchTrash();
    } catch(e) {}
}

document.getElementById('btn-empty-trash').onclick = () => {
    if(!STATE.trash || STATE.trash.length === 0) return;
    document.getElementById('btn-empty-trash').classList.add('hidden');
    document.getElementById('empty-trash-confirm').classList.replace('hidden', 'flex');
};
document.getElementById('btn-empty-trash-no').onclick = () => {
    document.getElementById('empty-trash-confirm').classList.replace('flex', 'hidden');
    document.getElementById('btn-empty-trash').classList.remove('hidden');
};
document.getElementById('btn-empty-trash-yes').onclick = async () => {
    document.getElementById('empty-trash-confirm').classList.replace('flex', 'hidden');
    document.getElementById('btn-empty-trash').classList.remove('hidden');
    try {
        await api('/trash', { method: 'DELETE' });
        await fetchTrash();
    } catch(e) {}
};

function escapeHtml(s) {
    return String(s ?? '').replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

init();
