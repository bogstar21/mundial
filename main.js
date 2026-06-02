/* ═══════════════════════════════════════════════════════════════
   MUNDIAL BLASTER 2026 — lógica del front-end
   Pestañas · formulario de predicciones · clasificación interactiva
   Backend: Google Apps Script (ver apps-script/Code.gs)
   ═══════════════════════════════════════════════════════════════ */
(() => {
  'use strict';

  const REFRESH_MS = 60000; // auto-refresco de la clasificación

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  const state = {
    tab: 'picks',
    players: [],
    scoring: { champion: 50, runnerUp: 30, goldenBoot: 25, revelation: 20, semi: 10 },
    expanded: new Set(), // filas abiertas que sobreviven al refresco
    deadline: null,
    locked: false,
    loading: false,
  };

  /* ─────────────── utilidades ─────────────── */

  // Igual que en el backend: ignora mayúsculas, espacios y acentos
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
      d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }) +
      ' · ' + d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  };

  const hitDot = h =>
    h === true ? '<i class="fa-solid fa-circle-check text-emerald-400"></i>' :
    h === false ? '<i class="fa-solid fa-circle-xmark text-red-400/60"></i>' :
    '<i class="fa-regular fa-clock text-gray-600"></i>';

  /* ─────────────── pestañas ─────────────── */

  function switchTab(tab, { refresh = false } = {}) {
    state.tab = tab;
    $$('.tab-btn').forEach(b => {
      const active = b.dataset.tab === tab;
      b.classList.toggle('tab-active', active);
      b.setAttribute('aria-selected', active);
    });
    $('#panel-picks').classList.toggle('hidden', tab !== 'picks');
    $('#panel-board').classList.toggle('hidden', tab !== 'board');
    if (tab === 'board' && (refresh || !state.players.length)) loadBoard();
    history.replaceState(null, '', tab === 'board' ? '#clasificacion' : '#predicciones');
  }

  /* ─────────────── formulario ─────────────── */

  function showStatus(kind, html) {
    const el = $('#status-message');
    const styles = {
      ok: 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20',
      err: 'bg-red-500/10 text-red-400 border border-red-500/20',
      warn: 'bg-amber-500/10 text-amber-400 border border-amber-500/20',
    };
    el.className = 'text-center text-sm font-bold py-3 px-4 rounded-lg fade-in ' + styles[kind];
    el.innerHTML = html;
    el.classList.remove('hidden');
  }

  function validate(p) {
    const semis = [p.semi1, p.semi2, p.semi3, p.semi4].map(norm);
    if (new Set(semis).size !== 4) return 'Tus cuatro semifinalistas deben ser equipos distintos.';
    if (norm(p.champion) === norm(p.runnerUp)) return 'El campeón y el subcampeón no pueden ser el mismo equipo.';
    if (!semis.includes(norm(p.champion))) return 'Tu campeón debe estar entre tus cuatro semifinalistas.';
    if (!semis.includes(norm(p.runnerUp))) return 'Tu subcampeón debe estar entre tus cuatro semifinalistas.';
    return null;
  }

  function bindForm() {
    $('#prediction-form').addEventListener('submit', async e => {
      e.preventDefault();
      const btn = $('#submit-btn');
      const p = Object.fromEntries(new FormData(e.target).entries());
      Object.keys(p).forEach(k => { p[k] = String(p[k]).replace(/\s+/g, ' ').trim(); });

      if (!urlReady()) {
        return showStatus('warn',
          '<i class="fa-solid fa-gear"></i> El backend aún no está conectado — pega la URL de tu aplicación web de Apps Script en <b>config.js</b>.');
      }
      const problem = validate(p);
      if (problem) return showStatus('err', '<i class="fa-solid fa-triangle-exclamation"></i> ' + esc(problem));

      btn.disabled = true;
      const original = btn.innerHTML;
      btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Enviando...';
      $('#status-message').classList.add('hidden');

      try {
        // text/plain evita el preflight CORS que Apps Script no puede responder
        const res = await fetch(GOOGLE_SCRIPT_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify(p),
        });
        const out = await res.json();

        if (out.ok) {
          showStatus('ok',
            `<i class="fa-solid fa-circle-check"></i> ¡${out.updated ? 'Predicciones actualizadas' : 'Predicciones guardadas'}, <b>${esc(p.playerName)}</b>! Vamos a la clasificación…`);
          setTimeout(() => switchTab('board', { refresh: true }), 1400);
        } else if (out.code === 'locked') {
          showStatus('warn', '<i class="fa-solid fa-lock"></i> ' + esc(out.error || 'Las predicciones están cerradas.'));
        } else {
          throw new Error(out.error || 'Error desconocido del backend');
        }
      } catch (err) {
        console.error('Fallo al enviar:', err);
        showStatus('err',
          '<i class="fa-solid fa-triangle-exclamation"></i> No se pudo enviar — revisa tu conexión y el despliegue de Apps Script.');
      } finally {
        btn.disabled = false;
        btn.innerHTML = original;
      }
    });
  }

  /* ─────────────── clasificación ─────────────── */

  async function loadBoard({ silent = false } = {}) {
    if (!urlReady()) { renderSetupNotice(); return; }
    if (state.loading) return;
    state.loading = true;
    const icon = $('#refresh-btn i');
    icon.classList.add('fa-spin');
    if (!silent && !state.players.length) renderSkeleton();

    try {
      const res = await fetch(`${GOOGLE_SCRIPT_URL}?action=leaderboard&cb=${Date.now()}`);
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'Error del backend');

      state.players = data.players || [];
      state.deadline = data.deadline;
      state.locked = !!data.locked;
      renderBoard(data);
      updateDeadlineUI();
      $('#last-updated').textContent = 'Actualizado a las ' + new Date().toLocaleTimeString('es-ES');
    } catch (err) {
      console.error('No se pudo cargar la clasificación:', err);
      if (!silent) renderBoardError(err);
    } finally {
      state.loading = false;
      icon.classList.remove('fa-spin');
    }
  }

  function renderSkeleton() {
    $('#board-status').innerHTML =
      Array.from({ length: 4 }, () => '<div class="skeleton h-14 rounded-xl mb-3"></div>').join('');
    $('#podium').innerHTML = '';
    $('#board-rows').innerHTML = '';
  }

  function renderSetupNotice() {
    $('#board-status').innerHTML = `
      <div class="rounded-xl border border-amber-500/30 bg-amber-500/5 p-5 text-sm fade-in">
        <p class="font-black text-amber-400 mb-2"><i class="fa-solid fa-gear"></i> Falta un paso — conecta tu hoja de Google</p>
        <ol class="list-decimal list-inside text-gray-400 space-y-1 text-xs">
          <li>Abre la hoja de Google → <b>Extensiones → Apps Script</b></li>
          <li>Pega el contenido de <b>apps-script/Code.gs</b> y ejecuta <b>setupSheets</b></li>
          <li>Desplegar → Nueva implementación → <b>Aplicación web</b> (acceso: <i>Cualquier usuario</i>)</li>
          <li>Copia la URL de la aplicación web en <b>config.js</b></li>
        </ol>
      </div>`;
    $('#podium').innerHTML = '';
    $('#board-rows').innerHTML = '';
  }

  function renderBoardError(err) {
    $('#board-status').innerHTML = `
      <div class="text-center py-10 fade-in">
        <div class="text-3xl mb-2">📡</div>
        <p class="text-red-400 font-bold mb-1">No se pudo cargar la clasificación</p>
        <p class="text-gray-500 text-xs mb-4">${esc(err.message || err)}</p>
        <button id="retry-btn" class="bg-gray-800 hover:bg-gray-700 text-white text-sm font-bold px-4 py-2 rounded-lg transition">
          <i class="fa-solid fa-rotate"></i> Reintentar
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
        <div class="text-center py-12 fade-in">
          <div class="text-4xl mb-3">🎯</div>
          <p class="text-white font-black mb-1">Todavía no hay predicciones</p>
          <p class="text-gray-500 text-sm mb-4">¡Sé el primero en apuntarte!</p>
          <button class="tab-jump bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white text-sm font-black px-5 py-2.5 rounded-lg uppercase tracking-wide transition">
            Hacer mis predicciones
          </button>
        </div>`;
      $('#podium').innerHTML = '';
      $('#board-rows').innerHTML = '';
      const jump = status.querySelector('.tab-jump');
      if (jump) jump.addEventListener('click', () => switchTab('picks'));
      return;
    }

    status.innerHTML = '';
    const scored = ps.some(p => p.points > 0);
    $('#podium').innerHTML = scored ? podiumHtml(ps) : `
      <div class="text-center text-xs text-gray-500 font-bold mb-4 fade-in">
        <i class="fa-regular fa-hourglass-half"></i>
        Aún no hay resultados oficiales — todo el mundo tiene 0 puntos. La clasificación cobrará vida cuando lleguen los resultados.
      </div>`;
    $('#board-rows').innerHTML = ps.map(rowHtml).join('');
  }

  function renderChips({ results = {}, scoring = state.scoring }) {
    const chip = (icon, label, val, pts) => `
      <div class="flex items-center gap-2 bg-gray-900/60 border border-gray-700/40 rounded-full px-3 py-1.5 text-xs fade-in">
        <span>${icon}</span>
        <span class="text-gray-400 font-bold uppercase tracking-wide">${label}</span>
        <span class="${val ? 'text-amber-300 font-bold' : 'text-gray-500 italic'}">${val ? esc(val) : 'Por decidir'}</span>
        <span class="text-gray-600">·</span>
        <span class="text-cyan-400 font-bold">${pts}</span>
      </div>`;
    const semis = (results.semis || []).filter(Boolean);
    $('#results-chips').innerHTML =
      chip('🏆', 'Campeón', results.champion, scoring.champion + 'p') +
      chip('🥈', 'Subcampeón', results.runnerUp, scoring.runnerUp + 'p') +
      chip('⚽', 'Goleador', results.goldenBoot, scoring.goldenBoot + 'p') +
      chip('💎', 'Revelación', results.revelation, scoring.revelation + 'p') +
      chip('🔥', 'Semifinalistas', semis.join(', '), scoring.semi + 'p c/u');
  }

  function podiumHtml(ps) {
    const medal = { 1: '🥇', 2: '🥈', 3: '🥉' };
    const card = p => {
      if (!p) return '<div></div>';
      const big = p.rank === 1;
      return `
        <div class="text-center ${big ? '' : 'mt-8'} fade-in">
          <div class="${big ? 'text-4xl' : 'text-3xl'}">${medal[p.rank] || '🏅'}</div>
          <div class="glass-panel rounded-2xl px-3 py-4 mt-2 ${big ? 'border-amber-400/40 shadow-lg shadow-amber-500/10' : ''}">
            <div class="font-black text-white truncate ${big ? 'text-lg' : 'text-sm'}">${esc(p.player)}</div>
            <div class="${big ? 'text-2xl' : 'text-xl'} font-black text-cyan-400 mt-1">${p.points}<span class="text-xs text-gray-500 ml-1">pts</span></div>
          </div>
        </div>`;
    };
    const [first, second, third] = ps;
    return `<div class="grid grid-cols-3 gap-3 sm:gap-4 mb-6 items-end">${card(second)}${card(first)}${card(third)}</div>`;
  }

  function miniIcons(p) {
    const b = p.breakdown;
    return `
      <span title="Campeón">🏆${hitDot(b.champion.hit)}</span>
      <span title="Subcampeón">🥈${hitDot(b.runnerUp.hit)}</span>
      <span title="Goleador">⚽${hitDot(b.goldenBoot.hit)}</span>
      <span title="Revelación">💎${hitDot(b.revelation.hit)}</span>
      <span class="text-gray-400 font-bold ml-1" title="Semifinalistas acertados">${b.semis.hits}/4</span>`;
  }

  function rowHtml(p) {
    const key = norm(p.player);
    const open = state.expanded.has(key);
    const rankBadge =
      p.rank === 1 ? 'bg-amber-400/20 text-amber-300 border-amber-400/40' :
      p.rank === 2 ? 'bg-gray-300/15 text-gray-200 border-gray-400/40' :
      p.rank === 3 ? 'bg-orange-400/15 text-orange-300 border-orange-400/40' :
      'bg-gray-800 text-gray-400 border-gray-700';
    return `
      <div class="glass-panel rounded-xl mb-2.5 overflow-hidden fade-in">
        <button type="button" class="row-toggle w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-white/[0.03] transition" data-player="${esc(key)}">
          <span class="w-9 h-9 shrink-0 rounded-lg border ${rankBadge} flex items-center justify-center font-black text-sm">${p.rank}</span>
          <span class="flex-1 min-w-0">
            <span class="block font-bold text-white truncate">${esc(p.player)}</span>
            <span class="block text-[11px] text-gray-500">${fmtDate(p.submittedAt)}</span>
          </span>
          <span class="hidden sm:flex items-center gap-1.5 text-xs">${miniIcons(p)}</span>
          <span class="text-xl font-black text-cyan-400 w-16 text-right">${p.points}<span class="text-[10px] text-gray-500 ml-0.5">pts</span></span>
          <i class="fa-solid fa-chevron-down text-gray-500 text-xs transition-transform duration-200 ${open ? 'rotate-180' : ''}"></i>
        </button>
        <div class="row-details ${open ? '' : 'hidden'} border-t border-gray-800 px-4 py-4 bg-black/20">${detailsHtml(p)}</div>
      </div>`;
  }

  function pickCard(label, icon, pick, judged, pts) {
    const st = judged.hit === true
      ? { ring: 'border-emerald-500/40', badge: `<span class="text-emerald-400 font-black">+${judged.points}</span>` }
      : judged.hit === false
        ? { ring: 'border-red-500/20', badge: '<span class="text-red-400/70 font-bold">0</span>' }
        : { ring: 'border-gray-700/40', badge: '<span class="text-gray-500 font-bold">…</span>' };
    return `
      <div class="rounded-lg border ${st.ring} bg-gray-900/40 px-3 py-2.5">
        <div class="text-[10px] font-black uppercase tracking-wider text-gray-500 mb-1">${icon} ${label} <span class="text-gray-600">(${pts}p)</span></div>
        <div class="flex items-center justify-between gap-2">
          <span class="font-bold text-white text-sm truncate">${esc(pick)}</span>
          <span class="flex items-center gap-1.5 text-sm">${hitDot(judged.hit)} ${st.badge}</span>
        </div>
      </div>`;
  }

  function detailsHtml(p) {
    const b = p.breakdown;
    const sc = state.scoring;
    const semiChip = pp => {
      const cls = pp.hit === true ? 'border-emerald-500/40 text-emerald-300' :
        pp.hit === false ? 'border-red-500/20 text-gray-500 line-through' :
        'border-gray-700/40 text-gray-300';
      return `<span class="border ${cls} bg-gray-900/40 rounded-full px-2.5 py-1 text-xs font-bold">${esc(pp.pick)}</span>`;
    };
    return `
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mb-3">
        ${pickCard('Campeón', '🏆', p.picks.champion, b.champion, sc.champion)}
        ${pickCard('Subcampeón', '🥈', p.picks.runnerUp, b.runnerUp, sc.runnerUp)}
        ${pickCard('Goleador', '⚽', p.picks.goldenBoot, b.goldenBoot, sc.goldenBoot)}
        ${pickCard('Revelación', '💎', p.picks.revelation, b.revelation, sc.revelation)}
      </div>
      <div class="text-[10px] font-black uppercase tracking-wider text-gray-500 mb-1.5">
        🔥 Semifinalistas <span class="text-gray-600">(${sc.semi}p c/u — ${b.semis.hits} aciertos, +${b.semis.points})</span>
      </div>
      <div class="flex flex-wrap gap-1.5">${(b.semis.perPick || []).map(semiChip).join('')}</div>`;
  }

  function bindRows() {
    $('#board-rows').addEventListener('click', e => {
      const btn = e.target.closest('.row-toggle');
      if (!btn) return;
      const details = btn.parentElement.querySelector('.row-details');
      const chev = btn.querySelector('.fa-chevron-down');
      const nowOpen = !details.classList.toggle('hidden');
      chev.classList.toggle('rotate-180', nowOpen);
      nowOpen ? state.expanded.add(btn.dataset.player) : state.expanded.delete(btn.dataset.player);
    });
  }

  /* ─────────────── cuenta atrás del cierre ─────────────── */

  function updateDeadlineUI() {
    const el = $('#deadline-chip');
    if (!el) return;
    if (!state.deadline) { el.classList.add('hidden'); return; }

    const ms = new Date(state.deadline) - Date.now();
    el.classList.remove('hidden');
    if (state.locked || ms <= 0) {
      el.className = 'inline-flex items-center gap-2 text-xs font-bold px-3 py-1.5 rounded-full bg-red-500/10 border border-red-500/30 text-red-400 mb-4 fade-in';
      el.innerHTML = '<i class="fa-solid fa-lock"></i> Predicciones cerradas — el torneo ya ha comenzado';
      const btn = $('#submit-btn');
      btn.disabled = true;
      btn.classList.add('opacity-50', 'cursor-not-allowed');
    } else {
      const d = Math.floor(ms / 86400000);
      const h = Math.floor(ms % 86400000 / 3600000);
      const m = Math.floor(ms % 3600000 / 60000);
      el.className = 'inline-flex items-center gap-2 text-xs font-bold px-3 py-1.5 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 mb-4 fade-in';
      el.innerHTML = `<i class="fa-regular fa-clock"></i> Las predicciones se cierran en ${d}d ${h}h ${m}m`;
    }
  }

  /* ─────────────── inicio ─────────────── */

  function init() {
    $$('.tab-btn').forEach(b => b.addEventListener('click', () => switchTab(b.dataset.tab)));
    $('#refresh-btn').addEventListener('click', () => loadBoard());
    bindForm();
    bindRows();

    if (location.hash === '#clasificacion') switchTab('board');

    // Carga los datos (y la cuenta atrás) aunque se empiece en el formulario
    loadBoard({ silent: state.tab !== 'board' });

    setInterval(() => {
      if (state.tab === 'board' && document.visibilityState === 'visible') loadBoard({ silent: true });
    }, REFRESH_MS);
    setInterval(updateDeadlineUI, 30000);
  }

  document.readyState === 'loading'
    ? document.addEventListener('DOMContentLoaded', init)
    : init();
})();
