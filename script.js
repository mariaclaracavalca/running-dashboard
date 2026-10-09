/* =====================================================================
   RUNNING DASHBOARD – script.js
   ===================================================================== */

const SUPABASE_URL = 'https://hakwysrhwddqgqernlxk.supabase.co';
const SUPABASE_KEY = 'sb_publishable_Drp2V_Sb-IHHxoMOPeetBQ_rXPwFQ93';
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let currentUser = 'Maria';

// true  = il totale km della settimana compare solo quando tutti i 7 giorni hanno un allenamento pianificato
// false = il totale si aggiorna man mano che aggiungi allenamenti
const REQUIRE_FULL_WEEK = true;

/* ---------------------------------------------------------------------
   TIPI DI PASSO
   --------------------------------------------------------------------- */

const STEP_TYPES = {
    warmup:   { label: 'Riscaldamento',  icon: 'fa-fire',           color: 'var(--warm)',    plain: 'min' },
    work:     { label: 'Esercizio',      icon: 'fa-person-running', color: 'var(--pink)',   plain: 'min' },
    recovery: { label: 'Recupero',       icon: 'fa-rotate',         color: 'var(--rest)',   plain: 'sec' },
    rest:     { label: 'Riposo',         icon: 'fa-pause',          color: 'var(--rest)',   plain: 'sec' },
    cooldown: { label: 'Defaticamento',  icon: 'fa-snowflake',      color: 'var(--ice)',    plain: 'min' },
    repeat:   { label: 'Ripetizioni',    icon: 'fa-repeat',         color: 'var(--pink)' }
};

const PILL_TO_TYPE = {
    'Riscaldamento': 'warmup', 'Corsa / Lavoro': 'work', 'Corsa': 'work', 'Esercizio': 'work', 'Recupero': 'recovery',
    'Riposo': 'rest', 'Defaticamento': 'cooldown', 'Ripetizioni': 'repeat'
};

const STATUS = {
    'done':        { label: 'Fatto',    tag: 'tag-done',        color: 'var(--green)', icon: 'fa-circle-check', title: 'Esecuzione registrata' },
    'to-fix':      { label: 'Saltato',  tag: 'tag-to-fix',      color: 'var(--red)',   icon: 'fa-circle-xmark', title: 'Allenamento saltato' },
    'in-progress': { label: 'Spostato', tag: 'tag-in-progress', color: 'var(--blue)',  icon: 'fa-circle-right', title: 'Allenamento spostato' }
};

/* ---------------------------------------------------------------------
   MODELLI (struttura a passi: i km e i tempi vengono calcolati)
   Pace di riferimento: facile 6:20, lento 6:00–6:30, soglia ~5:05
   --------------------------------------------------------------------- */

const S = (type, o = {}) => ({ type, mode: o.dist != null ? 'dist' : 'time', dist_km: o.dist ?? null, time_s: o.time ?? null, pace_lo: o.pace ?? null, pace_hi: o.paceHi ?? null, zone: o.zone || '' });
const R = (reps, steps) => ({ type: 'repeat', reps, steps });
const P = s => { const [m, x] = s.split(':').map(Number); return m * 60 + x; };

// Tipi di corsa preimpostati (le sigle sono quelle usate nel menu "Tipo di corsa")
const templatesData = {
    cl: {
        title: "Corsa lenta",
        steps: [S('warmup', { time: 300, pace: P('6:30'), zone: 'Z1' }), S('work', { time: 2400, pace: P('6:00'), zone: 'Z2' }), S('cooldown', { time: 300, pace: P('6:30'), zone: 'Z1' })],
        notes: "Costruisce la base aerobica e ti fa recuperare dalle corse intense."
    },
    cr: {
        title: "Corsa di recupero",
        steps: [S('work', { time: 1800, pace: P('6:30'), paceHi: P('6:50'), zone: 'Z1' })],
        notes: "Rigenerante: il giorno dopo una corsa intensa, molto lenta, deve sembrare facilissima."
    },
    fl: {
        title: "Corsa lunga",
        steps: [S('warmup', { dist: 1, pace: P('6:30'), zone: 'Z1' }), S('work', { dist: 14, pace: P('6:15'), paceHi: P('6:30'), zone: 'Z2' }), S('cooldown', { dist: 1, pace: P('6:30'), zone: 'Z1' })],
        notes: "Resistenza: tutto in Zona 2, ritmo comodo."
    },
    fr: {
        title: "Corsa cambio ritmo (Fartlek)",
        steps: [S('warmup', { time: 900, pace: P('6:20'), zone: 'Z2' }), R(10, [S('work', { time: 60, pace: P('4:50'), paceHi: P('5:00'), zone: 'Z4' }), S('recovery', { time: 60, pace: P('6:00'), paceHi: P('6:30'), zone: 'Z2' })]), S('cooldown', { time: 600, pace: P('6:30'), zone: 'Z1' })],
        notes: "Allena i cambi di ritmo e il recupero in corsa."
    },
    it: {
        // Come la ripetuta di martedì: 2 km a 6' 20", 10 × 300 m in Z5 con 90" di recupero, 1 km a 5' 20", 2 km a 6' 20"
        title: "Corsa ripetuta",
        steps: [
            S('warmup', { dist: 2, pace: P('6:20') }),
            R(10, [S('work', { dist: 0.3, zone: 'Z5' }), S('recovery', { time: 90 })]),
            S('work', { dist: 1, pace: P('5:20') }),
            S('cooldown', { dist: 2, pace: P('6:20') })
        ],
        notes: "Velocità sulle ripetute in Z5, poi 1 km a ritmo sostenuto."
    },
    riposo: {
        title: "Riposo",
        steps: [],
        notes: ""
    },
    libera: {
        title: "Corsa libera",
        steps: [{ type: 'work', mode: 'open', dist_km: null, time_s: null, pace_lo: null, pace_hi: null, zone: '' }],
        notes: ""
    }
};

let allPlannedWorkouts = [];
let allImportedWorkouts = [];
let currentWeekOffset = 0;
let selectedDateStr = toLocalISO(new Date());
let recapFilter = { status: 'all', weeks: 4 };
let gpxData = null; // dati letti dal GPX in corso di inserimento
let allGoals = [];            // gare in programma e record personali
let goalsUnavailable = false; // true se la tabella athlete_goals non esiste ancora

// Menu "Tipo di corsa" in ordine alfabetico (sigla), Corsa libera in fondo
const TEMPLATE_MENU = [
    ['fr', 'Corsa cambio ritmo (Fartlek) · FR'],
    ['cr', 'Corsa di recupero (rigenerante) · CR'],
    ['cl', 'Corsa lenta · CL'],
    ['libera', 'Corsa libera'],
    ['fl', 'Corsa lunga · FL'],
    ['it', 'Corsa ripetuta · IT'],
    ['riposo', 'Riposo']
];

/* =====================================================================
   UTILITÀ: DATE
   ===================================================================== */

function toLocalISO(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function parseLocalDate(str) {
    const [y, m, d] = str.split('-').map(Number);
    return new Date(y, m - 1, d);
}
function normDate(v) { return v ? String(v).slice(0, 10) : ''; }
function mondayOf(date) {
    const d = new Date(date); d.setHours(0, 0, 0, 0);
    const day = d.getDay();
    d.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
    return d;
}
function getStartOfWeek(offset = 0) {
    const d = mondayOf(new Date());
    d.setDate(d.getDate() + offset * 7);
    return d;
}
function weekOffsetFor(dateStr) {
    return Math.round((mondayOf(parseLocalDate(dateStr)) - getStartOfWeek(0)) / (7 * 86400000));
}
function getDatesOfWeek(offset = currentWeekOffset) {
    const start = getStartOfWeek(offset);
    return Array.from({ length: 7 }, (_, i) => { const d = new Date(start); d.setDate(d.getDate() + i); return toLocalISO(d); });
}
function isoWeekNumber(date) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
}
function fmtDateShort(dateStr) {
    return titleCase(parseLocalDate(dateStr).toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'short' }));
}

/* =====================================================================
   UTILITÀ: TESTO
   ===================================================================== */

