/* ═══════════════════════════════════════════════════════════════
   EpixMundial 2026 — lógica del front-end
   Predicciones cerradas: la pestaña de envío se sustituyó por
   "Probabilidades" (probabilidad de ganar la quiniela ahora mismo).
   ═══════════════════════════════════════════════════════════════ */
(() => {
  'use strict';

  const REFRESH_MS = 60000;

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  const state = {
    tab: 'probs',
    players: [],
    scoring: { champion: 50, runnerUp: 30, goldenBoot: 25, revelation: 20, mvp: 20, semi: 10 },
    expanded: new Set(),
    deadline: null,
    locked: false,
    loading: false,
  };

  /* ─── ESCENARIOS DE LA FINAL (hardcoded) ───
     Calculado el 16 de julio de 2026. Solo queda la FINAL: España vs
     Argentina (19 jul). Se ignoran las faltas de ortografía.

     Ya RESUELTO (puntos fijos, iguales en los dos escenarios):
       · Revelación = Noruega → Daini +20.
       · Semifinalistas (España, Francia, Inglaterra, Argentina), 10 c/u:
         Bogdan 3(30), Daini 2(20), Nacho 3(30), Lucas 2(20), Víctor 2(20),
         orazio 3(30), Carlos 3(30), Ben 3(30), Juan Manuel 1(10).
       · Bota de Oro → Messi (8g/4a, imbatible; Mbappé congelado en 8g/3a).
         Nadie eligió a Messi ⇒ el goleador (25) no lo puntúa nadie.
     Lo ÚNICO que decide la final:
       · Campeón (50): solo lo tienen los de España (Daini, Nacho, Ben).
       · Subcampeón (30): solo los de España (Lucas, Carlos) — cobran si
         gana Argentina.
       · MVP (20): si gana España, probable Lamine Yamal (Bogdan, Daini,
         orazio, Carlos, Ben); si gana Argentina, probable Messi (nadie). */

  const FINAL = {
    when: 'domingo 19 jul 2026 · 21:00 h (España) · MetLife Stadium',
    kickoff: '2026-07-19T19:00:00Z', // 15:00 ET / 21:00 CEST
    a: { name: 'España',    flag: '🇪🇸', win: 55 },
    b: { name: 'Argentina', flag: '🇦🇷', win: 45 },
  };

  // Probabilidad global de GANAR la quiniela (marginando ambos resultados).
  // Solo Daini, Carlos o Nacho pueden acabar 1.º; el resto no llega.
  const WIN_PROB = [
    { name: 'Carlos',         pct: 45, note: 'Gana la quiniela si gana Argentina (España subcampeón, +30).' },
    { name: 'Daini Carolina', pct: 41, note: 'Gana si gana España y el MVP no es Pedri (lo más probable).' },
    { name: 'Nacho',          pct: 14, note: 'Gana solo si gana España y además el MVP es Pedri.' },
  ];

  const SCENARIOS = [
    {
      key: 'espana', flag: '🇪🇸', title: 'Si gana ESPAÑA', win: 55,
      detail: 'España campeón (+50 a Daini, Nacho y Ben) · subcampeón Argentina (nadie) · MVP probable Lamine Yamal (+20). Ojo: si el MVP fuese Pedri, Nacho subiría a 100 y adelantaría a Daini.',
      table: [
        { name: 'Daini Carolina',    pts: 110, why: 'Campeón + Revelación + MVP + 2 semis' },
        { name: 'Ben',               pts: 100, why: 'Campeón + MVP + 3 semis' },
        { name: 'Nacho',             pts:  80, why: 'Campeón + 3 semis' },
        { name: 'Bogdan Starchenko', pts:  50, why: 'MVP + 3 semis' },
        { name: 'orazio',            pts:  50, why: 'MVP + 3 semis' },
        { name: 'Carlos',            pts:  50, why: 'MVP + 3 semis' },
        { name: 'Lucas',             pts:  20, why: '2 semis' },
        { name: 'Víctor',            pts:  20, why: '2 semis' },
        { name: 'Juan Manuel CR7',   pts:  10, why: '1 semi' },
      ],
    },
    {
      key: 'argentina', flag: '🇦🇷', title: 'Si gana ARGENTINA', win: 45,
      detail: 'Argentina campeón (nadie lo eligió) · subcampeón España (+30 a Lucas y Carlos) · MVP y Bota de Oro para Messi (nadie).',
      table: [
        { name: 'Carlos',            pts: 60, why: 'Subcampeón + 3 semis' },
        { name: 'Lucas',             pts: 50, why: 'Subcampeón + 2 semis' },
        { name: 'Daini Carolina',    pts: 40, why: 'Revelación + 2 semis' },
        { name: 'Bogdan Starchenko', pts: 30, why: '3 semis' },
        { name: 'Nacho',             pts: 30, why: '3 semis' },
        { name: 'orazio',            pts: 30, why: '3 semis' },
        { name: 'Ben',               pts: 30, why: '3 semis' },
        { name: 'Víctor',            pts: 20, why: '2 semis' },
        { name: 'Juan Manuel CR7',   pts: 10, why: '1 semi' },
      ],
    },
  ];

  /* ─── helpers ─── */

  const norm = s => String(s == null ? '' : s)
    .trim().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');

  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const urlReady = () =>
    typeof GOOGLE_SCRIPT_URL === 'string' && GOOGLE_SCRIPT_URL.startsWith('https://script.google.com/');

  const fmtDate = iso => {
    const d = new Date(iso);
    return isNaN(d) ? '' :
      d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }) + ' · ' +
      d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  };

  // Devuelve el breakdown de un campo de forma segura (filas antiguas sin mvp)
  const safeBd = (b, field) => (b && b[field]) ? b[field] : { hit: null, points: 0 };

  const hitIcon = h =>
    h === true  ? '<i class="fa-solid fa-check c-green" style="font-size:0.8rem;"></i>' :
    h === false ? '<i class="fa-solid fa-xmark c-red"   style="font-size:0.8rem;"></i>' :
                  '<i class="fa-regular fa-clock c-muted" style="font-size:0.8rem;"></i>';

  /* ─── tabs ─── */

  function switchTab(tab, { refresh = false } = {}) {
    state.tab = tab;
    $$('.tab-btn').forEach(b => {
      const active = b.dataset.tab === tab;
      b.classList.toggle('tab-active', active);
      b.setAttribute('aria-selected', active);
    });
    $('#panel-probs').classList.toggle('hidden', tab !== 'probs');
    $('#panel-board').classList.toggle('hidden', tab !== 'board');
    // La clasificación necesita datos del backend; los escenarios son fijos.
    if (tab === 'board' && (refresh || !state.players.length)) loadBoard();
    history.replaceState(null, '', tab === 'board' ? '#clasificacion' : '#escenarios');
  }

  /* ─── datos ─── */

  async function loadBoard({ silent = false } = {}) {
    if (!urlReady()) { renderSetupNotice(); return; }
    if (state.loading) return;
    state.loading = true;
    const icon = $('#refresh-btn i');
    if (icon) icon.classList.add('fa-spin');
    if (!silent && !state.players.length) renderSkeleton();

    try {
      const res = await fetch(`${GOOGLE_SCRIPT_URL}?action=leaderboard&cb=${Date.now()}`);
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'Error del backend');

      state.players = data.players || [];
      state.deadline = data.deadline;
      state.locked = !!data.locked;
      if (data.scoring) state.scoring = data.scoring;
      renderBoard(data);
      $('#last-updated').textContent = new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
    } catch (err) {
      if (!silent) renderBoardError(err);
    } finally {
      state.loading = false;
      if (icon) icon.classList.remove('fa-spin');
    }
  }

  /* ─── escenarios de la final ─── */

  // Los escenarios son fijos (no dependen del backend); se pintan una vez.
  function renderScenarios() {
    renderFinalHeader();
    startCountdown();
    renderWinProb();
    renderScenarioCards();
  }

  function renderFinalHeader() {
    const box = $('#final-header');
    if (!box) return;
    const team = t => `
      <div class="final-team">
        <span class="final-flag">${t.flag}</span>
        <span class="final-name">${esc(t.name)}</span>
        <span class="final-pct c-cyan">${t.win}%</span>
      </div>`;
    const cd = (id, lbl) => `
      <div class="cd-box"><div class="cd-num" id="${id}">–</div><div class="cd-lbl">${lbl}</div></div>`;
    box.innerHTML = `
      <div class="final-hero">
        <div class="final-label"><i class="fa-solid fa-star"></i> La Gran Final <i class="fa-solid fa-star"></i></div>
        <div class="final-vs">
          ${team(FINAL.a)}
          <div class="vs-badge">VS</div>
          ${team(FINAL.b)}
        </div>
        <div id="cd-wrap" class="cd-row">
          ${cd('cd-d', 'días')}${cd('cd-h', 'horas')}${cd('cd-m', 'min')}${cd('cd-s', 'seg')}
        </div>
        <div class="cd-venue"><i class="fa-solid fa-location-dot mr-1"></i>${esc(FINAL.when)}</div>
      </div>`;
  }

  /* ─── cuenta atrás en vivo ─── */

  let cdTimer = null;
  function startCountdown() {
    const target = new Date(FINAL.kickoff).getTime();
    if (cdTimer) clearInterval(cdTimer);
    const tick = () => {
      const diff = target - Date.now();
      if (diff <= 0) return showFinalLive();
      setCd('cd-d', Math.floor(diff / 86400000));
      setCd('cd-h', Math.floor(diff % 86400000 / 3600000), 2);
      setCd('cd-m', Math.floor(diff % 3600000 / 60000), 2);
      setCd('cd-s', Math.floor(diff % 60000 / 1000), 2);
    };
    tick();
    cdTimer = setInterval(tick, 1000);
  }

  function setCd(id, val, pad) {
    const el = document.getElementById(id);
    if (!el) return;
    const str = pad ? String(val).padStart(pad, '0') : String(val);
    if (el.textContent === str) return;
    el.textContent = str;
    el.classList.remove('cd-flash');
    void el.offsetWidth;        // reinicia la animación
    el.classList.add('cd-flash');
  }

  function showFinalLive() {
    if (cdTimer) { clearInterval(cdTimer); cdTimer = null; }
    const wrap = $('#cd-wrap');
    if (wrap) wrap.innerHTML = '<span class="cd-live"><span class="dot"></span>¡La final ya está en juego!</span>';
  }

  function renderWinProb() {
    const box = $('#win-prob');
    if (!box) return;
    const max = Math.max(...WIN_PROB.map(w => w.pct));
    const row = (w, i) => {
      const rankClass = i === 0 ? 'rank-1' : i === 1 ? 'rank-2' : i === 2 ? 'rank-3' : '';
      const width = Math.max(6, Math.round((w.pct / max) * 100));
      return `
        <div class="lb-row rise" style="padding:0.7rem 0.9rem;animation-delay:${i * 0.08}s;">
          <div style="display:flex;align-items:center;gap:0.7rem;">
            <div class="rank-badge ${rankClass}">${i + 1}</div>
            <div style="flex:1;min-width:0;">
              <div style="display:flex;align-items:baseline;justify-content:space-between;gap:0.5rem;">
                <span style="font-weight:800;font-size:0.9rem;">${esc(w.name)}</span>
                <span class="c-cyan" style="font-weight:900;font-size:1.1rem;">${w.pct}<span style="font-size:0.6rem;color:var(--muted);margin-left:2px;">%</span></span>
              </div>
              <div style="height:6px;background:var(--navy);border:1px solid var(--border);border-radius:20px;overflow:hidden;margin-top:0.35rem;">
                <div class="wp-fill" style="height:100%;width:${width}%;background:linear-gradient(90deg,var(--cyan),#0090a8);border-radius:20px;"></div>
              </div>
              <div class="c-muted" style="font-size:0.7rem;margin-top:0.35rem;">${esc(w.note)}</div>
            </div>
          </div>
        </div>`;
    };
    box.innerHTML = `
      <div style="font-size:0.7rem;font-weight:800;text-transform:uppercase;letter-spacing:0.06em;color:var(--muted);margin:0.25rem 0 0.6rem;">
        <i class="fa-solid fa-trophy mr-1"></i>Prob. de ganar la quiniela
      </div>
      ${WIN_PROB.map(row).join('')}
      <p class="c-muted" style="font-size:0.68rem;margin-top:0.35rem;">Solo estos tres pueden acabar 1.º; el resto ya no llega matemáticamente.</p>`;
  }

  function renderScenarioCards() {
    const box = $('#scenarios');
    if (!box) return;
    box.innerHTML = SCENARIOS.map(scenarioHtml).join('');
  }

  function scenarioHtml(sc, sci) {
    const rowHtmlS = (r, i) => {
      const rank = i + 1;
      const rankClass = rank === 1 ? 'rank-1' : rank === 2 ? 'rank-2' : rank === 3 ? 'rank-3' : '';
      const winner = rank === 1;
      return `
        <div class="scn-row ${winner ? 'scn-winner' : ''}" style="display:flex;align-items:center;gap:0.6rem;padding:0.5rem 0.65rem;${winner ? 'background:#1a1500;border:1px solid #b8860b;' : ''}">
          <div class="rank-badge ${rankClass}" style="width:28px;height:28px;font-size:0.75rem;">${rank}</div>
          <div style="flex:1;min-width:0;">
            <div style="font-weight:${winner ? 800 : 700};font-size:0.85rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${winner ? '👑 ' : ''}${esc(r.name)}</div>
            <div class="c-muted" style="font-size:0.66rem;">${esc(r.why)}</div>
          </div>
          <div class="c-cyan" style="font-weight:900;font-size:1rem;min-width:42px;text-align:right;">${r.pts}<span style="font-size:0.58rem;color:var(--muted);margin-left:2px;">pts</span></div>
        </div>`;
    };
    return `
      <div class="card-inner scn-card rise p-4" style="margin-bottom:1rem;animation-delay:${0.15 + sci * 0.1}s;">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:0.5rem;margin-bottom:0.6rem;">
          <h3 style="font-weight:800;font-size:0.95rem;">${sc.flag} ${esc(sc.title)}</h3>
          <span class="result-chip" style="font-size:0.7rem;"><span class="c-cyan" style="font-weight:800;">${sc.win}%</span></span>
        </div>
        <p class="c-muted" style="font-size:0.72rem;line-height:1.5;margin-bottom:0.75rem;">${esc(sc.detail)}</p>
        <div style="display:flex;flex-direction:column;gap:0.15rem;">${sc.table.map(rowHtmlS).join('')}</div>
      </div>`;
  }

  /* ─── clasificación ─── */

  function renderSkeleton() {
    $('#board-status').innerHTML = Array.from({ length: 4 }, () => '<div class="skeleton"></div>').join('');
    $('#podium').innerHTML = '';
    $('#board-rows').innerHTML = '';
  }

  function renderSetupNotice() {
    $('#board-status').innerHTML = `
      <div class="card-inner p-4 fade-in" style="font-size:0.82rem;">
        <p style="font-weight:800;color:#e0b030;margin-bottom:0.5rem;"><i class="fa-solid fa-gear mr-1"></i>Falta conectar la hoja de Google</p>
        <ol style="color:var(--muted);padding-left:1.2rem;line-height:1.8;">
          <li>Abre la hoja → <b>Extensiones → Apps Script</b></li>
          <li>Pega <b>apps-script/Code.gs</b> → ejecuta <b>setupSheets</b></li>
          <li>Despliega como <b>Aplicación web</b> (acceso: <i>Cualquier usuario</i>)</li>
          <li>Copia la URL en <b>config.js</b></li>
        </ol>
      </div>`;
    $('#podium').innerHTML = '';
    $('#board-rows').innerHTML = '';
  }

  function renderBoardError(err) {
    $('#board-status').innerHTML = `
      <div class="fade-in" style="text-align:center;padding:2.5rem 0;">
        <div style="font-size:2rem;margin-bottom:0.5rem;">📡</div>
        <p style="color:#f06070;font-weight:700;margin-bottom:0.4rem;">No se pudo cargar la clasificación</p>
        <p style="color:var(--muted);font-size:0.78rem;margin-bottom:1rem;">${esc(err.message || err)}</p>
        <button id="retry-btn" style="background:var(--navy3);border:1px solid var(--border);color:var(--text);padding:0.5rem 1.2rem;border-radius:6px;font-weight:700;font-size:0.82rem;cursor:pointer;">
          <i class="fa-solid fa-rotate mr-1"></i>Reintentar
        </button>
      </div>`;
    $('#podium').innerHTML = '';
    $('#board-rows').innerHTML = '';
    $('#retry-btn').addEventListener('click', () => loadBoard());
  }

  function renderBoard(data) {
    if (data.scoring) state.scoring = data.scoring;
    renderChips(data);
    const ps = state.players;
    const status = $('#board-status');

    if (!ps.length) {
      status.innerHTML = `
        <div class="fade-in" style="text-align:center;padding:3rem 0;">
          <div style="font-size:2.5rem;margin-bottom:0.75rem;">🎯</div>
          <p style="font-weight:800;font-size:1rem;margin-bottom:0.4rem;">Todavía no hay predicciones</p>
        </div>`;
      $('#podium').innerHTML = '';
      $('#board-rows').innerHTML = '';
      return;
    }

    status.innerHTML = '';
    const scored = ps.some(p => p.points > 0);
    $('#podium').innerHTML = scored ? podiumHtml(ps) : `
      <div class="fade-in" style="text-align:center;font-size:0.78rem;color:var(--muted);font-weight:700;margin-bottom:1.2rem;">
        <i class="fa-regular fa-hourglass-half mr-1"></i>Sin resultados oficiales aún — todos en 0 pts. Mientras tanto, mira la pestaña <span class="c-cyan">Probabilidades</span>.
      </div>`;
    $('#board-rows').innerHTML = ps.map(rowHtml).join('');
  }

  function renderChips({ results = {}, scoring = state.scoring }) {
    const chip = (icon, label, val, pts) => `
      <div class="result-chip fade-in">
        <span>${icon}</span>
        <span class="c-muted" style="font-weight:700;font-size:0.68rem;text-transform:uppercase;letter-spacing:0.05em;">${label}</span>
        <span style="font-weight:800;color:${val ? '#f5c518' : 'var(--muted)'};">${val ? esc(val) : 'Por decidir'}</span>
        <span class="c-cyan" style="font-weight:700;">· ${pts}</span>
      </div>`;
    const semis = (results.semis || []).filter(Boolean);
    $('#results-chips').innerHTML =
      chip('🏆', 'Campeón', results.champion, scoring.champion + 'p') +
      chip('🥈', 'Subcampeón', results.runnerUp, scoring.runnerUp + 'p') +
      chip('⚽', 'Goleador', results.goldenBoot, scoring.goldenBoot + 'p') +
      chip('💎', 'Revelación', results.revelation, scoring.revelation + 'p') +
      chip('⭐', 'MVP', results.mvp, (scoring.mvp || 20) + 'p') +
      chip('🔥', 'Final 4', semis.join(', '), scoring.semi + 'p c/u');
  }

  function podiumHtml(ps) {
    const medal = { 1: '🥇', 2: '🥈', 3: '🥉' };
    const card = p => {
      if (!p) return '<div></div>';
      const big = p.rank === 1;
      return `
        <div style="text-align:center;${big ? '' : 'margin-top:2rem;'}">
          <div style="font-size:${big ? '2.2rem' : '1.7rem'};margin-bottom:0.4rem;">${medal[p.rank] || '🏅'}</div>
          <div class="podium-card ${big ? 'podium-1' : ''} fade-in">
            <div style="font-weight:800;font-size:${big ? '1rem' : '0.82rem'};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(p.player)}</div>
            <div class="c-cyan" style="font-size:${big ? '1.4rem' : '1.1rem'};font-weight:900;margin-top:0.2rem;">${p.points}<span style="font-size:0.65rem;color:var(--muted);margin-left:2px;">pts</span></div>
          </div>
        </div>`;
    };
    const [first, second, third] = ps;
    return `<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:0.75rem;align-items:flex-end;margin-bottom:1.25rem;">${card(second)}${card(first)}${card(third)}</div>`;
  }

  function rowHtml(p) {
    const key = norm(p.player);
    const open = state.expanded.has(key);
    const rankClass = p.rank === 1 ? 'rank-1' : p.rank === 2 ? 'rank-2' : p.rank === 3 ? 'rank-3' : '';
    const b = p.breakdown;
    const miniHits = `
      <span style="font-size:0.7rem;display:flex;align-items:center;gap:0.5rem;">
        <span>🏆${hitIcon(b.champion.hit)}</span>
        <span>🥈${hitIcon(b.runnerUp.hit)}</span>
        <span>⚽${hitIcon(b.goldenBoot.hit)}</span>
        <span>💎${hitIcon(b.revelation.hit)}</span>
        <span>⭐${hitIcon(safeBd(b,'mvp').hit)}</span>
        <span class="c-muted" style="font-weight:700;">${b.semis.hits}/4</span>
      </span>`;
    return `
      <div class="lb-row fade-in">
        <button type="button" class="lb-toggle row-toggle" data-player="${esc(key)}">
          <div class="rank-badge ${rankClass}">${p.rank}</div>
          <div style="flex:1;min-width:0;text-align:left;">
            <div style="font-weight:700;font-size:0.9rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(p.player)}</div>
            <div class="c-muted" style="font-size:0.7rem;">${fmtDate(p.submittedAt)}</div>
          </div>
          <div class="hidden sm:flex">${miniHits}</div>
          <div class="c-cyan" style="font-size:1.1rem;font-weight:900;min-width:52px;text-align:right;">${p.points}<span style="font-size:0.62rem;color:var(--muted);margin-left:2px;">pts</span></div>
          <i class="fa-solid fa-chevron-down c-muted" style="font-size:0.7rem;transition:transform 0.2s;${open ? 'transform:rotate(180deg);' : ''}"></i>
        </button>
        <div class="row-details ${open ? '' : 'hidden'}" style="border-top:1px solid var(--border);padding:1rem;background:var(--navy);">
          ${detailsHtml(p)}
        </div>
      </div>`;
  }

  function pickCardHtml(label, icon, pick, judged, pts) {
    const cls = judged.hit === true ? 'hit' : judged.hit === false ? 'miss' : '';
    const badge = judged.hit === true
      ? `<span class="c-green" style="font-weight:800;font-size:0.8rem;">+${judged.points}</span>`
      : judged.hit === false
        ? `<span class="c-red" style="font-weight:700;font-size:0.8rem;">0</span>`
        : `<span class="c-muted" style="font-weight:700;font-size:0.8rem;">…</span>`;
    return `
      <div class="pick-card ${cls}">
        <div style="font-size:0.65rem;font-weight:800;text-transform:uppercase;letter-spacing:0.06em;color:var(--muted);margin-bottom:0.3rem;">${icon} ${label} (${pts}p)</div>
        <div style="display:flex;justify-content:space-between;align-items:center;gap:0.5rem;">
          <span style="font-weight:700;font-size:0.85rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(pick)}</span>
          <span style="display:flex;align-items:center;gap:0.3rem;">${hitIcon(judged.hit)}${badge}</span>
        </div>
      </div>`;
  }

  function detailsHtml(p) {
    const b = p.breakdown;
    const sc = state.scoring;
    const semiChip = pp => {
      const cls = pp.hit === true ? 'hit' : pp.hit === false ? 'miss' : '';
      return `<span class="semi-chip ${cls}">${esc(pp.pick)}</span>`;
    };
    return `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.5rem;margin-bottom:0.75rem;">
        ${pickCardHtml('Campeón', '🏆', p.picks.champion, b.champion, sc.champion)}
        ${pickCardHtml('Subcampeón', '🥈', p.picks.runnerUp, b.runnerUp, sc.runnerUp)}
        ${pickCardHtml('Goleador', '⚽', p.picks.goldenBoot, b.goldenBoot, sc.goldenBoot)}
        ${pickCardHtml('Revelación', '💎', p.picks.revelation, b.revelation, sc.revelation)}
        ${pickCardHtml('MVP', '⭐', p.picks.mvp || '', safeBd(b,'mvp'), sc.mvp || 20)}
      </div>
      <div style="font-size:0.65rem;font-weight:800;text-transform:uppercase;letter-spacing:0.06em;color:var(--muted);margin-bottom:0.5rem;">
        🔥 Semifinalistas — ${b.semis.hits} aciertos · +${b.semis.points} pts
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:0.4rem;">${(b.semis.perPick || []).map(semiChip).join('')}</div>`;
  }

  function bindRows() {
    $('#board-rows').addEventListener('click', e => {
      const btn = e.target.closest('.row-toggle');
      if (!btn) return;
      const details = btn.parentElement.querySelector('.row-details');
      const chev = btn.querySelector('.fa-chevron-down');
      const nowOpen = !details.classList.toggle('hidden');
      chev.style.transform = nowOpen ? 'rotate(180deg)' : '';
      nowOpen ? state.expanded.add(btn.dataset.player) : state.expanded.delete(btn.dataset.player);
    });
  }

  /* ─── init ─── */

  function init() {
    $$('.tab-btn').forEach(b => b.addEventListener('click', () => switchTab(b.dataset.tab)));
    $('#refresh-btn').addEventListener('click', () => loadBoard());
    bindRows();
    renderScenarios();               // escenarios fijos: se pintan una vez
    if (location.hash === '#clasificacion') switchTab('board');
    else loadBoard({ silent: true }); // precarga la clasificación en segundo plano
    setInterval(() => {
      if (document.visibilityState === 'visible' && state.tab === 'board') {
        loadBoard({ silent: true });
      }
    }, REFRESH_MS);
  }

  document.readyState === 'loading'
    ? document.addEventListener('DOMContentLoaded', init)
    : init();
})();
