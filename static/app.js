const API_BASE = '/api';
const STATE = {
    tasks: [],
    view: 'dashboard',
    filterDay: null, // 0-6 (Mon-Sun)
    search: '',
    settings: {
        showWeek: true,
        compact: false,
        notif: true
    },
    deletedTaskBuffer: null
};

// Elements
const viewDash = document.getElementById('view-dashboard');
const viewCal = document.getElementById('view-calendar');
const viewSet = document.getElementById('view-settings');
const toast = document.getElementById('toast');
const toastMsg = document.getElementById('toast-msg');
const toastUndo = document.getElementById('toast-undo');

const P = {
    HIGH: { label: 'High', bg: '#FFDAB3', text: '#574964' },
    MEDIUM: { label: 'Medium', bg: '#EFE3E3', text: '#574964' },
    LOW: { label: 'Low', bg: '#F4F0F2', text: '#9F8383' }
};
const STATUS = {
    BACKLOG: { label: 'Backlog', hex: '#C8AAAA' },
    TODO: { label: 'To Do', hex: '#FFDAB3' },
    IN_PROGRESS: { label: 'In Progress', hex: '#9F8383' },
    DONE: { label: 'Done', hex: '#574964' }
};
const DOW = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];

let undoTimeout = null;
let errorTimeout = null;

function showToast(msg, isUndo = false) {
    toastMsg.textContent = msg;
    toast.classList.remove('pointer-events-none');
    toast.classList.add('toast-active');
    
    if (isUndo) {
        toast.classList.remove('bg-red-600');
        toast.classList.add('bg-primary');
        toastUndo.classList.remove('hidden');
    } else {
        toast.classList.add('bg-red-600');
        toast.classList.remove('bg-primary');
        toastUndo.classList.add('hidden');
    }

    clearTimeout(errorTimeout);
    errorTimeout = setTimeout(() => hideToast(), 4500);
}

function hideToast() {
    toast.classList.remove('toast-active');
    toast.classList.add('pointer-events-none');
    STATE.deletedTaskBuffer = null;
}

async function api(path, opts = {}) {
    try {
        const res = await fetch(API_BASE + path, opts);
        if (!res.ok) throw new Error('API Error');
        return await res.json();
    } catch (e) {
        showToast('Something went wrong');
        throw e;
    }
}

async function init() {
    // Load Settings
    const saved = localStorage.getItem('kb-settings');
    if (saved) Object.assign(STATE.settings, JSON.parse(saved));
    updateSettingsUI();

    // Setup Header
    const d = new Date();
    const hr = d.getHours();
    document.getElementById('header-title').textContent = hr < 12 ? 'Good morning' : hr < 18 ? 'Good afternoon' : 'Good evening';
    document.getElementById('header-date').textContent = d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

    // Events
    document.querySelectorAll('.nav-btn').forEach(b => {
        b.addEventListener('click', () => setView(b.dataset.view));
    });
    
    document.getElementById('search-input').addEventListener('input', e => {
        STATE.search = e.target.value.toLowerCase();
        renderDash();
    });

    document.getElementById('bell-btn').addEventListener('click', e => {
        const d = document.getElementById('notif-dropdown');
        d.classList.toggle('hidden');
        e.currentTarget.classList.toggle('bg-primary');
        e.currentTarget.classList.toggle('text-white');
    });

    toastUndo.addEventListener('click', async () => {
        if (!STATE.deletedTaskBuffer) return;
        hideToast();
        const t = STATE.deletedTaskBuffer;
        try {
            const { id, created_at, subtasks, attachments, ...payload } = t;
            await api('/tasks', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(payload) });
            await fetchTasks();
        } catch(e) {}
    });

    // Load Data
    await fetchTasks();
}

async function fetchTasks() {
    STATE.tasks = await api('/tasks');
    render();
}

function setView(v) {
    STATE.view = v;
    document.querySelectorAll('.nav-btn').forEach(b => {
        const on = b.dataset.view === v;
        b.className = `nav-btn flex items-center gap-3 h-10 px-3 border-0 rounded-xl text-sm font-semibold cursor-pointer text-left transition-colors ${on ? 'bg-primary text-white' : 'bg-transparent text-muted hover:bg-white'}`;
    });
    viewDash.classList.toggle('hidden', v !== 'dashboard');
    viewCal.classList.toggle('hidden', v !== 'calendar');
    viewSet.classList.toggle('hidden', v !== 'settings');
    if(v === 'calendar') renderCalendar();
}

