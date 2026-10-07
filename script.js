let plannedWorkouts = JSON.parse(localStorage.getItem('running_planned')) || [];
let importedWorkouts = JSON.parse(localStorage.getItem('running_imported')) || [];

let currentWeekOffset = 0;
let selectedDateStr = new Date().toISOString().split('T')[0];

window.onload = function() {
  document.getElementById('p-date').value = selectedDateStr;
  renderCalendarBar();
  selectCalendarDate(selectedDateStr);
  renderPlannedTable();
  renderImportedTable();
  updateDashboardKPIs();
  updateTodayTomorrowReminders();
  updateWeeklyRecaps();
};

function saveToLocalStorage() {
  localStorage.setItem('running_planned', JSON.stringify(plannedWorkouts));
  localStorage.setItem('running_imported', JSON.stringify(importedWorkouts));
}

function getMondayAndSunday(dateObj) {
  const d = new Date(dateObj);
  const day = d.getDay();
  const diffToMonday = d.getDate() - (day === 0 ? 6 : day - 1);
  const monday = new Date(d);
  monday.setDate(diffToMonday);
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);
  return { monday, sunday };
}

function filterByPeriod(rawDateStr, periodKey) {
  if (periodKey === 'ALL') return true;
  if (!rawDateStr) return false;

  const itemDate = new Date(rawDateStr);
  const today = new Date();

  if (periodKey === 'THIS_WEEK') {
    const { monday, sunday } = getMondayAndSunday(today);
    return itemDate >= monday && itemDate <= sunday;
  }

  if (periodKey === 'PREV_WEEK') {
    const prevWeekRef = new Date(today);
    prevWeekRef.setDate(today.getDate() - 7);
    const { monday, sunday } = getMondayAndSunday(prevWeekRef);
    return itemDate >= monday && itemDate <= sunday;
  }

  return true;
}

function addEmptyStep(desc = "", dist = "", pace = "") {
  const container = document.getElementById('steps-list');
  const stepId = 'step_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4);

  const div = document.createElement('div');
  div.className = 'step-row';
  div.id = stepId;
  div.innerHTML = `
    <input type="text" class="step-desc" placeholder="Es. 10x 300m rec 90s..." value="${desc}">
    <input type="text" class="step-dist" placeholder="Km / m" value="${dist}">
    <input type="text" class="step-pace" placeholder="Ritmo" value="${pace}">
    <button class="btn-remove-step" onclick="removeStep('${stepId}')"><i class="fa-solid fa-trash-can"></i></button>
  `;
  container.appendChild(div);
}

function addPresetStep(val) {
  if (!val) return;
  if (val.includes('@')) {
    const parts = val.split('@');
    addEmptyStep(parts[0].trim(), '', parts[1].trim());
  } else {
    addEmptyStep(val, '', '');
  }
}

function removeStep(stepId) {
  const el = document.getElementById(stepId);
  if (el) el.remove();
}

function getFormSteps() {
  const steps = [];
  document.querySelectorAll('.step-row').forEach(row => {
    const desc = row.querySelector('.step-desc').value.trim();
    const dist = row.querySelector('.step-dist').value.trim();
    const pace = row.querySelector('.step-pace').value.trim();
    if (desc || dist || pace) steps.push({ desc, dist, pace });
  });
  return steps;
}

function handleCategoryChange(cat) {
  const titleInput = document.getElementById('p-title');
  const paceInput = document.getElementById('p-pace');
  const distInput = document.getElementById('p-dist');

  if (cat === 'REST') {
    paceInput.value = '--';
    distInput.value = '0';
    document.getElementById('p-zone').value = 'REST';
    titleInput.value = 'Giorno di Riposo';
    document.getElementById('steps-list').innerHTML = '';
  } else if (cat !== 'PERSONALIZZATO' && titleInput.value === '') {
    if (cat === 'LENTO') titleInput.value = 'Corsa Lenta';
    else if (cat === 'MEDIO') titleInput.value = 'Corsa Media';
    else if (cat === 'PROGRESSIVO') titleInput.value = 'Progressivo';
    else if (cat === 'INTERVALS') titleInput.value = 'Ripetute';
    else if (cat === 'FARTLEK') titleInput.value = 'Fartlek';
    else if (cat === 'LUNGO') titleInput.value = 'Lungo';
  }
}

