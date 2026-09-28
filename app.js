import { createStore, COLLECTIONS } from './store.js';

// ================= Configuració del centre =================
const CLASSES = [
  { id: '2A', name: '2nA', tablets: [1, 2, 3], color: '#2f7ed8' },
  { id: '2B', name: '2nB', tablets: [4, 5, 6], color: '#8e44ad' },
  { id: '3', name: '3r', tablets: [7, 8, 9], color: '#16a085' },
  { id: '4', name: '4t', tablets: [10, 11, 12], color: '#d35400' },
  { id: '5A', name: '5éA', tablets: [13, 14, 15], color: '#c0392b' },
  { id: '5B', name: '5éB', tablets: [16, 19, 20], color: '#a07c00' },
  { id: '6A', name: '6éA', tablets: [21, 24, 25], color: '#1f618d' },
  { id: '6B', name: '6éB', tablets: [28, 29, 30], color: '#6d4c41' },
  { id: 'COMU', name: 'Comuna', tablets: [31], color: '#7f8c8d', common: true },
];
const SESSIONS = [
  { n: 1, start: '9:00', end: '9:45' },
  { n: 2, start: '9:45', end: '10:30' },
  { n: 3, start: '10:30', end: '11:15' },
  { n: 4, start: '11:45', end: '12:30' },
  { n: 5, start: '12:30', end: '13:15' },
  { n: 6, start: '13:15', end: '14:00' },
];
const LOAN_DAYS = 14; // les tablets d'altres classes només es poden demanar amb 2 setmanes vista
const SPECIALIST_COLOR = '#455a64';

const TOTAL = CLASSES.reduce((n, c) => n + c.tablets.length, 0);
const OWNER = {};
CLASSES.forEach((c) => c.tablets.forEach((t) => (OWNER[t] = c)));
const ALL_TABLETS = CLASSES.flatMap((c) => c.tablets);
const classById = (id) => CLASSES.find((c) => c.id === id);
const sessionByN = (n) => SESSIONS.find((s) => s.n === n);

const SEED_PEOPLE = [
  ...CLASSES.filter((c) => !c.common).map((c) => ({ name: `Tutor/a ${c.name}`, role: 'tutor', classId: c.id, isAdmin: false })),
  { name: 'Especialista (exemple)', role: 'especialista', classId: null, isAdmin: false },
  { name: 'Isaac (administrador)', role: 'especialista', classId: null, isAdmin: true },
];

// ================= Estat =================
const S = {
  people: [], bookings: [], requests: [], holidays: [], incidents: [],
  loaded: {},
  meId: lsGet('tablets.me'),
  tab: 'calendari',
  weekOffset: 0,
  modal: null,
};
let store;
const shownRequests = new Set();

// ================= Utilitats =================
function lsGet(k) { try { return localStorage.getItem(k); } catch { return null; } }
function lsSet(k, v) { try { localStorage.setItem(k, v); } catch { /* res */ } }
const pad = (n) => String(n).padStart(2, '0');
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parse = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const today = () => iso(new Date());
const loanLimit = () => iso(addDays(new Date(), LOAN_DAYS));
const DAYS = ['diumenge', 'dilluns', 'dimarts', 'dimecres', 'dijous', 'divendres', 'dissabte'];
const MONTHS = ['gener', 'febrer', 'març', 'abril', 'maig', 'juny', 'juliol', 'agost', 'setembre', 'octubre', 'novembre', 'desembre'];
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const deMonth = (m) => (/^[aeiouà]/.test(MONTHS[m]) ? `d'${MONTHS[m]}` : `de ${MONTHS[m]}`);
const fmtDate = (s) => { const d = parse(s); return `${cap(DAYS[d.getDay()])} ${d.getDate()} ${deMonth(d.getMonth())}`; };
const fmtShort = (s) => { const d = parse(s); return `${d.getDate()} ${deMonth(d.getMonth())}`; };
const sessLabel = (n) => { const s = sessionByN(n); return `${n}a sessió (${s.start}–${s.end})`; };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const overlap = (a, b) => a.some((x) => b.includes(x));
const tabletsTxt = (arr) => [...arr].sort((a, b) => a - b).join(', ');

const me = () => S.people.find((p) => p.id === S.meId) || null;
const isAdmin = () => !!me()?.isAdmin;
const allLoaded = () => COLLECTIONS.every((c) => S.loaded[c]);

function isHoliday(date) {
  return S.holidays.find((h) => h.from <= date && date <= (h.to || h.from)) || null;
}

function activeBookings(date, session) {
  const dow = parse(date).getDay();
  return S.bookings.filter((b) => {
    if (b.session !== session) return false;
    if (b.type === 'single') return b.date === date;
    return b.weekday === dow && b.startDate <= date && (!b.endDate || date <= b.endDate) && !(b.exceptions || []).includes(date);
  });
}
function occupancy(date, session) {
  const map = new Map();
  activeBookings(date, session).forEach((b) => b.tablets.forEach((t) => map.set(t, b)));
  return map;
}
const bookingColor = (b) => classById(b.classId)?.color || SPECIALIST_COLOR;
const bookingLabel = (b) => classById(b.classId)?.name || b.personName.split(' ')[0];