function getDayIndex(dateStr) {
    if (!dateStr) return null;
    let idx = new Date(dateStr).getDay() - 1;
    return idx < 0 ? 6 : idx;
}

function render() {
    if (STATE.view === 'dashboard') renderDash();
    if (STATE.view === 'calendar') renderCalendar();
}

function renderDash() {
    renderStats();
    renderWeek();
    renderBoard();
}

function renderStats() {
    const counts = { BACKLOG:0, TODO:0, IN_PROGRESS:0, DONE:0, CANCELED:0 };
    STATE.tasks.forEach(t => { if(counts[t.status] !== undefined) counts[t.status]++; });
    
    const tot = STATE.tasks.length || 1;
    const stats = [
        { label: 'Completed', val: counts.DONE, bg: 'bg-primary', fg: 'text-white', dot: 'bg-accent', track: 'bg-white/35', fill: 'bg-accent', shadow: 'shadow-[0_10px_24px_rgba(87,73,100,0.12)]' },
        { label: 'Pending', val: counts.TODO + counts.BACKLOG, bg: 'bg-accent', fg: 'text-primary', dot: 'bg-primary', track: 'bg-white/35', fill: 'bg-primary', shadow: 'shadow-[0_10px_24px_rgba(87,73,100,0.12)]' },
        { label: 'Ongoing', val: counts.IN_PROGRESS, bg: 'bg-light', fg: 'text-[#3F3449]', dot: 'bg-primary', track: 'bg-white/35', fill: 'bg-primary', shadow: 'shadow-[0_10px_24px_rgba(87,73,100,0.12)]' },
        { label: 'Canceled', val: counts.CANCELED, bg: 'bg-white', fg: 'text-primary', dot: 'bg-muted', track: 'bg-[#F1EBED]', fill: 'bg-muted', shadow: 'shadow-[0_1px_2px_rgba(87,73,100,0.04),0_10px_30px_rgba(87,73,100,0.06)]' },
    ];

    document.getElementById('stats-container').innerHTML = stats.map(s => `
        <div class="p-5 rounded-[22px] flex flex-col gap-3.5 ${s.bg} ${s.fg} ${s.shadow}">
            <div class="flex justify-between items-center"><div class="text-[13px] font-semibold">${s.label}</div><div class="w-2 h-2 rounded-full ${s.dot}"></div></div>
            <div class="text-[36px] font-bold tracking-tight leading-none">${String(s.val).padStart(2, '0')}</div>
            <div class="h-1 rounded-full ${s.track} overflow-hidden"><div class="h-full rounded-full ${s.fill}" style="width: ${Math.round(s.val/tot*100)}%"></div></div>
        </div>
    `).join('');
}