function changeWeek(offset) {
  currentWeekOffset += offset;
  renderCalendarBar();
  updateWeeklyRecaps();
}

function renderCalendarBar() {
  const bar = document.getElementById('calendar-bar');
  bar.innerHTML = '';

  const today = new Date();
  const currDay = today.getDay();
  const monday = new Date(today);
  monday.setDate(today.getDate() - (currDay === 0 ? 6 : currDay - 1) + (currentWeekOffset * 7));

  const daysName = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];

  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const isoDate = d.toISOString().split('T')[0];

    const btn = document.createElement('div');
    btn.className = `cal-day-btn ${isoDate === selectedDateStr ? 'active' : ''}`;
    btn.id = `cal-btn-${isoDate}`;
    btn.onclick = () => selectCalendarDate(isoDate);

    btn.innerHTML = `
      <div class="cal-day-name">${daysName[i]}</div>
      <div class="cal-day-num">${d.getDate()}</div>
    `;
    bar.appendChild(btn);
  }
}

function selectCalendarDate(dateStr) {
  selectedDateStr = dateStr;
  document.querySelectorAll('.cal-day-btn').forEach(b => b.classList.remove('active'));
  const activeBtn = document.getElementById(`cal-btn-${dateStr}`);
  if (activeBtn) activeBtn.classList.add('active');

  document.getElementById('p-date').value = dateStr;
  updateSelectedDayCard();
  updatePreviousWeekReferenceCard();
}

function updateSelectedDayCard() {
  const formattedDate = new Date(selectedDateStr).toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'short' });
  document.getElementById('selected-day-label').innerHTML = `<span class="card-title-text"><i class="fa-solid fa-calendar-day"></i> Corsa ${formattedDate}</span>`;

  const gpx = importedWorkouts.find(w => w.rawDate === selectedDateStr);
  const plan = plannedWorkouts.find(w => w.rawDate === selectedDateStr);

  if (gpx) {
    document.getElementById('day-title').textContent = `${gpx.title} (Reale)`;
    document.getElementById('day-dist').textContent = `${gpx.dist} km`;
    document.getElementById('day-pace').textContent = `${gpx.pace} min/km`;
    document.getElementById('day-zone').textContent = gpx.hr ? `${gpx.hr} bpm` : "--";
    document.getElementById('day-badge').textContent = "Completato GPX";
    document.getElementById('day-badge').className = "badge z2";
  } else if (plan) {
    document.getElementById('day-title').textContent = plan.title;
    document.getElementById('day-dist').textContent = plan.dist > 0 ? `${plan.dist} km` : "0 km";
    document.getElementById('day-pace').textContent = plan.pace;
    document.getElementById('day-zone').textContent = plan.zone;
    document.getElementById('day-badge').textContent = plan.status;
    document.getElementById('day-badge').className = `badge ${plan.status === 'Completato' ? 'z2' : 'z3'}`;
  } else {
    document.getElementById('day-title').textContent = "Nessun allenamento";
    document.getElementById('day-dist').textContent = "-- km";
    document.getElementById('day-pace').textContent = "-- min/km";
    document.getElementById('day-zone').textContent = "--";
    document.getElementById('day-badge').textContent = "Non Impostato";
    document.getElementById('day-badge').className = "badge z-rest";
  }
}

