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

  /* ─── Probabilidades de victoria (hardcoded) ───
     Calculadas a mano el 3 de julio de 2026, con el Mundial en fase
     eliminatoria (octavos), sobre la tabla de predicciones corregida.
     Se ignoran las faltas de ortografía en los nombres (p. ej. "Halaand"
     cuenta como Haaland): cada pick se evalúa por lo que quiso decir.
     El modelo pondera la solidez de cada boleto: probabilidad del
     campeón/subcampeón, del goleador, del MVP, de que la "revelación"
     siga viva y de cuántos semifinalistas alcanzan la ronda.
     Nota: Bosnia, Senegal y Ecuador (revelaciones) ya están eliminadas.
     Las probabilidades suman 100 %. Clave por nombre normalizado. */
  const PROBABILITIES = {
    'carlos':             { prob: 16.1, note: 'Boleto más completo: Francia campeón, Marruecos (revelación) vivo en octavos, Mbappé goleador, Lamine Yamal MVP y 4 semifinalistas fuertes.' },
    'nacho':              { prob: 14.3, note: 'España (gran favorita) + Mbappé y 4 buenas semis; le pesa que Bosnia (revelación) ya esté eliminada.' },
    'ben':                { prob: 13.4, note: 'España campeona y una doble apuesta a Lamine Yamal (goleador y MVP) que puntúa dos veces si estalla; solo pierde Senegal (revelación), ya fuera.' },
    'bogdan starchenko':  { prob: 11.9, note: 'Semifinalistas muy sólidos (España, Brasil, Argentina, Francia) y Lamine Yamal MVP; Brasil campeón es menos probable y Turquía (revelación) casi descartada.' },
    'daini carolina':     { prob: 11.7, note: 'España campeona y Lamine Yamal MVP; Haaland (goleador) y Noruega (revelación) dependen de que Noruega siga con vida.' },
    'orazio':             { prob: 11.6, note: 'Francia + semis fuertes (Francia, Inglaterra, España) y Lamine Yamal MVP; Japón como revelación es una apuesta arriesgada.' },
    'lucas':              { prob:  9.5, note: 'EE. UU. (revelación) sigue vivo como anfitrión en octavos, pero Alemania campeón y Míchel Olise MVP son poco probables.' },
    'victor':             { prob:  8.3, note: 'Sus semifinalistas son sólidos, pero Portugal campeón y Bélgica como "revelación" son apuestas arriesgadas.' },
    'juan manuel cr7':    { prob:  3.2, note: 'Muy dependiente de sus semifinalistas: Ecuador (revelación) ya está eliminado y Portugal campeón + Cristiano Ronaldo MVP son poco probables.' },
  };

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

  // ¿es un semifinalista escrito con nombre de equipo (y no de jugador)? — heurístico laxo
  const probFor = player => PROBABILITIES[norm(player)] || null;

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
    if (refresh || !state.players.length) loadBoard({ silent: tab !== 'board' && tab !== 'probs' });
    history.replaceState(null, '', tab === 'board' ? '#clasificacion' : '#probabilidades');
  }

  /* ─── datos ─── */

  async function loadBoard({ silent = false } = {}) {
    if (!urlReady()) { renderSetupNotice(); return; }
    if (state.loading) return;
    state.loading = true;
    const icon = $('#refresh-btn i');
    if (icon) icon.classList.add('fa-spin');
    if (!silent && !state.players.length) { renderSkeleton(); renderProbsSkeleton(); }

    try {
      const res = await fetch(`${GOOGLE_SCRIPT_URL}?action=leaderboard&cb=${Date.now()}`);
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'Error del backend');

      state.players = data.players || [];
      state.deadline = data.deadline;
      state.locked = !!data.locked;
      if (data.scoring) state.scoring = data.scoring;
      renderBoard(data);
      renderProbs();
      $('#last-updated').textContent = new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
    } catch (err) {
      if (!silent) { renderBoardError(err); renderProbsError(err); }
    } finally {
      state.loading = false;
      if (icon) icon.classList.remove('fa-spin');
    }
  }

  /* ─── probabilidades ─── */

  function renderProbsSkeleton() {
    $('#probs-rows').innerHTML = Array.from({ length: 5 }, () => '<div class="skeleton"></div>').join('');
  }

  function renderProbsError(err) {
    $('#probs-rows').innerHTML = `
      <div class="fade-in" style="text-align:center;padding:2rem 0;">
        <div style="font-size:2rem;margin-bottom:0.5rem;">📡</div>
        <p style="color:#f06070;font-weight:700;margin-bottom:0.4rem;">No se pudieron cargar los jugadores</p>
        <p style="color:var(--muted);font-size:0.78rem;">${esc(err.message || err)}</p>
      </div>`;
  }

  function renderProbs() {
    const box = $('#probs-rows');
    if (!box) return;

    // Empareja cada jugador con su probabilidad hardcodeada y ordena de mayor a menor
    const rows = state.players
      .map(p => ({ p, meta: probFor(p.player) }))
      .filter(r => r.meta)
      .sort((a, b) => b.meta.prob - a.meta.prob);

    if (!rows.length) {
      box.innerHTML = `
        <div class="fade-in" style="text-align:center;padding:2.5rem 0;">
          <div style="font-size:2.5rem;margin-bottom:0.75rem;">🎯</div>
          <p style="font-weight:800;font-size:1rem;">Todavía no hay jugadores</p>
        </div>`;
      return;
    }

    const max = rows[0].meta.prob;
    box.innerHTML = rows.map((r, i) => probRowHtml(r.p, r.meta, i + 1, max)).join('');
  }

  function probRowHtml(p, meta, rank, max) {
    const rankClass = rank === 1 ? 'rank-1' : rank === 2 ? 'rank-2' : rank === 3 ? 'rank-3' : '';
    const width = Math.max(4, Math.round((meta.prob / max) * 100));
    const champion = (p.picks && p.picks.champion) || '—';
    return `
      <div class="lb-row fade-in" style="padding:0.85rem 1rem;">
        <div style="display:flex;align-items:center;gap:0.75rem;">
          <div class="rank-badge ${rankClass}">${rank}</div>
          <div style="flex:1;min-width:0;">
            <div style="display:flex;align-items:baseline;justify-content:space-between;gap:0.5rem;">
              <span style="font-weight:800;font-size:0.92rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(p.player)}</span>
              <span class="c-cyan" style="font-weight:900;font-size:1.15rem;">${meta.prob.toFixed(1)}<span style="font-size:0.62rem;color:var(--muted);margin-left:2px;">%</span></span>
            </div>
            <div style="height:7px;background:var(--navy);border:1px solid var(--border);border-radius:20px;overflow:hidden;margin-top:0.4rem;">
              <div style="height:100%;width:${width}%;background:linear-gradient(90deg,var(--cyan),#0090a8);border-radius:20px;"></div>
            </div>
            <div class="c-muted" style="font-size:0.72rem;margin-top:0.45rem;">
              <span style="font-weight:700;color:#f5c518;">🏆 ${esc(champion)}</span> · ${esc(meta.note)}
            </div>
          </div>
        </div>
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
    $('#probs-rows').innerHTML = '';
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
    if (location.hash === '#clasificacion') switchTab('board');
    loadBoard({ silent: false });
    setInterval(() => {
      if (document.visibilityState === 'visible' && (state.tab === 'board' || state.tab === 'probs')) {
        loadBoard({ silent: true });
      }
    }, REFRESH_MS);
  }

  document.readyState === 'loading'
    ? document.addEventListener('DOMContentLoaded', init)
    : init();
})();