function renderWeek() {
    const cont = document.getElementById('week-selector-container');
    if (!STATE.settings.showWeek) { cont.classList.add('hidden'); return; }
    cont.classList.remove('hidden');

    const currDay = new Date();
    const currDow = currDay.getDay() === 0 ? 6 : currDay.getDay() - 1;
    const startOfWeek = new Date(currDay);
    startOfWeek.setDate(currDay.getDate() - currDow);

    const isAll = STATE.filterDay === null;
    let html = `<button onclick="setFilterDay(null)" class="w-[52px] h-[64px] border-0 rounded-2xl font-bold text-[13px] transition-all shadow-[0_1px_2px_rgba(87,73,100,0.05)] ${isAll ? 'bg-primary text-white shadow-[0_8px_20px_rgba(87,73,100,0.25)]' : 'bg-white text-primary'}">All</button>`;

    for(let i=0; i<7; i++) {
        const d = new Date(startOfWeek);
        d.setDate(d.getDate() + i);
        
        const hasTasks = STATE.tasks.some(t => getDayIndex(t.due_date) === i && !['BACKLOG','CANCELED'].includes(t.status));
        const on = STATE.filterDay === i;
        
        html += `
            <button onclick="setFilterDay(${i})" class="relative w-[52px] h-[64px] border-0 rounded-2xl flex flex-col items-center justify-center gap-1 transition-all shadow-[0_1px_2px_rgba(87,73,100,0.05)] ${on ? 'bg-primary text-white shadow-[0_8px_20px_rgba(87,73,100,0.25)] transform -translate-y-0.5' : 'bg-white text-primary'}">
                <span class="text-[12px] font-medium">${DOW[i]}</span>
                <span class="text-[17px] font-bold">${d.getDate()}</span>
                <span class="absolute bottom-[7px] w-1 h-1 rounded-full ${hasTasks ? (on ? 'bg-accent' : 'bg-light') : 'bg-transparent'}"></span>
            </button>
        `;
    }
    document.getElementById('week-days').innerHTML = html;

    const fd = document.getElementById('filter-dot');
    const fl = document.getElementById('filter-label');
    const clr = document.getElementById('clear-filter');
    
    if (isAll) {
        fd.className = 'w-1.5 h-1.5 rounded-full bg-primary';
        fl.textContent = 'Showing all of this week';
        clr.classList.add('hidden');
        document.getElementById('board-container').classList.remove('opacity-35', 'blur-[2px]');
    } else {
        fd.className = 'w-1.5 h-1.5 rounded-full bg-accent';
        const d = new Date(startOfWeek); d.setDate(d.getDate() + STATE.filterDay);
        const count = STATE.tasks.filter(t => !['BACKLOG','CANCELED'].includes(t.status) && getDayIndex(t.due_date) === STATE.filterDay).length;
        fl.textContent = `${count} tasks on ${DOW[STATE.filterDay]}, ${d.toLocaleDateString('en-US',{month:'short',day:'numeric'})}`;
        clr.classList.remove('hidden');
        document.getElementById('board-container').classList.add('opacity-35', 'blur-[2px]');
        setTimeout(() => document.getElementById('board-container').classList.remove('opacity-35', 'blur-[2px]'), 300);
    }
    clr.onclick = () => setFilterDay(null);
}

function setFilterDay(i) {
    STATE.filterDay = i;
    renderDash();
}