const ownTablet = (t) => { const m = me(); return !!m?.classId && OWNER[t].id === m.classId; };
function canSingle(t, date) {
  if (isAdmin() || ownTablet(t)) return true;
  return date <= loanLimit();
}
const canRecurring = (t) => isAdmin() || ownTablet(t);
const canCancel = (b) => isAdmin() || b.personId === S.meId;
const openIncidentTablets = () => new Set(S.incidents.filter((i) => i.status !== 'resolta').map((i) => i.tablet));

function pendingForMe() {
  const m = me();
  if (!m?.classId) return [];
  return S.requests
    .filter((r) => r.status === 'pending' && r.ownerClassId === m.classId && r.date >= today())
    .sort((a, b) => (a.date + a.session).localeCompare(b.date + b.session));
}
function rejectedForMe() {
  return S.requests.filter((r) => r.fromPersonId === S.meId && r.status === 'rejected' && !r.requesterSeen);
}

// ================= Accions sobre dades =================
async function createBooking({ date, session, tablets, recurring, note }) {
  const m = me();
  const base = {
    session, tablets: [...tablets].sort((a, b) => a - b),
    personId: m.id, personName: m.name, classId: m.classId || null,
    note: note || '', createdAt: Date.now(),
  };
  if (!recurring) {
    const occ = occupancy(date, session);
    const taken = tablets.filter((t) => occ.has(t));
    if (taken.length) { alert(`Algú acaba de reservar les tablets ${tabletsTxt(taken)}. Torna-ho a provar.`); return false; }
    const id = await store.add('bookings', { ...base, type: 'single', date });
    // Avís al tutor/a propietari de cada tablet d'una altra classe
    const byOwner = {};
    tablets.forEach((t) => {
      const c = OWNER[t];
      if (c.common || c.id === m.classId) return;
      (byOwner[c.id] ||= []).push(t);
    });
    for (const [ownerClassId, ts] of Object.entries(byOwner)) {
      await store.add('requests', {
        bookingId: id, ownerClassId, tablets: ts, date, session,
        fromPersonId: m.id, fromName: m.name, status: 'pending', requesterSeen: false, createdAt: Date.now(),
      });
    }
    return true;
  }

  const weekday = parse(date).getDay();
  const series = S.bookings.filter((b) => b.type === 'recurring' && b.weekday === weekday && b.session === session
    && overlap(b.tablets, tablets) && (!b.endDate || b.endDate >= date));
  if (series.length) {
    alert(`Ja hi ha una reserva fixa els ${DAYS[weekday]} a la ${session}a sessió amb alguna d'aquestes tablets (${series.map((b) => b.personName).join(', ')}).`);
    return false;
  }
  const clashes = S.bookings.filter((b) => b.type === 'single' && b.session === session && b.date >= date
    && parse(b.date).getDay() === weekday && overlap(b.tablets, tablets));
  const exceptions = [...new Set(clashes.map((b) => b.date))].sort();
  if (exceptions.length && !confirm(`Aquests dies ja hi ha reserves amb alguna d'aquestes tablets i quedaran fora de la reserva fixa:\n\n${exceptions.map(fmtDate).join('\n')}\n\nVols continuar?`)) return false;
  await store.add('bookings', { ...base, type: 'recurring', weekday, startDate: date, endDate: null, exceptions });
  return true;
}

async function deleteBooking(b) {
  await store.remove('bookings', b.id);
  for (const r of S.requests.filter((r) => r.bookingId === b.id)) await store.remove('requests', r.id);
}
async function cancelDay(b, date) {
  await store.update('bookings', b.id, { exceptions: [...new Set([...(b.exceptions || []), date])] });
}
async function cancelFrom(b, date) {
  if (date <= b.startDate) return deleteBooking(b);
  await store.update('bookings', b.id, { endDate: iso(addDays(parse(date), -1)) });
}

async function answerRequest(r, accept) {
  await store.update('requests', r.id, { status: accept ? 'accepted' : 'rejected', respondedAt: Date.now() });
  if (accept) return;
  const b = S.bookings.find((x) => x.id === r.bookingId);
  if (!b) return;
  const rest = b.tablets.filter((t) => !r.tablets.includes(t));
  if (rest.length) await store.update('bookings', b.id, { tablets: rest });
  else await store.remove('bookings', b.id);
}

// ================= Render =================
let renderQueued = false;
function schedule() {
  if (renderQueued) return;
  renderQueued = true;
  setTimeout(() => { renderQueued = false; render(); }, 0);
}
function isTypingIn(el) {
  const a = document.activeElement;
  return a && el.contains(a) && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName);
}

function render() {
  if (!allLoaded()) return;
  maybeOpenNotifications();
  renderHeader();
  const main = document.getElementById('main');
  if (!isTypingIn(main)) main.innerHTML = renderMain();
  const mr = document.getElementById('modal-root');
  if (!isTypingIn(mr)) mr.innerHTML = renderModal();
}

