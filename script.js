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
    warmup:   { label: 'Riscaldamento',  icon: 'fa-fire',           color: 'var(--orange)', plain: 'min' },
    work:     { label: 'Corsa',          icon: 'fa-person-running', color: 'var(--pink)',   plain: 'min' },
    recovery: { label: 'Recupero',       icon: 'fa-rotate',         color: '#5a5a78',       plain: 'sec' },
    rest:     { label: 'Riposo',         icon: 'fa-pause',          color: '#5a5a78',       plain: 'sec', timeOnly: true },
    cooldown: { label: 'Defaticamento',  icon: 'fa-snowflake',      color: 'var(--orange)', plain: 'min' },
    repeat:   { label: 'Ripetizioni',    icon: 'fa-repeat',         color: 'var(--pink)' }
};

const PILL_TO_TYPE = {
    'Riscaldamento': 'warmup', 'Corsa / Lavoro': 'work', 'Corsa': 'work', 'Recupero': 'recovery',
    'Riposo': 'rest', 'Defaticamento': 'cooldown', 'Ripetizioni': 'repeat'
};

const STATUS = {
    'done':        { label: 'Fatto',    tag: 'tag-done',        color: 'var(--green)', icon: 'fa-circle-check', title: 'Esecuzione Registrata' },
    'to-fix':      { label: 'Saltato',  tag: 'tag-to-fix',      color: 'var(--red)',   icon: 'fa-circle-xmark', title: 'Allenamento Saltato' },
    'in-progress': { label: 'Spostato', tag: 'tag-in-progress', color: 'var(--blue)',  icon: 'fa-circle-right', title: 'Allenamento Spostato' }
};

/* ---------------------------------------------------------------------
   MODELLI (struttura a passi: i km e i tempi vengono calcolati)
   Pace di riferimento: facile 6:20, lento 6:00–6:30, soglia ~5:05
   --------------------------------------------------------------------- */

const S = (type, o = {}) => ({ type, mode: o.dist != null ? 'dist' : 'time', dist_km: o.dist ?? null, time_s: o.time ?? null, pace_lo: o.pace ?? null, pace_hi: o.paceHi ?? null, zone: o.zone || '' });
const R = (reps, steps) => ({ type: 'repeat', reps, steps });
const P = s => { const [m, x] = s.split(':').map(Number); return m * 60 + x; };