function renderBoard() {
    const board = document.getElementById('board-container');
    const q = STATE.search;
    
    const visible = STATE.tasks.filter(t => t.title.toLowerCase().includes(q) || (t.project && t.project.toLowerCase().includes(q)));
    
    board.innerHTML = Object.keys(STATUS).map(stKey => {
        const cfg = STATUS[stKey];
        const isBacklog = stKey === 'BACKLOG';
        const tasksInCol = visible.filter(t => t.status === stKey && (isBacklog || STATE.filterDay === null || getDayIndex(t.due_date) === STATE.filterDay));
        
        const pad = STATE.settings.compact ? 'p-[10px_12px]' : 'p-3.5';

        const cards = tasksInCol.map(t => {
            const isDone = t.status === 'DONE';
            const prio = P[t.priority] || P.MEDIUM;
            const dueStr = t.due_date ? new Date(t.due_date).toLocaleDateString('en-US', {month:'short',day:'numeric'}) : 'No date';
            const dueLabel = (t.status === 'BACKLOG' || !t.due_date) ? dueStr : `${DOW[getDayIndex(t.due_date)]}, ${dueStr}`;

            return `
                <div class="bg-white rounded-2xl flex flex-col gap-2.5 shadow-[0_1px_2px_rgba(87,73,100,0.06),0_4px_12px_rgba(87,73,100,0.05)] cursor-grab ${pad}"
                     draggable="true" ondragstart="dragStart(event, ${t.id})" onclick="openModal(${t.id})">
                    <div class="flex items-center justify-between gap-2">
                        <div class="text-[11px] font-medium text-muted">${t.project || 'Inbox'}</div>
                        <span class="text-[11px] font-semibold px-2 py-0.5 rounded-full" style="background:${prio.bg}; color:${prio.text}">${prio.label}</span>
                    </div>
                    
                    <div class="text-sm font-semibold leading-snug ${isDone ? 'text-muted line-through' : 'text-primary'} flex-1 group relative">
                        <span class="title-disp block text-wrap">${escapeHtml(t.title)}</span>
                        <input type="text" class="title-edit hidden w-full h-8 px-2 border-[1.5px] border-light rounded-lg outline-none font-inherit text-sm text-primary bg-[#FAF7F8]" 
                               value="${escapeHtml(t.title)}" 
                               onblur="saveInlineTitle(event, ${t.id})" 
                               onkeydown="if(event.key==='Enter')this.blur();if(event.key==='Escape')cancelInline(event)"
                               onclick="event.stopPropagation()">
                    </div>

                    ${t.status === 'IN_PROGRESS' ? `
                    <div class="flex items-center gap-2">
                        <div class="flex-1 h-1 rounded-full bg-[#F1EBED]"><div class="h-full rounded-full bg-primary" style="width: ${t.progress||0}%"></div></div>
                        <span class="text-[11px] font-semibold">${t.progress||0}%</span>
                    </div>` : ''}

                    <div class="flex items-center gap-2">
                        <button onclick="toggleDone(event, ${t.id})" class="flex-none w-5 h-5 rounded-full flex items-center justify-center cursor-pointer ${isDone ? 'border-0 bg-primary' : 'border-[1.6px] border-light bg-white'}">
                            ${isDone ? '<span class="w-2 h-1 border-l-2 border-b-2 border-white transform -rotate-45 -translate-y-[1px] translate-x-[1px]"></span>' : ''}
                        </button>
                        <div class="text-xs text-muted flex-1 min-w-0">${dueLabel}</div>
                        
                        <button onclick="editInlineTitle(event)" class="w-7 h-7 rounded-lg text-muted bg-transparent hover:bg-[#F6F1F2] hover:text-primary flex items-center justify-center transition-colors">
                            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"><path d="M2 12l.6-2.6L9.5 2.5l2 2-6.9 6.9z"></path></svg>
                        </button>
                        <button onclick="delTask(event, ${t.id})" class="w-7 h-7 rounded-lg text-muted bg-transparent hover:bg-[#FFF1E2] hover:text-primary flex items-center justify-center transition-colors">
                            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><line x1="2" y1="3.5" x2="12" y2="3.5"></line><path d="M3.5 3.5l.6 8.5h5.8l.6-8.5"></path><line x1="5.5" y1="1.8" x2="8.5" y2="1.8"></line></svg>
                        </button>
                    </div>
                </div>
            `;
        }).join('');

        const emptyHTML = tasksInCol.length === 0 ? `<div class="p-[22px_12px] border-[1.5px] border-dashed border-[#DCCACA] rounded-2xl text-xs text-muted text-center">${q ? 'No matches' : 'Drag tasks here'}</div>` : '';

        return `
            <div class="rounded-[22px] p-[14px_10px_10px] flex flex-col gap-2.5 min-h-[420px] bg-[#EFEBED] transition-colors" 
                 ondragover="allowDrop(event)" ondragleave="dragLeave(event)" ondrop="drop(event, '${stKey}')">
                <div class="flex items-center gap-2 px-1.5 pb-1">
                    <span class="w-2 h-2 rounded-full" style="background: ${cfg.hex}"></span>
                    <div class="text-xs font-bold tracking-wider uppercase">${cfg.label}</div>
                    <span class="min-w-[22px] h-5 px-1.5 rounded-md bg-white text-[11px] font-bold flex items-center justify-center ml-1">${tasksInCol.length}</span>
                </div>
                
                ${cards}
                ${emptyHTML}

                <div class="add-container hidden bg-white rounded-2xl p-2.5 flex-col gap-2 shadow-[0_0_0_1.5px_#C8AAAA]">
                    <input type="text" class="add-input border-0 outline-0 font-inherit text-sm text-primary bg-transparent px-1 py-1" placeholder="What needs to be done?" onkeydown="if(event.key==='Enter')addTask(event, '${stKey}');if(event.key==='Escape')hideAdd(event)">
                    <div class="flex gap-1.5 justify-end">
                        <button onclick="hideAdd(event)" class="h-[30px] px-3 rounded-full bg-[#F1EBED] text-primary text-xs font-semibold">Cancel</button>
                        <button onclick="addTask(event, '${stKey}')" class="h-[30px] px-3.5 rounded-full bg-primary text-white text-xs font-semibold">Add task</button>
                    </div>
                </div>
                
                <button onclick="showAdd(event)" class="add-btn flex items-center gap-2 h-[38px] px-2.5 border-0 rounded-xl bg-transparent text-muted text-[13px] font-semibold cursor-pointer text-left hover:bg-white/70 hover:text-primary mt-auto">
                    <span class="text-[17px] leading-none">+</span>Create task
                </button>
            </div>
        `;
    }).join('');
}