function maybeOpenNotifications() {
  const m = me();
  if (!m) { if (!S.modal) S.modal = { type: 'who', forced: true }; return; }
  if (S.modal) return;
  const fresh = pendingForMe().filter((r) => !shownRequests.has(r.id));
  if (fresh.length || rejectedForMe().length) {
    pendingForMe().forEach((r) => shownRequests.add(r.id));
    S.modal = { type: 'notif' };
  }
}

function renderHeader() {
  const m = me();
  const pend = pendingForMe().length;
  const openInc = S.incidents.filter((i) => i.status !== 'resolta').length;
  const tabs = [
    ['calendari', 'Calendari', 0],
    ['meues', 'Les meues reserves', pend],
    ['incidencies', 'Incidències', isAdmin() ? openInc : 0],
  ];
  if (isAdmin()) tabs.push(['admin', 'Administració', 0]);
  document.getElementById('tabs').innerHTML = tabs.map(([id, label, n]) =>
    `<button class="${S.tab === id ? 'active' : ''}" data-act="tab" data-tab="${id}">${label}${n ? `<span class="badge">${n}</span>` : ''}</button>`).join('');
  document.getElementById('who').innerHTML = m
    ? `<span>Hola, <b>${esc(m.name)}</b>${m.classId ? ` · ${classById(m.classId)?.name}` : ''}</span><button data-act="changeMe">Canviar</button>`
    : '';
  document.getElementById('banner').innerHTML = store.mode === 'demo'
    ? `<div class="demo"><b>Mode demostració:</b> les dades només es guarden en aquest navegador. Quan configures Firebase es compartiran amb tot el claustre.</div>`
    : '';
}

function renderMain() {
  if (!me()) return '';
  if (S.tab === 'meues') return renderMine();
  if (S.tab === 'incidencies') return renderIncidents();
  if (S.tab === 'admin' && isAdmin()) return renderAdmin();
  return renderCalendar();
}

// ---------- Calendari ----------
function firstMonday() {
  const d = new Date();
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dow = x.getDay();
  if (dow === 6) return addDays(x, 2);
  if (dow === 0) return addDays(x, 1);
  return addDays(x, 1 - dow);
}

function renderCalendar() {
  const start = addDays(firstMonday(), S.weekOffset * 7);
  const days = [];
  for (let w = 0; w < 2; w++) for (let d = 0; d < 5; d++) days.push(iso(addDays(start, w * 7 + d)));
  const t = today();
  const colCount = SESSIONS.length + 2;

  let rows = '';
  days.forEach((date, i) => {
    if (i % 5 === 0) rows += `<tr class="weeksep"><td colspan="${colCount}">Setmana del ${fmtShort(date)}</td></tr>`;
    const d = parse(date);
    const dayCell = `<td class="day">${cap(DAYS[d.getDay()])}<small>${d.getDate()} ${deMonth(d.getMonth())}</small></td>`;
    const hol = isHoliday(date);
    if (hol) { rows += `<tr>${dayCell}<td class="holiday" colspan="${colCount - 1}">${esc(hol.label || 'Dia no lectiu')}</td></tr>`; return; }
    const cells = SESSIONS.map((s) => (s.n === 4 ? '<td class="patio"></td>' : '') + `<td>${cellHTML(date, s.n)}</td>`).join('');
    rows += `<tr class="${date === t ? 'today' : ''}">${dayCell}${cells}</tr>`;
  });

  const head = SESSIONS.map((s) => (s.n === 4 ? '<th class="patio">Pati</th>' : '') + `<th>${s.n}a sessió<small>${s.start}–${s.end}</small></th>`).join('');
  const legend = CLASSES.map((c) => `<span><i class="sw" style="--c:${c.color}"></i>${c.name}</span>`).join('')
    + `<span><i class="sw" style="--c:${SPECIALIST_COLOR}"></i>Especialistes</span>`;

  return `
    <div class="cal-toolbar">
      <button class="btn" data-act="week" data-d="-1">◀</button>
      <button class="btn" data-act="week" data-d="0">Hui</button>
      <button class="btn" data-act="week" data-d="1">▶</button>
      <span class="range">Del ${fmtShort(days[0])} al ${fmtShort(days[9])}</span>
    </div>
    <div class="legend">${legend}</div>
    <div class="grid-wrap"><table class="grid">
      <thead><tr><th>Dia</th>${head}</tr></thead>
      <tbody>${rows}</tbody>
    </table></div>
    <p class="hint">Fes clic en una sessió per a veure quines tablets estan lliures i reservar-les. Les xifres indiquen tablets lliures de ${TOTAL}.</p>`;
}

function cellHTML(date, n) {
  const occ = occupancy(date, n);
  const free = TOTAL - occ.size;
  const lvl = free >= 15 ? 'ok' : free >= 6 ? 'mid' : 'low';
  const past = date < today();
  const m = me();
  let mine = '';
  const myClass = classById(m?.classId);
  if (myClass) {
    const f = myClass.tablets.filter((t) => !occ.has(t)).length;
    mine = `<span class="mine">Les teues: ${f}/${myClass.tablets.length} lliures</span>`;
  }
  const chips = activeBookings(date, n).map((b) =>
    `<span class="chip" style="--c:${bookingColor(b)}" title="${esc(b.personName)}${b.note ? ' · ' + esc(b.note) : ''}">${b.type === 'recurring' ? '↻ ' : ''}${esc(bookingLabel(b))} ${b.tablets.length}</span>`).join('');
  return `<button class="cell ${lvl}" data-act="openCell" data-date="${date}" data-s="${n}" ${past ? 'disabled' : ''}>
    <span class="free">${free}<span>/${TOTAL} lliures</span></span>${mine}<span class="chips">${chips}</span></button>`;
}