function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
// Iniziale maiuscola per ogni parola, senza toccare il resto (MM, km restano come sono)
// Etichette fisse dell'HTML: solo la prima lettera maiuscola (es. "Tempo impiegato")
const KEEP_CAPS = new Set(['Supabase', 'Riegel', 'Maria', 'Magrela', 'Lap', 'Apple', 'Garmin', 'Fartlek']);
function toSentence(text) {
    let start = true;
    return text.replace(/(\S+)(\s*)/g, (m, w, sp) => {
        let out = w;
        const bare = w.replace(/[^A-Za-zÀ-ÿ']/g, '');
        if (!start && /^[(«"']?[A-ZÀ-Ý][a-zà-ÿ']/.test(w) && !KEEP_CAPS.has(bare)) out = w.replace(/[A-ZÀ-Ý]/, c => c.toLowerCase());
        if (start && /^[A-Z]{2,}$/.test(w)) return out + sp;
        if (/[A-Za-zÀ-ÿ0-9]/.test(w)) start = /[.!?]$/.test(w) && !/^(Dist|Es)\.$/i.test(w);
        return out + sp;
    });
}
function sentenceCaseStatic() {
    const sel = 'label, h2, h3, .page-title-box p, .metric-box small, .res-item small, .res-title, .ring-text small, .race-countdown small, button, option, .optional-fields-box > span, .gpx-drop-zone p, .profile-card p';
    document.querySelectorAll(sel).forEach(el => {
        if (el.closest('.user-selector')) return;
        el.childNodes.forEach(n => { if (n.nodeType === 3 && n.textContent.trim()) n.textContent = toSentence(n.textContent); });
    });
    document.querySelectorAll('input[placeholder], textarea[placeholder]').forEach(el => { el.placeholder = toSentence(el.placeholder); });
}

function titleCase(s) {
    s = String(s ?? '');
    return s.charAt(0).toUpperCase() + s.slice(1);
}
function fmtNum(n, dec = 1) {
    return Number(n).toLocaleString('it-IT', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

/* =====================================================================
   UTILITÀ: PARSER DI TEMPO, PACE E DISTANZA
   - Tempo:  "1:30" = 90 s · "90s" / 90" = 90 s · "15'" / "15min" = 15 min · "1:05:00" = 1h05
             numero semplice → minuti (secondi per Recupero/Riposo)
             i secondi oltre 59 vengono riportati: "1:75" → 2:15
   - Pace:   "6:20" · "620" · "6.20" · "6,20" · "6'20" · intervallo "4:40-4:50"
   - Distanza: "2" / "2 km" / "2,5" = km · "300 m" / "300" (numero ≥ 50 senza unità) = metri
   ===================================================================== */

function parseDuration(str, plain = 'min') {
    if (str == null) return null;
    let s = String(str).trim().toLowerCase().replace(',', '.').replace(/″/g, '"').replace(/′/g, "'");
    if (!s) return null;
    let m;
    if (s.includes(':')) {
        const parts = s.split(':').map(x => parseFloat(x) || 0);
        if (parts.length === 3) return Math.round(parts[0] * 3600 + parts[1] * 60 + parts[2]);
        if (parts.length === 2) return Math.round(parts[0] * 60 + parts[1]);
        return null;
    }
    if ((m = s.match(/^(\d+)\s*h\s*(\d+)?\s*(?:m|min|')?$/))) return (+m[1]) * 3600 + (+(m[2] || 0)) * 60;
    if ((m = s.match(/^(\d+)\s*(?:'|m|min)\s*(\d+)\s*(?:"|s|sec)?$/))) return (+m[1]) * 60 + (+m[2]);
    if ((m = s.match(/^(\d+(?:\.\d+)?)\s*(?:s|sec|secondi|")$/))) return Math.round(+m[1]);
    if ((m = s.match(/^(\d+(?:\.\d+)?)\s*(?:m|min|minuti|')$/))) return Math.round(+m[1] * 60);
    if ((m = s.match(/^(\d+(?:\.\d+)?)\s*(?:h|ore|ora)$/))) return Math.round(+m[1] * 3600);
    if ((m = s.match(/^(\d+(?:\.\d+)?)$/))) return Math.round(plain === 'sec' ? +m[1] : +m[1] * 60);
    return null;
}

function fmtDuration(sec) {
    if (sec == null || isNaN(sec)) return '';
    sec = Math.round(sec);
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}
function fmtDurationWords(sec) {
    if (sec == null) return '';
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = Math.round(sec % 60);
    return [h ? `${h} h` : '', m ? `${m} min` : '', s ? `${s} s` : ''].filter(Boolean).join(' ') || '0 s';
}

function parsePaceOne(str) {
    let s = String(str).trim().toLowerCase().replace(/(min)?\s*\/\s*km/, '').replace(/″/g, '"').replace(/′/g, "'").trim();
    if (!s) return null;
    let min, sec, m;
    if ((m = s.match(/^(\d{1,2})\s*[:'.,]+\s*(\d{1,2})\s*"?$/))) { // 6:20 · 6'20" · 6',20" · 6,20 · 6.20
        min = +m[1]; sec = m[2].length === 1 ? +m[2] * 10 : +m[2];
    } else if ((m = s.match(/^(\d{3,4})$/))) {
        min = Math.floor(+m[1] / 100); sec = +m[1] % 100;
    } else if ((m = s.match(/^(\d{1,2})'?$/))) {
        min = +m[1]; sec = 0;
    } else return null;
    const total = min * 60 + sec;            // i secondi ≥ 60 vengono riportati automaticamente
    return total >= 120 && total <= 1200 ? total : null; // pace realistico: 2:00 – 20:00 /km
}
function parsePace(str) {
    if (str == null || !String(str).trim()) return null;
    const parts = String(str).split(/\s*[-–—]\s*/).filter(Boolean);
    const lo = parsePaceOne(parts[0]);
    if (lo == null) return null;
    const hi = parts[1] ? parsePaceOne(parts[1]) : null;
    if (hi != null && hi !== lo) return { lo: Math.min(lo, hi), hi: Math.max(lo, hi) };
    return { lo, hi: null };
}
function fmtPaceSec(sec) {
    if (sec == null || isNaN(sec)) return '';
    sec = Math.round(sec);
    return `${Math.floor(sec / 60)}' ${String(sec % 60).padStart(2, '0')}"`;
}
// Pace dei passi nel formato 6' 20" (valore) o 6' 20" – 6' 40" (intervallo)
function fmtPaceQ(sec) {
    if (sec == null || isNaN(sec)) return '';
    sec = Math.round(sec);
    return `${Math.floor(sec / 60)}' ${String(sec % 60).padStart(2, '0')}"`;
}
function fmtPaceStep(lo, hi) {
    if (lo == null) return '';
    return hi ? `${fmtPaceQ(lo)} – ${fmtPaceQ(hi)}` : fmtPaceQ(lo);
}
function fmtPace(lo, hi) {
    if (lo == null) return '';
    return hi ? `${fmtPaceSec(lo)}–${fmtPaceSec(hi)}` : fmtPaceSec(lo);
}

function parseDistanceKm(str, metersIfAtLeast = 50) {
    if (str == null) return null;
    const s = String(str).trim().toLowerCase().replace(',', '.');
    if (!s) return null;
    let m;
    if ((m = s.match(/^(\d+(?:\.\d+)?)\s*(?:km|k)$/))) return +m[1];
    if ((m = s.match(/^(\d+(?:\.\d+)?)\s*(?:m|mt|metri)$/))) return +m[1] / 1000;
    if ((m = s.match(/^(\d+(?:\.\d+)?)$/))) return +m[1] >= metersIfAtLeast ? +m[1] / 1000 : +m[1];
    return null;
}
function fmtDist(km) {
    if (km == null || isNaN(km)) return '';
    if (km > 0 && km < 1) return `${Math.round(km * 1000)} m`;
    return `${Number(km.toFixed(2)).toLocaleString('it-IT')} km`;
}

/* =====================================================================
   CALCOLI DELL'ALLENAMENTO
   Regole:
   - passo a distanza + pace  → tempo = km × pace
   - passo a tempo + pace     → km = tempo ÷ pace
   - Recupero senza pace e Riposo → 0 km (contano solo nel tempo)
   - Ripetizioni → (somma dei passi interni) × numero di ripetizioni
   - Pace medio = tempo dei tratti di corsa ÷ km (esclusi riposi/recuperi da fermo)
   ===================================================================== */

// Pace di un passo: tre impostazioni indipendenti e combinabili
//   pace_val  = Pace (valore)   ·   pace_slow = Ritmo più lento   ·   pace_fast = Ritmo più veloce
// I passi salvati con il formato precedente (pace_lo / pace_hi) vengono letti allo stesso modo.
function stepPace(s) {
    if (s.pace_val != null || s.pace_slow != null || s.pace_fast != null) {
        return { val: s.pace_val ?? null, slow: s.pace_slow ?? null, fast: s.pace_fast ?? null };
    }
    if (s.pace_hi != null) return { val: null, slow: s.pace_hi, fast: s.pace_lo ?? null };
    return { val: s.pace_lo ?? null, slow: null, fast: null };
}
function hasPace(s) { const p = stepPace(s); return p.val != null || p.slow != null || p.fast != null; }
// Pace usato per i calcoli: il Pace (valore) se c'è, altrimenti il centro dell'intervallo
function paceMid(s) {
    const p = stepPace(s);
    if (p.val != null) return p.val;
    if (p.slow != null && p.fast != null) return (p.slow + p.fast) / 2;
    return p.slow ?? p.fast ?? null;
}
function describePace(s) {
    const p = stepPace(s), out = [];
    if (p.val != null) out.push(`Pace ${fmtPaceQ(p.val)} /km`);
    if (p.slow != null && p.fast != null) out.push(`Intervallo ${fmtPaceQ(p.fast)} – ${fmtPaceQ(p.slow)} /km`);
    else if (p.slow != null) out.push(`Non più lento di ${fmtPaceQ(p.slow)} /km`);
    else if (p.fast != null) out.push(`Non più veloce di ${fmtPaceQ(p.fast)} /km`);
    return out.join(' · ');
}

function calcStep(s) {
    const pm = paceMid(s);
    let d, t;
    const still = s.type === 'recovery' || s.type === 'rest'; // senza pace contano solo nel tempo
    if (s.mode === 'open') { d = still ? 0 : null; t = null; } // passo "Aperto" (a Lap)
    else if (s.mode === 'dist') { d = s.dist_km || 0; t = pm ? d * pm : null; }
    else {
        t = s.time_s || 0;
        d = pm ? t / pm : (still ? 0 : null);
    }
    return {
        dist: d, time: t,
        movDist: d && t != null ? d : 0,
        movTime: d && t != null ? t : 0,
        partial: d == null || t == null
    };
}

function calcSteps(steps) {
    const tot = { dist: 0, time: 0, movDist: 0, movTime: 0, partial: false };
    (steps || []).forEach(s => {
        let r;
        if (s.type === 'repeat') {
            const inner = calcSteps(s.steps);
            const n = Math.max(1, parseInt(s.reps) || 1);
            r = { dist: inner.dist * n, time: inner.time * n, movDist: inner.movDist * n, movTime: inner.movTime * n, partial: inner.partial };
        } else r = calcStep(s);
        tot.dist += r.dist || 0;
        tot.time += r.time || 0;
        tot.movDist += r.movDist;
        tot.movTime += r.movTime;
        tot.partial = tot.partial || r.partial;
    });
    tot.pace = tot.movDist > 0 ? tot.movTime / tot.movDist : null;
    return tot;
}

// Passi strutturati di un allenamento pianificato (o null se è in formato vecchio)
function getSteps(p) {
    const cf = parseFields(p.custom_fields);
    if (cf && cf._v === 2 && Array.isArray(cf.steps)) return cf.steps;
    return null;
}
function parseFields(f) {
    if (!f) return null;
    if (typeof f === 'string') { try { return JSON.parse(f); } catch { return null; } }
    return f;
}
// Riepilogo pianificato: calcolato dai passi, oppure valori salvati (formato vecchio)
function planSummary(p) {
    const steps = getSteps(p);
    if (steps) {
        const t = calcSteps(steps);
        return { dist: t.dist, time: t.time, pace: t.pace, partial: t.partial, structured: true, steps };
    }
    return {
        dist: parseFloat(p.summary_dist) || 0,
        time: parseDuration(p.summary_time, 'min'),
        pace: parsePace(p.summary_pace)?.lo ?? null,
        partial: false, structured: false, steps: legacyToSteps(parseFields(p.custom_fields) || {})
    };
}
// Giorno di riposo: nessun km e nessun passo, oppure solo passi "Riposo"
function isRestDay(p) {
    const s = planSummary(p);
    const flat = st => (st || []).flatMap(x => x.type === 'repeat' ? flat(x.steps) : [x]);
    const all = flat(s.steps);
    if (s.dist) return false;
    // Senza passi è riposo solo se si chiama così (una corsa ancora da strutturare non è riposo)
    return all.length ? all.every(x => x.type === 'rest') : /riposo|rest/i.test(p.title || '');
}

// Converte il vecchio formato { "Riscaldamento": "Tempo 5:00", ... } in passi
function legacyToSteps(fields) {
    const steps = [];
    let block = null, pace = null, zone = '';
    const parseVal = (type, v) => {
        let str = String(v).replace(/^(tempo|distanza|fermo|corsetta)\s*/i, '').trim();
        const st = S(type);
        const dist = /\d\s*(km|m|mt|metri)\b/i.test(str) && !/min/i.test(str) ? parseDistanceKm(str) : null;
        if (dist != null) { st.mode = 'dist'; st.dist_km = dist; }
        else { st.mode = 'time'; st.time_s = parseDuration(str.replace(/^(\d+)\s*'$/, '$1min'), STEP_TYPES[type]?.plain || 'min'); }
        return st;
    };
    for (const [k, v] of Object.entries(fields)) {
        const type = PILL_TO_TYPE[k];
        if (k === 'Pace') { pace = parsePace(String(v).split(/\s/)[0]) || parsePace(v); continue; }
        if (k.startsWith('ZF')) { zone = (String(v).match(/\d/) || [''])[0]; zone = zone ? 'Z' + zone : ''; continue; }
        if (type === 'repeat') {
            const m = String(v).match(/(\d+)\s*[x×]\s*(.*)/i);
            block = R(m ? +m[1] : 1, []);
            steps.push(block);
            continue;
        }
        if (!type) continue;
        const st = parseVal(type, v);
        if (block && (type === 'work' || type === 'recovery')) block.steps.push(st);
        else steps.push(st);
    }
    const work = (block ? block.steps : steps).find(s => s.type === 'work') || steps.find(s => s.type === 'work');
    if (work) {
        if (pace) { work.pace_lo = pace.lo; work.pace_hi = pace.hi; }
        if (zone) work.zone = zone;
    }
    return steps;
}

/* =====================================================================
   SUPABASE
   ===================================================================== */

function reportError(where, error) {
    if (!error) return false;
    console.error(`[Supabase] ${where}:`, error);
    const msg = String(error.message || error);
    if (msg.includes('Failed to fetch') || msg.includes('NetworkError')) {
        alert(`Impossibile raggiungere Supabase (${where}).\nControlla la connessione, eventuali adblocker/estensioni, VPN o firewall aziendale, e che il progetto Supabase non sia in pausa.`);
    } else {
        alert(`Errore Supabase (${where}): ${msg}`);
    }
    return true;
}

window.onload = async function () {
    initUI();
    await fetchAllData();
};

async function fetchAllData() {
    const { data: planned, error: e1 } = await supabaseClient.from('planned_workouts').select('*').order('date', { ascending: true });
    const { data: imported, error: e2 } = await supabaseClient.from('imported_workouts').select('*').order('date', { ascending: true });

    if (reportError('lettura planned_workouts', e1) || reportError('lettura imported_workouts', e2)) {
        renderApp();
        return;
    }

    allPlannedWorkouts = (planned || []).map(w => ({ ...w, date: normDate(w.date) }));
    allImportedWorkouts = (imported || []).map(w => ({ ...w, date: normDate(w.date), status: w.status || 'done' }));

    // Gare e record personali (tabella athlete_goals). Se la tabella non esiste ancora l'app funziona lo stesso.
    const { data: goals, error: e3 } = await supabaseClient.from('athlete_goals').select('*').order('date', { ascending: true });
    if (e3) { goalsUnavailable = true; allGoals = []; console.warn('[Supabase] athlete_goals:', e3.message); }
    else { goalsUnavailable = false; allGoals = (goals || []).map(g => ({ ...g, date: normDate(g.date), dist_km: parseFloat(g.dist_km) })); }

    // Nessun dato di esempio: l'app mostra solo quello che hai inserito tu
    renderApp();
}

function buildPlanPayload(user, date, t) {
    const tot = calcSteps(t.steps);
    return {
        user_id: user, date,
        workout_type: t.title, title: t.title,
        summary_dist: Math.round(tot.dist * 100) / 100,
        summary_pace: tot.pace ? fmtPaceSec(tot.pace) : null,
        summary_time: tot.time ? fmtDuration(tot.time) : null,
        custom_fields: { _v: 2, steps: t.steps },
        notes: t.notes || null
    };
}

/* =====================================================================
   NAVIGAZIONE
   ===================================================================== */

function switchUser(newUser) {
    currentUser = newUser;
    const el = document.getElementById('active-user-name');
    if (el) el.innerText = newUser;
    renderApp();
}
function switchTab(tabName, btn) {
    document.querySelectorAll('.tab-page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
    document.getElementById('tab-' + tabName).classList.add('active');
    btn.classList.add('active');
    // Il "+" in alto (nuovo allenamento) solo nella schermata Allenamenti
    const add = document.querySelector('.app-header .btn-add-green');
    if (add) add.style.visibility = tabName === 'workouts' ? 'visible' : 'hidden';
}
function changeWeek(direction) {
    currentWeekOffset += direction;
    const d = parseLocalDate(selectedDateStr);
    d.setDate(d.getDate() + direction * 7);
    selectedDateStr = toLocalISO(d);
    renderApp();
}
function selectDate(dateStr) {
    selectedDateStr = dateStr;
    renderApp();
}
function goToDate(dateStr) {
    selectedDateStr = dateStr;
    currentWeekOffset = weekOffsetFor(dateStr);
    const btn = document.querySelector('.nav-item');
    if (btn) switchTab('workouts', btn);
    renderApp();
}

/* =====================================================================
   RENDER PRINCIPALE
   ===================================================================== */

function userPlanned() { return allPlannedWorkouts.filter(w => w.user_id === currentUser); }
function userImported() { return allImportedWorkouts.filter(w => w.user_id === currentUser); }

function renderApp() {
    const dates = getDatesOfWeek();
    const planned = userPlanned(), imported = userImported();
    renderWeekCalendarPills(dates, planned, imported);
    renderDayDetails(selectedDateStr, planned, imported);
    updateWeeklyStats(dates, planned, imported);
    renderRecapTab(dates, planned, imported);
    renderProfile();
}

function renderWeekCalendarPills(dates, planned, imported) {
    const bar = document.getElementById('week-calendar-bar');
    if (!bar) return;
    const names = ['LUN', 'MAR', 'MER', 'GIO', 'VEN', 'SAB', 'DOM'];

    bar.innerHTML = dates.map((dateStr, i) => {
        const execs = imported.filter(w => w.date === dateStr);
        const hasPlanned = planned.some(w => w.date === dateStr);
        // priorità: Fatto > Spostato > Saltato
        const st = ['done', 'in-progress', 'to-fix'].find(s => execs.some(e => e.status === s));
        let marker = '';
        if (st) marker = `<i class="fa-solid ${STATUS[st].icon} check-icon status-${st}" title="${STATUS[st].label}"></i>`;
        else if (userGoals('race').some(g => g.date === dateStr)) marker = '<i class="fa-solid fa-trophy check-icon status-race" title="Gara"></i>';
        else if (hasPlanned) marker = '<span class="planned-dot"></span>';
        return `
            <div class="day-pill-square ${dateStr === selectedDateStr ? 'active' : ''}" onclick="selectDate('${dateStr}')">
                <span class="day-name">${names[i]}</span>
                <span class="day-num">${dateStr.split('-')[2]}</span>
                ${marker}
            </div>`;
    }).join('');

    const first = parseLocalDate(dates[0]);
    const months = ["Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno", "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre"];
    document.getElementById('current-month-label').innerText = `${months[first.getMonth()]}, ${first.getFullYear()}`;
    document.getElementById('selected-day-full-date').innerText =
        titleCase(parseLocalDate(selectedDateStr).toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' }));
}

/* ---------- Passi in formato leggibile ---------- */

function describeStep(s) {
    const parts = [];
    if (s.type === 'rest' && s.mode === 'time' && !hasPace(s)) parts.push(fmtDuration(s.time_s) + ' Fermo');
    else if (s.mode === 'open') parts.push('Aperto (Lap)');
    else if (s.mode === 'dist') parts.push(fmtDist(s.dist_km));
    else parts.push(fmtDuration(s.time_s));
    if (hasPace(s)) parts.push(describePace(s));
    const c = calcStep(s);
    if (s.mode === 'dist' && c.time) parts.push(`≈ ${fmtDuration(c.time)}`);
    if (s.mode === 'time' && c.dist) parts.push(`≈ ${fmtDist(c.dist)}`);
    return parts.join(' · ');
}

function renderStepLines(steps, nested = false) {
    return (steps || []).map(s => {
        const st = STEP_TYPES[s.type] || { label: s.type, icon: 'fa-circle', color: 'var(--text-muted)' };
        if (s.type === 'repeat') {
            const inner = calcSteps(s.steps);
            return `
                <div class="step-line">
                    <span class="step-bar" style="background:${st.color}"></span>
                    <i class="fa-solid ${st.icon} step-icon" style="color:${st.color}"></i>
                    <div class="step-text">
                        <strong>${st.label} × ${s.reps}</strong>
                        <span>Totale ${fmtDist(inner.dist * s.reps)} · ${fmtDuration(inner.time * s.reps)}</span>
                    </div>
                </div>
                <div class="step-nested">${renderStepLines(s.steps, true)}</div>`;
        }
        return `
            <div class="step-line ${nested ? 'is-nested' : ''}">
                <span class="step-bar" style="background:${st.color}"></span>
                <i class="fa-solid ${st.icon} step-icon" style="color:${st.color}"></i>
                <div class="step-text">
                    <strong>${st.label}</strong>
                    <span>${esc(describeStep(s))}</span>
                </div>
                ${s.zone ? `<span class="zone-chip">${esc(zoneNorm(s.zone))}</span>` : ''}
            </div>`;
    }).join('');
}

function summaryGrid(items) {
    return `<div class="pre-workout-summary-grid">${items.map(([icon, label, val]) =>
        `<div class="summary-box-item"><small>${icon ? `<i class="fa-solid ${icon}"></i> ` : ''}${label}</small><strong>${val}</strong></div>`).join('')}</div>`;
}

/* ---------- Dettaglio del giorno ---------- */

function renderDayDetails(dateStr, planned, imported) {
    const container = document.getElementById('day-workout-details');
    const dayPlanned = planned.filter(w => w.date === dateStr);
    const dayImported = imported.filter(w => w.date === dateStr);
    const dayRaces = userGoals('race').filter(g => g.date === dateStr);
    let html = '';

    // Gara del giorno (gestita nel Profilo)
    dayRaces.forEach(r => {
        const est = estimateRace(r.dist_km);
        html += `
            <div class="main-workout-card" style="border-color:var(--orange);">
                <div class="workout-type-header" style="color:var(--orange);">
                    <span><i class="fa-solid fa-trophy"></i> Gara: ${esc(titleCase(r.name || fmtDist(r.dist_km)))}</span>
                </div>
                ${summaryGrid([
                    ['fa-ruler', 'Distanza', fmtDist(r.dist_km)],
                    ['fa-stopwatch', 'Stima', est ? fmtDuration(est.time) : '--'],
                    ['fa-bullseye', 'Obiettivo', r.time_s ? fmtDuration(r.time_s) : '--']
                ])}
            </div>`;
    });

    dayImported.forEach(imp => {
        const st = STATUS[imp.status] || STATUS.done;
        let body = '';
        if (imp.status === 'done') {
            const pace = imp.pace || (imp.dist && parseDuration(imp.time_exec) ? fmtPaceSec(parseDuration(imp.time_exec) / imp.dist) : '');
            body = `
                <p class="exec-title">${esc(titleCase(imp.title))}</p>
                ${summaryGrid([
                    ['fa-ruler', 'Distanza', imp.dist ? fmtNum(imp.dist, 2) + ' km' : '--'],
                    ['fa-clock', 'Tempo', esc(imp.time_exec || '--')],
                    ['fa-gauge-high', 'Pace', pace ? esc(pace) + ' /km' : '--']
                ])}
                ${summaryGrid([
                    ['fa-heart', 'Zona FC', esc(imp.hr_zone || '--')],
                    ['fa-heart-pulse', 'FC media', imp.hr ? imp.hr + ' bpm' : '--'],
                    ['fa-percent', 'Vs piano', complianceLabel(imp, planned)]
                ])}`;
        } else {
            body = `<p class="exec-title">${esc(titleCase(imp.title))}</p>`;
        }
        html += `
            <div class="main-workout-card" style="border-color:${st.color};">
                <div class="workout-type-header" style="color:${st.color};">
                    <span><i class="fa-solid ${st.icon}"></i> ${st.title}</span>
                    <span class="icon-btn-row">
                        <span class="tag-pill ${st.tag}">${st.label}</span>
                        <button class="btn-circle-muted" title="Modifica" onclick="openUploadModal(null, '${imp.id}')"><i class="fa-solid fa-pen"></i></button>
                        <button class="btn-circle-red" title="Elimina" onclick="deleteImportedWorkout('${imp.id}')"><i class="fa-solid fa-minus"></i></button>
                    </span>
                </div>
                ${body}
                ${imp.notes ? `<div class="workout-notes-box">📝 ${imp.status === 'to-fix' ? 'Motivo: ' : ''}${esc(imp.notes)}</div>` : ''}
            </div>`;
    });

    dayPlanned.forEach(p => {
        const sum = planSummary(p);
        const rest = isRestDay(p);
        // Il pulsante "Aggiungi risultato" sparisce quando il risultato è già registrato
        const hasResult = dayImported.some(imp => findPlanForExec(imp, dayPlanned)?.id === p.id);
        html += `
            <div class="main-workout-card" style="border-color:var(--pink);">
                <div class="workout-type-header">
                    <span>${esc(titleCase(p.title))}</span>
                    <span class="icon-btn-row">
                        <button class="btn-circle-muted" title="Modifica" onclick="openPlanModal('${p.id}')"><i class="fa-solid fa-pen"></i></button>
                    </span>
                </div>
                ${rest ? `<div class="workout-notes-box">Giorno di riposo: nessuna corsa prevista.</div>` : `
                ${summaryGrid([
                    ['fa-ruler', 'Distanza', sum.dist ? fmtNum(sum.dist, 2) + ' km' : '--'],
                    ['fa-gauge-high', 'Pace medio', sum.pace ? fmtPaceSec(sum.pace) + ' /km' : '--'],
                    ['fa-clock', 'Tempo', sum.time ? fmtDuration(sum.time) : '--']
                ])}
                ${sum.partial ? '<p class="calc-warning">Stima parziale: alcuni passi non hanno pace o durata, quindi km e tempo sono calcolati solo in parte.</p>' : ''}
                <div class="steps-title">Passi</div>
                <div class="steps-list">${renderStepLines(sum.steps) || '<p class="empty-steps">Nessun passo inserito.</p>'}</div>`}
                ${p.notes ? `<div class="workout-notes-box">📝 ${esc(p.notes)}</div>` : ''}
                <div class="card-actions-row">
                    ${rest || hasResult ? '' : `<button class="btn-full-workout btn-result" onclick="openUploadModal('${p.id}')"><i class="fa-solid fa-plus"></i> Aggiungi risultato</button>`}
                    <button class="btn-full-workout" onclick="openDetailModal('${p.id}')">Vedi dettagli →</button>
                </div>
            </div>`;
    });

    if (!dayPlanned.length && !dayImported.length && !dayRaces.length) {
        html = `
            <div style="text-align:center; padding:30px 10px;">
                <p style="color:var(--text-muted); margin-bottom:15px;">Nessun allenamento programmato per questa data.</p>
                <button class="btn-action-cta btn-add-green" title="Aggiungi allenamento" onclick="openPlanModal()"><i class="fa-solid fa-plus"></i></button>
            </div>`;
    }
    container.innerHTML = html;
}

/* ---------- Confronto pianificato / eseguito ---------- */

function findPlanForExec(imp, planned = userPlanned()) {
    const same = planned.filter(p => p.date === imp.date);
    return same.find(p => (p.title || '').toLowerCase() === (imp.title || '').toLowerCase()) || same.find(p => !isRestDay(p)) || null;
}
function findExecForPlan(p) {
    const execs = userImported().filter(e => e.date === p.date && e.status === 'done');
    return execs.find(e => (e.title || '').toLowerCase() === (p.title || '').toLowerCase()) || execs[0] || null;
}
// Percentuale di completamento (come TrainingPeaks): 90–110% verde, 70–130% arancione, altrimenti rosso
function compliance(done, plan) {
    if (!plan || !done) return null;
    const pct = Math.round(done / plan * 100);
    const color = pct >= 90 && pct <= 110 ? 'var(--green)' : (pct >= 70 && pct <= 130 ? 'var(--orange)' : 'var(--red)');
    return { pct, color };
}
function complianceLabel(imp, planned) {
    const p = findPlanForExec(imp, planned);
    if (!p) return '--';
    const c = compliance(parseFloat(imp.dist), planSummary(p).dist);
    return c ? `<span style="color:${c.color}">${c.pct}%</span>` : '--';
}

// Confronto passo per passo (solo i passi con un risultato inserito)
function stepCompareHtml(steps, saved, delta) {
    const rows = resultRows(steps).filter(r => !r.head && saved[r.key]);
    if (!rows.length) return '';
    return `
        <div class="cmp-card">
            <div class="cmp-head"><span>Risultato per passo</span></div>
            <div class="cmp-row cmp-row-head"><span></span><span>Piano</span><span>Eseguito</span><span>Diff.</span></div>
            ${rows.map(r => {
                const s = r.step, v = saved[r.key], c = calcStep(s);
                const t = STEP_TYPES[s.type] || { label: s.type, color: 'var(--text-muted)' };
                const label = `<span style="color:${t.color}">${esc(r.nested ? t.label + ' · media' : t.label)}</span>`;
                const planPace = hasPace(s) ? paceMid(s) : null;
                const planTime = s.mode === 'dist' ? c.time : s.time_s;
                // Una sola misura per riga: il pace se il piano ha un pace, altrimenti il tempo
                let plan, done, d = '<span class="cmp-delta"></span>';
                if (planPace && v.pace_sec != null) {
                    plan = fmtPaceSec(planPace); done = fmtPaceSec(v.pace_sec); d = delta(v.pace_sec, planPace, 't', 'less');
                } else if (planTime && v.time_s != null) {
                    plan = fmtDuration(planTime); done = fmtDuration(v.time_s); d = delta(v.time_s, planTime, 't', s.mode === 'dist' ? 'less' : 'neutral');
                } else {
                    plan = stepPlanText(s);
                    done = v.time_s != null ? fmtDuration(v.time_s) : v.pace_sec != null ? fmtPaceSec(v.pace_sec) : fmtDist(v.dist_km);
                }
                return `<div class="cmp-row">${label}<span>${esc(plan)}</span><strong>${esc(done)}</strong>${d}</div>`;
            }).join('')}
        </div>`;
}

function openDetailModal(id) {
    const item = allPlannedWorkouts.find(w => w.id == id);
    if (!item) return;
    const sum = planSummary(item);
    const exec = findExecForPlan(item);
    const other = userImported().find(e => e.date === item.date && e.status !== 'done');

    let cmp = '';
    if (exec) {
        const doneTime = parseDuration(exec.time_exec, 'min');
        const donePace = exec.dist && doneTime ? doneTime / exec.dist : null;
        const c = compliance(parseFloat(exec.dist), sum.dist);
        // Distanza: verde se ≥ piano · Pace: verde se più veloce (o uguale) · Tempo: neutro
        const delta = (a, b, fmt, mode = 'neutral') => {
            if (a == null || b == null || !b) return '';
            const diff = a - b;
            if (Math.abs(diff) < (fmt === 'km' ? 0.005 : 0.5)) return '<span class="cmp-delta">=</span>';
            const txt = fmt === 'km' ? `${diff > 0 ? '+' : ''}${fmtNum(diff, 2)} km`
                : `${diff > 0 ? '+' : '−'}${fmtDuration(Math.abs(diff))}`;
            let color = 'var(--text-muted)';
            if (mode === 'more') color = diff >= 0 ? 'var(--green)' : 'var(--orange)';
            if (mode === 'less') color = diff <= 0 ? 'var(--green)' : 'var(--orange)';
            return `<span class="cmp-delta" style="color:${color}">${txt}</span>`;
        };
        const zones = [...new Set(JSON.stringify(sum.steps).match(/Z\d/g) || [])].sort().join('–');
        cmp = `
            <div class="cmp-card">
                <div class="cmp-head">
                    <span>Confronto pianificato vs eseguito</span>
                    ${c ? `<strong style="color:${c.color}">${c.pct}%</strong>` : ''}
                </div>
                ${c ? `<div class="cmp-bar"><div style="width:${Math.min(c.pct, 100)}%; background:${c.color}"></div></div>` : ''}
                <div class="cmp-row cmp-row-head"><span></span><span>Piano</span><span>Eseguito</span><span>Diff.</span></div>
                <div class="cmp-row"><span>Distanza</span><span>${sum.dist ? fmtNum(sum.dist, 2) + ' km' : '--'}</span><strong>${+exec.dist ? fmtNum(+exec.dist, 2) + ' km' : '--'}</strong>${+exec.dist ? delta(+exec.dist, sum.dist, 'km', 'more') : '<span class="cmp-delta"></span>'}</div>
                <div class="cmp-row"><span>Tempo</span><span>${sum.time ? fmtDuration(sum.time) : '--'}</span><strong>${esc(exec.time_exec || '--')}</strong>${delta(doneTime, sum.time, 't')}</div>
                <div class="cmp-row"><span>Pace</span><span>${sum.pace ? fmtPaceSec(sum.pace) : '--'}</span><strong>${donePace ? fmtPaceSec(donePace) : '--'}</strong>${delta(donePace, sum.pace, 't', 'less')}</div>
                <div class="cmp-row"><span>Zona FC</span><span>${zones || '--'}</span><strong>${esc(exec.hr_zone || '--')}</strong><span class="cmp-delta">${exec.hr ? exec.hr + ' bpm' : ''}</span></div>
                <p class="cmp-legend">Verde: 90–110% del piano · Arancione: 70–130% · Rosso: fuori range</p>
            </div>${stepCompareHtml(sum.steps, savedStepResults(exec), delta)}`;
    } else if (other) {
        const st = STATUS[other.status];
        cmp = `<div class="cmp-card" style="border-color:${st.color}"><div class="cmp-head"><span>Stato</span><span class="tag-pill ${st.tag}">${st.label}</span></div>${other.notes ? `<p class="cmp-legend">${esc(other.notes)}</p>` : ''}</div>`;
    }

    document.getElementById('detail-modal-content').innerHTML = `
        <span class="close-btn" onclick="closeDetailModal()">&times;</span>
        <h3 style="color:var(--pink); margin-bottom:12px;">${esc(titleCase(item.title))}</h3>
        ${summaryGrid([
            ['fa-ruler', 'Distanza', sum.dist ? fmtNum(sum.dist, 2) + ' km' : '--'],
            ['fa-gauge-high', 'Pace medio', sum.pace ? fmtPaceSec(sum.pace) + ' /km' : '--'],
            ['fa-clock', 'Tempo', sum.time ? fmtDuration(sum.time) : '--']
        ])}
        ${cmp}
        <div class="steps-title" style="margin-top:12px">Passi</div>
        <div class="steps-list">${renderStepLines(sum.steps) || '<p class="empty-steps">Nessun passo inserito.</p>'}</div>
        ${item.notes ? `<div class="workout-notes-box">📝 ${esc(item.notes)}</div>` : ''}`;
    document.getElementById('detail-modal').style.display = 'block';
}
function closeDetailModal() { document.getElementById('detail-modal').style.display = 'none'; }

/* =====================================================================
   META SETTIMANALE
   ===================================================================== */

function updateWeeklyStats(dates, planned, imported) {
    const weekPlanned = planned.filter(w => dates.includes(w.date));
    const runPlanned = weekPlanned.filter(w => !isRestDay(w));
    const weekDone = imported.filter(w => dates.includes(w.date) && w.status === 'done');
    const plannedDays = new Set(weekPlanned.map(w => w.date)).size;
    const ready = weekPlanned.length > 0 && !(REQUIRE_FULL_WEEK && plannedDays < 7);

    const doneKm = weekDone.reduce((s, w) => s + (parseFloat(w.dist) || 0), 0);
    const planKm = weekPlanned.reduce((s, w) => s + planSummary(w).dist, 0);
    const pct = ready && planKm > 0 ? doneKm / planKm : null;

    // Testo semplice: km fatti / km pianificati + numero di allenamenti
    document.querySelector('.ring-text small').textContent = 'Km settimana';
    document.getElementById('goal-km-display').innerText = `${fmtNum(doneKm)} / ${ready ? fmtNum(planKm) : '--'} km`;
    document.getElementById('ring-sub').textContent = !weekPlanned.length ? 'Nessun allenamento pianificato'
        : !ready ? `Pianificati ${plannedDays}/7 giorni`
        : `${weekDone.length} / ${runPlanned.length} allenamenti`;

    const pctEl = document.getElementById('ring-pct');
    if (pctEl) pctEl.textContent = pct == null ? '--' : `${Math.round(pct * 100)}%`;

    const ring = document.getElementById('goal-progress-ring');
    if (ring) {
        const circ = 2 * Math.PI * 32;
        ring.style.strokeDasharray = `${circ} ${circ}`;
        ring.style.strokeDashoffset = circ - Math.min(pct || 0, 1) * circ;
        ring.setAttribute('stroke', pct >= 1 ? '#00e676' : '#ff79c6');
    }

    renderNextRace();
}

// Riquadro "Prossima gara" nella card in alto (le gare si gestiscono nel Profilo)
function renderNextRace() {
    const box = document.querySelector('.race-countdown');
    if (!box) return;
    const today = toLocalISO(new Date());
    const race = userGoals('race').filter(g => g.date >= today).sort((a, b) => a.date.localeCompare(b.date))[0];
    const profileBtn = document.querySelectorAll('.nav-item')[3];
    box.onclick = () => profileBtn && switchTab('profile', profileBtn);
    box.style.cursor = 'pointer';

    if (!race) {
        box.innerHTML = `<div><small>Prossima gara</small><strong>Nessuna gara</strong></div>
            <div class="race-right"><small>Aggiungila nel profilo</small></div>`;
        return;
    }
    const days = Math.round((parseLocalDate(race.date) - parseLocalDate(today)) / 86400000);
    const est = estimateRace(race.dist_km);
    box.innerHTML = `
        <div>
            <small>Prossima gara</small>
            <strong>${race.name ? esc(titleCase(race.name)) + ' · ' : ''}${fmtDist(race.dist_km)}</strong>
            <small>${fmtDateShort(race.date)}</small>
        </div>
        <div class="race-right">
            <strong>${days === 0 ? 'Oggi!' : days === 1 ? 'Domani' : `Tra ${days} giorni`}</strong>
            <small>${est ? 'Stima ' + fmtDuration(est.time) : 'Stima --'}</small>
        </div>`;
}

/* =====================================================================
   RECAP: SETTIMANE + FILTRI
   ===================================================================== */

function setRecapFilter(key, val) {
    recapFilter[key] = val;
    renderRecapTab(getDatesOfWeek(), userPlanned(), userImported());
}

function renderRecapTab(dates, planned, imported) {
    const weekImported = imported.filter(w => dates.includes(w.date));
    const weekPlanned = planned.filter(w => dates.includes(w.date) && !isRestDay(w));
    const doneKm = weekImported.filter(w => w.status === 'done').reduce((s, w) => s + (parseFloat(w.dist) || 0), 0);
    const plannedKm = weekPlanned.reduce((s, w) => s + planSummary(w).dist, 0);

    document.getElementById('recap-planned-km').innerText = `${fmtNum(plannedKm)} km`;
    document.getElementById('recap-executed-km').innerText = `${fmtNum(doneKm)} km`;
    document.getElementById('recap-sessions-count').innerText = `${weekImported.filter(w => w.status === 'done').length} / ${weekPlanned.length}`;

    // Settimane con dati
    const weekKeys = new Set([...planned, ...imported].map(w => toLocalISO(mondayOf(parseLocalDate(w.date)))));
    const thisMonday = getStartOfWeek(0);
    let weeks = [...weekKeys].sort().reverse();
    if (recapFilter.weeks !== 'all') {
        const limit = new Date(thisMonday); limit.setDate(limit.getDate() - (recapFilter.weeks - 1) * 7);
        weeks = weeks.filter(w => parseLocalDate(w) >= limit);
    }

    const statusChip = (val, label, cls = '') =>
        `<button type="button" class="recap-chip ${cls} ${recapFilter.status === val ? 'active' : ''}" onclick="setRecapFilter('status','${val}')">${label}</button>`;
    let html = `
        <div class="recap-filters">
            <div class="recap-chips">
                ${statusChip('all', 'Tutti')}
                ${statusChip('done', 'Fatto', 'chip-done')}
                ${statusChip('to-fix', 'Saltato', 'chip-skip')}
                ${statusChip('in-progress', 'Spostato', 'chip-moved')}
            </div>
            <select onchange="setRecapFilter('weeks', this.value === 'all' ? 'all' : +this.value)">
                <option value="4" ${recapFilter.weeks === 4 ? 'selected' : ''}>Ultime 4 settimane</option>
                <option value="12" ${recapFilter.weeks === 12 ? 'selected' : ''}>Ultime 12 settimane</option>
                <option value="all" ${recapFilter.weeks === 'all' ? 'selected' : ''}>Tutto</option>
            </select>
        </div>`;

    if (!weeks.length) {
        pastHtml(html + '<p style="color:var(--text-muted)">Nessuna corsa salvata nello storico.</p>');
        return;
    }

    const doneByWeek = {};
    imported.filter(w => w.status === 'done').forEach(w => {
        const k = toLocalISO(mondayOf(parseLocalDate(w.date)));
        doneByWeek[k] = (doneByWeek[k] || 0) + (parseFloat(w.dist) || 0);
    });

    weeks.forEach(wk => {
        const start = parseLocalDate(wk);
        const end = new Date(start); end.setDate(end.getDate() + 6);
        const wDates = Array.from({ length: 7 }, (_, i) => { const d = new Date(start); d.setDate(d.getDate() + i); return toLocalISO(d); });
        const wPlanned = planned.filter(p => wDates.includes(p.date) && !isRestDay(p));
        const wExec = imported.filter(e => wDates.includes(e.date));
        const wDone = doneByWeek[wk] || 0;
        const wPlanKm = wPlanned.reduce((s, p) => s + planSummary(p).dist, 0);
        const shown = wExec.filter(e => recapFilter.status === 'all' || e.status === recapFilter.status).sort((a, b) => b.date.localeCompare(a.date));
        const c = compliance(wDone, wPlanKm);

        // Consiglio: aumento del volume oltre il 10% rispetto alla settimana precedente
        const prev = new Date(start); prev.setDate(prev.getDate() - 7);
        const prevDone = doneByWeek[toLocalISO(prev)] || 0;
        const incr = prevDone > 0 ? Math.round((wDone / prevDone - 1) * 100) : null;

        const range = `${start.getDate()} ${start.toLocaleDateString('it-IT', { month: 'short' })} – ${end.getDate()} ${end.toLocaleDateString('it-IT', { month: 'short' })}`;
        html += `
            <div class="recap-week">
                <div class="recap-week-head" onclick="goToDate('${wk}')">
                    <div>
                        <strong>Settimana ${isoWeekNumber(start)}</strong>
                        <small>${titleCase(range)}</small>
                    </div>
                    <div class="recap-week-km">
                        <strong style="color:var(--green)">${fmtNum(wDone)}</strong> / ${fmtNum(wPlanKm)} km
                        <small>${wExec.filter(e => e.status === 'done').length}/${wPlanned.length} sessioni</small>
                    </div>
                </div>
                ${c ? `<div class="cmp-bar"><div style="width:${Math.min(c.pct, 100)}%; background:${c.color}"></div></div>` : ''}
                ${incr != null && incr > 10 ? `<p class="calc-warning">↑ +${incr}% km rispetto alla settimana precedente (consiglio: massimo +10%).</p>` : ''}
                ${shown.length ? shown.map(e => {
                    const st = STATUS[e.status] || STATUS.done;
                    return `
                    <div class="recap-run" style="border-left-color:${st.color}" onclick="goToDate('${e.date}')">
                        <div>
                            <strong>${esc(titleCase(e.title))}</strong>
                            <small>${fmtDateShort(e.date)}${e.status === 'done' && e.time_exec ? ' · ' + esc(e.time_exec) : ''}${e.status === 'done' && e.pace ? ' · ' + esc(e.pace) + ' /km' : ''}</small>
                        </div>
                        ${e.status === 'done' ? `<span style="color:var(--green); font-weight:bold;">${fmtNum(e.dist || 0, 2)} km</span>` : `<span class="tag-pill ${st.tag}">${st.label}</span>`}
                    </div>`;
                }).join('') : '<p class="empty-steps">Nessuna corsa con questo filtro.</p>'}
            </div>`;
    });
    pastHtml(html);
}
function pastHtml(h) { document.getElementById('past-imported-list').innerHTML = h; }

/* =====================================================================
   BUILDER DEI PASSI (modale pianificazione)
   ===================================================================== */

// Zone frequenza: solo sigle, unite a due a due
const ZONE_OPTIONS = ['Z1 · Z2', 'Z3 · Z4', 'Z5'];
// Allenamenti salvati prima con una zona sola (es. "Z2") → opzione corrispondente
function zoneNorm(z) {
    if (!z) return '';
    if (ZONE_OPTIONS.includes(z)) return z;
    const n = (String(z).match(/\d/) || [''])[0];
    return n === '1' || n === '2' ? 'Z1 · Z2' : n === '3' || n === '4' ? 'Z3 · Z4' : n === '5' ? 'Z5' : z;
}

function stepValueText(s) {
    if (s.mode === 'dist' && s.dist_km != null) return fmtDist(s.dist_km);
    if (s.time_s != null) return fmtDuration(s.time_s);
    return '';
}

// Ogni passo ha tre impostazioni facoltative: Durata (distanza o tempo), Pace, ZF.
// Puoi aggiungerle con "+ Durata / + Pace / + ZF" e toglierle con "×".
// Senza durata il passo è "Aperto": si passa al successivo a mano (tasto Lap).
function createStepEl(step) {
    const t = STEP_TYPES[step.type];
    const div = document.createElement('div');
    div.className = 'builder-step';
    div.dataset.type = step.type;
    const mode = step.mode || 'time';
    const sp = stepPace(step);
    const hasZone = !!step.zone;
    const x = f => `<button type="button" class="bs-x-field" data-field="${f}" title="Togli">×</button>`;
    div.innerHTML = `
        <div class="bs-head">
            <span class="bs-drag" title="Tieni premuto e trascina"><i class="fa-solid fa-grip-vertical"></i></span>
            <i class="fa-solid ${t.icon}" style="color:${t.color}"></i>
            <span class="builder-active-label">${t.label}</span>
            <button type="button" class="btn-circle-muted bs-copy" title="Duplica"><i class="fa-regular fa-copy"></i></button>
            <button type="button" class="btn-circle-red bs-remove" title="Rimuovi"><i class="fa-solid fa-minus"></i></button>
        </div>
        <div class="bs-fields">
            <span class="bs-field f-time" ${mode === 'time' ? '' : 'hidden'}>
                <span class="bs-flabel">Durata</span>
                <input type="text" class="builder-active-input bs-value bs-time" value="${mode === 'time' && step.time_s != null ? esc(fmtDuration(step.time_s)) : ''}">
                ${x('time')}
            </span>
            <span class="bs-field f-dist" ${mode === 'dist' ? '' : 'hidden'}>
                <span class="bs-flabel">Distanza</span>
                <input type="text" class="builder-active-input bs-value bs-dist" value="${mode === 'dist' && step.dist_km != null ? esc(fmtDist(step.dist_km)) : ''}">
                ${x('dist')}
            </span>
            <span class="bs-field f-pace" ${sp.val != null ? '' : 'hidden'}>
                <span class="bs-flabel">Pace</span>
                <input type="text" class="builder-active-input bs-pace" placeholder="6' 20&quot;" value="${esc(fmtPaceQ(sp.val))}">
                ${x('pace')}
            </span>
            <span class="bs-field f-slow" ${sp.slow != null ? '' : 'hidden'}>
                <span class="bs-flabel">Ritmo più lento</span>
                <input type="text" class="builder-active-input bs-pace-slow" placeholder="6' 40&quot;" value="${esc(fmtPaceQ(sp.slow))}">
                ${x('slow')}
            </span>
            <span class="bs-field f-fast" ${sp.fast != null ? '' : 'hidden'}>
                <span class="bs-flabel">Ritmo più veloce</span>
                <input type="text" class="builder-active-input bs-pace-fast" placeholder="6' 20&quot;" value="${esc(fmtPaceQ(sp.fast))}">
                ${x('fast')}
            </span>
            <span class="bs-field f-zone" ${hasZone ? '' : 'hidden'}>
                <select class="bs-zone">${ZONE_OPTIONS.map(z => `<option value="${z}" ${(zoneNorm(step.zone) || ZONE_OPTIONS[0]) === z ? 'selected' : ''}>${z}</option>`).join('')}</select>
                ${x('zone')}
            </span>
        </div>
        <div class="bs-add-fields">
            <button type="button" class="bs-add-field" data-field="time">+ Durata</button>
            <button type="button" class="bs-add-field" data-field="dist">+ Distanza</button>
            <button type="button" class="bs-add-field" data-field="pace">+ Pace</button>
            <button type="button" class="bs-add-field" data-field="slow">+ Ritmo più lento</button>
            <button type="button" class="bs-add-field" data-field="fast">+ Ritmo più veloce</button>
            <button type="button" class="bs-add-field" data-field="zone">+ ZF</button>
        </div>
        <small class="bs-hint"></small>`;
    updateStepPlaceholder(div);
    updateFieldButtons(div);
    return div;
}

// Pace di un passo: "Pace" (valore singolo) oppure intervallo "Ritmo più lento" / "Ritmo più veloce".
// Se è presente almeno uno dei due ritmi dell'intervallo, vale l'intervallo.
function stepFieldOn(el, f) { const x = el.querySelector(':scope > .bs-fields > .f-' + f); return !!x && !x.hidden; }
function readStepPace(el) {
    const val = stepFieldOn(el, 'pace') ? (parsePace(el.querySelector('.bs-pace').value)?.lo ?? null) : null;
    const slow = stepFieldOn(el, 'slow') ? parsePaceOne(el.querySelector('.bs-pace-slow').value) : null;
    const fast = stepFieldOn(el, 'fast') ? parsePaceOne(el.querySelector('.bs-pace-fast').value) : null;
    return { val, slow, fast };
}
function paceRawText(el) {
    return ['pace', 'slow', 'fast'].filter(f => stepFieldOn(el, f))
        .map(f => el.querySelector(f === 'pace' ? '.bs-pace' : f === 'slow' ? '.bs-pace-slow' : '.bs-pace-fast').value).join('').trim();
}

// Mostra "+ Durata / + Pace / + ZF" solo per le impostazioni non ancora presenti
function updateFieldButtons(stepEl) {
    stepEl.querySelectorAll('.bs-add-field').forEach(btn => {
        const f = stepEl.querySelector('.f-' + btn.dataset.field);
        btn.hidden = !f || !f.hidden;
    });
}
function toggleStepField(stepEl, field, show) {
    const f = stepEl.querySelector(':scope > .bs-fields > .f-' + field);
    if (!f) return;
    f.hidden = !show;
    // Durata e distanza sono alternative: aggiungendone una, l'altra si toglie
    const other = { time: 'dist', dist: 'time' }[field];
    if (show && other) { const o = stepEl.querySelector(':scope > .bs-fields > .f-' + other); if (o) { o.hidden = true; o.querySelector('input').value = ''; } }
    if (show) {
        const input = f.querySelector('input:not([hidden])') || f.querySelector('select');
        if (input) { input.focus(); input.classList.add('bs-flash'); setTimeout(() => input.classList.remove('bs-flash'), 1000); }
    }
    updateFieldButtons(stepEl);
    recalcBuilder();
}

function createBlockEl(block) {
    const div = document.createElement('div');
    div.className = 'builder-block';
    div.dataset.type = 'repeat';
    div.innerHTML = `
        <div class="bs-head">
            <span class="bs-drag" title="Tieni premuto e trascina"><i class="fa-solid fa-grip-vertical"></i></span>
            <i class="fa-solid fa-repeat" style="color:var(--pink)"></i>
            <span class="builder-active-label">Ripetizioni</span>
            <input type="number" min="1" class="builder-active-input bs-reps" placeholder="N°" value="${block.reps || ''}">
            <span class="bs-x">Volte</span>
            <button type="button" class="btn-circle-muted bs-copy" title="Duplica"><i class="fa-regular fa-copy"></i></button>
            <button type="button" class="btn-circle-red bs-remove" title="Rimuovi"><i class="fa-solid fa-minus"></i></button>
        </div>
        <div class="bb-inner"></div>
        <div class="add-pills-grid bb-add">
            <button type="button" class="btn-add-pill" data-add="work">+ Esercizio</button>
            <button type="button" class="btn-add-pill" data-add="recovery">+ Recupero</button>
            <button type="button" class="btn-add-pill" data-add="rest">+ Riposo</button>
        </div>
        <small class="bs-hint"></small>`;
    const inner = div.querySelector('.bb-inner');
    (block.steps || []).forEach(s => inner.appendChild(createStepEl(s)));
    makeSortable(inner);
    return div;
}

/* ---------- Trascina per riordinare (come l'app Allenamento di iPhone) ----------
   - tieni premuto la riga del titolo di un passo (o l'icona ⋮⋮) e trascina
   - puoi spostare i passi anche dentro/fuori da un blocco Ripetizioni
   - usa la libreria SortableJS (caricata in automatico, funziona con touch e mouse) */

const SORTABLE_URL = 'https://cdnjs.cloudflare.com/ajax/libs/Sortable/1.15.2/Sortable.min.js';
let sortableLoading = null;

function loadSortable() {
    if (window.Sortable) return Promise.resolve(window.Sortable);
    if (!sortableLoading) {
        sortableLoading = new Promise((resolve, reject) => {
            const sc = document.createElement('script');
            sc.src = SORTABLE_URL;
            sc.onload = () => resolve(window.Sortable);
            sc.onerror = () => { sortableLoading = null; reject(new Error('SortableJS non caricato')); };
            document.head.appendChild(sc);
        });
    }
    return sortableLoading;
}

function makeSortable(container) {
    if (!container || container.dataset.sortable) return;
    container.dataset.sortable = '1';
    loadSortable().then(Sortable => {
        Sortable.create(container, {
            group: 'builder-steps',
            handle: '.bs-head',
            filter: '.bs-remove, .bs-copy, .bs-reps',      // il "−" e il numero di ripetizioni restano cliccabili
            preventOnFilter: false,
            draggable: '.builder-step, .builder-block',
            animation: 180,
            delay: 180, delayOnTouchOnly: true, // sul telefono: tieni premuto, poi trascina
            touchStartThreshold: 4,
            forceFallback: true, fallbackOnBody: true, fallbackTolerance: 3,
            ghostClass: 'bs-ghost', chosenClass: 'bs-chosen', dragClass: 'bs-dragging',
            scroll: true, scrollSensitivity: 60, bubbleScroll: true,
            // Un blocco Ripetizioni non può finire dentro un altro blocco
            onMove: evt => !(evt.dragged.classList.contains('builder-block') && evt.to.classList.contains('bb-inner')),
            onEnd: () => recalcBuilder()
        });
    }).catch(err => {
        console.warn(err);
        document.querySelectorAll('.bs-drag').forEach(h => h.style.display = 'none');
    });
}

function updateStepPlaceholder(el) {
    const type = el.dataset.type;
    const d = el.querySelector('.bs-dist'), t = el.querySelector('.bs-time');
    if (d) d.placeholder = 'es. 2 km o 300 m';
    if (t) t.placeholder = STEP_TYPES[type].plain === 'sec' ? 'es. 90 (sec) o 1:30' : 'es. 15 (min) o 15:00';
}

function readStepEl(el) {
    const type = el.dataset.type;
    const t = STEP_TYPES[type];
    const on = f => { const x = el.querySelector(':scope > .bs-fields > .f-' + f); return !!x && !x.hidden; };
    const mode = on('dist') ? 'dist' : on('time') ? 'time' : 'open';
    const raw = mode === 'open' ? '' : el.querySelector(':scope > .bs-fields .bs-' + mode).value;
    const pace = readStepPace(el);
    return {
        type, mode,
        dist_km: mode === 'dist' ? parseDistanceKm(raw) : null,
        time_s: mode === 'time' ? parseDuration(raw, t.plain) : null,
        pace_val: pace.val, pace_slow: pace.slow, pace_fast: pace.fast,
        zone: on('zone') ? (el.querySelector(':scope > .bs-fields .bs-zone').value || '') : ''
    };
}

function readBuilder() {
    const container = document.getElementById('active-builder-blocks');
    return [...container.children].map(el => {
        if (el.dataset.type === 'repeat') {
            return { type: 'repeat', reps: Math.max(1, parseInt(el.querySelector('.bs-reps').value) || 1),
                steps: [...el.querySelector('.bb-inner').children].map(readStepEl) };
        }
        return readStepEl(el);
    }).filter(Boolean);
}

function renderBuilder(steps = []) {
    const c = document.getElementById('active-builder-blocks');
    c.innerHTML = '';
    steps.forEach(s => c.appendChild(s.type === 'repeat' ? createBlockEl(s) : createStepEl(s)));
    makeSortable(c);
    recalcBuilder();
}

// Chiamata dai pulsanti "+ ..." dell'HTML
// Passo vuoto: nessuna impostazione di default, si aggiungono con i pulsanti +
const EMPTY = type => ({ type, mode: 'open', dist_km: null, time_s: null, pace_val: null, pace_slow: null, pace_fast: null, zone: '' });

// Impostazioni aggiungibili dai pulsanti in basso (vanno sul passo selezionato)
const SETTING_PILLS = { 'Durata': 'time', 'Distanza': 'dist', 'Pace': 'pace', 'Ritmo più lento': 'slow', 'Ritmo più veloce': 'fast', 'ZF': 'zone', 'ZF – Zona frequenza': 'zone' };

function setActiveStep(stepEl) {
    document.querySelectorAll('#active-builder-blocks .builder-step.is-active').forEach(el => el.classList.remove('is-active'));
    if (stepEl) stepEl.classList.add('is-active');
}

// Chiamata dai pulsanti "+ ..." in basso
function addBuilderBlock(keyName) {
    const c = document.getElementById('active-builder-blocks');
    const type = PILL_TO_TYPE[keyName];
    if (type === 'repeat') {
        const el = createBlockEl(R('', []));
        c.appendChild(el);
        el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    } else if (type) {
        const el = createStepEl(EMPTY(type));
        c.appendChild(el);
        setActiveStep(el);
        el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    } else if (SETTING_PILLS[keyName]) {
        // Impostazione: va sul passo selezionato (bordo rosa), altrimenti sull'ultimo
        const target = c.querySelector('.builder-step.is-active') || [...c.querySelectorAll('.builder-step')].pop();
        if (!target) { alert('Aggiungi prima un passo (es. + Riscaldamento), poi le sue impostazioni.'); return; }
        target.scrollIntoView({ block: 'center', behavior: 'smooth' });
        toggleStepField(target, SETTING_PILLS[keyName], true);
    }
    recalcBuilder();
}

function updateHints() {
    document.querySelectorAll('#active-builder-blocks .builder-step').forEach(el => {
        const s = readStepEl(el);
        const hint = el.querySelector('.bs-hint');
        const raw = s.mode === 'open' ? '' : el.querySelector(':scope > .bs-fields .bs-' + s.mode).value.trim();
        const paceRaw = paceRawText(el);
        const msgs = [];
        const empty = s.mode === 'open' && !hasPace(s) && !s.zone && [...el.querySelectorAll(':scope > .bs-fields > .bs-field')].every(f => f.hidden);
        if (empty) msgs.push('Vuoto: aggiungi le impostazioni con i pulsanti +');
        else if (s.mode === 'open') msgs.push('Senza durata: passi al successivo a mano (Lap)');
        if (raw) {
            if (s.mode === 'dist') msgs.push(s.dist_km != null ? `= ${fmtDist(s.dist_km)}` : '⚠ Distanza non valida');
            else msgs.push(s.time_s != null ? `= ${fmtDurationWords(s.time_s)}` : '⚠ Tempo non valido');
        }
        if (paceRaw) {
            const bad = ['pace', 'slow', 'fast'].some(f => stepFieldOn(el, f) &&
                el.querySelector(f === 'pace' ? '.bs-pace' : f === 'slow' ? '.bs-pace-slow' : '.bs-pace-fast').value.trim() &&
                (f === 'pace' ? s.pace_val : f === 'slow' ? s.pace_slow : s.pace_fast) == null);
            msgs.push(bad ? `⚠ Pace non valido (es. 6' 20")` : describePace(s));
        }
        const c = calcStep(s);
        {
            if (s.mode === 'dist' && c.time) msgs.push(`≈ ${fmtDuration(c.time)}`);
            if (s.mode === 'time' && c.dist) msgs.push(`≈ ${fmtDist(c.dist)}`);
            if (s.mode === 'time' && c.dist == null) msgs.push('Aggiungi il pace per calcolare i km');
            if (s.type === 'rest' && s.mode === 'time' && !hasPace(s) && raw) msgs.push('Fermo');
            if (s.zone) msgs.push(s.zone);
        }
        hint.textContent = msgs.join(' · ');
        hint.classList.toggle('is-warning', msgs.some(m => m.startsWith('⚠')));
    });
    document.querySelectorAll('#active-builder-blocks .builder-block').forEach(el => {
        const b = { type: 'repeat', reps: Math.max(1, parseInt(el.querySelector('.bs-reps').value) || 1), steps: [...el.querySelector('.bb-inner').children].map(readStepEl) };
        const t = calcSteps([b]);
        el.querySelector(':scope > .bs-hint').textContent = `Totale blocco: ${fmtDist(t.dist) || '0 km'} · ${fmtDuration(t.time)}`;
    });
}

function recalcBuilder() {
    updateHints();
    const steps = readBuilder();
    const distEl = document.getElementById('plan-summary-dist');
    const paceEl = document.getElementById('plan-summary-pace');
    const timeEl = document.getElementById('plan-summary-time');
    const auto = steps.length > 0;
    [distEl, paceEl, timeEl].forEach(el => { el.readOnly = auto; el.classList.toggle('is-auto', auto); });
    if (auto) {
        const t = calcSteps(steps);
        distEl.value = t.dist ? t.dist.toFixed(2) : '';
        paceEl.value = t.pace ? fmtPaceSec(t.pace) : '';
        timeEl.value = t.time ? fmtDuration(t.time) : '';
    }
}

// Normalizza i valori quando esci dal campo (es. "90" → "1:30", "300" → "300 m", "620" → "6:20")
function normalizeField(input) {
    const stepEl = input.closest('.builder-step');
    if (input.classList.contains('bs-value') && stepEl) {
        const s = readStepEl(stepEl);
        if (s.mode === 'dist' && s.dist_km != null) input.value = fmtDist(s.dist_km);
        if (s.mode === 'time' && s.time_s != null) input.value = fmtDuration(s.time_s);
    } else if (input.classList.contains('bs-pace')) {
        const p = parsePace(input.value);
        if (p) input.value = fmtPaceStep(p.lo, p.hi);
    } else if (input.classList.contains('bs-pace-slow') || input.classList.contains('bs-pace-fast')) {
        const v = parsePaceOne(input.value);
        if (v != null) input.value = fmtPaceQ(v);
    } else if (input.id === 'plan-summary-time' || input.id === 'exec-time') {
        const t = parseDuration(input.value, 'min');
        if (t != null) input.value = fmtDuration(t);
    } else if (input.id === 'plan-summary-pace') {
        const p = parsePace(input.value);
        if (p) input.value = fmtPace(p.lo, p.hi);
    }
}

function handleTemplateSelect(val) {
    if (!val) return;
    const t = templatesData[val];
    if (!t) return;
    document.getElementById('plan-title').value = t.title;
    document.getElementById('plan-notes').value = t.notes || '';
    // Struttura vuota per tutti i tipi di corsa, tranne la corsa ripetuta
    renderBuilder(val === 'it' ? JSON.parse(JSON.stringify(t.steps)) : []);
}

// Duplica un passo o un blocco Ripetizioni (con tutto quello che contiene) subito sotto
function duplicateBuilderItem(el) {
    const copy = el.cloneNode(true);
    const src = el.querySelectorAll('input, select'), dst = copy.querySelectorAll('input, select');
    src.forEach((f, i) => { dst[i].value = f.value; });
    copy.classList.remove('is-active', 'bs-chosen', 'bs-ghost');
    copy.querySelectorAll('.bs-flash').forEach(x => x.classList.remove('bs-flash'));
    copy.querySelectorAll('.is-active').forEach(x => x.classList.remove('is-active'));
    copy.querySelectorAll('[data-sortable]').forEach(x => { delete x.dataset.sortable; makeSortable(x); });
    el.after(copy);
    if (copy.classList.contains('builder-step')) setActiveStep(copy);
    copy.classList.add('bs-copied');
    setTimeout(() => copy.classList.remove('bs-copied'), 900);
    recalcBuilder();
}

/* =====================================================================
   INIZIALIZZAZIONE UI (eventi, opzioni extra) – una sola volta
   ===================================================================== */

function initUI() {
    // Tipo di corsa: solo questi modelli, in ordine alfabetico
    const sel = document.getElementById('workout-template-select');
    sel.innerHTML = '<option value="">Seleziona il tipo di corsa</option>' +
        TEMPLATE_MENU.map(([v, l]) => `<option value="${v}">${l}</option>`).join('');
    const selLabel = sel.previousElementSibling;
    if (selLabel && selLabel.tagName === 'LABEL') selLabel.textContent = 'Tipo di corsa';
    const titleLabel = document.getElementById('plan-title').previousElementSibling;
    if (titleLabel && titleLabel.tagName === 'LABEL') titleLabel.textContent = 'Nome allenamento';
    document.getElementById('plan-title').placeholder = 'Es. corsa lenta';

    // Pulsanti della struttura: "Esercizio" al posto di "Corsa", "ZF" al posto di "ZF – Zona frequenza"
    document.querySelectorAll('#plan-modal .btn-add-pill').forEach(btn => {
        const t = btn.textContent.trim();
        if (t === '+ Corsa / Lavoro' || t === '+ Corsa') btn.textContent = '+ Esercizio';
        if (t.startsWith('+ ZF')) btn.textContent = '+ ZF';
    });

    // Due gruppi di pulsanti sotto la struttura: Passi e impostazioni (per il passo selezionato)
    const pillsGrid = document.querySelector('#plan-modal .optional-fields-box > div:last-child .add-pills-grid');
    if (pillsGrid && !document.getElementById('settings-pills')) {
        pillsGrid.querySelectorAll('.btn-add-pill').forEach(btn => {
            const t = btn.textContent.trim();
            if (t === '+ Pace' || t === '+ ZF') btn.remove();
        });
        pillsGrid.insertAdjacentHTML('beforebegin', '<span class="pills-label">Aggiungi passo</span>');
        pillsGrid.insertAdjacentHTML('afterend', `
            <span class="pills-label">Aggiungi impostazione al passo selezionato</span>
            <div id="settings-pills" class="add-pills-grid">
                ${Object.keys(SETTING_PILLS).filter(k => !k.includes('–')).map(k =>
                    `<button type="button" class="btn-add-pill" onclick="addBuilderBlock('${k}')">+ ${k}</button>`).join('')}
            </div>`);
    }

    // Stato esecuzione: icone colorate (come nel calendario) al posto del menu a tendina
    const stSel = document.getElementById('exec-status');
    if (stSel && !document.getElementById('status-chips')) {
        [...stSel.options].forEach(o => { if (STATUS[o.value]) o.textContent = STATUS[o.value].label; });
        stSel.style.display = 'none';
        stSel.insertAdjacentHTML('afterend', `<div id="status-chips" class="status-chips">${
            Object.entries(STATUS).map(([k, st]) =>
                `<button type="button" class="status-chip" data-status="${k}" style="--st:${st.color}">
                    <i class="fa-solid ${st.icon}"></i><span>${st.label}</span>
                </button>`).join('')}</div>`);
        document.getElementById('status-chips').addEventListener('click', e => {
            const chip = e.target.closest('.status-chip');
            if (!chip) return;
            stSel.value = chip.dataset.status;
            stSel.dispatchEvent(new Event('change'));
        });
    }

    // Elimina allenamento: solo l'icona "−"
    const del = document.getElementById('btn-delete-plan');
    if (del) { del.innerHTML = '<i class="fa-solid fa-minus"></i>'; del.title = 'Elimina'; }

    // Cerchio in alto: percentuale al centro + km e numero di allenamenti
    const svg = document.querySelector('.progress-ring');
    if (svg && !document.getElementById('ring-pct')) {
        const NS = 'http://www.w3.org/2000/svg';
        const t1 = document.createElementNS(NS, 'text');
        t1.id = 'ring-pct';
        Object.entries({ x: 40, y: 45, 'text-anchor': 'middle', fill: '#ffffff', 'font-size': 15, 'font-weight': 'bold' }).forEach(([k, v]) => t1.setAttribute(k, v));
        svg.append(t1);
        document.getElementById('goal-progress-ring').style.transition = 'stroke-dashoffset 0.6s ease';
    }
    const ringBox = document.querySelector('.ring-container');
    if (ringBox && !document.getElementById('ring-sub')) {
        ringBox.querySelector('.ring-text').insertAdjacentHTML('beforeend', '<small id="ring-sub" class="ring-sub"></small>');
    }

    // Profilo: gare in programma e record personali + finestra per inserirli
    initGoalsUI();

    // Tutte le etichette fisse: maiuscola solo all'inizio
    sentenceCaseStatic();

    // Schermata Pace: scorciatoie distanze, calcolo automatico e sezioni extra
    initCalculatorExtras();

    // Builder: eventi delegati
    const b = document.getElementById('active-builder-blocks');
    b.addEventListener('input', recalcBuilder);
    b.addEventListener('change', e => {
        recalcBuilder();
    });
    b.addEventListener('pointerdown', e => {
        const st = e.target.closest('.builder-step');
        if (st) setActiveStep(st);
    });
    b.addEventListener('focusin', e => {
        const st = e.target.closest('.builder-step');
        if (st) setActiveStep(st);
    });
    b.addEventListener('focusout', e => { if (e.target.matches('input')) { normalizeField(e.target); recalcBuilder(); } });
    b.addEventListener('click', e => {
        const rm = e.target.closest('.bs-remove');
        if (rm) { rm.closest('.builder-step, .builder-block').remove(); recalcBuilder(); return; }
        const cp = e.target.closest('.bs-copy');
        if (cp) { duplicateBuilderItem(cp.closest('.builder-step, .builder-block')); return; }
        const xf = e.target.closest('.bs-x-field');
        if (xf) { toggleStepField(xf.closest('.builder-step'), xf.dataset.field, false); return; }
        const af = e.target.closest('.bs-add-field');
        if (af) { toggleStepField(af.closest('.builder-step'), af.dataset.field, true); return; }
        const add = e.target.closest('[data-add]');
        if (add) {
            const type = add.dataset.add;
            const newStep = createStepEl(EMPTY(type));
            add.closest('.builder-block').querySelector('.bb-inner').appendChild(newStep);
            setActiveStep(newStep); // le impostazioni aggiunte dopo vanno su questo passo
            recalcBuilder();
        }
    });
    ['plan-summary-time', 'plan-summary-pace'].forEach(id =>
        document.getElementById(id).addEventListener('blur', e => normalizeField(e.target)));

    // Modale esecuzione
    document.getElementById('exec-status').addEventListener('change', e => applyStatusVisibility(e.target.value));
    const timeEl = document.getElementById('exec-time');
    timeEl.addEventListener('blur', () => { normalizeField(timeEl); updateExecHint(); });
    timeEl.addEventListener('input', updateExecHint);
    document.getElementById('exec-dist').addEventListener('input', updateExecHint);
    timeEl.placeholder = 'es. 45:20 o 45 (min)';
    if (!document.getElementById('exec-pace-hint')) {
        const h = document.createElement('small');
        h.id = 'exec-pace-hint';
        h.className = 'bs-hint';
        timeEl.closest('div').parentElement.insertAdjacentElement('afterend', h);
    }
    // Risultato: riga "Previsto" in alto e risultato per passo (tutto facoltativo)
    const execForm = document.getElementById('execution-form');
    if (!document.getElementById('exec-plan-ref')) {
        execForm.insertAdjacentHTML('afterbegin', '<div id="exec-plan-ref" class="res-plan" hidden></div>');
        labelOf('exec-notes').insertAdjacentHTML('beforebegin', '<div id="exec-steps"></div>');
    }
    document.getElementById('exec-dist').removeAttribute('required');
    const stepsBox = document.getElementById('exec-steps');
    stepsBox.addEventListener('focusout', e => { if (e.target.classList.contains('res-in')) normalizeResultInput(e.target); });
}

/* =====================================================================
   MODALE PIANIFICAZIONE
   ===================================================================== */

function openPlanModal(id = null) {
    document.getElementById('plan-modal').style.display = 'block';
    document.getElementById('btn-delete-plan').style.display = id ? 'inline-block' : 'none';
    document.getElementById('workout-template-select').value = '';

    if (id) {
        const item = allPlannedWorkouts.find(w => w.id == id);
        if (!item) return;
        document.getElementById('modal-plan-title').innerText = 'Modifica allenamento';
        document.getElementById('plan-id').value = item.id;
        document.getElementById('plan-date').value = item.date || selectedDateStr;
        document.getElementById('plan-title').value = item.title || '';
        document.getElementById('plan-notes').value = item.notes || '';
        const sum = planSummary(item);
        document.getElementById('plan-summary-dist').value = item.summary_dist || '';
        document.getElementById('plan-summary-pace').value = item.summary_pace || '';
        document.getElementById('plan-summary-time').value = item.summary_time || '';
        renderBuilder(JSON.parse(JSON.stringify(sum.steps || [])));
    } else {
        document.getElementById('modal-plan-title').innerText = 'Nuovo allenamento';
        document.getElementById('plan-form').reset();
        document.getElementById('plan-id').value = '';
        document.getElementById('plan-date').value = selectedDateStr;
        renderBuilder([]);
    }
}
function closePlanModal() { document.getElementById('plan-modal').style.display = 'none'; }

async function savePlannedWorkout(e) {
    e.preventDefault();
    const id = document.getElementById('plan-id').value;
    const steps = readBuilder();

    // Controllo valori non validi
    const bad = document.querySelector('#active-builder-blocks .bs-hint.is-warning');
    if (bad) { bad.scrollIntoView({ block: 'center' }); alert('Controlla i campi segnati con ⚠ prima di salvare.'); return; }

    const title = document.getElementById('plan-title').value.trim();
    let payload;
    if (steps.length || /riposo|rest/i.test(title)) {
        payload = buildPlanPayload(currentUser, document.getElementById('plan-date').value,
            { title, steps, notes: document.getElementById('plan-notes').value.trim() });
    } else {
        // Nessun passo: valori inseriti a mano
        const t = parseDuration(document.getElementById('plan-summary-time').value, 'min');
        const p = parsePace(document.getElementById('plan-summary-pace').value);
        payload = {
            user_id: currentUser, date: document.getElementById('plan-date').value,
            workout_type: title, title,
            summary_dist: parseFloat(document.getElementById('plan-summary-dist').value) || null,
            summary_pace: p ? fmtPace(p.lo, p.hi) : null,
            summary_time: t != null ? fmtDuration(t) : null,
            custom_fields: { _v: 2, steps: [] },
            notes: document.getElementById('plan-notes').value.trim() || null
        };
    }

    const { error } = id
        ? await supabaseClient.from('planned_workouts').update(payload).eq('id', id)
        : await supabaseClient.from('planned_workouts').insert([payload]);
    if (reportError(id ? 'modifica allenamento' : 'creazione allenamento', error)) return;

    selectedDateStr = payload.date;
    currentWeekOffset = weekOffsetFor(payload.date);
    closePlanModal();
    await fetchAllData();
}

async function deletePlannedWorkout() {
    const id = document.getElementById('plan-id').value;
    if (id && confirm('Eliminare questo allenamento?')) {
        const { error } = await supabaseClient.from('planned_workouts').delete().eq('id', id);
        if (reportError('eliminazione allenamento', error)) return;
        closePlanModal();
        await fetchAllData();
    }
}

/* =====================================================================
   MODALE ESECUZIONE (Fatto / Saltato / Spostato) – inserimento e modifica
   ===================================================================== */

function labelOf(id) { return document.getElementById(id).previousElementSibling; }
function showField(id, show) {
    const el = document.getElementById(id);
    el.style.display = show ? '' : 'none';
    const lab = el.previousElementSibling;
    if (lab && lab.tagName === 'LABEL') lab.style.display = show ? '' : 'none';
}

function applyStatusVisibility(status) {
    document.querySelectorAll('#status-chips .status-chip').forEach(c => c.classList.toggle('active', c.dataset.status === status));
    const done = status === 'done', moved = status === 'in-progress';
    document.querySelector('#upload-modal .gpx-drop-zone').style.display = done ? '' : 'none';
    showField('exec-title', done);
    showField('exec-hr', done);
    showField('exec-date', done || moved);
    document.getElementById('exec-dist').closest('div').parentElement.style.display = done ? 'grid' : 'none';
    document.getElementById('exec-pace-hint').style.display = done ? '' : 'none';

    document.getElementById('exec-dist').required = false; // facoltativa
    const ref = document.getElementById('exec-plan-ref');
    if (ref) ref.hidden = !done || !ref.innerHTML;
    const stepsBox = document.getElementById('exec-steps');
    if (stepsBox) stepsBox.style.display = done ? '' : 'none';
    document.getElementById('exec-title').required = done;
    document.getElementById('exec-date').required = done || moved;

    labelOf('exec-date').textContent = moved ? 'Nuova data' : 'Data esecuzione';
    labelOf('exec-notes').textContent = status === 'to-fix' ? 'Motivo (perché hai saltato)' : 'Note';
    document.getElementById('exec-notes').placeholder = status === 'to-fix' ? 'Es. stanchezza, pioggia, impegno di lavoro...' : 'Sensazioni, meteo...';
    const submit = document.querySelector('#execution-form button[type="submit"]');
    submit.textContent = done ? 'Salva esecuzione' : (moved ? 'Sposta allenamento' : 'Segna come saltato');
}

function updateExecHint() {
    const d = parseFloat(document.getElementById('exec-dist').value);
    const t = parseDuration(document.getElementById('exec-time').value, 'min');
    const parts = [];
    if (t != null && document.getElementById('exec-time').value.trim()) parts.push(`Tempo = ${fmtDurationWords(t)}`);
    if (d > 0 && t) parts.push(`Pace medio ${fmtPaceSec(t / d)} /km`);
    if (gpxData?.hr) parts.push(`FC media dal GPX ${gpxData.hr} bpm`);
    document.getElementById('exec-pace-hint').textContent = parts.join(' · ');
}

const MOVED_RE = /^Spostato al (\d{2})\/(\d{2})\/(\d{4})(?: · )?/;
function movedTarget(notes) {
    const m = String(notes || '').match(MOVED_RE);
    return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

function openUploadModal(planId = null, execId = null) {
    const form = document.getElementById('execution-form');
    form.reset();
    document.getElementById('gpx-file-input').value = ''; // il file precedente non resta selezionato
    gpxData = null;
    form.dataset.execId = execId || '';

    const exec = execId ? allImportedWorkouts.find(w => w.id == execId) : null;
    const plan = planId ? allPlannedWorkouts.find(w => w.id == planId) : (exec ? findPlanForExec(exec) : null);
    document.getElementById('exec-plan-id').value = plan ? plan.id : '';
    document.querySelector('#upload-modal h3').textContent = exec ? 'Modifica esecuzione' : 'Registra risultato e stato';

    if (exec) {
        document.getElementById('exec-status').value = exec.status || 'done';
        document.getElementById('exec-title').value = exec.title || '';
        document.getElementById('exec-dist').value = exec.dist || '';
        document.getElementById('exec-time').value = exec.time_exec || '';
        document.getElementById('exec-hr').value = exec.hr_zone || 'Z2';
        document.getElementById('exec-date').value = exec.status === 'in-progress' ? (movedTarget(exec.notes) || exec.date) : exec.date;
        document.getElementById('exec-notes').value = String(exec.notes || '').replace(MOVED_RE, '');
        if (exec.hr) gpxData = { hr: exec.hr };
    } else {
        document.getElementById('exec-status').value = 'done';
        document.getElementById('exec-date').value = plan ? plan.date : selectedDateStr;
        document.getElementById('exec-title').value = plan ? titleCase(plan.title) : '';
    }
    fillExecFromPlan(plan, exec);
    applyStatusVisibility(document.getElementById('exec-status').value);
    updateExecHint();
    document.getElementById('upload-modal').style.display = 'block';
}
function closeUploadModal() { document.getElementById('upload-modal').style.display = 'none'; }

function parseGPXFile(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
        const xml = new DOMParser().parseFromString(e.target.result, 'text/xml');
        const pts = xml.getElementsByTagName('trkpt');
        let dist = 0;
        for (let i = 0; i < pts.length - 1; i++) {
            dist += calcHaversineDistance(+pts[i].getAttribute('lat'), +pts[i].getAttribute('lon'), +pts[i + 1].getAttribute('lat'), +pts[i + 1].getAttribute('lon'));
        }
        let secs = null;
        if (pts.length > 1) {
            const t0 = pts[0].getElementsByTagName('time')[0]?.textContent;
            const t1 = pts[pts.length - 1].getElementsByTagName('time')[0]?.textContent;
            if (t0 && t1) secs = Math.round((new Date(t1) - new Date(t0)) / 1000);
        }
        // Frequenza cardiaca media (estensioni Garmin/Apple: <gpxtpx:hr> o <hr>)
        const hrs = [...xml.getElementsByTagName('*')].filter(n => n.localName === 'hr').map(n => +n.textContent).filter(Boolean);
        gpxData = { hr: hrs.length ? Math.round(hrs.reduce((a, b) => a + b, 0) / hrs.length) : null };

        document.getElementById('exec-dist').value = (dist / 1000).toFixed(2);
        if (secs > 0) document.getElementById('exec-time').value = fmtDuration(secs);
        if (!document.getElementById('exec-title').value) document.getElementById('exec-title').value = file.name.replace(/\.gpx$/i, '');
        updateExecHint();
    };
    reader.readAsText(file);
}

function calcHaversineDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3, r1 = lat1 * Math.PI / 180, r2 = lat2 * Math.PI / 180;
    const dR = (lat2 - lat1) * Math.PI / 180, dL = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dR / 2) ** 2 + Math.cos(r1) * Math.cos(r2) * Math.sin(dL / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/* ---------- Risultato che segue l'allenamento pianificato ---------- */

// Righe del risultato: un passo = una riga; nelle ripetizioni una riga per passo interno (media)
function resultRows(steps) {
    const rows = [];
    (steps || []).forEach((s, i) => {
        if (s.type === 'repeat') {
            rows.push({ head: true, reps: s.reps });
            (s.steps || []).forEach((x, j) => rows.push({ key: `${i}.${j}`, step: x, nested: true }));
        } else rows.push({ key: String(i), step: s });
    });
    return rows;
}
// Per ogni passo: a distanza → Tempo + Pace; a tempo o aperto → Tempo + Distanza
function resultSpec(s) {
    const c = calcStep(s);
    const t = STEP_TYPES[s.type] || {};
    if (s.mode === 'dist') return {
        plain: t.plain === 'sec' || (s.dist_km != null && s.dist_km < 1.5) ? 'sec' : 'min',
        timePh: c.time ? fmtDuration(c.time) : '--',
        second: 'pace', secondLabel: 'Pace', secondPh: hasPace(s) ? fmtPaceQ(paceMid(s)) : '--'
    };
    return {
        plain: t.plain || 'min',
        timePh: s.time_s != null ? fmtDuration(s.time_s) : '--',
        second: 'dist', secondLabel: 'Distanza', secondPh: c.dist ? fmtDist(c.dist) : '--'
    };
}
function stepPlanText(s) {
    const parts = [];
    if (s.mode === 'dist') parts.push(fmtDist(s.dist_km));
    else if (s.mode === 'time') parts.push(fmtDuration(s.time_s));
    if (hasPace(s)) parts.push(describePace(s));
    return parts.join(' · ') || 'Libero';
}
function savedStepResults(exec) {
    const r = exec ? exec.step_results : null;
    return parseFields(r) || {};
}

function fillExecFromPlan(plan, exec) {
    const ref = document.getElementById('exec-plan-ref');
    const box = document.getElementById('exec-steps');
    const distEl = document.getElementById('exec-dist'), timeEl = document.getElementById('exec-time');
    ref.innerHTML = ''; box.innerHTML = '';
    distEl.placeholder = 'es. 8.00'; timeEl.placeholder = 'es. 45:20 o 45 (min)';
    if (!plan || isRestDay(plan)) return;

    const sum = planSummary(plan);
    const zones = [...new Set(JSON.stringify(sum.steps).match(/Z\d/g) || [])].sort();
    const main = [sum.dist ? fmtDist(sum.dist) : '', sum.time ? fmtDuration(sum.time) : '', sum.pace ? fmtPaceSec(sum.pace) + ' /km' : ''].filter(Boolean).join(' · ');
    ref.innerHTML = `Previsto: <b>${esc(main || '--')}</b>${zones.length ? ` · ZF ${zones.join(' · ')}` : ''}`;
    if (sum.dist) distEl.placeholder = sum.dist.toFixed(2);
    if (sum.time) timeEl.placeholder = fmtDuration(sum.time);
    // Zona cardio: parte da quella più alta dell'allenamento (solo per un nuovo risultato)
    if (!exec && zones.length) document.getElementById('exec-hr').value = zones[zones.length - 1];

    const rows = resultRows(sum.steps);
    if (!rows.length) return;
    const saved = savedStepResults(exec);
    box.innerHTML = `<div class="res-steps-title">Risultato per passo <small>· facoltativo</small></div>` + rows.map(r => {
        if (r.head) return `
            <div class="res-step"><span class="res-bar" style="background:var(--pink)"></span><div>
                <div class="res-top"><i class="fa-solid fa-repeat" style="color:var(--pink)"></i>Ripetizioni × ${r.reps}</div>
                <div class="res-planline">Inserisci la media delle ripetute</div></div></div>`;
        const s = r.step, t = STEP_TYPES[s.type] || { label: s.type, icon: 'fa-circle', color: 'var(--text-muted)' };
        const sp = resultSpec(s), v = saved[r.key] || {};
        const label = r.nested ? `${t.label} · media` : t.label;
        const secondVal = sp.second === 'pace' ? (v.pace_sec != null ? fmtPaceQ(v.pace_sec) : '') : (v.dist_km != null ? fmtDist(v.dist_km) : '');
        const inp = (f, ph, val) => `<input type="text" class="res-in" data-key="${r.key}" data-f="${f}" data-plain="${sp.plain}" data-label="${esc(label)}" placeholder="${esc(ph)}" value="${esc(val)}">`;
        return `
            <div class="res-step ${r.nested ? 'is-nested' : ''}"><span class="res-bar" style="background:${t.color}"></span><div>
                <div class="res-top"><i class="fa-solid ${t.icon}" style="color:${t.color}"></i>${esc(label)}${s.zone ? `<span class="zone-chip">${esc(zoneNorm(s.zone))}</span>` : ''}</div>
                <div class="res-planline">Previsto: ${esc(stepPlanText(s))}</div>
                <div class="res-ins">
                    <div><label>Tempo</label>${inp('time', sp.timePh, v.time_s != null ? fmtDuration(v.time_s) : '')}</div>
                    <div><label>${sp.secondLabel}</label>${inp(sp.second, sp.secondPh, secondVal)}</div>
                </div></div></div>`;
    }).join('');
}

function parseResultInput(inp) {
    const raw = inp.value.trim();
    if (!raw) return null;
    if (inp.dataset.f === 'time') return parseDuration(raw, inp.dataset.plain);
    if (inp.dataset.f === 'pace') return parsePaceOne(raw);
    return parseDistanceKm(raw);
}
function normalizeResultInput(inp) {
    const v = parseResultInput(inp);
    const bad = !!inp.value.trim() && v == null;
    inp.classList.toggle('is-bad', bad);
    if (v == null) return;
    inp.value = inp.dataset.f === 'time' ? fmtDuration(v) : inp.dataset.f === 'pace' ? fmtPaceQ(v) : fmtDist(v);
}

// Solo i campi compilati; il pace si calcola da tempo e distanza quando possibile
function readStepResults(plan) {
    const steps = planSummary(plan).steps;
    const byKey = {};
    resultRows(steps).forEach(r => { if (!r.head) byKey[r.key] = r.step; });
    const out = {};
    document.querySelectorAll('#exec-steps .res-in').forEach(inp => {
        const v = parseResultInput(inp);
        if (v == null) return;
        const o = out[inp.dataset.key] || (out[inp.dataset.key] = { label: inp.dataset.label });
        if (inp.dataset.f === 'time') o.time_s = v;
        if (inp.dataset.f === 'pace') o.pace_sec = v;
        if (inp.dataset.f === 'dist') o.dist_km = v;
    });
    Object.entries(out).forEach(([k, o]) => {
        const s = byKey[k];
        const d = o.dist_km ?? (s && s.mode === 'dist' ? s.dist_km : null);
        if (o.pace_sec == null && o.time_s && d) o.pace_sec = Math.round(o.time_s / d);
    });
    return Object.keys(out).length ? out : null;
}

async function saveExecutionWorkout(e) {
    e.preventDefault();
    const form = document.getElementById('execution-form');
    const execId = form.dataset.execId || null;
    const exec = execId ? allImportedWorkouts.find(w => w.id == execId) : null;
    const plan = allPlannedWorkouts.find(w => w.id == document.getElementById('exec-plan-id').value) || null;
    const status = document.getElementById('exec-status').value;
    const notes = document.getElementById('exec-notes').value.trim();
    const baseDate = exec ? exec.date : (plan ? plan.date : selectedDateStr);
    const title = plan ? titleCase(plan.title) : (exec ? exec.title : 'Allenamento');
    let payload, moveTo = null;

    if (status === 'done') {
        const dist = parseFloat(document.getElementById('exec-dist').value) || 0;
        const time = parseDuration(document.getElementById('exec-time').value, 'min');
        if (document.querySelector('#exec-steps .res-in.is-bad')) { alert('Controlla i valori segnati in rosso nel risultato per passo.'); return; }
        payload = {
            user_id: currentUser, date: document.getElementById('exec-date').value, status,
            title: document.getElementById('exec-title').value.trim() || title,
            dist, time_exec: time ? fmtDuration(time) : null,
            pace: time && dist ? fmtPaceSec(time / dist) : null,
            pace_sec: time && dist ? Math.round(time / dist) : null,
            hr_zone: document.getElementById('exec-hr').value,
            hr: gpxData?.hr || null,
            notes: notes || null,
            step_results: plan ? readStepResults(plan) : null
        };
    } else if (status === 'to-fix') {
        payload = { user_id: currentUser, date: baseDate, status, title, dist: 0, time_exec: null, pace: null, pace_sec: null, hr_zone: null, hr: null, notes: notes || null, step_results: null };
    } else {
        moveTo = document.getElementById('exec-date').value;
        if (!moveTo || moveTo === baseDate) { alert('Scegli una nuova data diversa da quella attuale.'); return; }
        const [y, m, d] = moveTo.split('-');
        payload = {
            user_id: currentUser, date: baseDate, status, title, dist: 0, time_exec: null, pace: null, pace_sec: null, hr_zone: null, hr: null,
            notes: `Spostato al ${d}/${m}/${y}` + (notes ? ` · ${notes}` : ''),
            step_results: null
        };
    }

    const send = pl => execId
        ? supabaseClient.from('imported_workouts').update(pl).eq('id', execId)
        : supabaseClient.from('imported_workouts').insert([pl]);
    let { error } = await send(payload);
    // Se nel database manca ancora la colonna step_results, salva il resto e avvisa
    if (error && /step_results/.test(error.message || '')) {
        const hadSteps = !!payload.step_results;
        delete payload.step_results;
        ({ error } = await send(payload));
        if (!error && hadSteps) alert('Risultato salvato, ma senza i passi: nel database manca la colonna step_results (vedi file supabase-risultati-passi.sql).');
    }
    if (reportError(execId ? 'modifica esecuzione' : 'registrazione esecuzione', error)) return;

    // Spostamento: l'allenamento pianificato va alla nuova data
    if (moveTo) {
        const prevTarget = exec ? movedTarget(exec.notes) : null;
        const toMove = plan && (plan.date === baseDate || plan.date === prevTarget) ? plan
            : userPlanned().find(p => p.date === (prevTarget || baseDate) && (p.title || '').toLowerCase() === title.toLowerCase());
        if (toMove && toMove.date !== moveTo) {
            const { error: e2 } = await supabaseClient.from('planned_workouts').update({ date: moveTo }).eq('id', toMove.id);
            reportError('spostamento allenamento', e2);
        }
    }

    selectedDateStr = payload.date;
    currentWeekOffset = weekOffsetFor(payload.date);
    closeUploadModal();
    await fetchAllData();
}

async function deleteImportedWorkout(id) {
    if (confirm('Eliminare questa esecuzione?')) {
        const { error } = await supabaseClient.from('imported_workouts').delete().eq('id', id);
        if (reportError('eliminazione esecuzione', error)) return;
        await fetchAllData();
    }
}

/* =====================================================================
   CALCOLATRICE PACE + PREVISIONI GARA + RITMI DI ALLENAMENTO
   ===================================================================== */

const RACE_DISTANCES = [['5 km', 5], ['10 km', 10], ['Mezza', 21.0975], ['Maratona', 42.195]];

function initCalculatorExtras() {
    const distInput = document.getElementById('calc-dist');
    const timeInput = document.getElementById('calc-time');
    const card = document.querySelector('#tab-calculator .calc-form-card');
    if (!distInput || !card || document.getElementById('calc-extras')) return;

    // Scorciatoie per le distanze di gara
    distInput.insertAdjacentHTML('afterend', `
        <div class="calc-chips">
            ${RACE_DISTANCES.map(([l, d]) => `<button type="button" class="recap-chip" onclick="setCalcDist(${d})">${l}</button>`).join('')}
        </div>`);
    distInput.addEventListener('input', calculatePace);
    timeInput.addEventListener('input', calculatePace);
    timeInput.addEventListener('blur', () => {
        const t = parseDuration(timeInput.value, 'min');
        if (t) timeInput.value = fmtDuration(t);
    });

    card.insertAdjacentHTML('afterend', '<div id="calc-extras"></div>');
    renderCalcExtras(null, null);
}

function setCalcDist(d) {
    document.getElementById('calc-dist').value = d;
    calculatePace();
}

function calculatePace() {
    const dist = parseDistanceKm(document.getElementById('calc-dist').value, 1000);
    const seconds = parseDuration(document.getElementById('calc-time').value.trim(), 'min');
    if (!dist || dist <= 0 || !seconds) { renderCalcExtras(null, null); return; }
    document.getElementById('res-dist-display').innerText = `${fmtNum(dist, 2)} KM`;
    document.getElementById('res-time-display').innerText = fmtDuration(seconds);
    document.getElementById('calc-pace-output').innerText = `${fmtPaceSec(seconds / dist)} min/km`;
    renderCalcExtras(dist, seconds);
}

function resetCalculator() {
    document.getElementById('calc-dist').value = '';
    document.getElementById('calc-time').value = '';
    document.getElementById('res-dist-display').innerText = '-- KM';
    document.getElementById('res-time-display').innerText = '--:--';
    document.getElementById('calc-pace-output').innerText = '0:00 min/km';
    renderCalcExtras(null, null);
}

// Formula di Riegel: T2 = T1 × (D2 / D1)^1.06
function riegel(t1, d1, d2) { return t1 * Math.pow(d2 / d1, 1.06); }

function renderCalcExtras(dist, sec) {
    const box = document.getElementById('calc-extras');
    if (!box) return;
    if (!dist || !sec) {
        box.innerHTML = `
            <div class="calc-form-card calc-extra">
                <span class="res-title">Cosa puoi calcolare</span>
                <p class="calc-tip">Inserisci la distanza e il tempo di una gara o di un test (es. 5 km in 27:30) per vedere la velocità, i passaggi, la previsione sulle altre distanze e i ritmi consigliati per ogni allenamento.</p>
            </div>`;
        return;
    }
    const pace = sec / dist;
    const kmh = 3600 / pace;
    const p10 = riegel(sec, dist, 10) / 10; // pace equivalente sui 10 km

    const splits = [['400 m', 0.4], ['1 km', 1], ['5 km', 5], ['10 km', 10], ['Mezza', 21.0975], ['Maratona', 42.195]];
    const zones = [
        ['Corsa di recupero', 'Z1', 75, 95],
        ['Fondo lento / lungo', 'Z2', 50, 70],
        ['Fondo medio', 'Z3', 25, 35],
        ['Soglia (tempo run)', 'Z4', 5, 12],
        ['Ripetute lunghe (1000 m)', 'Z4', -8, 0],
        ['Ripetute brevi (400 m)', 'Z5', -22, -12]
    ];
    const row = (a, b, c = '') => `<div class="calc-row"><span>${a}</span><strong>${b}</strong><small>${c}</small></div>`;

    box.innerHTML = `
        <div class="calc-form-card calc-extra">
            <span class="res-title">Velocità</span>
            ${row('Pace', fmtPaceSec(pace) + ' /km')}
            ${row('Velocità', fmtNum(kmh, 1) + ' km/h')}
            ${row('Al giro di pista (400 m)', fmtDuration(pace * 0.4))}
        </div>
        <div class="calc-form-card calc-extra">
            <span class="res-title">Passaggi a questo ritmo</span>
            ${splits.map(([l, d]) => row(l, fmtDuration(pace * d))).join('')}
        </div>
        <div class="calc-form-card calc-extra">
            <span class="res-title">Previsione gare</span>
            ${RACE_DISTANCES.map(([l, d]) => {
                const t = riegel(sec, dist, d);
                return row(l, fmtDuration(t), fmtPaceSec(t / d) + ' /km');
            }).join('')}
            <p class="calc-tip">Stima con la formula di Riegel: è più affidabile per distanze vicine a quella inserita. Per la maratona serve anche un buon volume di lunghi.</p>
        </div>
        <div class="calc-form-card calc-extra">
            <span class="res-title">Ritmi di allenamento consigliati</span>
            ${zones.map(([l, z, a, b]) => row(l, `${fmtPaceSec(p10 + a)}–${fmtPaceSec(p10 + b)}`, z)).join('')}
            <p class="calc-tip">Calcolati dal tuo ritmo equivalente sui 10 km (${fmtPaceSec(p10)} /km). Sono indicazioni: se il cuore sale oltre la zona indicata, rallenta.</p>
        </div>`;
}


/* =====================================================================
   PROFILO: GARE IN PROGRAMMA + RECORD PERSONALI
   Tabella Supabase "athlete_goals" (vedi supabase-goals.sql)
   - kind = 'race'   → gara in programma (data, distanza, tempo obiettivo facoltativo)
   - kind = 'record' → record personale (5 km, 10 km, mezza, maratona)
   La stima del tempo di gara usa la formula di Riegel:
   1) dal record personale con la distanza più vicina, se c'è
   2) altrimenti dal miglior allenamento "Fatto" degli ultimi 120 giorni (≥ 3 km): stima prudente
   ===================================================================== */

const RECORD_DISTANCES = [['5KM', 5], ['10KM', 10], ['Mezza maratona', 21.0975], ['Maratona', 42.195]];

// Nome della distanza: 5KM, 10KM, Mezza maratona, Maratona, altrimenti es. "15KM"
function recordLabel(km) {
    const known = RECORD_DISTANCES.find(([, d]) => Math.abs(d - km) < 0.05);
    return known ? known[0] : fmtDist(km).toUpperCase().replace(' ', '');
}

function userGoals(kind) { return allGoals.filter(g => g.user_id === currentUser && g.kind === kind); }

function fmtDateIt(dateStr) {
    if (!dateStr) return '--';
    const [y, m, d] = dateStr.split('-');
    return `${d}/${m}/${y}`;
}

function estimateRace(distKm) {
    if (!distKm) return null;
    const recs = userGoals('record').filter(r => r.time_s && r.dist_km);
    if (recs.length) {
        const best = recs.reduce((a, b) => Math.abs(Math.log(b.dist_km / distKm)) < Math.abs(Math.log(a.dist_km / distKm)) ? b : a);
        return { time: riegel(best.time_s, best.dist_km, distKm), source: `Dal record ${fmtDist(best.dist_km)} (${fmtDuration(best.time_s)})` };
    }
    const since = new Date(); since.setDate(since.getDate() - 120);
    const runs = userImported().filter(e => e.status === 'done' && parseFloat(e.dist) >= 3 && parseDuration(e.time_exec, 'min') && parseLocalDate(e.date) >= since);
    if (!runs.length) return null;
    let best = null;
    runs.forEach(e => {
        const t = riegel(parseDuration(e.time_exec, 'min'), parseFloat(e.dist), distKm);
        if (!best || t < best.time) best = { time: t, source: `Dall'Allenamento del ${fmtDateShort(e.date)} (stima prudente)` };
    });
    return best;
}

function initGoalsUI() {
    const tab = document.getElementById('tab-profile');
    if (tab && !document.getElementById('profile-goals')) {
        tab.insertAdjacentHTML('beforeend', '<div id="profile-goals"></div>');
    }
    if (!document.getElementById('goal-modal')) {
        document.body.insertAdjacentHTML('beforeend', `
            <div id="goal-modal" class="modal">
                <div class="modal-content">
                    <span class="close-btn" onclick="closeGoalModal()">&times;</span>
                    <h3 id="goal-modal-title">Gara</h3>
                    <form id="goal-form" onsubmit="saveGoal(event)">
                        <input type="hidden" id="goal-id">
                        <input type="hidden" id="goal-kind">
                        <label id="goal-name-label">Nome gara</label>
                        <input type="text" id="goal-name" placeholder="Es. corsa di San Martino">
                        <label>Data</label>
                        <input type="date" id="goal-date" required>
                        <label>Distanza (km)</label>
                        <input type="text" id="goal-dist" inputmode="decimal" placeholder="es. 10 o 21,1" required>
                        <label id="goal-time-label">Tempo obiettivo (facoltativo)</label>
                        <input type="text" id="goal-time" placeholder="es. 50:00 o 1:50:00">
                        <small class="bs-hint" id="goal-hint"></small>
                        <div class="modal-actions">
                            <button type="submit" class="btn-action-cta btn-add-green" style="width:100%;">Salva</button>
                            <button type="button" id="goal-delete" class="btn-action-cta btn-delete-red" title="Elimina" onclick="deleteGoal()"><i class="fa-solid fa-minus"></i></button>
                        </div>
                    </form>
                </div>
            </div>`);
        ['goal-dist', 'goal-time'].forEach(id => document.getElementById(id).addEventListener('input', updateGoalHint));
        document.getElementById('goal-time').addEventListener('blur', e => {
            const t = parseDuration(e.target.value, 'min');
            if (t) e.target.value = fmtDuration(t);
            updateGoalHint();
        });
    }
}

function goalRow(tile, cols, extra = '', onclick = '') {
    return `
        <div class="goal-card" ${onclick ? `onclick="${onclick}"` : ''}>
            <div class="goal-main">
                <div class="goal-tile">${tile}</div>
                ${cols.map(([l, v]) => `<div class="goal-col"><small>${l}</small><strong>${v}</strong></div>`).join('')}
            </div>
            ${extra}
        </div>`;
}

function renderProfile() {
    const box = document.getElementById('profile-goals');
    if (!box) return;
    if (goalsUnavailable) {
        box.innerHTML = `<div class="profile-card"><p class="calc-tip">Per usare gare e record esegui una volta lo script <strong>supabase-goals.sql</strong> in Supabase → SQL Editor, poi ricarica la pagina.</p></div>`;
        return;
    }
    const today = toLocalISO(new Date());
    const races = userGoals('race').sort((a, b) => a.date.localeCompare(b.date));
    const future = races.filter(r => r.date >= today), past = races.filter(r => r.date < today).reverse();

    const raceCard = (r, isPast) => {
        const est = estimateRace(r.dist_km);
        const days = Math.round((parseLocalDate(r.date) - parseLocalDate(today)) / 86400000);
        const extra = `
            <div class="goal-foot">
                <span>${[r.name ? esc(titleCase(r.name)) : '', isPast ? 'Conclusa' : `<b>${days === 0 ? 'Oggi' : days === 1 ? 'Domani' : `Tra ${days} giorni`}</b>`, r.time_s ? `Obiettivo ${fmtDuration(r.time_s)}` : ''].filter(Boolean).join(' · ')}</span>
                <span class="icon-btn-row">
                    <button class="btn-circle-muted" title="Modifica" onclick="event.stopPropagation(); openGoalModal('race', '${r.id}')"><i class="fa-solid fa-pen"></i></button>
                    <button class="btn-circle-red" title="Elimina" onclick="event.stopPropagation(); deleteGoal('${r.id}')"><i class="fa-solid fa-minus"></i></button>
                </span>
            </div>
            ${est ? `<small class="goal-src">Stima ${est.source}</small>` : '<small class="goal-src">Stima: aggiungi un record o registra qualche corsa con distanza e tempo.</small>'}`;
        return goalRow(fmtDist(r.dist_km).toUpperCase().replace(' ', ''), [
            ['Data', fmtDateIt(r.date)],
            ['Stima', est ? fmtDuration(est.time) : '--'],
            ['Ritmo', est ? fmtPaceSec(est.time / r.dist_km) + ' / km' : '--']
        ], extra);
    };

    // Record: solo quelli inseriti, ordinati per distanza (nessuna riga vuota fissa)
    const recCards = userGoals('record').sort((a, b) => a.dist_km - b.dist_km).map(r => goalRow(recordLabel(r.dist_km), [
        ['Tempo', r.time_s ? fmtDuration(r.time_s) : '--'],
        ['Ritmo', r.time_s ? fmtPaceSec(r.time_s / r.dist_km) + ' / km' : '--'],
        ['Data', fmtDateIt(r.date)]
    ], `
        <div class="goal-foot">
            <span></span>
            <span class="icon-btn-row">
                <button class="btn-circle-muted" title="Modifica" onclick="event.stopPropagation(); openGoalModal('record', '${r.id}')"><i class="fa-solid fa-pen"></i></button>
                <button class="btn-circle-red" title="Elimina" onclick="event.stopPropagation(); deleteGoal('${r.id}')"><i class="fa-solid fa-minus"></i></button>
            </span>
        </div>`, `openGoalModal('record', '${r.id}')`)).join('');

    box.innerHTML = `
        <div class="goal-section-head">
            <span>Gare in programma</span>
            <button class="btn-circle-green" title="Aggiungi gara" onclick="openGoalModal('race')"><i class="fa-solid fa-plus"></i></button>
        </div>
        ${future.length ? future.map(r => raceCard(r, false)).join('') : '<p class="empty-steps">Nessuna gara in programma. Aggiungila con il +.</p>'}
        ${past.length ? `<div class="goal-section-head"><span>Gare passate</span></div>${past.map(r => raceCard(r, true)).join('')}` : ''}
        <div class="goal-section-head">
            <span>Record personali</span>
            <button class="btn-circle-green" title="Aggiungi record" onclick="openGoalModal('record')"><i class="fa-solid fa-plus"></i></button>
        </div>
        ${recCards || '<p class="empty-steps">Nessun record. Aggiungilo con il +.</p>'}
        <p class="calc-tip">Puoi aggiungere record su qualsiasi distanza (es. 5, 10, 15, 21,1 km). La stima delle gare usa il record con la distanza più vicina (formula di Riegel); senza record usa il tuo miglior allenamento recente, quindi è più prudente.</p>`;
}

function openGoalModal(kind, id = null, recordDist = null) {
    const g = id ? allGoals.find(x => x.id == id) : null;
    const isRecord = kind === 'record';
    document.getElementById('goal-form').reset();
    document.getElementById('goal-id').value = g ? g.id : '';
    document.getElementById('goal-kind').value = kind;
    document.getElementById('goal-modal-title').textContent = isRecord
        ? (g ? `Record ${recordLabel(g.dist_km)}` : 'Nuovo record')
        : (g ? 'Modifica gara' : 'Nuova gara');
    ['goal-name', 'goal-name-label'].forEach(i => document.getElementById(i).style.display = isRecord ? 'none' : '');
    document.getElementById('goal-time-label').textContent = isRecord ? 'Tempo' : 'Tempo obiettivo (facoltativo)';
    document.getElementById('goal-time').required = isRecord;
    const distEl = document.getElementById('goal-dist');
    distEl.readOnly = false;
    distEl.value = g ? String(g.dist_km).replace('.', ',') : (recordDist ? String(recordDist).replace('.', ',') : '');
    document.getElementById('goal-name').value = g?.name || '';
    document.getElementById('goal-date').value = g?.date || (isRecord ? toLocalISO(new Date()) : '');
    document.getElementById('goal-time').value = g?.time_s ? fmtDuration(g.time_s) : '';
    document.getElementById('goal-delete').style.display = g ? '' : 'none';
    updateGoalHint();
    document.getElementById('goal-modal').style.display = 'block';
}
function closeGoalModal() { document.getElementById('goal-modal').style.display = 'none'; }

function updateGoalHint() {
    const d = parseDistanceKm(document.getElementById('goal-dist').value, 1000);
    const t = parseDuration(document.getElementById('goal-time').value, 'min');
    const parts = [];
    if (d) parts.push(`Distanza ${fmtDist(d)}`);
    if (d && t) parts.push(`Ritmo ${fmtPaceSec(t / d)} /km`);
    if (d && document.getElementById('goal-kind').value === 'race') {
        const est = estimateRace(d);
        if (est) parts.push(`Stima attuale ${fmtDuration(est.time)}`);
    }
    document.getElementById('goal-hint').textContent = parts.join(' · ');
}

async function saveGoal(e) {
    e.preventDefault();
    const id = document.getElementById('goal-id').value;
    const kind = document.getElementById('goal-kind').value;
    const dist = parseDistanceKm(document.getElementById('goal-dist').value, 1000);
    const time = parseDuration(document.getElementById('goal-time').value, 'min');
    if (!dist) { alert('Inserisci una distanza valida (es. 10 o 21,1).'); return; }
    if (kind === 'record' && !time) { alert('Inserisci il tempo del record (es. 25:04).'); return; }
    const payload = {
        user_id: currentUser, kind,
        name: kind === 'race' ? (document.getElementById('goal-name').value.trim() || null) : null,
        date: document.getElementById('goal-date').value || null,
        dist_km: Math.round(dist * 10000) / 10000,
        time_s: time || null
    };
    const { error } = id
        ? await supabaseClient.from('athlete_goals').update(payload).eq('id', id)
        : await supabaseClient.from('athlete_goals').insert([payload]);
    if (reportError('salvataggio gara/record', error)) return;
    closeGoalModal();
    await fetchAllData();
}

async function deleteGoal(id = null) {
    id = id || document.getElementById('goal-id').value;
    if (!id || !confirm('Eliminare definitivamente?')) return;
    const { error } = await supabaseClient.from('athlete_goals').delete().eq('id', id);
    if (reportError('eliminazione gara/record', error)) return;
    closeGoalModal();
    await fetchAllData();
}