// Inline Edit
function editInlineTitle(e) {
    e.stopPropagation();
    const card = e.currentTarget.closest('.bg-white');
    card.querySelector('.title-disp').classList.add('hidden');
    const inp = card.querySelector('.title-edit');
    inp.classList.remove('hidden');
    inp.focus();
}
function cancelInline(e) {
    const card = e.currentTarget.closest('.bg-white');
    card.querySelector('.title-disp').classList.remove('hidden');
    e.currentTarget.classList.add('hidden');
}
async function saveInlineTitle(e, id) {
    const val = e.currentTarget.value.trim();
    if (!val) { cancelInline(e); return; }
    
    const task = STATE.tasks.find(t=>t.id===id);
    if(task.title === val) { cancelInline(e); return; }
    
    task.title = val;
    renderBoard();
    try {
        await api(`/tasks/${id}`, { method: 'PATCH', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({title: val}) });
    } catch(err) {
        await fetchTasks();
    }
}

// Inline Add
function showAdd(e) {
    const col = e.currentTarget.parentElement;
    col.querySelector('.add-container').classList.replace('hidden', 'flex');
    col.querySelector('.add-btn').classList.add('hidden');
    col.querySelector('.add-input').focus();
}
function hideAdd(e) {
    const col = e.currentTarget.closest('.rounded-\\[22px\\]');
    col.querySelector('.add-container').classList.replace('flex', 'hidden');
    col.querySelector('.add-btn').classList.remove('hidden');
    col.querySelector('.add-input').value = '';
}
async function addTask(e, status) {
    const col = e.currentTarget.closest('.rounded-\\[22px\\]');
    const inp = col.querySelector('.add-input');
    const title = inp.value.trim();
    if (!title) return;
    
    hideAdd(e);
    
    const currDay = new Date();
    const currDow = currDay.getDay() === 0 ? 6 : currDay.getDay() - 1;
    const startOfWeek = new Date(currDay); startOfWeek.setDate(currDay.getDate() - currDow);
    
    let due_date = null;
    if (status !== 'BACKLOG' && STATE.filterDay !== null) {
        const d = new Date(startOfWeek);
        d.setDate(d.getDate() + STATE.filterDay);
        due_date = d.toISOString();
    }

    try {
        const t = await api('/tasks', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ title, status, project: 'Inbox', due_date, progress: status==='IN_PROGRESS'?10:(status==='DONE'?100:0) })
        });
        STATE.tasks.push(t);
        renderDash();
    } catch(err) {}
}

async function toggleDone(e, id) {
    e.stopPropagation();
    const t = STATE.tasks.find(x=>x.id===id);
    const newStatus = t.status === 'DONE' ? 'TODO' : 'DONE';
    const oldStatus = t.status;
    t.status = newStatus;
    t.progress = newStatus === 'DONE' ? 100 : 0;
    renderDash();
    try {
        await api(`/tasks/${id}`, { method: 'PATCH', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({status: newStatus, progress: t.progress}) });
    } catch(err) {
        t.status = oldStatus; renderDash();
    }
}

async function delTask(e, id) {
    e.stopPropagation();
    const idx = STATE.tasks.findIndex(t=>t.id===id);
    const t = STATE.tasks[idx];
    STATE.deletedTaskBuffer = { ...t };
    STATE.tasks.splice(idx, 1);
    renderDash();
    
    showToast(`"${t.title}" deleted`, true);
    
    try {
        await api(`/tasks/${id}`, { method: 'DELETE' });
    } catch(err) {
        await fetchTasks();
    }
}

// Drag & Drop
let dragId = null;
function dragStart(e, id) {
    dragId = id;
    e.dataTransfer.effectAllowed = 'move';
    setTimeout(() => e.target.classList.add('dragging'), 0);
}
function allowDrop(e) {
    e.preventDefault();
    e.currentTarget.style.boxShadow = 'inset 0 0 0 2px #C8AAAA';
    e.currentTarget.style.background = '#F3E7E7';
}
function dragLeave(e) {
    if (!e.currentTarget.contains(e.relatedTarget)) {
        e.currentTarget.style.boxShadow = 'none';
        e.currentTarget.style.background = '#EFEBED';
    }
}
async function drop(e, status) {
    e.preventDefault();
    e.currentTarget.style.boxShadow = 'none';
    e.currentTarget.style.background = '#EFEBED';
    if (!dragId) return;

    const task = STATE.tasks.find(t=>t.id===dragId);
    if (!task || task.status === status) { dragId=null; return; }

    task.status = status;
    task.progress = status === 'DONE' ? 100 : (status === 'IN_PROGRESS' ? (task.progress||10) : 0);
    renderDash();

    try {
        await api(`/tasks/${dragId}`, { method: 'PATCH', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({status, progress: task.progress}) });
    } catch(err) {
        await fetchTasks();
    }
    dragId = null;
}

