// Credenziali Supabase
const SUPABASE_URL = 'https://hakwysrhwddqqgernlxk.supabase.co';
const SUPABASE_KEY = 'sb_publishable_Drp2V_Sb-IHHxoMOPeetBQ_rXPwFQ93';

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let plannedWorkouts = [];
let importedWorkouts = [];

let currentWeekOffset = 0;
let selectedDateStr = new Date().toISOString().split('T')[0];

window.onload = async function() {
    document.getElementById('p-date').value = selectedDateStr;
    await fetchAllData();
};

// Carica tutti i dati da Supabase
async function fetchAllData() {
    try {
        const { data: planned, error: pErr } = await supabaseClient
            .from('planned_workouts')
            .select('*');
        if (pErr) console.error("Errore caricamento planned:", pErr);
        else plannedWorkouts = planned || [];

        const { data: imported, error: iErr } = await supabaseClient
            .from('imported_workouts')
            .select('*');
        if (iErr) console.error("Errore caricamento imported:", iErr);
        else importedWorkouts = imported || [];

        refreshUI();
    } catch (err) {
        console.error("Errore di rete/Supabase:", err);
    }
}

function refreshUI() {
    renderCalendarBar();
    selectCalendarDate(selectedDateStr);
    renderPlannedTable();
    renderImportedTable();
    updateDashboardKPIs();
    updateTodayTomorrowReminders();
    updateWeeklyRecaps();
}

// Salva allenamento programmato su Supabase
async function addPlannedWorkout(workoutData) {
    const { data, error } = await supabaseClient
        .from('planned_workouts')
        .insert([workoutData])
        .select();
    if (error) {
        alert("Errore nel salvataggio su Supabase: " + error.message);
    } else {
        await fetchAllData();
    }
}

// Salva allenamento GPX importato su Supabase
async function addImportedWorkout(workoutData) {
    const { data, error } = await supabaseClient
        .from('imported_workouts')
        .insert([workoutData])
        .select();
    if (error) {
        alert("Errore nel salvataggio GPX su Supabase: " + error.message);
    } else {
        await fetchAllData();
    }
}

// Elimina allenamento programmato
async function deletePlannedWorkout(id) {
    const { error } = await supabaseClient
        .from('planned_workouts')
        .delete()
        .eq('id', id);
    if (error) {
        alert("Errore nell'eliminazione: " + error.message);
    } else {
        await fetchAllData();
    }
}

// Elimina allenamento importato
async function deleteImportedWorkout(id) {
    const { error } = await supabaseClient
        .from('imported_workouts')
        .delete()
        .eq('id', id);
    if (error) {
        alert("Errore nell'eliminazione: " + error.message);
    } else {
        await fetchAllData();
    }
}