// ---------- Les meues reserves ----------
function bookingItem(b, extra = '') {
  const when = b.type === 'recurring'
    ? `↻ Cada ${DAYS[b.weekday]} · ${sessLabel(b.session)} · des del ${fmtShort(b.startDate)}${b.endDate ? ` fins al ${fmtShort(b.endDate)}` : ''}`
    : `${fmtDate(b.date)} · ${sessLabel(b.session)}`;
  return `<div class="item" style="--c:${bookingColor(b)}">
    <div><b>${when}</b><div class="meta">Tablets ${tabletsTxt(b.tablets)}${b.note ? ` · ${esc(b.note)}` : ''}${b.personId !== S.meId ? ` · ${esc(b.personName)}` : ''}</div></div>
    <div class="actions">${extra}</div></div>`;
}

function requestItem(r, mode) {
  const st = { pending: 'Pendent', accepted: 'Acceptat', rejected: 'Rebutjat' }[r.status];
  const who = mode === 'owner' ? `${esc(r.fromName)} vol les tablets ${tabletsTxt(r.tablets)}` : `Tablets ${tabletsTxt(r.tablets)} de ${classById(r.ownerClassId)?.name}`;
  const actions = mode === 'owner' && r.status === 'pending'
    ? `<button class="btn small ok" data-act="accept" data-id="${r.id}">Acceptar</button><button class="btn small danger" data-act="reject" data-id="${r.id}">Rebutjar</button>`
    : '';
  return `<div class="item"><div><b>${fmtDate(r.date)} · ${sessLabel(r.session)}</b><div class="meta">${who} <span class="status ${r.status}">${st}</span></div></div><div class="actions">${actions}</div></div>`;
}

function renderMine() {
  const t = today();
  const m = me();
  const mine = S.bookings.filter((b) => b.personId === S.meId);
  const series = mine.filter((b) => b.type === 'recurring' && (!b.endDate || b.endDate >= t));
  const singles = mine.filter((b) => b.type === 'single' && b.date >= t).sort((a, b) => (a.date + a.session).localeCompare(b.date + b.session));

  const seriesHTML = series.length
    ? series.map((b) => bookingItem(b, `<button class="btn small danger" data-act="endSeries" data-id="${b.id}">Anul·lar</button>`)).join('')
    : '<p class="empty">No tens cap reserva fixa.</p>';
  const singlesHTML = singles.length
    ? singles.map((b) => bookingItem(b, `<button class="btn small danger" data-act="cancelSingle" data-id="${b.id}">Anul·lar</button>`)).join('')
    : '<p class="empty">No tens cap reserva puntual pròxima.</p>';

  let loans = '';
  if (m.classId) {
    const toMe = S.requests.filter((r) => r.ownerClassId === m.classId && r.date >= t).sort((a, b) => (a.date + a.session).localeCompare(b.date + b.session));
    loans = `<div class="card"><h2>Préstecs de les tablets de ${classById(m.classId)?.name}</h2>
      <p class="hint" style="margin-top:-6px">Si no contestes, el préstec es dona per acceptat.</p>
      <div class="list">${toMe.length ? toMe.map((r) => requestItem(r, 'owner')).join('') : '<p class="empty">Ningú ha demanat les teues tablets.</p>'}</div></div>`;
  }
  const fromMe = S.requests.filter((r) => r.fromPersonId === S.meId && r.date >= t).sort((a, b) => (a.date + a.session).localeCompare(b.date + b.session));

  return `
    <div class="card"><h2>Reserves fixes</h2><div class="list">${seriesHTML}</div></div>
    <div class="card"><h2>Pròximes reserves puntuals</h2><div class="list">${singlesHTML}</div></div>
    ${loans}
    <div class="card"><h2>Tablets que he demanat a altres classes</h2><div class="list">${fromMe.length ? fromMe.map((r) => requestItem(r, 'requester')).join('') : '<p class="empty">Cap.</p>'}</div></div>`;
}

// ---------- Incidències ----------
function tabletOptions(selected) {
  return CLASSES.map((c) => `<optgroup label="${c.name}">${c.tablets.map((t) => `<option value="${t}" ${t === selected ? 'selected' : ''}>Tablet ${t}</option>`).join('')}</optgroup>`).join('');
}

