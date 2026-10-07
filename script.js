const SUPABASE_URL = 'https://hakwysrhwddqqgernlxk.supabase.co';
const SUPABASE_KEY = 'sb_publishable_Drp2V_Sb-IHHxoMOPeetBQ_rXPwFQ93';
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let currentUser = 'Maria';

const templatesData = {
    fondo_lento: {
        title: "Fondo Lento 50'",
        fields: { "Riscaldamento": "Tempo 5:00", "Corsa / Lavoro": "Tempo 40:00", "ZF – Zona frequenza": "Zona 2", "Defaticamento": "Tempo 5:00" },
        notes: "Costruisce la base aerobica e ti fa recuperare dalle sedute dure."
    },
    lungo: {
        title: "Lungo 95' Finale MM",
        fields: { "Riscaldamento": "Tempo 10:00", "Corsa / Lavoro": "Tempo 65:00", "ZF – Zona frequenza": "Zona 2", "Ripetizioni": "Tempo 15:00", "Pace": "5:15–5:25 /km", "Defaticamento": "Tempo 5:00" },
        notes: "Insegna al corpo a usare i grassi ed evita il muro."
    },
    rip_brevi: {
        title: "Ripetute Brevi – 10 × 400 M",
        fields: { "Riscaldamento": "Tempo 15:00", "Ripetizioni": "10 × 400 m", "Corsa / Lavoro": "Distanza 400m", "Pace": "4:40–4:50 /km", "Recupero": "Tempo 1:30", "Defaticamento": "Tempo 10:00" },
        notes: "Aumenta il VO2max e la velocità di punta."
    },
    rip_lunghe: {
        title: "Ripetute Lunghe – 5 × 1000 M",
        fields: { "Riscaldamento": "Tempo 15:00", "Ripetizioni": "5 × 1000 m", "Corsa / Lavoro": "Distanza 1 km", "Pace": "4:55–5:05 /km", "Recupero": "Tempo 2:00", "Defaticamento": "Tempo 10:00" },
        notes: "Allenamento specifico per 10 km e mezza maratona."
    },
    tempo_run: {
        title: "Tempo Run (Soglia) – 3 × 10'",
        fields: { "Riscaldamento": "Tempo 15:00", "Ripetizioni": "3 × 10'", "Corsa / Lavoro": "Tempo 10:00", "Pace": "5:05–5:10 /km", "Recupero": "Tempo 2:00", "Defaticamento": "Tempo 10:00" },
        notes: "Alza la soglia anaerobica."
    },
    fartlek: {
        title: "Fartlek – 10 × (1' + 1')",
        fields: { "Riscaldamento": "Tempo 15:00", "Ripetizioni": "10 × (1' + 1')", "Corsa / Lavoro": "Tempo 1:00", "Recupero": "Tempo 1:00", "Defaticamento": "Tempo 10:00" },
        notes: "Allena i cambi di ritmo e il recupero in corsa."
    },
    salita: {
        title: "Ripetute In Salita – 8 × 75\"",
        fields: { "Riscaldamento": "Tempo 15:00", "Ripetizioni": "8 × 75\"", "Corsa / Lavoro": "Tempo 1:15", "Defaticamento": "Tempo 10:00" },
        notes: "Forza specifica per glutei e polpacci."
    }
};

let allPlannedWorkouts = [];
let allImportedWorkouts = [];

let currentWeekOffset = 0;
let selectedDateStr = new Date().toISOString().split('T')[0];

window.onload = async function() {
    await fetchAllData();
};

async function fetchAllData() {
    const { data: planned } = await supabaseClient.from('planned_workouts').select('*');
    const { data: imported } = await supabaseClient.from('imported_workouts').select('*');
    
    allPlannedWorkouts = planned || [];
    allImportedWorkouts = imported || [];
    
    if (allPlannedWorkouts.length === 0) {
        await seedDefaultWorkouts();
    } else {
        renderApp();
    }
}

