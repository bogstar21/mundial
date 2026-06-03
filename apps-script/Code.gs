/** ═══════════════════════════════════════════════════════════════════════
 *  MUNDIAL BLASTER 2026 — Backend en Google Sheets (Apps Script)
 *
 *  CÓMO INSTALARLO
 *  1. Abre la hoja de cálculo → Extensiones → Apps Script
 *  2. Borra el código de ejemplo, pega este archivo entero y guarda
 *  3. En el desplegable de funciones elige `setupSheets` → Ejecutar
 *     (autoriza cuando lo pida) → crea las pestañas:
 *     Predicciones / Resultados / Clasificación
 *  4. (Opcional) Ejecuta `seedDemoData` para añadir 4 jugadores de prueba
 *  5. Desplegar → Nueva implementación → tipo: Aplicación web
 *        Ejecutar como:   Yo
 *        Quién accede:    Cualquier usuario
 *     → copia la URL de la aplicación web (termina en /exec) en config.js
 *
 *  IMPORTANTE: cada vez que EDITES este código hay que volver a desplegar:
 *  Desplegar → Gestionar implementaciones → ✏️ → Versión: Nueva → Desplegar
 *
 *  ENDPOINTS
 *  GET  ?action=leaderboard  → clasificación completa en JSON (por defecto)
 *  GET  ?action=ping         → comprobación de estado
 *  POST (cuerpo JSON)        → guarda/actualiza las predicciones de un jugador
 *       { playerName, champion, runnerUp, goldenBoot, revelation, semi1..semi4 }
 *
 *  PUNTUACIÓN (editable en la pestaña Resultados)
 *  Campeón 50 · Subcampeón 30 · Máximo Goleador 25 · Revelación 20 · Semifinalista 10 c/u
 *  Ve escribiendo los resultados reales en la pestaña Resultados según avance
 *  el torneo: la clasificación se recalcula sola.
 *  ═══════════════════════════════════════════════════════════════════════ */

// ─────────────────────────── CONFIGURACIÓN ───────────────────────────

const SPREADSHEET_ID = '1jwXb2Ksj-eRe4M0bVej_YWAHbWBR3p0jT5ojX3NOcjs';

// Después de esta fecha no se aceptan más predicciones (inicio del Mundial 2026).
// Déjalo en '' para desactivar el bloqueo.
const PICKS_DEADLINE = '2026-06-11T19:00:00-06:00';

const SHEETS = {
  PREDICTIONS: 'Predicciones',
  RESULTS: 'Resultados',
  LEADERBOARD: 'Clasificación',
};

const PRED_HEADERS = [
  'Fecha', 'Jugador', 'Campeón', 'Subcampeón', 'Máximo Goleador',
  'Equipo Revelación', 'MVP', 'Semi 1', 'Semi 2', 'Semi 3', 'Semi 4', 'Puntos',
];

const DEFAULT_SCORING = { champion: 50, runnerUp: 30, goldenBoot: 25, revelation: 20, mvp: 20, semi: 10 };

// ─────────────────────────── ESTRUCTURA ───────────────────────────