function renderIncidents() {
  const admin = isAdmin();
  const sorted = [...S.incidents].sort((a, b) => b.createdAt - a.createdAt);
  const open = sorted.filter((i) => i.status !== 'resolta');
  const done = sorted.filter((i) => i.status === 'resolta').slice(0, 30);
  const item = (i) => `<div class="item" style="--c:${OWNER[i.tablet]?.color || '#999'}">
      <div><b>Tablet ${i.tablet}</b> <span class="meta">(${OWNER[i.tablet]?.name || '?'})</span>
        <div>${esc(i.text)}</div>
        <div class="meta">${esc(i.personName)} · ${new Date(i.createdAt).toLocaleString('ca-ES', { dateStyle: 'short', timeStyle: 'short' })}${i.resolvedAt ? ` · resolta el ${new Date(i.resolvedAt).toLocaleDateString('ca-ES')}` : ''}</div></div>
      <div class="actions">${admin ? (i.status !== 'resolta'
        ? `<button class="btn small ok" data-act="resolveInc" data-id="${i.id}">Marcar resolta</button>`
        : `<button class="btn small" data-act="reopenInc" data-id="${i.id}">Reobrir</button>`) + `<button class="btn small danger" data-act="deleteInc" data-id="${i.id}">Esborrar</button>` : ''}</div>
    </div>`;
  return `
    <div class="card"><h2>Comunicar una incidència</h2>
      <form data-form="incident">
        <div class="form-row"><label>Tablet<select name="tablet" required>${tabletOptions()}</select></label></div>
        <label style="display:block;margin-top:10px;font-weight:700;color:var(--muted);font-size:.85rem">Què passa?
          <textarea name="text" required placeholder="Ex.: la pantalla està trencada, no carrega, falta el carregador..."></textarea></label>
        <div style="margin-top:10px"><button class="btn primary" type="submit">Enviar incidència</button></div>
      </form></div>
    <div class="card"><h2>Incidències obertes (${open.length})</h2><div class="list">${open.length ? open.map(item).join('') : '<p class="empty">Cap incidència oberta.</p>'}</div></div>
    ${done.length ? `<div class="card"><h2>Resoltes recentment</h2><div class="list">${done.map(item).join('')}</div></div>` : ''}`;
}

// ---------- Administració ----------
function renderAdmin() {
  const roleOpts = (r) => ['tutor', 'especialista', 'altres'].map((x) => `<option value="${x}" ${x === r ? 'selected' : ''}>${cap(x)}</option>`).join('');
  const classOpts = (id) => `<option value="">—</option>` + CLASSES.filter((c) => !c.common).map((c) => `<option value="${c.id}" ${c.id === id ? 'selected' : ''}>${c.name}</option>`).join('');
  const people = [...S.people].sort(personSort);
  const rows = people.map((p) => `<tr>
      <td><input type="text" value="${esc(p.name)}" data-change="pName" data-id="${p.id}"></td>
      <td><select data-change="pRole" data-id="${p.id}">${roleOpts(p.role)}</select></td>
      <td><select data-change="pClass" data-id="${p.id}">${classOpts(p.classId)}</select></td>
      <td style="text-align:center"><input type="checkbox" data-change="pAdmin" data-id="${p.id}" ${p.isAdmin ? 'checked' : ''}></td>
      <td><button class="btn small danger" data-act="delPerson" data-id="${p.id}">Esborrar</button></td></tr>`).join('');

  const hols = [...S.holidays].sort((a, b) => a.from.localeCompare(b.from));
  const holHTML = hols.length ? hols.map((h) => `<div class="item"><div><b>${fmtDate(h.from)}${h.to && h.to !== h.from ? ` – ${fmtDate(h.to)}` : ''}</b><div class="meta">${esc(h.label)}</div></div>
      <div class="actions"><button class="btn small danger" data-act="delHoliday" data-id="${h.id}">Esborrar</button></div></div>`).join('') : '<p class="empty">Encara no hi ha dies no lectius.</p>';

  return `
    <div class="card"><h2>Persones</h2>
      <p class="hint" style="margin-top:-6px">Els tutors/es tenen assignades les tablets de la seua classe. Els canvis es guarden automàticament.</p>
      <div style="overflow-x:auto"><table class="admin"><thead><tr><th>Nom</th><th>Rol</th><th>Classe</th><th>Admin</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>
      <h3>Afegir persona</h3>
      <form data-form="person" class="form-row">
        <label>Nom<input type="text" name="name" required></label>
        <label>Rol<select name="role">${roleOpts('tutor')}</select></label>
        <label>Classe<select name="classId">${classOpts(null)}</select></label>
        <label style="flex-direction:row;align-items:center;gap:6px"><input type="checkbox" name="isAdmin"> Admin</label>
        <button class="btn primary" type="submit">Afegir</button>
      </form>
    </div>
    <div class="card"><h2>Dies no lectius</h2>
      <form data-form="holiday" class="form-row">
        <label>Des de<input type="date" name="from" required></label>
        <label>Fins a (opcional)<input type="date" name="to"></label>
        <label style="flex:1">Motiu<input type="text" name="label" placeholder="Ex.: Nadal, festa local..." required></label>
        <button class="btn primary" type="submit">Afegir</button>
      </form>
      <div class="list" style="margin-top:14px">${holHTML}</div>
    </div>
    <div class="card"><h2>Còpia de seguretat</h2>
      <button class="btn" data-act="export">Descarregar totes les dades (JSON)</button>
      ${store.mode === 'demo' ? '<button class="btn danger" data-act="resetDemo">Esborrar dades de la demo</button>' : ''}
    </div>`;
}