// Modal
const modal = document.getElementById('task-modal');
const backdrop = document.getElementById('modal-backdrop');
let currentModalTaskId = null;

function openModal(id) {
    const t = STATE.tasks.find(x=>x.id===id);
    if (!t) return;
    currentModalTaskId = id;
    
    document.getElementById('modal-status-label').textContent = STATUS[t.status].label;
    
    const badge = document.getElementById('modal-priority-badge');
    const p = P[t.priority] || P.MEDIUM;
    badge.textContent = p.label + ' priority';
    badge.style.background = p.bg;
    badge.style.color = p.text;

    const titleInp = document.getElementById('modal-title');
    titleInp.value = t.title;
    
    titleInp.onblur = async () => {
        const val = titleInp.value.trim();
        if(val && val !== t.title) {
            t.title = val; renderDash();
            await api(`/tasks/${id}`, { method: 'PATCH', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({title: val}) });
        }
    };

    document.getElementById('modal-project').textContent = t.project || 'Inbox';
    document.getElementById('modal-due').textContent = t.due_date ? new Date(t.due_date).toLocaleDateString('en-US', {weekday:'short', month:'short',day:'numeric'}) : 'No date';
    document.getElementById('modal-desc').textContent = t.description || 'No description provided.';
    
    // Subtasks
    const subC = document.getElementById('modal-subtasks-container');
    const subL = document.getElementById('modal-subtasks-list');
    if (t.subtasks && t.subtasks.length > 0) {
        subC.classList.remove('hidden');
        document.getElementById('modal-subtasks-count').textContent = `${t.subtasks.filter(s=>s.done).length} / ${t.subtasks.length}`;
        
        subL.innerHTML = t.subtasks.map(s => `
            <button onclick="toggleSubtask(${id}, ${s.id}, ${!s.done})" class="flex items-center gap-3 py-2.5 border-b border-[#F3EEF0] bg-transparent cursor-pointer text-left focus:outline-none">
                <span class="w-5 h-5 rounded-md flex-none flex items-center justify-center ${s.done ? 'bg-primary border-0' : 'bg-white border-[1.6px] border-light'}">
                    ${s.done ? '<span class="w-2 h-1 border-l-2 border-b-2 border-white transform -rotate-45 -translate-y-[1px] translate-x-[1px]"></span>' : ''}
                </span>
                <span class="text-sm ${s.done ? 'text-muted line-through' : 'text-primary'}">${escapeHtml(s.title)}</span>
            </button>
        `).join('');
    } else {
        subC.classList.add('hidden');
    }

    // Attachments
    const attC = document.getElementById('modal-attachments-container');
    const attL = document.getElementById('modal-attachments-list');
    if (t.attachments && t.attachments.length > 0) {
        attC.classList.remove('hidden');
        attL.innerHTML = t.attachments.map(a => `
            <div class="flex items-center gap-2 h-[38px] px-3.5 rounded-xl bg-[#F8F4F5] text-[13px] font-medium">
                <span class="w-2.5 h-3 rounded-sm border-[1.6px] border-muted"></span>
                ${escapeHtml(a.name)}
            </div>
        `).join('');
    } else {
        attC.classList.add('hidden');
    }

    document.getElementById('modal-delete').onclick = () => { closeModal(); delTask({stopPropagation:()=>{}}, id); };
    document.getElementById('modal-mark-done').onclick = async () => {
        closeModal();
        t.status = 'DONE'; t.progress = 100; renderDash();
        await api(`/tasks/${id}`, { method: 'PATCH', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({status: 'DONE', progress: 100}) });
    };
    document.getElementById('modal-mark-progress').onclick = async () => {
        closeModal();
        t.status = 'IN_PROGRESS'; t.progress = t.progress||10; renderDash();
        await api(`/tasks/${id}`, { method: 'PATCH', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({status: 'IN_PROGRESS', progress: t.progress}) });
    };

    backdrop.classList.remove('opacity-0', 'pointer-events-none');
    modal.classList.remove('translate-x-[calc(100%+24px)]');
}

function closeModal() {
    modal.classList.add('translate-x-[calc(100%+24px)]');
    backdrop.classList.add('opacity-0', 'pointer-events-none');
    currentModalTaskId = null;
}