/** Crea toda la estructura de tablas. Se puede re-ejecutar sin perder datos. */
function setupSheets() {
  const ss = getSS_();

  // ── Pestaña Predicciones: una fila por jugador ──
  const pred = ensureSheet_(ss, SHEETS.PREDICTIONS);
  pred.getRange(1, 1, 1, PRED_HEADERS.length).setValues([PRED_HEADERS]);
  styleHeader_(pred, PRED_HEADERS.length, '#0f172a');
  pred.setFrozenRows(1);
  pred.setColumnWidth(1, 170);
  pred.setColumnWidth(2, 160);
  pred.setColumnWidths(3, 8, 135);
  pred.setColumnWidth(12, 80);
  pred.getRange('A2:A').setNumberFormat('yyyy-mm-dd hh:mm:ss');

  // ── Pestaña Resultados: rellena las celdas amarillas según haya resultados ──
  const res = ensureSheet_(ss, SHEETS.RESULTS);
  if (res.getLastRow() < 2) { // solo se escribe una vez — nunca pisa resultados ya escritos
    const rows = [
      ['Ajuste', 'Valor', 'Notas'],
      ['champion', '', 'Campeón del torneo — rellenar tras la final'],
      ['runnerUp', '', 'Subcampeón (perdedor de la final)'],
      ['goldenBoot', '', 'Máximo goleador del torneo (nombre del jugador)'],
      ['revelation', '', 'Equipo revelación del torneo'],
      ['mvp', '', 'MVP del torneo — mejor jugador (nombre del jugador)'],
      ['semi1', '', 'Semifinalista (en cualquier orden)'],
      ['semi2', '', 'Semifinalista (en cualquier orden)'],
      ['semi3', '', 'Semifinalista (en cualquier orden)'],
      ['semi4', '', 'Semifinalista (en cualquier orden)'],
      ['pointsChampion', DEFAULT_SCORING.champion, 'Puntos por acertar el campeón'],
      ['pointsRunnerUp', DEFAULT_SCORING.runnerUp, 'Puntos por acertar el subcampeón'],
      ['pointsGoldenBoot', DEFAULT_SCORING.goldenBoot, 'Puntos por acertar el goleador'],
      ['pointsRevelation', DEFAULT_SCORING.revelation, 'Puntos por acertar la revelación'],
      ['pointsMvp', DEFAULT_SCORING.mvp, 'Puntos por acertar el MVP del torneo'],
      ['pointsSemi', DEFAULT_SCORING.semi, 'Puntos por cada semifinalista acertado'],
    ];
    res.getRange(1, 1, rows.length, 3).setValues(rows);
  }
  styleHeader_(res, 3, '#78350f');
  res.setFrozenRows(1);
  res.setColumnWidth(1, 170);
  res.setColumnWidth(2, 200);
  res.setColumnWidth(3, 340);
  res.getRange(2, 1, 14, 1).setFontWeight('bold');
  res.getRange(2, 2, 9, 1).setBackground('#fef3c7'); // celdas donde se escriben los resultados

  // ── Pestaña Clasificación: se genera sola (la web la sirve en vivo vía doGet) ──
  ensureSheet_(ss, SHEETS.LEADERBOARD);
  refreshLeaderboard();
}

/** Añade 4 jugadores de prueba para ver la clasificación funcionando. */
function seedDemoData() {
  const ss = getSS_();
  ensureStructure_(ss);
  const sh = ss.getSheetByName(SHEETS.PREDICTIONS);
  const demo = [
    ['Leo', 'Argentina', 'Francia', 'Messi', 'Marruecos', 'Messi', 'Argentina', 'Francia', 'España', 'Inglaterra'],
    ['Cris', 'Portugal', 'Brasil', 'Ronaldo', 'Japón', 'Vinicius', 'Portugal', 'Brasil', 'Alemania', 'Argentina'],
    ['Luka', 'Croacia', 'Argentina', 'Mbappé', 'Croacia', 'Mbappé', 'Croacia', 'Argentina', 'Brasil', 'Países Bajos'],
    ['Kylian', 'Francia', 'Inglaterra', 'Mbappé', 'Uzbekistán', 'Pedri', 'Francia', 'Inglaterra', 'España', 'Portugal'],
  ];
  demo.forEach(function (d, i) {
    sh.appendRow([new Date(Date.now() - (demo.length - i) * 3600000),
      d[0], d[1], d[2], d[3], d[4], d[5], d[6], d[7], d[8], d[9], '']);
  });
  refreshLeaderboard();
}

// ─────────────────────────── ENDPOINTS WEB ───────────────────────────

/** GET — devuelve la clasificación en JSON. */
function doGet(e) {
  e = e || { parameter: {} };
  const action = (e.parameter && e.parameter.action) || 'leaderboard';
  try {
    if (action === 'ping') {
      return jsonOut_({ ok: true, time: new Date().toISOString() });
    }
    const ss = getSS_();
    ensureStructure_(ss);
    const board = computeBoard_(ss);
    return jsonOut_({
      ok: true,
      generatedAt: new Date().toISOString(),
      deadline: PICKS_DEADLINE || null,
      locked: isLocked_(),
      results: board.results,
      scoring: board.scoring,
      players: board.players,
    });
  } catch (err) {
    return jsonOut_({ ok: false, error: String((err && err.message) || err) });
  }
}