function personSort(a, b) {
  const order = (p) => (p.classId ? CLASSES.findIndex((c) => c.id === p.classId) : 100);
  return order(a) - order(b) || a.name.localeCompare(b.name, 'ca');
}

// ---------- Modals ----------
function modalShell(title, subtitle, body, footer = '', closable = true) {
  return `<div class="backdrop" data-backdrop="${closable ? 1 : 0}"><div class="modal" role="dialog" aria-modal="true">
    <header><div><h2>${title}</h2>${subtitle ? `<p>${subtitle}</p>` : ''}</div>${closable ? '<button class="x" data-act="close" aria-label="Tancar">×</button>' : ''}</header>
    <div class="body">${body}</div>${footer ? `<footer>${footer}</footer>` : ''}</div></div>`;
}

function renderModal() {
  const M = S.modal;
  if (!M) return '';
  if (M.type === 'who') return whoModal(M);
  if (M.type === 'cell') return cellModal(M);
  if (M.type === 'notif') return notifModal();
  return '';
}

function whoModal(M) {
  const groups = [
    ['Tutors/es', S.people.filter((p) => p.role === 'tutor')],
    ['Especialistes', S.people.filter((p) => p.role === 'especialista')],
    ['Altres', S.people.filter((p) => p.role !== 'tutor' && p.role !== 'especialista')],
  ].filter(([, arr]) => arr.length);
  const body = groups.map(([label, arr]) => `<div class="who-group"><h3>${label}</h3><div class="who-list">${arr.sort(personSort).map((p) =>
    `<button data-act="pickMe" data-id="${p.id}" style="--c:${classById(p.classId)?.color || SPECIALIST_COLOR}">${esc(p.name)}</button>`).join('')}</div></div>`).join('');
  return modalShell('Qui eres?', "Tria el teu nom. L'aplicació el recordarà en aquest dispositiu.", body, '', !M.forced);
}

