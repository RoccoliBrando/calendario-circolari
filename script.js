(() => {
  'use strict';

  // ---------- Configurazione ----------
  const CATS = {
    circolare: { label: 'Circolare',          color: 'var(--c-circolare)' },
    docenti:   { label: 'Impegno docenti',    color: 'var(--c-docenti)'   },
    studenti:  { label: 'Impegno studenti',   color: 'var(--c-studenti)'  },
    riunione:  { label: 'Riunione / Collegio',color: 'var(--c-riunione)'  },
    scadenza:  { label: 'Scadenza',           color: 'var(--c-scadenza)'  }
  };
  const AUD = { docenti: 'Docenti', studenti: 'Studenti', tutti: 'Tutti' };
  const KEY_EVENTS = 'belluzzi.calendario.eventi.v1';
  const KEY_USER = 'belluzzi.calendario.utente.v1';

  // ---------- Utilità ----------
  const $ = id => document.getElementById(id);
  const pad = n => String(n).padStart(2, '0');
  const toISO = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
  const fromISO = s => { const [y,m,d] = s.split('-').map(Number); return new Date(y, m-1, d); };
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const fmtLong = iso => fromISO(iso).toLocaleDateString('it-IT', { weekday:'long', day:'numeric', month:'long', year:'numeric' });
  const fmtShort = iso => fromISO(iso).toLocaleDateString('it-IT', { day:'numeric', month:'short' });
  const el = (tag, props = {}, ...kids) => {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (k === 'class') e.className = v;
      else if (k === 'style') e.style.cssText = v;
      else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v);
    }
    kids.flat().forEach(k => e.append(k instanceof Node ? k : document.createTextNode(k)));
    return e;
  };
  const safeUrl = u => { try { const x = new URL(u); return /^https?:$/.test(x.protocol) ? x.href : ''; } catch { return ''; } };
  let toastT;
  const toast = msg => { const t = $('toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2400); };

  // ---------- Stato e persistenza ----------
  const today = new Date();
  const state = {
    events: [],
    user: '',
    cursor: new Date(today.getFullYear(), today.getMonth(), 1),
    selected: toISO(today),
    editingId: null
  };

  function seed() {
    const y = today.getFullYear(), m = today.getMonth();
    const d = n => toISO(new Date(y, m, n));
    return [
      { id: uid(), title: 'Convocazione Collegio Docenti', num: '64', start: d(12), end: '', cat: 'riunione', audience: 'docenti',
        desc: 'Ordine del giorno: approvazione verbali, PTOF, progetti PCTO.\nOre 15:00 – Aula Magna.', link: '', needsSign: true, signatures: [] },
      { id: uid(), title: 'Assemblea di istituto studenti', num: '65', start: d(17), end: '', cat: 'studenti', audience: 'studenti',
        desc: 'Assemblea di istituto – ore 8:30 in palestra. Le lezioni riprendono alle 12:00.', link: '', needsSign: false, signatures: [] },
      { id: uid(), title: 'Scrutini intermedi – consegna proposte di voto', num: '66', start: d(24), end: '', cat: 'scadenza', audience: 'docenti',
        desc: 'Inserire le proposte di voto sul registro elettronico entro le 18:00.', link: '', needsSign: true, signatures: [] },
      { id: uid(), title: 'Uscita didattica – Museo della Scienza', num: '67', start: d(19), end: d(20), cat: 'studenti', audience: 'tutti',
        desc: 'Classi 3A e 3B. Partenza ore 7:45. Autorizzazione firmata dai genitori.', link: '', needsSign: true, signatures: [] },
      { id: uid(), title: 'Circolare: aggiornamento sicurezza sul lavoro', num: '68', start: d(5), end: '', cat: 'circolare', audience: 'docenti',
        desc: 'Si invitano i docenti a prendere visione delle nuove procedure di evacuazione.', link: '', needsSign: true, signatures: [] },
      { id: uid(), title: 'Ricevimento generale genitori', num: '69', start: d(30), end: '', cat: 'docenti', audience: 'docenti',
        desc: 'Dalle 15:00 alle 18:00, su prenotazione dal registro elettronico.', link: '', needsSign: false, signatures: [] }
    ];
  }

  function load() {
    try {
      const raw = localStorage.getItem(KEY_EVENTS);
      state.events = raw ? JSON.parse(raw) : seed();
      state.user = localStorage.getItem(KEY_USER) || '';
    } catch { state.events = seed(); }
    if (!localStorage.getItem(KEY_EVENTS)) save();
  }
  function save() {
    try { localStorage.setItem(KEY_EVENTS, JSON.stringify(state.events)); } catch { toast('Impossibile salvare nel browser'); }
  }

  // ---------- Filtri ----------
  const isSignedBy = (ev, name) => ev.signatures.some(s => s.name.toLowerCase() === name.toLowerCase());
  const needsMySign = ev => ev.needsSign && !(state.user && isSignedBy(ev, state.user));

  function filtered() {
    const q = $('q').value.trim().toLowerCase();
    const cat = $('fCat').value, aud = $('fAud').value, onlyU = $('fUnsigned').checked;
    return state.events.filter(ev => {
      if (cat !== 'all' && ev.cat !== cat) return false;
      if (aud !== 'all' && ev.audience !== aud) return false;
      if (onlyU && !needsMySign(ev)) return false;
      if (q && !(`${ev.title} ${ev.num} ${ev.desc}`.toLowerCase().includes(q))) return false;
      return true;
    });
  }
  const onDay = (ev, iso) => ev.start <= iso && iso <= (ev.end || ev.start);

  // ---------- Rendering calendario ----------
  function renderCalendar() {
    const cur = state.cursor;
    $('monthTitle').textContent = cur.toLocaleDateString('it-IT', { month: 'long', year: 'numeric' });
    const grid = $('grid'); grid.replaceChildren();
    ['Lun','Mar','Mer','Gio','Ven','Sab','Dom'].forEach(n => grid.append(el('div', { class: 'dow' }, n)));

    const first = new Date(cur.getFullYear(), cur.getMonth(), 1);
    const offset = (first.getDay() + 6) % 7;
    const start = new Date(cur.getFullYear(), cur.getMonth(), 1 - offset);
    const evs = filtered();
    const todayISO = toISO(today);

    for (let i = 0; i < 42; i++) {
      const dt = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
      const iso = toISO(dt);
      const dayEvs = evs.filter(e => onDay(e, iso));
      const cell = el('div', {
        class: 'day' + (dt.getMonth() !== cur.getMonth() ? ' other' : '') + (iso === todayISO ? ' today' : '') + (iso === state.selected ? ' selected' : ''),
        role: 'button', tabindex: '0', 'aria-label': fmtLong(iso) + `, ${dayEvs.length} eventi`,
        onclick: () => { state.selected = iso; render(); },
        ondblclick: () => openDialog(null, iso),
        onkeydown: e => { if (e.key === 'Enter') { state.selected = iso; render(); } }
      },
        el('span', { class: 'num' }, String(dt.getDate())),
        el('button', { class: 'add', title: 'Aggiungi', onclick: e => { e.stopPropagation(); openDialog(null, iso); } }, '+')
      );
      dayEvs.slice(0, 3).forEach(ev => {
        cell.append(el('span', {
          class: 'chip' + (needsMySign(ev) ? ' unsigned' : ''),
          style: `background:${CATS[ev.cat].color}`, title: ev.title
        }, (ev.num ? `n.${ev.num} ` : '') + ev.title));
      });
      if (dayEvs.length > 3) cell.append(el('span', { class: 'more' }, `+${dayEvs.length - 3} altri`));
      grid.append(cell);
    }

    // statistiche mese
    const y = cur.getFullYear(), m = cur.getMonth();
    const inMonth = evs.filter(e => {
      const s = fromISO(e.start), f = fromISO(e.end || e.start);
      return s <= new Date(y, m + 1, 0) && f >= new Date(y, m, 1);
    });
    $('stTot').textContent = inMonth.length;
    $('stSign').textContent = state.events.filter(needsMySign).length;
  }

  // ---------- Rendering pannello giorno ----------
  function renderDay() {
    $('dayTitle').textContent = fmtLong(state.selected);
    const list = filtered().filter(e => onDay(e, state.selected));
    $('daySub').textContent = list.length ? `${list.length} element${list.length === 1 ? 'o' : 'i'} in programma` : 'Nessun evento in questa data';
    const box = $('dayList'); box.replaceChildren();
    if (!list.length) { box.append(el('div', { class: 'empty' }, 'Nessuna circolare o impegno. Usa il pulsante per aggiungerne uno.')); return; }

    list.forEach(ev => {
      const c = CATS[ev.cat];
      const card = el('div', { class: 'card', style: `border-left-color:${c.color}` });
      card.append(el('h4', {}, (ev.num ? `Circ. n. ${ev.num} – ` : '') + ev.title));
      card.append(el('div', {},
        el('span', { class: 'tag', style: `background:${c.color}` }, c.label),
        el('span', { class: 'tag gray' }, '👥 ' + AUD[ev.audience]),
        ev.needsSign ? el('span', { class: 'tag gray' }, '✎ Firma richiesta') : ''
      ));
      card.append(el('div', { class: 'meta', style: 'margin-top:6px' },
        '📅 ' + fmtShort(ev.start) + (ev.end && ev.end !== ev.start ? ' → ' + fmtShort(ev.end) : '')));
      if (ev.desc) card.append(el('p', {}, ev.desc));
      const url = safeUrl(ev.link);
      if (url) card.append(el('a', { href: url, target: '_blank', rel: 'noopener noreferrer', class: 'meta' }, '📎 Apri il PDF della circolare'));

      if (ev.needsSign) {
        const sigs = el('div', { class: 'sigs' });
        if (ev.signatures.length) {
          sigs.append(el('b', {}, `Firmato da ${ev.signatures.length}: `),
            ev.signatures.map(s => `${s.name} (${new Date(s.at).toLocaleString('it-IT', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' })})`).join(' · '));
        } else sigs.append('Nessuna firma ancora registrata.');
        card.append(sigs);
      }

      const act = el('div', { class: 'actions' });
      if (ev.needsSign) {
        const mine = state.user && isSignedBy(ev, state.user);
        act.append(mine
          ? el('button', { class: 'small', onclick: () => unsign(ev.id) }, '↩ Revoca la mia firma')
          : el('button', { class: 'small ok', onclick: () => sign(ev.id) }, '✎ Firma per presa visione'));
      }
      act.append(el('button', { class: 'small', onclick: () => openDialog(ev.id) }, '✏️ Modifica'));
      act.append(el('button', { class: 'small danger', onclick: () => remove(ev.id) }, '🗑 Elimina'));
      card.append(act);
      box.append(card);
    });
  }

  function renderLegend() {
    const lg = $('legend'); lg.replaceChildren();
    Object.values(CATS).forEach(c => lg.append(el('span', {}, el('i', { style: `background:${c.color}` }), c.label)));
    lg.append(el('span', {}, '✎ = da firmare'));
  }

  function render() { renderCalendar(); renderDay(); }

  // ---------- Azioni: firma, elimina, salva ----------
  function ensureUser() {
    if (state.user.trim()) return true;
    $('userName').focus();
    toast('Inserisci prima il tuo nome in alto per poter firmare');
    return false;
  }
  function sign(id) {
    if (!ensureUser()) return;
    const ev = state.events.find(e => e.id === id);
    if (!ev || isSignedBy(ev, state.user)) return;
    ev.signatures.push({ name: state.user.trim(), at: new Date().toISOString() });
    save(); render(); toast('Firma registrata ✔');
  }
  function unsign(id) {
    const ev = state.events.find(e => e.id === id);
    if (!ev) return;
    ev.signatures = ev.signatures.filter(s => s.name.toLowerCase() !== state.user.trim().toLowerCase());
    save(); render(); toast('Firma revocata');
  }
  function remove(id) {
    const ev = state.events.find(e => e.id === id);
    if (!ev || !confirm(`Eliminare definitivamente "${ev.title}"?`)) return;
    state.events = state.events.filter(e => e.id !== id);
    save(); render(); toast('Elemento eliminato');
  }

  // ---------- Dialog inserimento / modifica ----------
  const dlg = $('dlg');
  function openDialog(id, presetDate) {
    state.editingId = id;
    const ev = id ? state.events.find(e => e.id === id) : null;
    $('dlgTitle').textContent = ev ? 'Modifica elemento' : 'Nuova circolare / impegno';
    $('fTitle').value = ev?.title || '';
    $('fNum').value = ev?.num || '';
    $('fCategory').value = ev?.cat || 'circolare';
    $('fStart').value = ev?.start || presetDate || state.selected;
    $('fEnd').value = ev?.end || '';
    $('fAudience').value = ev?.audience || 'docenti';
    $('fLink').value = ev?.link || '';
    $('fDesc').value = ev?.desc || '';
    $('fSign').checked = ev ? ev.needsSign : true;
    dlg.showModal();
    $('fTitle').focus();
  }

  $('form').addEventListener('submit', e => {
    e.preventDefault();
    const start = $('fStart').value, end = $('fEnd').value;
    if (!start) return;
    if (end && end < start) { toast('La data di fine non può precedere quella di inizio'); return; }
    const link = $('fLink').value.trim();
    if (link && !safeUrl(link)) { toast('Il link deve iniziare con http:// o https://'); return; }
    const data = {
      title: $('fTitle').value.trim(), num: $('fNum').value.trim(), cat: $('fCategory').value,
      start, end, audience: $('fAudience').value, link, desc: $('fDesc').value.trim(), needsSign: $('fSign').checked
    };
    if (!data.title) return;
    if (state.editingId) {
      Object.assign(state.events.find(x => x.id === state.editingId), data);
      toast('Modifiche salvate');
    } else {
      state.events.push({ id: uid(), signatures: [], ...data });
      toast('Aggiunto al calendario');
    }
    state.selected = start;
    state.cursor = new Date(fromISO(start).getFullYear(), fromISO(start).getMonth(), 1);
    save(); dlg.close(); render();
  });
  $('cancelBtn').onclick = () => dlg.close();

  // ---------- Esporta / importa ----------
  $('exportBtn').onclick = () => {
    const blob = new Blob([JSON.stringify(state.events, null, 2)], { type: 'application/json' });
    const a = el('a', { href: URL.createObjectURL(blob), download: `circolari-${toISO(new Date())}.json` });
    document.body.append(a); a.click(); a.remove();
  };
  $('importBtn').onclick = () => $('importFile').click();
  $('importFile').onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    try {
      const arr = JSON.parse(await f.text());
      if (!Array.isArray(arr)) throw 0;
      const valid = arr.filter(x => x && typeof x.title === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x.start) && CATS[x.cat])
        .map(x => ({ id: uid(), title: x.title, num: x.num || '', start: x.start, end: x.end || '', cat: x.cat,
          audience: AUD[x.audience] ? x.audience : 'tutti', desc: x.desc || '', link: x.link || '',
          needsSign: !!x.needsSign, signatures: Array.isArray(x.signatures) ? x.signatures.filter(s => s && s.name) : [] }));
      state.events.push(...valid); save(); render(); toast(`Importati ${valid.length} elementi`);
    } catch { toast('File non valido'); }
    e.target.value = '';
  };

  // ---------- Inizializzazione ----------
  function init() {
    load();
    Object.entries(CATS).forEach(([k, c]) => {
      $('fCat').append(el('option', { value: k }, c.label));
      $('fCategory').append(el('option', { value: k }, c.label));
    });
    renderLegend();
    $('userName').value = state.user;
    $('userName').addEventListener('input', e => {
      state.user = e.target.value;
      try { localStorage.setItem(KEY_USER, state.user); } catch {}
      render();
    });
    $('prev').onclick = () => { state.cursor = new Date(state.cursor.getFullYear(), state.cursor.getMonth() - 1, 1); renderCalendar(); };
    $('next').onclick = () => { state.cursor = new Date(state.cursor.getFullYear(), state.cursor.getMonth() + 1, 1); renderCalendar(); };
    $('today').onclick = () => { state.cursor = new Date(today.getFullYear(), today.getMonth(), 1); state.selected = toISO(today); render(); };
    $('newBtn').onclick = () => openDialog(null, state.selected);
    $('addDay').onclick = () => openDialog(null, state.selected);
    ['q', 'fCat', 'fAud', 'fUnsigned'].forEach(id => $(id).addEventListener('input', render));
    render();
  }
  init();
})();