/** POST — guarda una predicción. Mismo nombre = se actualiza (hasta el cierre). */
function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);

    if (isLocked_()) {
      return jsonOut_({ ok: false, code: 'locked', error: '¡Las predicciones están cerradas — el torneo ya ha comenzado!' });
    }

    // El cuerpo llega como text/plain JSON (evita el preflight CORS que Apps Script no responde)
    let data = {};
    if (e && e.postData && e.postData.contents) {
      try { data = JSON.parse(e.postData.contents); } catch (_) { data = e.parameter || {}; }
    } else if (e && e.parameter) {
      data = e.parameter;
    }

    const fields = ['playerName', 'champion', 'runnerUp', 'goldenBoot', 'revelation', 'mvp', 'semi1', 'semi2', 'semi3', 'semi4'];
    const clean = {};
    for (let i = 0; i < fields.length; i++) {
      clean[fields[i]] = sanitize_(data[fields[i]]);
      if (!clean[fields[i]]) {
        return jsonOut_({ ok: false, code: 'missing', error: 'Falta el campo: ' + fields[i] });
      }
    }

    const ss = getSS_();
    ensureStructure_(ss);
    const sh = ss.getSheetByName(SHEETS.PREDICTIONS);
    const rowValues = [
      new Date(), clean.playerName, clean.champion, clean.runnerUp, clean.goldenBoot,
      clean.revelation, clean.mvp, clean.semi1, clean.semi2, clean.semi3, clean.semi4, '',
    ];

    // Upsert por nombre de jugador (ignora mayúsculas y acentos)
    let targetRow = 0;
    if (sh.getLastRow() > 1) {
      const names = sh.getRange(2, 2, sh.getLastRow() - 1, 1).getValues();
      for (let r = 0; r < names.length; r++) {
        if (norm_(names[r][0]) === norm_(clean.playerName)) { targetRow = r + 2; break; }
      }
    }
    const updated = targetRow > 0;
    if (updated) {
      sh.getRange(targetRow, 1, 1, rowValues.length).setValues([rowValues]);
    } else {
      sh.appendRow(rowValues);
    }

    return jsonOut_({ ok: true, updated: updated, player: clean.playerName });
  } catch (err) {
    return jsonOut_({ ok: false, error: String((err && err.message) || err) });
  } finally {
    try { lock.releaseLock(); } catch (_) {}
  }
}

/** Trigger simple — al editar la pestaña Resultados se refresca la Clasificación. */
function onEdit(e) {
  try {
    if (e && e.range && e.range.getSheet().getName() === SHEETS.RESULTS) {
      refreshLeaderboard();
    }
  } catch (_) {}
}

// ─────────────────────────── CÁLCULO DE PUNTOS ───────────────────────────