function cellModal(M) {
  const { date, session } = M;
  const occ = occupancy(date, session);
  const m = me();
  const broken = openIncidentTablets();
  // Llevar de la selecció les que ja no estan disponibles
  [...M.sel].forEach((t) => { if (occ.has(t) || !canSingle(t, date)) M.sel.delete(t); });
  const sel = [...M.sel];

  const tabletBtn = (t) => {
    const warn = broken.has(t) ? '<span class="warn">⚠ incidència</span>' : '';
    const b = occ.get(t);
    if (b) return `<div class="tab occ" style="--c:${bookingColor(b)}" title="${esc(b.personName)}"><b>${t}</b><small>${b.type === 'recurring' ? '↻ ' : ''}${esc(b.personName)}</small>${warn}</div>`;
    if (!canSingle(t, date)) return `<div class="tab no" title="Les tablets d'altres classes només es poden demanar amb ${LOAN_DAYS} dies d'antelació com a màxim"><b>${t}</b><small>Massa lluny</small>${warn}</div>`;
    const on = M.sel.has(t);
    return `<button class="tab free ${on ? 'sel' : ''}" data-act="toggleTab" data-t="${t}"><b>${t}</b><small>${on ? '✓ Seleccionada' : 'Lliure'}</small>${warn}</button>`;
  };
  const rows = CLASSES.map((c) => `<div class="trow"><div class="tclass"><i class="sw" style="--c:${c.color}"></i>${c.name}${c.id === m.classId ? ' <em>(teua)</em>' : ''}</div><div class="tbtns">${c.tablets.map(tabletBtn).join('')}</div></div>`).join('');

  const recurOk = sel.length > 0 && sel.every(canRecurring);
  if (!recurOk) M.recurring = false;
  const dayName = DAYS[parse(date).getDay()];

  const byOwner = {};
  sel.forEach((t) => { const c = OWNER[t]; if (!c.common && c.id !== m.classId) (byOwner[c.name] ||= []).push(t); });
  const notice = Object.keys(byOwner).length
    ? `<div class="notice">S'avisarà ${Object.entries(byOwner).map(([n, ts]) => `el tutor/a de <b>${n}</b> (${tabletsTxt(ts)})`).join(', ')}. Pot rebutjar el préstec; si no contesta, es dona per acceptat.</div>`
    : '';

  const existing = activeBookings(date, session);
  const existingHTML = existing.length ? `<h3>Reserves en aquesta sessió</h3><div class="list">${existing.map((b) => {
    let acts = '';
    if (canCancel(b)) {
      acts = b.type === 'single'
        ? `<button class="btn small danger" data-act="cancelSingle" data-id="${b.id}">Anul·lar</button>`
        : `<button class="btn small" data-act="cancelDay" data-id="${b.id}" data-date="${date}">Anul·lar només aquest dia</button><button class="btn small danger" data-act="cancelFrom" data-id="${b.id}" data-date="${date}">Anul·lar des d'aquest dia</button>`;
    }
    return `<div class="item" style="--c:${bookingColor(b)}"><div><b>${esc(b.personName)}</b>${b.type === 'recurring' ? ` <span class="meta">↻ cada ${DAYS[b.weekday]}</span>` : ''}
      <div class="meta">Tablets ${tabletsTxt(b.tablets)}${b.note ? ` · ${esc(b.note)}` : ''}</div></div><div class="actions">${acts}</div></div>`;
  }).join('')}</div>` : '';

  const myClass = classById(m.classId);
  const quick = `<div class="quick">
      ${myClass ? `<button class="btn small" data-act="selMine">Seleccionar les meues</button>` : ''}
      <button class="btn small" data-act="selAll">Seleccionar totes les lliures</button>
      ${sel.length ? `<button class="btn small" data-act="selNone">Cap</button>` : ''}
    </div>`;

  const opts = `<div class="opts">
      <label><input type="radio" name="kind" value="single" data-change="kind" ${!M.recurring ? 'checked' : ''}> Només aquesta sessió</label>
      <label class="${recurOk ? '' : 'disabled'}"><input type="radio" name="kind" value="recurring" data-change="kind" ${M.recurring ? 'checked' : ''} ${recurOk ? '' : 'disabled'}>
        Cada ${dayName} a la ${session}a sessió, fins que l'anul·le</label>
      ${!recurOk && sel.length ? `<p class="hint">Les reserves fixes només es poden fer amb les tablets de la teua classe.</p>` : ''}
      <input type="text" class="note-input" placeholder="Activitat o nota (opcional)" value="${esc(M.note)}" data-input="note">
    </div>`;

  const body = `${quick}${rows}${opts}${notice}${existingHTML}`;
  const footer = `<button class="btn" data-act="close">Tancar</button>
    <button class="btn primary" data-act="book" ${sel.length ? '' : 'disabled'}>Reservar ${sel.length || ''} tablet${sel.length === 1 ? '' : 's'}</button>`;
  return modalShell(fmtDate(date), sessLabel(session), body, footer);
}

function notifModal() {
  const pend = pendingForMe();
  const rej = rejectedForMe();
  if (!pend.length && !rej.length) { S.modal = null; return ''; }
  const pendHTML = pend.length ? `<h3 style="margin-top:0">Han demanat les tablets de ${classById(me().classId)?.name}</h3>
    <p class="hint" style="margin-top:-4px">Si no contestes, el préstec es dona per acceptat.</p>
    <div class="list">${pend.map((r) => requestItem(r, 'owner')).join('')}</div>` : '';
  const rejHTML = rej.length ? `<h3>Préstecs rebutjats</h3><div class="list">${rej.map((r) => `<div class="item" style="--c:var(--low)"><div>
      <b>${fmtDate(r.date)} · ${sessLabel(r.session)}</b><div class="meta">El tutor/a de ${classById(r.ownerClassId)?.name} ha rebutjat les tablets ${tabletsTxt(r.tablets)}. S'han llevat de la teua reserva.</div></div>
      <div class="actions"><button class="btn small" data-act="seenRejected" data-id="${r.id}">D'acord</button></div></div>`).join('')}</div>` : '';
  return modalShell('Avisos', '', pendHTML + rejHTML, `<button class="btn" data-act="close">${pend.length ? 'Decidir més tard' : 'Tancar'}</button>`);
}

// ================= Esdeveniments =================
const byId = (col, id) => S[col].find((x) => x.id === id);

const actions = {
  tab: (el) => { S.tab = el.dataset.tab; },
  week: (el) => { const d = Number(el.dataset.d); S.weekOffset = d === 0 ? 0 : S.weekOffset + d; },
  changeMe: () => { S.modal = { type: 'who', forced: false }; },
  pickMe: (el) => {
    S.meId = el.dataset.id; lsSet('tablets.me', S.meId); S.modal = null;
    if (S.tab === 'admin' && !isAdmin()) S.tab = 'calendari';
  },
  close: () => { S.modal = null; },
  openCell: (el) => { S.modal = { type: 'cell', date: el.dataset.date, session: Number(el.dataset.s), sel: new Set(), recurring: false, note: '' }; },
  toggleTab: (el) => { const t = Number(el.dataset.t); S.modal.sel.has(t) ? S.modal.sel.delete(t) : S.modal.sel.add(t); },
  selMine: () => {
    const M = S.modal; const occ = occupancy(M.date, M.session);
    classById(me().classId).tablets.filter((t) => !occ.has(t)).forEach((t) => M.sel.add(t));
  },
  selAll: () => {
    const M = S.modal; const occ = occupancy(M.date, M.session);
    ALL_TABLETS.filter((t) => !occ.has(t) && canSingle(t, M.date)).forEach((t) => M.sel.add(t));
  },
  selNone: () => { S.modal.sel.clear(); },
  book: async (el) => {
    const M = S.modal;
    el.disabled = true;
    const ok = await createBooking({ date: M.date, session: M.session, tablets: [...M.sel], recurring: M.recurring, note: M.note.trim() });
    if (ok) { M.sel.clear(); M.note = ''; M.recurring = false; }
  },
  cancelSingle: async (el) => {
    const b = byId('bookings', el.dataset.id);
    if (b && confirm('Segur que vols anul·lar aquesta reserva?')) await deleteBooking(b);
  },
  cancelDay: async (el) => { const b = byId('bookings', el.dataset.id); if (b) await cancelDay(b, el.dataset.date); },
  cancelFrom: async (el) => {
    const b = byId('bookings', el.dataset.id);
    if (b && confirm(`S'anul·larà la reserva fixa a partir del ${fmtShort(el.dataset.date)}. Continuar?`)) await cancelFrom(b, el.dataset.date);
  },
  endSeries: async (el) => {
    const b = byId('bookings', el.dataset.id);
    if (b && confirm('Segur que vols anul·lar aquesta reserva fixa a partir de hui?')) await cancelFrom(b, today());
  },
  accept: async (el) => { const r = byId('requests', el.dataset.id); if (r) await answerRequest(r, true); },
  reject: async (el) => {
    const r = byId('requests', el.dataset.id);
    if (r && confirm(`Rebutjar el préstec de les tablets ${tabletsTxt(r.tablets)} a ${r.fromName}?`)) await answerRequest(r, false);
  },
  seenRejected: async (el) => { await store.update('requests', el.dataset.id, { requesterSeen: true }); },
  resolveInc: async (el) => { await store.update('incidents', el.dataset.id, { status: 'resolta', resolvedAt: Date.now() }); },
  reopenInc: async (el) => { await store.update('incidents', el.dataset.id, { status: 'oberta', resolvedAt: null }); },
  deleteInc: async (el) => { if (confirm('Esborrar aquesta incidència?')) await store.remove('incidents', el.dataset.id); },
  delPerson: async (el) => {
    const p = byId('people', el.dataset.id);
    if (p && confirm(`Esborrar ${p.name}? Les seues reserves es mantindran.`)) await store.remove('people', p.id);
  },
  delHoliday: async (el) => { await store.remove('holidays', el.dataset.id); },
  export: () => {
    const data = {}; COLLECTIONS.forEach((c) => (data[c] = S[c]));
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    a.download = `tablets-${today()}.json`;
    a.click();
  },
  resetDemo: () => { if (confirm('Esborrar totes les dades de la demo?')) { store.reset(); S.meId = null; } },
};