document.getElementById('modal-close').onclick = closeModal;
backdrop.onclick = closeModal;

async function toggleSubtask(taskId, subId, done) {
    const t = STATE.tasks.find(x=>x.id===taskId);
    const sub = t.subtasks.find(s=>s.id===subId);
    sub.done = done;
    openModal(taskId); // re-render modal
    try {
        await api(`/subtasks/${subId}`, { method: 'PATCH', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({done}) });
    } catch(e) {
        sub.done = !done; openModal(taskId);
    }
}

// Calendar
function renderCalendar() {
    const currDay = new Date();
    const y = currDay.getFullYear();
    const m = currDay.getMonth();
    
    document.getElementById('calendar-month').textContent = currDay.toLocaleDateString('en-US', {month: 'long', year: 'numeric'});
    
    const firstDay = new Date(y, m, 1);
    let startDow = firstDay.getDay() - 1; if(startDow < 0) startDow = 6;
    
    const calGrid = document.getElementById('calendar-grid');
    let html = DOW.map(d => `<div class="text-[11px] font-semibold tracking-wider uppercase text-muted px-2 pb-1">${d}</div>`).join('');
    
    for(let i=0; i<35; i++) {
        const d = new Date(y, m, i - startDow + 1);
        const inMonth = d.getMonth() === m;
        const isToday = d.toDateString() === currDay.toDateString();
        const dateISO = d.toISOString().split('T')[0];
        
        const dayTasks = STATE.tasks.filter(t => t.due_date && t.due_date.startsWith(dateISO) && !['BACKLOG','CANCELED'].includes(t.status));
        
        const bg = isToday ? 'bg-primary text-white shadow-[0_8px_20px_rgba(87,73,100,0.25)]' : (inMonth ? 'bg-[#FAF7F8] text-primary' : 'bg-transparent text-light');
        
        const taskChips = dayTasks.slice(0,2).map(t => `<span class="text-[11px] font-medium px-1.5 py-0.5 rounded-md bg-accent text-primary whitespace-nowrap overflow-hidden text-ellipsis">${escapeHtml(t.title)}</span>`).join('');
        const more = dayTasks.length > 2 ? `<span class="text-[11px] text-muted">+${dayTasks.length-2} more</span>` : '';
        
        html += `
            <button onclick="navToDay('${dateISO}')" class="min-h-[92px] border-0 rounded-2xl p-2 flex flex-col gap-1 items-stretch text-left cursor-pointer transition-transform hover:-translate-y-0.5 ${bg}">
                <span class="text-[13px] font-bold">${d.getDate()}</span>
                ${taskChips}
                ${more}
            </button>
        `;
    }
    calGrid.innerHTML = html;
}

function navToDay(dateStr) {
    setView('dashboard');
    setFilterDay(getDayIndex(dateStr));
}

// Settings
function updateSettingsUI() {
    ['showWeek','compact','notif'].forEach(k => {
        const btn = document.getElementById('toggle-' + k);
        const knob = btn.firstElementChild;
        if (STATE.settings[k]) {
            btn.classList.replace('bg-[#E4DADC]', 'bg-primary');
            knob.classList.add('translate-x-5');
        } else {
            btn.classList.replace('bg-primary', 'bg-[#E4DADC]');
            knob.classList.remove('translate-x-5');
        }
    });
}

function toggleSetting(k) {
    STATE.settings[k] = !STATE.settings[k];
    localStorage.setItem('kb-settings', JSON.stringify(STATE.settings));
    updateSettingsUI();
    if(STATE.view === 'dashboard') renderDash();
}

['showWeek','compact','notif'].forEach(k => {
    document.getElementById('toggle-' + k).onclick = () => toggleSetting(k);
});

document.getElementById('btn-clear-done').onclick = async () => {
    try {
        await api('/tasks?status=DONE', { method: 'DELETE' });
        await fetchTasks();
    } catch(e) {}
};

document.getElementById('btn-reset-data').onclick = async () => {
    try {
        await api('/tasks?status=BACKLOG', { method: 'DELETE' });
        await api('/tasks?status=TODO', { method: 'DELETE' });
        await api('/tasks?status=IN_PROGRESS', { method: 'DELETE' });
        await api('/tasks?status=DONE', { method: 'DELETE' });
        await api('/seed', { method: 'POST' });
        await fetchTasks();
    } catch(e) {}
};

function escapeHtml(s) {
    return (s || '').replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

init();