/** Calcula la clasificación completa a partir de Predicciones + Resultados. */
function computeBoard_(ss) {
  const cfg = getResultsAndScoring_(ss);
  const sh = ss.getSheetByName(SHEETS.PREDICTIONS);
  const players = [];

  if (sh && sh.getLastRow() > 1) {
    const values = sh.getRange(2, 1, sh.getLastRow() - 1, 11).getValues();
    values.forEach(function (row) {
      const ts = row[0];
      const name = String(row[1] || '').trim();
      if (!name) return;
      const champion = String(row[2] || '').trim();
      const runnerUp = String(row[3] || '').trim();
      const goldenBoot = String(row[4] || '').trim();
      const revelation = String(row[5] || '').trim();
      const mvp = String(row[6] || '').trim();
      const semis = [row[7], row[8], row[9], row[10]].map(function (v) { return String(v || '').trim(); });

      const bChampion = judge_(champion, cfg.results.champion, cfg.scoring.champion);
      const bRunnerUp = judge_(runnerUp, cfg.results.runnerUp, cfg.scoring.runnerUp);
      const bBoot = judge_(goldenBoot, cfg.results.goldenBoot, cfg.scoring.goldenBoot);
      const bRevelation = judge_(revelation, cfg.results.revelation, cfg.scoring.revelation);
      const bMvp = judge_(mvp, cfg.results.mvp, cfg.scoring.mvp);
      const bSemis = judgeSemis_(semis, cfg.results.semis, cfg.scoring.semi);

      players.push({
        player: name,
        submittedAt: ts instanceof Date ? ts.toISOString() : String(ts),
        picks: { champion: champion, runnerUp: runnerUp, goldenBoot: goldenBoot, revelation: revelation, mvp: mvp, semis: semis },
        breakdown: { champion: bChampion, runnerUp: bRunnerUp, goldenBoot: bBoot, revelation: bRevelation, mvp: bMvp, semis: bSemis },
        points: bChampion.points + bRunnerUp.points + bBoot.points + bRevelation.points + bMvp.points + bSemis.points,
      });
    });
  }

  // Orden: puntos desc; a igualdad gana quien envió antes
  players.sort(function (a, b) {
    return (b.points - a.points) || (new Date(a.submittedAt) - new Date(b.submittedAt));
  });
  // Ranking de competición: mismos puntos comparten puesto
  let prevPts = null, prevRank = 0;
  players.forEach(function (p, i) {
    p.rank = (p.points === prevPts) ? prevRank : i + 1;
    prevPts = p.points;
    prevRank = p.rank;
  });

  return { results: cfg.results, scoring: cfg.scoring, players: players };
}

/** hit: true / false / null (null = ese resultado aún no se conoce). */
function judge_(pick, actual, pts) {
  if (!actual) return { hit: null, points: 0 };
  const hit = norm_(pick) === norm_(actual);
  return { hit: hit, points: hit ? pts : 0 };
}

function judgeSemis_(picks, actualSemis, ptsEach) {
  const actual = actualSemis.map(norm_).filter(Boolean);
  const complete = actual.length === 4;

  const perPick = picks.map(function (p) {
    if (!actual.length) return { pick: p, hit: null };
    if (actual.indexOf(norm_(p)) !== -1) return { pick: p, hit: true };
    return { pick: p, hit: complete ? false : null };
  });

  // Equipos repetidos solo cuentan una vez
  const uniqueHits = {};
  picks.forEach(function (p) {
    const n = norm_(p);
    if (n && actual.indexOf(n) !== -1) uniqueHits[n] = true;
  });
  const hits = Object.keys(uniqueHits).length;

  return { perPick: perPick, hits: hits, points: hits * ptsEach };
}

/** Lee la pestaña Resultados → { results, scoring }. */
function getResultsAndScoring_(ss) {
  const sh = ss.getSheetByName(SHEETS.RESULTS);
  const map = {};
  if (sh && sh.getLastRow() > 1) {
    sh.getRange(2, 1, sh.getLastRow() - 1, 2).getValues().forEach(function (r) {
      const k = String(r[0]).trim();
      if (k) map[k] = r[1];
    });
  }
  const str = function (k) { return String(map[k] === undefined || map[k] === null ? '' : map[k]).trim(); };
  const num = function (k, d) { const n = Number(map[k]); return (isNaN(n) || n <= 0) ? d : n; };
  return {
    results: {
      champion: str('champion'),
      runnerUp: str('runnerUp'),
      goldenBoot: str('goldenBoot'),
      revelation: str('revelation'),
      mvp: str('mvp'),
      semis: [str('semi1'), str('semi2'), str('semi3'), str('semi4')],
    },
    scoring: {
      champion: num('pointsChampion', DEFAULT_SCORING.champion),
      runnerUp: num('pointsRunnerUp', DEFAULT_SCORING.runnerUp),
      goldenBoot: num('pointsGoldenBoot', DEFAULT_SCORING.goldenBoot),
      revelation: num('pointsRevelation', DEFAULT_SCORING.revelation),
      mvp: num('pointsMvp', DEFAULT_SCORING.mvp),
      semi: num('pointsSemi', DEFAULT_SCORING.semi),
    },
  };
}

// ─────────────────────────── UTILIDADES ADMIN ───────────────────────────