document.addEventListener('click', async (e) => {
  const bd = e.target.closest('.backdrop');
  if (bd && e.target === bd && bd.dataset.backdrop === '1') { S.modal = null; render(); return; }
  const el = e.target.closest('[data-act]');
  if (!el || !actions[el.dataset.act]) return;
  el.blur();
  await actions[el.dataset.act](el, e);
  render();
});

document.addEventListener('input', (e) => {
  if (e.target.dataset.input === 'note' && S.modal) S.modal.note = e.target.value;
});

document.addEventListener('change', async (e) => {
  const el = e.target;
  const k = el.dataset.change;
  if (!k) return;
  const id = el.dataset.id;
  if (k === 'kind') { S.modal.recurring = el.value === 'recurring'; el.blur(); render(); return; }
  if (k === 'pName' && el.value.trim()) await store.update('people', id, { name: el.value.trim() });
  if (k === 'pRole') await store.update('people', id, { role: el.value });
  if (k === 'pClass') await store.update('people', id, { classId: el.value || null });
  if (k === 'pAdmin') await store.update('people', id, { isAdmin: el.checked });
  el.blur();
  render();
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && S.modal && !S.modal.forced) { S.modal = null; render(); }
});

const forms = {
  incident: async (fd) => {
    const m = me();
    await store.add('incidents', {
      tablet: Number(fd.get('tablet')), text: String(fd.get('text')).trim(),
      personId: m.id, personName: m.name, status: 'oberta', createdAt: Date.now(),
    });
    alert("Incidència enviada. Gràcies!");
  },
  person: async (fd) => {
    await store.add('people', {
      name: String(fd.get('name')).trim(), role: fd.get('role'),
      classId: fd.get('classId') || null, isAdmin: fd.get('isAdmin') === 'on',
    });
  },
  holiday: async (fd) => {
    const from = fd.get('from');
    let to = fd.get('to') || from;
    if (to < from) to = from;
    await store.add('holidays', { from, to, label: String(fd.get('label')).trim() });
  },
};

document.addEventListener('submit', async (e) => {
  const f = e.target.dataset.form;
  if (!forms[f]) return;
  e.preventDefault();
  await forms[f](new FormData(e.target));
  e.target.reset();
  document.activeElement?.blur();
  render();
});

// ================= Inici =================
async function boot() {
  const main = document.getElementById('main');
  main.innerHTML = '<p class="loading">Carregant…</p>';
  try {
    store = await createStore({ people: SEED_PEOPLE });
  } catch (err) {
    console.error(err);
    main.innerHTML = `<p class="error">No s'ha pogut connectar amb la base de dades.<br><small>${esc(err.message)}</small></p>`;
    return;
  }
  COLLECTIONS.forEach((col) => store.subscribe(col, (arr) => { S[col] = arr; S.loaded[col] = true; schedule(); }));
}
boot();