async function seedDefaultWorkouts() {
    const startOfWeek = getStartOfWeek(0);
    const keys = Object.keys(templatesData);
    
    for (let i = 0; i < 7; i++) {
        const d = new Date(startOfWeek);
        d.setDate(d.getDate() + i);
        const dateStr = d.toISOString().split('T')[0];
        const templateKey = keys[i % keys.length];
        const t = templatesData[templateKey];

        const payload = {
            user_id: 'Maria',
            date: dateStr,
            workout_type: t.title,
            title: t.title,
            custom_fields: t.fields,
            notes: t.notes
        };
        await supabaseClient.from('planned_workouts').insert([payload]);
    }

    const { data: planned } = await supabaseClient.from('planned_workouts').select('*');
    allPlannedWorkouts = planned || [];
    renderApp();
}

function switchUser(newUser) {
    currentUser = newUser;
    renderApp();
}

function switchTab(tabName, btn) {
    document.querySelectorAll('.tab-page').forEach(page => page.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
    
    document.getElementById('tab-' + tabName).classList.add('active');
    btn.classList.add('active');
}

function changeWeek(direction) {
    currentWeekOffset += direction;
    renderApp();
}

function getStartOfWeek(offset = 0) {
    const d = new Date();
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(d.setDate(diff));
    monday.setDate(monday.getDate() + (offset * 7));
    return monday;
}

function renderApp() {
    const startOfWeek = getStartOfWeek(currentWeekOffset);
    const datesOfWeek = [];
    for (let i = 0; i < 7; i++) {
        const date = new Date(startOfWeek);
        date.setDate(date.getDate() + i);
        datesOfWeek.push(date.toISOString().split('T')[0]);
    }

    const userPlanned = allPlannedWorkouts.filter(w => w.user_id === currentUser);
    const userImported = allImportedWorkouts.filter(w => w.user_id === currentUser);

    renderWeekCalendarPills(datesOfWeek);
    renderDayDetails(selectedDateStr, userPlanned, userImported);
    updateWeeklyStats(datesOfWeek, userPlanned, userImported);
    renderRecapTab(datesOfWeek, userPlanned, userImported);
}

function renderWeekCalendarPills(datesOfWeek) {
    const bar = document.getElementById('week-calendar-bar');
    if (!bar) return;

    const daysName = ['LUN', 'MAR', 'MER', 'GIO', 'VEN', 'SAB', 'DOM'];
    let html = '';

    datesOfWeek.forEach((dateStr, idx) => {
        const isSelected = dateStr === selectedDateStr;
        const hasImported = allImportedWorkouts.some(w => w.user_id === currentUser && w.date === dateStr);
        const dayNum = dateStr.split('-')[2];

        html += `
            <div class="day-pill-square ${isSelected ? 'active' : ''}" onclick="selectDate('${dateStr}')">
                <span class="day-name">${daysName[idx]}</span>
                <span class="day-num">${dayNum}</span>
                ${hasImported ? '<i class="fa-solid fa-circle-check check-icon"></i>' : ''}
            </div>
        `;
    });

    bar.innerHTML = html;

    const firstDate = new Date(datesOfWeek[0]);
    const monthNames = ["Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno", "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre"];
    document.getElementById('current-month-label').innerText = `${monthNames[firstDate.getMonth()]}, ${firstDate.getFullYear()}`;
    
    const selDateObj = new Date(selectedDateStr);
    const options = { weekday: 'long', day: 'numeric', month: 'long' };
    document.getElementById('selected-day-full-date').innerText = selDateObj.toLocaleDateString('it-IT', options);
}

function selectDate(dateStr) {
    selectedDateStr = dateStr;
    renderApp();
}

function renderDayDetails(dateStr, planned, imported) {
    const container = document.getElementById('day-workout-details');
    const dayPlanned = planned.filter(w => w.date === dateStr);
    const dayImported = imported.filter(w => w.date === dateStr);

    let html = '';

    if (dayImported.length > 0) {
        dayImported.forEach(imp => {
            const statusClass = imp.status === 'to-fix' ? 'tag-to-fix' : (imp.status === 'in-progress' ? 'tag-in-progress' : 'tag-done');
            const statusLabel = imp.status === 'to-fix' ? 'non fatto' : (imp.status === 'in-progress' ? 'spostato' : 'fatto');
            html += `
                <div class="main-workout-card" style="border-color: var(--green);">
                    <div class="workout-type-header" style="color: var(--green);">
                        <span><i class="fa-solid fa-circle-check"></i> Esecuzione Registrata</span>
                        <span class="tag-pill ${statusClass}">${statusLabel}</span>
                    </div>
                    <div class="workout-inner-box">
                        <strong>${imp.dist} km - ${imp.hr_zone || 'Z2'}</strong>
                    </div>
                    <p style="font-weight:bold; margin-bottom:5px;">${imp.title}</p>
                    ${imp.notes ? `<div class="workout-notes-box">📝 Note: ${imp.notes}</div>` : ''}
                    <button class="btn-full-workout" onclick="deleteImportedWorkout('${imp.id}')">Elimina Esecuzione</button>
                </div>
            `;
        });
    }

    if (dayPlanned.length > 0) {
        dayPlanned.forEach(p => {
            let fieldsHtml = '';
            if (p.custom_fields) {
                for (const [k, v] of Object.entries(p.custom_fields)) {
                    fieldsHtml += `<div style="font-size:0.85rem; margin-bottom:4px; display:flex; justify-content:space-between;"><strong>${k}:</strong> <span>${v}</span></div>`;
                }
            }

            html += `
                <div class="main-workout-card">
                    <div class="workout-type-header">
                        <span><i class="fa-solid fa-person-running"></i> ${p.workout_type || 'Corsa'}</span>
                    </div>
                    
                    <div class="workout-inner-box">
                        <div style="font-weight:bold; font-size:1.05rem; margin-bottom:6px; color:#121214;">${p.title}</div>
                        ${fieldsHtml}
                    </div>

                    ${p.notes ? `<div class="workout-notes-box">📝 ${p.notes}</div>` : ''}

                    <button class="btn-full-workout" onclick="openPlanModal('${p.id}')">Modifica Allenamento →</button>
                    <button class="btn-full-workout" style="margin-top:5px; border-color:var(--green); color:var(--green);" onclick="openUploadModal('${p.id}', '${p.title}')">+ Inserisci Risultato / GPX / Stato</button>
                </div>
            `;
        });
    }

    if (dayPlanned.length === 0 && dayImported.length === 0) {
        html = `
            <div style="text-align:center; padding:30px 10px;">
                <p style="color:var(--text-muted); margin-bottom:15px;">Nessun allenamento programmato per questa data.</p>
                <button class="btn-action-cta btn-add-green" onclick="openPlanModal()">+ Aggiungi Allenamento</button>
            </div>
        `;
    }

    container.innerHTML = html;
}

function updateWeeklyStats(datesOfWeek, planned, imported) {
    const weekImported = imported.filter(w => datesOfWeek.includes(w.date));
    const totalKmDone = weekImported.reduce((sum, w) => sum + (parseFloat(w.dist) || 0), 0);
    const weekPlanned = planned.filter(w => datesOfWeek.includes(w.date));
    
    const dynamicTarget = weekPlanned.length > 0 ? (weekPlanned.length * 8.0) : 30;

    document.getElementById('goal-km-display').innerText = `${totalKmDone.toFixed(1)} / ${dynamicTarget.toFixed(1)} km`;

    const ring = document.getElementById('goal-progress-ring');
    if (ring) {
        const circumference = 2 * Math.PI * 32;
        const percent = Math.min(totalKmDone / dynamicTarget, 1);
        const offset = circumference - (percent * circumference);
        ring.style.strokeDasharray = `${circumference} ${circumference}`;
        ring.style.strokeDashoffset = offset;
    }

    const countdownEl = document.getElementById('countdown-val');
    if (weekPlanned.length > 0) {
        countdownEl.innerText = weekPlanned[0].title;
    } else {
        countdownEl.innerText = "Nessun obiettivo";
    }
}

function renderRecapTab(datesOfWeek, planned, imported) {
    const weekImported = imported.filter(w => datesOfWeek.includes(w.date));
    const weekPlanned = planned.filter(w => datesOfWeek.includes(w.date));
    const totalExecuted = weekImported.reduce((sum, w) => sum + (parseFloat(w.dist) || 0), 0);

    document.getElementById('recap-planned-km').innerText = `${weekPlanned.length} sessioni`;
    document.getElementById('recap-executed-km').innerText = `${totalExecuted.toFixed(1)} km`;
    document.getElementById('recap-sessions-count').innerText = `${weekImported.length} / ${weekPlanned.length}`;

    const pastContainer = document.getElementById('past-imported-list');
    if (imported.length > 0) {
        let html = '';
        imported.forEach(imp => {
            html += `
                <div style="background:var(--card-inner); padding:10px; border-radius:8px; margin-bottom:8px; display:flex; justify-content:space-between; align-items:center; border: 1px solid var(--border-color);">
                    <div>
                        <strong>🏃 ${imp.title}</strong>
                        <small style="display:block; color:var(--text-muted);">${imp.date}</small>
                    </div>
                    <span style="color:var(--green); font-weight:bold;">${imp.dist} km</span>
                </div>
            `;
        });
        pastContainer.innerHTML = html;
    } else {
        pastContainer.innerHTML = '<p style="color:var(--text-muted)">Nessuna corsa salvata nello storico.</p>';
    }
}

// GESTIONE COSTRUTTORE COMPATTO IN REAL-TIME
function renderBuilder(fields = {}) {
    const container = document.getElementById('active-builder-blocks');
    container.innerHTML = '';

    for (const [key, val] of Object.entries(fields)) {
        appendBuilderRow(key, val);
    }
}

function addBuilderBlock(keyName, defaultVal = '') {
    appendBuilderRow(keyName, defaultVal);
}

function appendBuilderRow(keyName, val) {
    const container = document.getElementById('active-builder-blocks');
    const div = document.createElement('div');
    div.className = 'builder-active-row';
    div.innerHTML = `
        <span class="builder-active-label">${keyName}</span>
        <input type="text" class="builder-active-input" data-key="${keyName}" value="${val}" placeholder="Valore...">
        <button type="button" class="btn-circle-red" onclick="this.parentElement.remove()"><i class="fa-solid fa-minus"></i></button>
    `;
    container.appendChild(div);
}

function handleTemplateSelect(val) {
    if (!val || val === 'CUSTOM') return;
    const t = templatesData[val];
    if (!t) return;

    document.getElementById('plan-title').value = t.title;
    document.getElementById('plan-notes').value = t.notes || '';
    renderBuilder(t.fields);
}

// CALCOLATRICE PACE
function calculatePace() {
    const distInput = document.getElementById('calc-dist').value.trim();
    const timeInput = document.getElementById('calc-time').value.trim();
    
    const dist = parseFloat(distInput);
    if (!dist || dist <= 0 || !timeInput) return;

    let seconds = 0;
    if (timeInput.includes(':')) {
        const parts = timeInput.split(':').map(Number);
        if (parts.length === 3) seconds = parts[0]*3600 + parts[1]*60 + parts[2];
        else if (parts.length === 2) seconds = parts[0]*60 + parts[1];
    } else {
        seconds = parseFloat(timeInput) * 60;
    }

    if (isNaN(seconds) || seconds <= 0) return;

    const secPerKm = seconds / dist;
    const min = Math.floor(secPerKm / 60);
    const sec = Math.round(secPerKm % 60);
    const paceStr = `${min}:${sec < 10 ? '0' : ''}${sec} min/km`;

    document.getElementById('res-dist-display').innerText = `${dist.toFixed(2)} KM`;
    document.getElementById('res-time-display').innerText = timeInput.includes(':') ? timeInput : `${timeInput}:00`;
    document.getElementById('calc-pace-output').innerText = paceStr;
}

function resetCalculator() {
    document.getElementById('calc-dist').value = '';
    document.getElementById('calc-time').value = '';
    document.getElementById('res-dist-display').innerText = '-- KM';
    document.getElementById('res-time-display').innerText = '--:--';
    document.getElementById('calc-pace-output').innerText = '0:00 min/km';
}

function openPlanModal(id = null) {
    document.getElementById('plan-modal').style.display = 'block';
    document.getElementById('btn-delete-plan').style.display = id ? 'inline-block' : 'none';

    if (id) {
        document.getElementById('modal-plan-title').innerText = "Modifica Allenamento";
        const item = allPlannedWorkouts.find(w => w.id == id);
        if (item) {
            document.getElementById('plan-id').value = item.id;
            document.getElementById('plan-date').value = item.date || selectedDateStr;
            document.getElementById('plan-title').value = item.title || '';
            document.getElementById('plan-notes').value = item.notes || '';
            renderBuilder(item.custom_fields || {});
        }
    } else {
        document.getElementById('modal-plan-title').innerText = "Nuovo Allenamento";
        document.getElementById('plan-form').reset();
        document.getElementById('plan-id').value = '';
        document.getElementById('plan-date').value = selectedDateStr;
        document.getElementById('workout-template-select').value = '';
        renderBuilder({ "Riscaldamento": "Tempo 5:00", "Corsa / Lavoro": "Tempo 30:00" });
    }
}

function closePlanModal() { document.getElementById('plan-modal').style.display = 'none'; }

function openUploadModal(planId = null, defaultTitle = '') {
    const modal = document.getElementById('upload-modal');
    document.getElementById('execution-form').reset();
    document.getElementById('exec-date').value = selectedDateStr;
    if (defaultTitle) document.getElementById('exec-title').value = defaultTitle;
    document.getElementById('exec-plan-id').value = planId || '';
    modal.style.display = 'block';
}

function closeUploadModal() { document.getElementById('upload-modal').style.display = 'none'; }

function parseGPXFile(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(e.target.result, "text/xml");
        const trkpts = xmlDoc.getElementsByTagName("trkpt");
        let totalDist = 0;

        for (let i = 0; i < trkpts.length - 1; i++) {
            const lat1 = parseFloat(trkpts[i].getAttribute("lat"));
            const lon1 = parseFloat(trkpts[i].getAttribute("lon"));
            const lat2 = parseFloat(trkpts[i + 1].getAttribute("lat"));
            const lon2 = parseFloat(trkpts[i + 1].getAttribute("lon"));
            totalDist += calcHaversineDistance(lat1, lon1, lat2, lon2);
        }

        const distKm = (totalDist / 1000).toFixed(2);
        document.getElementById('exec-title').value = file.name.replace('.gpx', '');
        document.getElementById('exec-dist').value = distKm;
    };
    reader.readAsText(file);
}

function calcHaversineDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3;
    const r1 = lat1 * Math.PI / 180, r2 = lat2 * Math.PI / 180;
    const dR = (lat2 - lat1) * Math.PI / 180, dL = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dR/2)*Math.sin(dR/2) + Math.cos(r1)*Math.cos(r2)*Math.sin(dL/2)*Math.sin(dL/2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function savePlannedWorkout(e) {
    e.preventDefault();
    const id = document.getElementById('plan-id').value;
    
    const customFields = {};
    document.querySelectorAll('.builder-active-row').forEach(row => {
        const key = row.querySelector('.builder-active-label').innerText.trim();
        const val = row.querySelector('.builder-active-input').value.trim();
        if (key && val) customFields[key] = val;
    });

    const payload = {
        user_id: currentUser,
        date: document.getElementById('plan-date').value,
        workout_type: document.getElementById('plan-title').value,
        title: document.getElementById('plan-title').value,
        custom_fields: customFields,
        notes: document.getElementById('plan-notes').value.trim() || null
    };

    if (id) {
        await supabaseClient.from('planned_workouts').update(payload).eq('id', id);
    } else {
        await supabaseClient.from('planned_workouts').insert([payload]);
    }

    closePlanModal();
    await fetchAllData();
}

async function saveExecutionWorkout(e) {
    e.preventDefault();
    const planId = document.getElementById('exec-plan-id').value;
    const newDate = document.getElementById('exec-date').value;
    const status = document.getElementById('exec-status').value;

    const payload = {
        user_id: currentUser,
        date: newDate,
        title: document.getElementById('exec-title').value,
        dist: parseFloat(document.getElementById('exec-dist').value) || 0,
        hr_zone: document.getElementById('exec-hr').value,
        status: status,
        notes: document.getElementById('exec-notes').value
    };

    await supabaseClient.from('imported_workouts').insert([payload]);

    if (planId && newDate !== selectedDateStr) {
        await supabaseClient.from('planned_workouts').update({ date: newDate }).eq('id', planId);
    }

    closeUploadModal();
    await fetchAllData();
}

async function deletePlannedWorkout() {
    const id = document.getElementById('plan-id').value;
    if (id && confirm("Eliminare questo allenamento?")) {
        await supabaseClient.from('planned_workouts').delete().eq('id', id);
        closePlanModal();
        await fetchAllData();
    }
}

async function deleteImportedWorkout(id) {
    if (confirm("Eliminare questa esecuzione?")) {
        await supabaseClient.from('imported_workouts').delete().eq('id', id);
        await fetchAllData();
    }
}