/** Reescribe la pestaña Clasificación y la columna Puntos de Predicciones. */
function refreshLeaderboard() {
  const ss = getSS_();
  ensureStructure_(ss);
  const board = computeBoard_(ss);
  const sh = ensureSheet_(ss, SHEETS.LEADERBOARD);

  sh.clearContents();
  const headers = ['Puesto', 'Jugador', 'Puntos', 'Campeón', 'Subcampeón', 'Goleador', 'Revelación', 'MVP', 'Semis', 'Enviado'];
  sh.getRange(1, 1, 1, headers.length).setValues([headers]);
  styleHeader_(sh, headers.length, '#064e3b');
  sh.setFrozenRows(1);

  if (board.players.length) {
    const rows = board.players.map(function (p) {
      return [
        p.rank, p.player, p.points,
        markPick_(p.picks.champion, p.breakdown.champion.hit),
        markPick_(p.picks.runnerUp, p.breakdown.runnerUp.hit),
        markPick_(p.picks.goldenBoot, p.breakdown.goldenBoot.hit),
        markPick_(p.picks.revelation, p.breakdown.revelation.hit),
        markPick_(p.picks.mvp, p.breakdown.mvp.hit),
        p.breakdown.semis.hits + '/4',
        new Date(p.submittedAt),
      ];
    });
    sh.getRange(2, 1, rows.length, headers.length).setValues(rows);
    sh.getRange(2, 10, rows.length, 1).setNumberFormat('yyyy-mm-dd hh:mm');
  }
  sh.setColumnWidth(2, 160);
  sh.setColumnWidths(4, 5, 150);
  sh.setColumnWidth(10, 150);

  // Copia los puntos a la pestaña Predicciones
  const pred = ss.getSheetByName(SHEETS.PREDICTIONS);
  if (pred && pred.getLastRow() > 1) {
    const ptsByName = {};
    board.players.forEach(function (p) { ptsByName[norm_(p.player)] = p.points; });
    const names = pred.getRange(2, 2, pred.getLastRow() - 1, 1).getValues();
    const pts = names.map(function (n) {
      const v = ptsByName[norm_(n[0])];
      return [v === undefined ? '' : v];
    });
    pred.getRange(2, 12, pts.length, 1).setValues(pts);
  }
}

// ─────────────────────────── AUXILIARES ───────────────────────────

function getSS_() {
  const active = SpreadsheetApp.getActiveSpreadsheet(); // si el script está vinculado a la hoja
  return active ? active : SpreadsheetApp.openById(SPREADSHEET_ID);
}

function ensureStructure_(ss) {
  if (!ss.getSheetByName(SHEETS.PREDICTIONS) || !ss.getSheetByName(SHEETS.RESULTS)) {
    setupSheets();
  }
}

/** Devuelve la hoja con ese nombre; reutiliza la hoja vacía por defecto o la crea. */
function ensureSheet_(ss, name) {
  let sh = ss.getSheetByName(name);
  if (sh) return sh;
  const sheets = ss.getSheets();
  if (sheets.length === 1) {
    const first = sheets[0];
    const isOurs = Object.keys(SHEETS).some(function (k) { return SHEETS[k] === first.getName(); });
    if (!isOurs && first.getLastRow() === 0) {
      first.setName(name);
      return first;
    }
  }
  return ss.insertSheet(name);
}

function styleHeader_(sh, nCols, color) {
  sh.getRange(1, 1, 1, nCols)
    .setBackground(color)
    .setFontColor('#ffffff')
    .setFontWeight('bold');
}

function isLocked_() {
  if (!PICKS_DEADLINE) return false;
  return Date.now() > new Date(PICKS_DEADLINE).getTime();
}

/** Minúsculas, sin espacios extra, sin acentos — para comparar de forma justa. */
function norm_(s) {
  return String(s === undefined || s === null ? '' : s)
    .trim().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

/** Recorta, limita longitud y desactiva inyección de fórmulas (=, +, @). */
function sanitize_(v) {
  let s = String(v === undefined || v === null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, 80);
  if (/^[=+@]/.test(s)) s = "'" + s;
  return s;
}

function markPick_(pick, hit) {
  return String(pick) + (hit === true ? ' ✓' : hit === false ? ' ✗' : '');
}

function jsonOut_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