function updateTodayTomorrowReminders() {
  const todayISO = new Date().toISOString().split('T')[0];
  const gpxToday = importedWorkouts.find(w => w.rawDate === todayISO);
  const planToday = plannedWorkouts.find(w => w.rawDate === todayISO);

  if (gpxToday) {
    document.getElementById('today-reminder-title').textContent = `${gpxToday.title}`;
    document.getElementById('today-reminder-detail').textContent = `Completata! ${gpxToday.dist} km @ ${gpxToday.pace}`;
  } else if (planToday) {
    document.getElementById('today-reminder-title').textContent = planToday.title;
    document.getElementById('today-reminder-detail').textContent = `${planToday.dist > 0 ? planToday.dist + ' km' : ''}`;
  } else {
    document.getElementById('today-reminder-title').textContent = "Nessun impegno";
    document.getElementById('today-reminder-detail').textContent = "Nessuna corsa programmata oggi";
  }
}

function updateWeeklyRecaps() {
  const today = new Date();
  const currDay = today.getDay();
  const mondayCW = new Date(today);
  mondayCW.setDate(today.getDate() - (currDay === 0 ? 6 : currDay - 1) + (currentWeekOffset * 7));
  mondayCW.setHours(0,0,0,0);

  const sundayCW = new Date(mondayCW);
  sundayCW.setDate(mondayCW.getDate() + 6);
  sundayCW.setHours(23,59,59,999);

  let totalKm = 0, count = 0;
  importedWorkouts.forEach(w => {
    if (!w.rawDate) return;
    const d = new Date(w.rawDate + 'T12:00:00');
    if (d >= mondayCW && d <= sundayCW) {
      totalKm += parseFloat(w.dist) || 0;
      count++;
    }
  });

  document.getElementById('cw-km').textContent = `${totalKm.toFixed(2)} km`;
  document.getElementById('cw-details').textContent = `${count} attività svolte`;
}

function updatePreviousWeekReferenceCard() {}

function scheduleWorkout() {
  const date = document.getElementById('p-date').value;
  const title = document.getElementById('p-title').value || "Allenamento Manuale";
  const dist = parseFloat(document.getElementById('p-dist').value) || 0;
  const pace = document.getElementById('p-pace').value || "5:00";

  if (!date) return alert("Seleziona una data.");

  plannedWorkouts.push({
    id: Date.now(),
    dateStr: new Date(date).toLocaleDateString('it-IT'),
    rawDate: date,
    title: title,
    dist: dist,
    pace: pace,
    status: "In Attesa"
  });

  saveToLocalStorage();
  renderPlannedTable();
  selectCalendarDate(date);
}

function renderPlannedTable() {
  const tbody = document.getElementById('planned-history');
  tbody.innerHTML = '';
  plannedWorkouts.forEach(w => {
    tbody.innerHTML += `<tr><td><input type="checkbox"></td><td>${w.dateStr}</td><td>${w.title}</td><td>--</td><td>${w.dist} km</td><td>${w.pace}</td><td>${w.status}</td><td class="text-center"><button onclick="deletePlanned(${w.id})"><i class="fa-solid fa-trash-can" style="color:var(--red)"></i></button></td></tr>`;
  });
}

function renderImportedTable() {
  const tbody = document.getElementById('imported-history');
  tbody.innerHTML = '';
  importedWorkouts.forEach(w => {
    tbody.innerHTML += `<tr><td><input type="checkbox"></td><td>${w.dateStr}</td><td>${w.title}</td><td>${w.dist} km</td><td>${w.duration}</td><td>${w.pace}</td><td>${w.hr || '--'}</td></tr>`;
  });
}

function updateDashboardKPIs() {
  const totalKm = importedWorkouts.reduce((sum, w) => sum + (parseFloat(w.dist) || 0), 0);
  document.getElementById('kpi-dist').textContent = `${totalKm.toFixed(2)} km`;
  document.getElementById('kpi-count').textContent = importedWorkouts.length;
}

function deletePlanned(id) {
  plannedWorkouts = plannedWorkouts.filter(w => w.id !== id);
  saveToLocalStorage();
  renderPlannedTable();
}