const templatesData = {
    fondo_lento: {
        title: "Fondo Lento 50'",
        steps: [S('warmup', { time: 300, pace: P('6:30'), zone: 'Z1' }), S('work', { time: 2400, pace: P('6:00'), zone: 'Z2' }), S('cooldown', { time: 300, pace: P('6:30'), zone: 'Z1' })],
        notes: "Costruisce la base aerobica e ti fa recuperare dalle sedute dure."
    },
    lungo: {
        title: "Lungo 95' Finale MM",
        steps: [S('warmup', { time: 600, pace: P('6:20'), zone: 'Z2' }), S('work', { time: 3900, pace: P('6:00'), zone: 'Z2' }), S('work', { time: 900, pace: P('5:15'), paceHi: P('5:25'), zone: 'Z3' }), S('cooldown', { time: 300, pace: P('6:30'), zone: 'Z1' })],
        notes: "Insegna al corpo a usare i grassi ed evita il muro. Finale a ritmo mezza maratona."
    },
    rip_brevi: {
        title: "Ripetute Brevi – 10 × 400 M",
        steps: [S('warmup', { time: 900, pace: P('6:20'), zone: 'Z2' }), R(10, [S('work', { dist: 0.4, pace: P('4:40'), paceHi: P('4:50'), zone: 'Z5' }), S('recovery', { time: 90, zone: 'Z1' })]), S('cooldown', { time: 600, pace: P('6:30'), zone: 'Z1' })],
        notes: "Aumenta il VO2max e la velocità di punta."
    },
    rip_300_1k: {
        title: "Ripetute 10 × 300 M + 1 Km",
        steps: [S('warmup', { dist: 2, pace: P('6:20'), zone: 'Z2' }), R(10, [S('work', { dist: 0.3, pace: P('4:40'), paceHi: P('4:50'), zone: 'Z5' }), S('rest', { time: 90 })]), S('work', { dist: 1, pace: P('5:20'), zone: 'Z4' }), S('rest', { time: 90 }), S('cooldown', { dist: 2, pace: P('6:20'), zone: 'Z2' })],
        notes: "Velocità sui 300 m, poi 1 km a ritmo sostenuto quando sei già stanca."
    },
    rip_lunghe: {
        title: "Ripetute Lunghe – 5 × 1000 M",
        steps: [S('warmup', { time: 900, pace: P('6:20'), zone: 'Z2' }), R(5, [S('work', { dist: 1, pace: P('4:55'), paceHi: P('5:05'), zone: 'Z4' }), S('recovery', { time: 120, zone: 'Z1' })]), S('cooldown', { time: 600, pace: P('6:30'), zone: 'Z1' })],
        notes: "Allenamento specifico per 10 km e mezza maratona."
    },
    tempo_run: {
        title: "Tempo Run (Soglia) – 3 × 10'",
        steps: [S('warmup', { time: 900, pace: P('6:20'), zone: 'Z2' }), R(3, [S('work', { time: 600, pace: P('5:05'), paceHi: P('5:10'), zone: 'Z4' }), S('recovery', { time: 120, zone: 'Z1' })]), S('cooldown', { time: 600, pace: P('6:30'), zone: 'Z1' })],
        notes: "Alza la soglia anaerobica."
    },
    fartlek: {
        title: "Fartlek – 10 × (1' + 1')",
        steps: [S('warmup', { time: 900, pace: P('6:20'), zone: 'Z2' }), R(10, [S('work', { time: 60, pace: P('4:50'), paceHi: P('5:00'), zone: 'Z4' }), S('recovery', { time: 60, pace: P('6:00'), paceHi: P('6:30'), zone: 'Z2' })]), S('cooldown', { time: 600, pace: P('6:30'), zone: 'Z1' })],
        notes: "Allena i cambi di ritmo e il recupero in corsa."
    },
    salita: {
        title: "Ripetute In Salita – 8 × 75\"",
        steps: [S('warmup', { time: 900, pace: P('6:20'), zone: 'Z2' }), R(8, [S('work', { time: 75, pace: P('5:30'), zone: 'Z5' }), S('recovery', { time: 150, zone: 'Z1' })]), S('cooldown', { time: 600, pace: P('6:30'), zone: 'Z1' })],
        notes: "Forza specifica per glutei e polpacci. Il pace in salita è solo una stima per calcolare i km."
    },
    progressivo: {
        title: "Progressivo 8 Km",
        steps: [S('work', { dist: 3, pace: P('6:20'), zone: 'Z2' }), S('work', { dist: 3, pace: P('5:50'), zone: 'Z3' }), S('work', { dist: 2, pace: P('5:20'), zone: 'Z4' })],
        notes: "Parti lenta e chiudi forte: insegna a gestire il ritmo e a finire in spinta."
    },
    fondo_medio: {
        title: "Fondo Medio 10 Km",
        steps: [S('warmup', { dist: 1, pace: P('6:20'), zone: 'Z2' }), S('work', { dist: 8, pace: P('5:35'), paceHi: P('5:45'), zone: 'Z3' }), S('cooldown', { dist: 1, pace: P('6:30'), zone: 'Z1' })],
        notes: "Ritmo 'comodamente impegnativo': migliora la resistenza alla velocità di gara."
    },
    lungo_lento: {
        title: "Lungo Lento 16 Km",
        steps: [S('work', { dist: 16, pace: P('6:15'), paceHi: P('6:30'), zone: 'Z2' })],
        notes: "Tutto in Zona 2: costruisce la resistenza senza affaticare troppo."
    },
    rip_800: {
        title: "Ripetute 6 × 800 M",
        steps: [S('warmup', { dist: 2, pace: P('6:20'), zone: 'Z2' }), R(6, [S('work', { dist: 0.8, pace: P('4:45'), paceHi: P('4:55'), zone: 'Z4' }), S('recovery', { time: 120, zone: 'Z1' })]), S('cooldown', { dist: 1.5, pace: P('6:30'), zone: 'Z1' })],
        notes: "Classico per i 10 km: ritmo vicino al passo gara, recupero completo."
    },
    piramide: {
        title: "Piramide 200-400-600-800-600-400-200",
        steps: [S('warmup', { dist: 2, pace: P('6:20'), zone: 'Z2' }),
            S('work', { dist: 0.2, pace: P('4:30'), zone: 'Z5' }), S('recovery', { time: 60 }),
            S('work', { dist: 0.4, pace: P('4:40'), zone: 'Z5' }), S('recovery', { time: 90 }),
            S('work', { dist: 0.6, pace: P('4:45'), zone: 'Z4' }), S('recovery', { time: 120 }),
            S('work', { dist: 0.8, pace: P('4:50'), zone: 'Z4' }), S('recovery', { time: 150 }),
            S('work', { dist: 0.6, pace: P('4:45'), zone: 'Z4' }), S('recovery', { time: 120 }),
            S('work', { dist: 0.4, pace: P('4:40'), zone: 'Z5' }), S('recovery', { time: 90 }),
            S('work', { dist: 0.2, pace: P('4:30'), zone: 'Z5' }),
            S('cooldown', { dist: 1.5, pace: P('6:30'), zone: 'Z1' })],
        notes: "Allena velocità e resistenza nella stessa seduta. Recupero lungo circa quanto metà del tempo di corsa."
    },
    allunghi: {
        title: "Fondo Lento + 6 Allunghi",
        steps: [S('work', { time: 1800, pace: P('6:10'), zone: 'Z2' }), R(6, [S('work', { dist: 0.1, pace: P('4:00'), paceHi: P('4:20'), zone: 'Z5' }), S('rest', { time: 60 })]), S('cooldown', { time: 300, pace: P('6:30'), zone: 'Z1' })],
        notes: "Gli allunghi migliorano la tecnica e la reattività senza stancare."
    },
    recupero_attivo: {
        title: "Corsa Di Recupero 30'",
        steps: [S('work', { time: 1800, pace: P('6:30'), paceHi: P('6:50'), zone: 'Z1' })],
        notes: "Il giorno dopo una seduta dura: molto lenta, deve sembrare facilissima."
    },
    riposo: {
        title: "Riposo / REST",
        steps: [],
        notes: "Giorno di recupero: stretching, mobilità o niente."
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

// Ordine dei modelli nel menu (quelli non presenti nell'HTML vengono aggiunti da initUI)
const TEMPLATE_MENU = [
    ['recupero_attivo', "Corsa Di Recupero 30'"], ['lungo_lento', 'Lungo Lento 16 Km'], ['fondo_medio', 'Fondo Medio 10 Km'],
    ['progressivo', 'Progressivo 8 Km'], ['allunghi', 'Fondo Lento + 6 Allunghi'], ['rip_800', 'Ripetute 6 × 800 M'],
    ['rip_300_1k', 'Ripetute 10 × 300 M + 1 Km'], ['piramide', 'Piramide 200-400-600-800-600-400-200'], ['riposo', 'Riposo / REST']
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
function titleCase(s) {
    return String(s ?? '').replace(/(^|[\s\-\/(–·])(\p{L})/gu, (m, a, b) => a + b.toUpperCase());
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
    if ((m = s.match(/^(\d{1,2})\s*[:'.,]\s*(\d{1,2})"?$/))) {
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
    return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
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

function paceMid(s) { return s.pace_lo ? (s.pace_hi ? (s.pace_lo + s.pace_hi) / 2 : s.pace_lo) : null; }

function calcStep(s) {
    const pm = paceMid(s);
    let d, t;
    if (s.type === 'rest') { d = 0; t = s.time_s || 0; }
    else if (s.mode === 'open') { d = s.type === 'recovery' ? 0 : null; t = null; } // passo "Aperto" (a Lap)
    else if (s.mode === 'dist') { d = s.dist_km || 0; t = pm ? d * pm : null; }
    else {
        t = s.time_s || 0;
        d = pm ? t / pm : (s.type === 'recovery' ? 0 : null);
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
function isRestDay(p) {
    const s = planSummary(p);
    return s.dist === 0 && (!s.steps || s.steps.length === 0);
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
    if (s.type === 'rest') parts.push(fmtDuration(s.time_s) + ' Fermo');
    else if (s.mode === 'open') parts.push('Aperto (Lap)');
    else if (s.mode === 'dist') parts.push(fmtDist(s.dist_km));
    else parts.push(fmtDuration(s.time_s));
    if (s.pace_lo) parts.push(`Pace ${fmtPace(s.pace_lo, s.pace_hi)} /km`);
    if (s.zone) parts.push(s.zone);
    const c = calcStep(s);
    if (s.mode === 'dist' && c.time) parts.push(`≈ ${fmtDuration(c.time)}`);
    if (s.mode === 'time' && s.type !== 'rest' && c.dist) parts.push(`≈ ${fmtDist(c.dist)}`);
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
                    <i class="fa-solid ${st.icon} step-icon"></i>
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
                <i class="fa-solid ${st.icon} step-icon"></i>
                <div class="step-text">
                    <strong>${st.label}</strong>
                    <span>${esc(describeStep(s))}</span>
                </div>
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
                    ['fa-heart-pulse', 'FC Media', imp.hr ? imp.hr + ' bpm' : '--'],
                    ['fa-percent', 'Vs Piano', complianceLabel(imp, planned)]
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
        html += `
            <div class="main-workout-card" style="border-color:var(--pink);">
                <div class="workout-type-header">
                    <span>${esc(titleCase(p.title))}</span>
                    <span class="icon-btn-row">
                        ${rest ? '' : `<button class="btn-circle-green" title="Inserisci Risultato / GPX / Stato" onclick="openUploadModal('${p.id}')"><i class="fa-solid fa-plus"></i></button>`}
                        <button class="btn-circle-muted" title="Modifica" onclick="openPlanModal('${p.id}')"><i class="fa-solid fa-pen"></i></button>
                    </span>
                </div>
                ${rest ? `<div class="workout-notes-box">Giorno Di Riposo: Nessuna Corsa Prevista.</div>` : `
                ${summaryGrid([
                    ['fa-ruler', 'Distanza', sum.dist ? fmtNum(sum.dist, 2) + ' km' : '--'],
                    ['fa-gauge-high', 'Pace Medio', sum.pace ? fmtPaceSec(sum.pace) + ' /km' : '--'],
                    ['fa-clock', 'Tempo', sum.time ? fmtDuration(sum.time) : '--']
                ])}
                ${sum.partial ? '<p class="calc-warning">Stima Parziale: Alcuni Passi Non Hanno Pace O Durata, Quindi Km E Tempo Sono Calcolati Solo In Parte.</p>' : ''}
                <div class="steps-title">Passi</div>
                <div class="steps-list">${renderStepLines(sum.steps) || '<p class="empty-steps">Nessun Passo Inserito.</p>'}</div>`}
                ${p.notes ? `<div class="workout-notes-box">📝 ${esc(p.notes)}</div>` : ''}
                <button class="btn-full-workout" onclick="openDetailModal('${p.id}')">Vedi Allenamento Completo →</button>
            </div>`;
    });

    if (!dayPlanned.length && !dayImported.length && !dayRaces.length) {
        html = `
            <div style="text-align:center; padding:30px 10px;">
                <p style="color:var(--text-muted); margin-bottom:15px;">Nessun Allenamento Programmato Per Questa Data.</p>
                <button class="btn-action-cta btn-add-green" title="Aggiungi Allenamento" onclick="openPlanModal()"><i class="fa-solid fa-plus"></i></button>
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
                    <span>Confronto Pianificato Vs Eseguito</span>
                    ${c ? `<strong style="color:${c.color}">${c.pct}%</strong>` : ''}
                </div>
                ${c ? `<div class="cmp-bar"><div style="width:${Math.min(c.pct, 100)}%; background:${c.color}"></div></div>` : ''}
                <div class="cmp-row cmp-row-head"><span></span><span>Piano</span><span>Eseguito</span><span>Diff.</span></div>
                <div class="cmp-row"><span>Distanza</span><span>${sum.dist ? fmtNum(sum.dist, 2) + ' km' : '--'}</span><strong>${fmtNum(exec.dist || 0, 2)} km</strong>${delta(+exec.dist, sum.dist, 'km', 'more')}</div>
                <div class="cmp-row"><span>Tempo</span><span>${sum.time ? fmtDuration(sum.time) : '--'}</span><strong>${esc(exec.time_exec || '--')}</strong>${delta(doneTime, sum.time, 't')}</div>
                <div class="cmp-row"><span>Pace</span><span>${sum.pace ? fmtPaceSec(sum.pace) : '--'}</span><strong>${donePace ? fmtPaceSec(donePace) : '--'}</strong>${delta(donePace, sum.pace, 't', 'less')}</div>
                <div class="cmp-row"><span>Zona FC</span><span>${zones || '--'}</span><strong>${esc(exec.hr_zone || '--')}</strong><span class="cmp-delta">${exec.hr ? exec.hr + ' bpm' : ''}</span></div>
                <p class="cmp-legend">Verde: 90–110% Del Piano · Arancione: 70–130% · Rosso: Fuori Range</p>
            </div>`;
    } else if (other) {
        const st = STATUS[other.status];
        cmp = `<div class="cmp-card" style="border-color:${st.color}"><div class="cmp-head"><span>Stato</span><span class="tag-pill ${st.tag}">${st.label}</span></div>${other.notes ? `<p class="cmp-legend">${esc(other.notes)}</p>` : ''}</div>`;
    }

    document.getElementById('detail-modal-content').innerHTML = `
        <span class="close-btn" onclick="closeDetailModal()">&times;</span>
        <h3 style="color:var(--pink); margin-bottom:12px;">${esc(titleCase(item.title))}</h3>
        ${summaryGrid([
            ['fa-ruler', 'Distanza', sum.dist ? fmtNum(sum.dist, 2) + ' km' : '--'],
            ['fa-gauge-high', 'Pace Medio', sum.pace ? fmtPaceSec(sum.pace) + ' /km' : '--'],
            ['fa-clock', 'Tempo', sum.time ? fmtDuration(sum.time) : '--']
        ])}
        ${cmp}
        <div class="steps-title" style="margin-top:12px">Passi</div>
        <div class="steps-list">${renderStepLines(sum.steps) || '<p class="empty-steps">Nessun Passo Inserito.</p>'}</div>
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
    document.querySelector('.ring-text small').textContent = 'Km Settimana';
    document.getElementById('goal-km-display').innerText = `${fmtNum(doneKm)} / ${ready ? fmtNum(planKm) : '--'} km`;
    document.getElementById('ring-sub').textContent = !weekPlanned.length ? 'Nessun Allenamento Pianificato'
        : !ready ? `Pianificati ${plannedDays}/7 Giorni`
        : `${weekDone.length} / ${runPlanned.length} Allenamenti`;

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

// Riquadro "Prossima Gara" nella card in alto (le gare si gestiscono nel Profilo)
function renderNextRace() {
    const box = document.querySelector('.race-countdown');
    if (!box) return;
    const today = toLocalISO(new Date());
    const race = userGoals('race').filter(g => g.date >= today).sort((a, b) => a.date.localeCompare(b.date))[0];
    const profileBtn = document.querySelectorAll('.nav-item')[3];
    box.onclick = () => profileBtn && switchTab('profile', profileBtn);
    box.style.cursor = 'pointer';

    if (!race) {
        box.innerHTML = `<div><small>Prossima Gara</small><strong>Nessuna Gara</strong></div>
            <div class="race-right"><small>Aggiungila Nel Profilo</small></div>`;
        return;
    }
    const days = Math.round((parseLocalDate(race.date) - parseLocalDate(today)) / 86400000);
    const est = estimateRace(race.dist_km);
    box.innerHTML = `
        <div>
            <small>Prossima Gara</small>
            <strong>${race.name ? esc(titleCase(race.name)) + ' · ' : ''}${fmtDist(race.dist_km)}</strong>
            <small>${fmtDateShort(race.date)}</small>
        </div>
        <div class="race-right">
            <strong>${days === 0 ? 'Oggi!' : days === 1 ? 'Domani' : `Tra ${days} Giorni`}</strong>
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
                <option value="4" ${recapFilter.weeks === 4 ? 'selected' : ''}>Ultime 4 Settimane</option>
                <option value="12" ${recapFilter.weeks === 12 ? 'selected' : ''}>Ultime 12 Settimane</option>
                <option value="all" ${recapFilter.weeks === 'all' ? 'selected' : ''}>Tutto</option>
            </select>
        </div>`;

    if (!weeks.length) {
        pastHtml(html + '<p style="color:var(--text-muted)">Nessuna Corsa Salvata Nello Storico.</p>');
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
                        <small>${wExec.filter(e => e.status === 'done').length}/${wPlanned.length} Sessioni</small>
                    </div>
                </div>
                ${c ? `<div class="cmp-bar"><div style="width:${Math.min(c.pct, 100)}%; background:${c.color}"></div></div>` : ''}
                ${incr != null && incr > 10 ? `<p class="calc-warning">↑ +${incr}% Km Rispetto Alla Settimana Precedente (Consiglio: Massimo +10%).</p>` : ''}
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
                }).join('') : '<p class="empty-steps">Nessuna Corsa Con Questo Filtro.</p>'}
            </div>`;
    });
    pastHtml(html);
}
function pastHtml(h) { document.getElementById('past-imported-list').innerHTML = h; }

/* =====================================================================
   BUILDER DEI PASSI (modale pianificazione)
   ===================================================================== */

const ZONE_OPTIONS = ['', 'Z1', 'Z2', 'Z3', 'Z4', 'Z5'];

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
    const mode = t.timeOnly ? 'time' : (step.mode || 'time');
    const hasDur = t.timeOnly || mode !== 'open';
    const hasPace = !t.timeOnly && step.pace_lo != null;
    const hasZone = !t.timeOnly && !!step.zone;
    const x = f => `<button type="button" class="bs-x-field" data-field="${f}" title="Togli">×</button>`;
    div.innerHTML = `
        <div class="bs-head">
            <span class="bs-drag" title="Tieni Premuto E Trascina"><i class="fa-solid fa-grip-vertical"></i></span>
            <i class="fa-solid ${t.icon}" style="color:${t.color}"></i>
            <span class="builder-active-label">${t.label}</span>
            <button type="button" class="btn-circle-red bs-remove" title="Rimuovi"><i class="fa-solid fa-minus"></i></button>
        </div>
        <div class="bs-fields">
            <span class="bs-field f-dur" ${hasDur ? '' : 'hidden'}>
                ${t.timeOnly ? '<span class="bs-fixed">Tempo</span>' : `
                <select class="bs-mode">
                    <option value="dist" ${mode === 'dist' ? 'selected' : ''}>Distanza</option>
                    <option value="time" ${mode !== 'dist' ? 'selected' : ''}>Tempo</option>
                </select>`}
                <input type="text" class="builder-active-input bs-value" value="${esc(stepValueText(step))}">
                ${t.timeOnly ? '' : x('dur')}
            </span>
            ${t.timeOnly ? '' : `
            <span class="bs-field f-pace" ${hasPace ? '' : 'hidden'}>
                <input type="text" class="builder-active-input bs-pace" placeholder="Pace 6:20" value="${esc(fmtPace(step.pace_lo, step.pace_hi))}">
                ${x('pace')}
            </span>
            <span class="bs-field f-zone" ${hasZone ? '' : 'hidden'}>
                <select class="bs-zone">${ZONE_OPTIONS.filter(Boolean).map(z => `<option value="${z}" ${(step.zone || 'Z2') === z ? 'selected' : ''}>${z}</option>`).join('')}</select>
                ${x('zone')}
            </span>`}
        </div>
        ${t.timeOnly ? '' : `
        <div class="bs-add-fields">
            <button type="button" class="bs-add-field" data-field="dur">+ Durata</button>
            <button type="button" class="bs-add-field" data-field="pace">+ Pace</button>
            <button type="button" class="bs-add-field" data-field="zone">+ ZF</button>
        </div>`}
        <small class="bs-hint"></small>`;
    updateStepPlaceholder(div);
    updateFieldButtons(div);
    return div;
}

// Mostra "+ Durata / + Pace / + ZF" solo per le impostazioni non ancora presenti
function updateFieldButtons(stepEl) {
    stepEl.querySelectorAll('.bs-add-field').forEach(btn => {
        const f = stepEl.querySelector('.f-' + btn.dataset.field);
        btn.hidden = !f || !f.hidden;
    });
}
function toggleStepField(stepEl, field, show) {
    const f = stepEl.querySelector('.f-' + field);
    if (!f) return;
    f.hidden = !show;
    if (show) {
        const input = f.querySelector('input, select');
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
            <span class="bs-drag" title="Tieni Premuto E Trascina"><i class="fa-solid fa-grip-vertical"></i></span>
            <i class="fa-solid fa-repeat" style="color:var(--pink)"></i>
            <span class="builder-active-label">Ripetizioni</span>
            <input type="number" min="1" class="builder-active-input bs-reps" value="${block.reps || 1}">
            <span class="bs-x">Volte</span>
            <button type="button" class="btn-circle-red bs-remove" title="Rimuovi"><i class="fa-solid fa-minus"></i></button>
        </div>
        <div class="bb-inner"></div>
        <div class="add-pills-grid bb-add">
            <button type="button" class="btn-add-pill" data-add="work">+ Corsa</button>
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
            filter: '.bs-remove, .bs-reps',      // il "−" e il numero di ripetizioni restano cliccabili
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
    const mode = el.querySelector('.bs-mode')?.value || 'time';
    const input = el.querySelector('.bs-value');
    if (!input) return;
    input.placeholder = mode === 'dist' ? 'es. 2 km o 300 m'
        : (STEP_TYPES[type].plain === 'sec' ? 'es. 90 (sec) o 1:30' : 'es. 15 (min) o 15:00');
}

function readStepEl(el) {
    const type = el.dataset.type;
    const t = STEP_TYPES[type];
    const on = f => { const x = el.querySelector(':scope > .bs-fields > .f-' + f); return !!x && !x.hidden; };
    const mode = t.timeOnly ? 'time' : (on('dur') ? (el.querySelector('.bs-mode')?.value || 'time') : 'open');
    const raw = el.querySelector('.bs-value').value;
    const pace = !t.timeOnly && on('pace') ? parsePace(el.querySelector('.bs-pace').value) : null;
    return {
        type, mode,
        dist_km: mode === 'dist' ? parseDistanceKm(raw) : null,
        time_s: mode === 'time' ? parseDuration(raw, t.plain) : null,
        pace_lo: pace?.lo ?? null, pace_hi: pace?.hi ?? null,
        zone: !t.timeOnly && on('zone') ? (el.querySelector('.bs-zone').value || '') : ''
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
function addBuilderBlock(keyName) {
    const c = document.getElementById('active-builder-blocks');
    const type = PILL_TO_TYPE[keyName];
    if (type === 'repeat') {
        c.appendChild(createBlockEl(R(10, [S('work', { dist: 0.4 }), S('recovery', { time: 90 })])));
    } else if (type) {
        c.appendChild(createStepEl(S(type, type === 'rest' || type === 'recovery' ? { time: 90 } : { time: 600 })));
    } else {
        // "+ Pace" e "+ ZF": aggiunge l'impostazione all'ultimo passo (che non sia un Riposo)
        const steps = [...c.querySelectorAll('.builder-step')].filter(el => el.dataset.type !== 'rest');
        if (!steps.length) { c.appendChild(createStepEl(S('work', { time: 600 }))); return addBuilderBlock(keyName); }
        const last = steps[steps.length - 1];
        last.scrollIntoView({ block: 'center', behavior: 'smooth' });
        toggleStepField(last, keyName === 'Pace' ? 'pace' : 'zone', true);
    }
    recalcBuilder();
}

function updateHints() {
    document.querySelectorAll('#active-builder-blocks .builder-step').forEach(el => {
        const s = readStepEl(el);
        const hint = el.querySelector('.bs-hint');
        const raw = s.mode === 'open' ? '' : el.querySelector('.bs-value').value.trim();
        const paceRaw = s.pace_lo != null || (el.querySelector('.f-pace') && !el.querySelector('.f-pace').hidden) ? el.querySelector('.bs-pace').value.trim() : '';
        const msgs = [];
        if (s.mode === 'open') msgs.push('Aperto: Passi Al Successivo A Mano (Lap)');
        if (raw) {
            if (s.mode === 'dist') msgs.push(s.dist_km != null ? `= ${fmtDist(s.dist_km)}` : '⚠ Distanza Non Valida');
            else msgs.push(s.time_s != null ? `= ${fmtDurationWords(s.time_s)}` : '⚠ Tempo Non Valido');
        }
        if (paceRaw) msgs.push(s.pace_lo ? `Pace ${fmtPace(s.pace_lo, s.pace_hi)} /km` : '⚠ Pace Non Valido (es. 6:20)');
        const c = calcStep(s);
        if (s.type !== 'rest') {
            if (s.mode === 'dist' && c.time) msgs.push(`≈ ${fmtDuration(c.time)}`);
            if (s.mode === 'time' && c.dist) msgs.push(`≈ ${fmtDist(c.dist)}`);
            if (s.mode === 'time' && c.dist == null) msgs.push('Aggiungi Il Pace Per Calcolare I Km');
            if (s.zone) msgs.push(s.zone);
        }
        hint.textContent = msgs.join(' · ');
        hint.classList.toggle('is-warning', msgs.some(m => m.startsWith('⚠')));
    });
    document.querySelectorAll('#active-builder-blocks .builder-block').forEach(el => {
        const b = { type: 'repeat', reps: Math.max(1, parseInt(el.querySelector('.bs-reps').value) || 1), steps: [...el.querySelector('.bb-inner').children].map(readStepEl) };
        const t = calcSteps([b]);
        el.querySelector(':scope > .bs-hint').textContent = `Totale Blocco: ${fmtDist(t.dist) || '0 km'} · ${fmtDuration(t.time)}`;
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
        if (p) input.value = fmtPace(p.lo, p.hi);
    } else if (input.id === 'plan-summary-time' || input.id === 'exec-time') {
        const t = parseDuration(input.value, 'min');
        if (t != null) input.value = fmtDuration(t);
    } else if (input.id === 'plan-summary-pace') {
        const p = parsePace(input.value);
        if (p) input.value = fmtPace(p.lo, p.hi);
    }
}

function handleTemplateSelect(val) {
    if (!val || val === 'CUSTOM') { if (val === 'CUSTOM') renderBuilder([]); return; }
    const t = templatesData[val];
    if (!t) return;
    document.getElementById('plan-title').value = t.title;
    document.getElementById('plan-notes').value = t.notes || '';
    renderBuilder(JSON.parse(JSON.stringify(t.steps)));
}

/* =====================================================================
   INIZIALIZZAZIONE UI (eventi, opzioni extra) – una sola volta
   ===================================================================== */

function initUI() {
    // Nuovi modelli nel menu
    const sel = document.getElementById('workout-template-select');
    const custom = sel.querySelector('option[value="CUSTOM"]');
    TEMPLATE_MENU.forEach(([v, l]) => {
        if (!sel.querySelector(`option[value="${v}"]`)) {
            const o = document.createElement('option'); o.value = v; o.textContent = l;
            sel.insertBefore(o, custom);
        }
    });

    // "+ Corsa / Lavoro" → "+ Corsa"
    document.querySelectorAll('#plan-modal .btn-add-pill').forEach(btn => {
        if (btn.textContent.includes('Corsa / Lavoro')) btn.textContent = '+ Corsa';
    });

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

    // Schermata Pace: scorciatoie distanze, calcolo automatico e sezioni extra
    initCalculatorExtras();

    // Builder: eventi delegati
    const b = document.getElementById('active-builder-blocks');
    b.addEventListener('input', recalcBuilder);
    b.addEventListener('change', e => {
        if (e.target.classList.contains('bs-mode')) {
            const stepEl = e.target.closest('.builder-step');
            stepEl.querySelector('.bs-value').value = '';
            updateStepPlaceholder(stepEl);
        }
        recalcBuilder();
    });
    b.addEventListener('focusout', e => { if (e.target.matches('input')) { normalizeField(e.target); recalcBuilder(); } });
    b.addEventListener('click', e => {
        const rm = e.target.closest('.bs-remove');
        if (rm) { rm.closest('.builder-step, .builder-block').remove(); recalcBuilder(); return; }
        const xf = e.target.closest('.bs-x-field');
        if (xf) { toggleStepField(xf.closest('.builder-step'), xf.dataset.field, false); return; }
        const af = e.target.closest('.bs-add-field');
        if (af) { toggleStepField(af.closest('.builder-step'), af.dataset.field, true); return; }
        const add = e.target.closest('[data-add]');
        if (add) {
            const type = add.dataset.add;
            add.closest('.builder-block').querySelector('.bb-inner')
                .appendChild(createStepEl(S(type, type === 'work' ? { dist: 0.4 } : { time: 90 })));
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
        document.getElementById('modal-plan-title').innerText = 'Modifica Allenamento';
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
        document.getElementById('modal-plan-title').innerText = 'Nuovo Allenamento';
        document.getElementById('plan-form').reset();
        document.getElementById('plan-id').value = '';
        document.getElementById('plan-date').value = selectedDateStr;
        renderBuilder([S('warmup', { time: 600, zone: 'Z2' }), S('work', { time: 1800, zone: 'Z2' }), S('cooldown', { time: 300, zone: 'Z1' })]);
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
    const done = status === 'done', moved = status === 'in-progress';
    document.querySelector('#upload-modal .gpx-drop-zone').style.display = done ? '' : 'none';
    showField('exec-title', done);
    showField('exec-hr', done);
    showField('exec-date', done || moved);
    document.getElementById('exec-dist').closest('div').parentElement.style.display = done ? 'grid' : 'none';
    document.getElementById('exec-pace-hint').style.display = done ? '' : 'none';

    document.getElementById('exec-dist').required = done;
    document.getElementById('exec-title').required = done;
    document.getElementById('exec-date').required = done || moved;

    labelOf('exec-date').textContent = moved ? 'Nuova Data' : 'Data Esecuzione';
    labelOf('exec-notes').textContent = status === 'to-fix' ? 'Motivo (Perché Hai Saltato)' : 'Note';
    document.getElementById('exec-notes').placeholder = status === 'to-fix' ? 'Es. Stanchezza, Pioggia, Impegno Di Lavoro...' : 'Sensazioni, Meteo...';
    const submit = document.querySelector('#execution-form button[type="submit"]');
    submit.textContent = done ? 'Salva Esecuzione' : (moved ? 'Sposta Allenamento' : 'Segna Come Saltato');
}

function updateExecHint() {
    const d = parseFloat(document.getElementById('exec-dist').value);
    const t = parseDuration(document.getElementById('exec-time').value, 'min');
    const parts = [];
    if (t != null && document.getElementById('exec-time').value.trim()) parts.push(`Tempo = ${fmtDurationWords(t)}`);
    if (d > 0 && t) parts.push(`Pace Medio ${fmtPaceSec(t / d)} /km`);
    if (gpxData?.hr) parts.push(`FC Media Dal GPX ${gpxData.hr} bpm`);
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
    document.querySelector('#upload-modal h3').textContent = exec ? 'Modifica Esecuzione' : 'Registra Risultato & Stato';

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
        if (dist <= 0) { alert('Inserisci la distanza percorsa.'); return; }
        payload = {
            user_id: currentUser, date: document.getElementById('exec-date').value, status,
            title: document.getElementById('exec-title').value.trim() || title,
            dist, time_exec: time ? fmtDuration(time) : null,
            pace: time ? fmtPaceSec(time / dist) : null,
            pace_sec: time ? Math.round(time / dist) : null,
            hr_zone: document.getElementById('exec-hr').value,
            hr: gpxData?.hr || null,
            notes: notes || null
        };
    } else if (status === 'to-fix') {
        payload = { user_id: currentUser, date: baseDate, status, title, dist: 0, time_exec: null, pace: null, pace_sec: null, hr_zone: null, hr: null, notes: notes || null };
    } else {
        moveTo = document.getElementById('exec-date').value;
        if (!moveTo || moveTo === baseDate) { alert('Scegli una nuova data diversa da quella attuale.'); return; }
        const [y, m, d] = moveTo.split('-');
        payload = {
            user_id: currentUser, date: baseDate, status, title, dist: 0, time_exec: null, pace: null, pace_sec: null, hr_zone: null, hr: null,
            notes: `Spostato al ${d}/${m}/${y}` + (notes ? ` · ${notes}` : '')
        };
    }

    const { error } = execId
        ? await supabaseClient.from('imported_workouts').update(payload).eq('id', execId)
        : await supabaseClient.from('imported_workouts').insert([payload]);
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

const RACE_DISTANCES = [['5 Km', 5], ['10 Km', 10], ['Mezza', 21.0975], ['Maratona', 42.195]];

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
                <span class="res-title">Cosa Puoi Calcolare</span>
                <p class="calc-tip">Inserisci la distanza e il tempo di una gara o di un test (es. 5 km in 27:30) per vedere la velocità, i passaggi, la previsione sulle altre distanze e i ritmi consigliati per ogni allenamento.</p>
            </div>`;
        return;
    }
    const pace = sec / dist;
    const kmh = 3600 / pace;
    const p10 = riegel(sec, dist, 10) / 10; // pace equivalente sui 10 km

    const splits = [['400 m', 0.4], ['1 Km', 1], ['5 Km', 5], ['10 Km', 10], ['Mezza', 21.0975], ['Maratona', 42.195]];
    const zones = [
        ['Corsa Di Recupero', 'Z1', 75, 95],
        ['Fondo Lento / Lungo', 'Z2', 50, 70],
        ['Fondo Medio', 'Z3', 25, 35],
        ['Soglia (Tempo Run)', 'Z4', 5, 12],
        ['Ripetute Lunghe (1000 m)', 'Z4', -8, 0],
        ['Ripetute Brevi (400 m)', 'Z5', -22, -12]
    ];
    const row = (a, b, c = '') => `<div class="calc-row"><span>${a}</span><strong>${b}</strong><small>${c}</small></div>`;

    box.innerHTML = `
        <div class="calc-form-card calc-extra">
            <span class="res-title">Velocità</span>
            ${row('Pace', fmtPaceSec(pace) + ' /km')}
            ${row('Velocità', fmtNum(kmh, 1) + ' km/h')}
            ${row('Al Giro Di Pista (400 m)', fmtDuration(pace * 0.4))}
        </div>
        <div class="calc-form-card calc-extra">
            <span class="res-title">Passaggi A Questo Ritmo</span>
            ${splits.map(([l, d]) => row(l, fmtDuration(pace * d))).join('')}
        </div>
        <div class="calc-form-card calc-extra">
            <span class="res-title">Previsione Gare</span>
            ${RACE_DISTANCES.map(([l, d]) => {
                const t = riegel(sec, dist, d);
                return row(l, fmtDuration(t), fmtPaceSec(t / d) + ' /km');
            }).join('')}
            <p class="calc-tip">Stima con la formula di Riegel: è più affidabile per distanze vicine a quella inserita. Per la maratona serve anche un buon volume di lunghi.</p>
        </div>
        <div class="calc-form-card calc-extra">
            <span class="res-title">Ritmi Di Allenamento Consigliati</span>
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

const RECORD_DISTANCES = [['5KM', 5], ['10KM', 10], ['Mezza Maratona', 21.0975], ['Maratona', 42.195]];

// Nome della distanza: 5KM, 10KM, Mezza Maratona, Maratona, altrimenti es. "15KM"
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
        return { time: riegel(best.time_s, best.dist_km, distKm), source: `Dal Record ${fmtDist(best.dist_km)} (${fmtDuration(best.time_s)})` };
    }
    const since = new Date(); since.setDate(since.getDate() - 120);
    const runs = userImported().filter(e => e.status === 'done' && parseFloat(e.dist) >= 3 && parseDuration(e.time_exec, 'min') && parseLocalDate(e.date) >= since);
    if (!runs.length) return null;
    let best = null;
    runs.forEach(e => {
        const t = riegel(parseDuration(e.time_exec, 'min'), parseFloat(e.dist), distKm);
        if (!best || t < best.time) best = { time: t, source: `Dall'Allenamento Del ${fmtDateShort(e.date)} (Stima Prudente)` };
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
                        <label id="goal-name-label">Nome Gara</label>
                        <input type="text" id="goal-name" placeholder="Es. Corsa Di San Martino">
                        <label>Data</label>
                        <input type="date" id="goal-date" required>
                        <label>Distanza (km)</label>
                        <input type="text" id="goal-dist" inputmode="decimal" placeholder="es. 10 o 21,1" required>
                        <label id="goal-time-label">Tempo Obiettivo (Facoltativo)</label>
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
        box.innerHTML = `<div class="profile-card"><p class="calc-tip">Per usare Gare e Record esegui una volta lo script <strong>supabase-goals.sql</strong> in Supabase → SQL Editor, poi ricarica la pagina.</p></div>`;
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
                <span>${[r.name ? esc(titleCase(r.name)) : '', isPast ? 'Conclusa' : `<b>${days === 0 ? 'Oggi' : days === 1 ? 'Domani' : `Tra ${days} Giorni`}</b>`, r.time_s ? `Obiettivo ${fmtDuration(r.time_s)}` : ''].filter(Boolean).join(' · ')}</span>
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
            <span>Gare In Programma</span>
            <button class="btn-circle-green" title="Aggiungi Gara" onclick="openGoalModal('race')"><i class="fa-solid fa-plus"></i></button>
        </div>
        ${future.length ? future.map(r => raceCard(r, false)).join('') : '<p class="empty-steps">Nessuna Gara In Programma. Aggiungila Con Il +.</p>'}
        ${past.length ? `<div class="goal-section-head"><span>Gare Passate</span></div>${past.map(r => raceCard(r, true)).join('')}` : ''}
        <div class="goal-section-head">
            <span>Record Personali</span>
            <button class="btn-circle-green" title="Aggiungi Record" onclick="openGoalModal('record')"><i class="fa-solid fa-plus"></i></button>
        </div>
        ${recCards || '<p class="empty-steps">Nessun Record. Aggiungilo Con Il +.</p>'}
        <p class="calc-tip">Puoi aggiungere record su qualsiasi distanza (es. 5, 10, 15, 21,1 km). La stima delle gare usa il record con la distanza più vicina (formula di Riegel); senza record usa il tuo miglior allenamento recente, quindi è più prudente.</p>`;
}

function openGoalModal(kind, id = null, recordDist = null) {
    const g = id ? allGoals.find(x => x.id == id) : null;
    const isRecord = kind === 'record';
    document.getElementById('goal-form').reset();
    document.getElementById('goal-id').value = g ? g.id : '';
    document.getElementById('goal-kind').value = kind;
    document.getElementById('goal-modal-title').textContent = isRecord
        ? (g ? `Record ${recordLabel(g.dist_km)}` : 'Nuovo Record')
        : (g ? 'Modifica Gara' : 'Nuova Gara');
    ['goal-name', 'goal-name-label'].forEach(i => document.getElementById(i).style.display = isRecord ? 'none' : '');
    document.getElementById('goal-time-label').textContent = isRecord ? 'Tempo' : 'Tempo Obiettivo (Facoltativo)';
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
        if (est) parts.push(`Stima Attuale ${fmtDuration(est.time)}`);
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