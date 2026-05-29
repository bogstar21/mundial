/**
 * Mundial Blaster 2026 Engine Logic Core
 * Connected directly to dynamic JSON serialization endpoints on Google Sheets
 */

// Target Configuration
const CONFIG = {
  sheetId: "1jwXb2Ksj-eRe4M0bVej_YWAHbWBR3p0jT5ojX3NOcjs",
  get endpoint() {
    return `https://docs.google.com/spreadsheets/d/${this.sheetId}/gviz/tq?tqx=out:json`;
  }
};

// Global Memory State Cache Matrix
let state = {
  realResults: null,
  players: [],
  selectedPlayerName: null
};

/**
 * Normalizes text payload extractions from custom-wrapped Google data packets
 */
function cleanCellValue(cell) {
  if (!cell || cell.v === undefined || cell.v === null) return "";
  return cell.v.toString().trim();
}

/**
 * Deep evaluation points matrix mapping engine logic
 */
function evaluatePlayerMetrics(playerBets, realResults) {
  let score = 0;
  
  // Track accuracy flags for individual UI elements
  const breakdown = {
    championMatch: false,
    runnerUpMatch: false,
    goldenBootMatch: false,
    correctSemisCount: 0,
    semiDetails: []
  };

  if (!realResults) return { score, breakdown };

  // 1. Champion Validation
  if (realResults.champion && playerBets.champion.toLowerCase() === realResults.champion.toLowerCase()) {
    score += 50;
    breakdown.championMatch = true;
  }

  // 2. Runner Up Validation
  if (realResults.runnerUp && playerBets.runnerUp.toLowerCase() === realResults.runnerUp.toLowerCase()) {
    score += 30;
    breakdown.runnerUpMatch = true;
  }

  // 3. Golden Boot Prediction
  if (realResults.goldenBoot && playerBets.goldenBoot.toLowerCase() === realResults.goldenBoot.toLowerCase()) {
    score += 25;
    breakdown.goldenBootMatch = true;
  }

  // 4. Semifinalists Multi-Array Matching
  const canonicalSemis = realResults.semifinalists.map(t => t.toLowerCase().trim()).filter(Boolean);
  
  playerBets.semifinalists.forEach(team => {
    const cleanedTeam = team.trim();
    if (!cleanedTeam) return;

    const isCorrect = canonicalSemis.includes(cleanedTeam.toLowerCase());
    if (isCorrect) {
      score += 10;
      breakdown.correctSemisCount++;
    }
    breakdown.semiDetails.push({
      name: cleanedTeam,
      hit: isCorrect
    });
  });

  return { score, breakdown };
}

/**
 * Fetch layer orchestrator
 */
async function syncDashboardPipeline() {
  const errorBanner = document.getElementById("error-banner");
  const errorMsg = document.getElementById("error-message");

  try {
    const fetchResponse = await fetch(CONFIG.endpoint);
    const textBlob = await fetchResponse.text();
    
    // Strips out JSON wrapper strings used by Google Sheets structural rendering API
    const cleanJsonString = textBlob.substring(textBlob.indexOf("{"), textBlob.lastIndexOf("}") + 1);
    const parsedData = JSON.parse(cleanJsonString);
    const sheetRows = parsedData.table.rows;

    let targetResultsRow = null;
    const temporaryPlayersList = [];

    sheetRows.forEach(row => {
      if (!row.c || row.c.length === 0) return;

      const primaryIdentity = cleanCellValue(row.c[0]);
      if (!primaryIdentity) return; // Disregard structural empty lines

      const matrixObject = {
        name: primaryIdentity,
        champion: cleanCellValue(row.c[1]),
        runnerUp: cleanCellValue(row.c[2]),
        goldenBoot: cleanCellValue(row.c[3]),
        semifinalists: [
          cleanCellValue(row.c[4]),
          cleanCellValue(row.c[5]),
          cleanCellValue(row.c[6]),
          cleanCellValue(row.c[7])
        ].filter(Boolean)
      };

      if (primaryIdentity.toUpperCase() === "REAL_RESULTS") {
        targetResultsRow = matrixObject;
      } else {
        temporaryPlayersList.push(matrixObject);
      }
    });

    if (!targetResultsRow) {
      throw new Error("Missing alignment configuration! Could not discover row matching identity profile name: 'REAL_RESULTS'.");
    }

    // Map structural results directly to the live state engine
    state.realResults = targetResultsRow;
    
    state.players = temporaryPlayersList.map(p => {
      const evaluation = evaluatePlayerMetrics(p, state.realResults);
      return {
        ...p,
        totalPoints: evaluation.score,
        breakdown: evaluation.breakdown
      };
    });

    // Auto-sort based on point standing achievements
    state.players.sort((a, b) => b.totalPoints - a.totalPoints);

    // Default selection to primary standing rank player position if untouched
    if (!state.selectedPlayerName && state.players.length > 0) {
      state.selectedPlayerName = state.players[0].name;
    }

    errorBanner.classList.add("hidden");
    compileDOMRenderCycle();

  } catch (err) {
    console.error("Pipeline failure:", err);
    errorMsg.innerText = err.message || "Network isolation protocol failure. Confirm document is shared as 'Anyone with the link can view'.";
    errorBanner.classList.remove("hidden");
  }
}

/**
 * Compiles state elements straight into active interface viewports
 */
function compileDOMRenderCycle() {
  renderLeaderboardSection();
  renderControlTabInterface();
  renderDetailedShowcasePanel();
}

/**
 * Builds Left-Hand Standing Leaderboard View
 */
function renderLeaderboardSection() {
  const container = document.getElementById("leaderboard-rows");
  container.innerHTML = "";

  if (state.players.length === 0) {
    container.innerHTML = `<tr><td colspan="4" class="text-center py-8 text-gray-500 text-xs">No entries processed from data pipeline sheets.</td></tr>`;
    return;
  }

  state.players.forEach((player, idx) => {
    const rank = idx + 1;
    let rankBadge = `<span class="text-gray-500 font-mono text-sm">${rank}</span>`;
    let rowSpecialHighlight = "bg-transparent";

    // Set Up Medal indicators and unique rows for Top Tier Players
    if (rank === 1) {
      rankBadge = `<div class="bg-amber-400 text-black text-xs font-black w-6 h-6 rounded-full flex items-center justify-center shadow-lg shadow-amber-400/20">🥇</div>`;
      rowSpecialHighlight = "bg-amber-500/5 border-l-2 border-amber-400";
    } else if (rank === 2) {
      rankBadge = `<div class="bg-slate-300 text-black text-xs font-black w-6 h-6 rounded-full flex items-center justify-center">🥈</div>`;
    } else if (rank === 3) {
      rankBadge = `<div class="bg-amber-700 text-white text-xs font-black w-6 h-6 rounded-full flex items-center justify-center">🥉</div>`;
    }

    // Toggle active background classes matching selection properties
    const isActiveSelection = player.name === state.selectedPlayerName;
    const activeBorderClass = isActiveSelection ? "ring-1 ring-cyan-400/60 bg-cyan-950/20" : "";

    const markup = `
      <tr class="group cursor-pointer transition-all duration-200 ${rowSpecialHighlight} ${activeBorderClass} hover:bg-gray-800/40" onclick="switchActivePlayer('${escapeSelector(player.name)}')">
        <td class="py-4 text-center flex items-center justify-center">${rankBadge}</td>
        <td class="py-4 pl-3">
          <div class="font-bold text-sm tracking-wide group-hover:text-cyan-400 transition-colors">${player.name}</div>
        </td>
        <td class="py-4 text-center">
          <span class="text-xs px-2 py-0.5 rounded bg-gray-900 border border-gray-800 text-gray-300 font-medium">${player.champion || '—'}</span>
        </td>
        <td class="py-4 text-right pr-2">
          <span class="font-black text-base text-amber-400 font-mono tracking-tight">${player.totalPoints}<span class="text-[10px] text-gray-500 font-normal ml-0.5">pts</span></span>
        </td>
      </tr>
    `;
    container.innerHTML += markup;
  });
}

/**
 * Renders Top Horizontal Selection Buttons
 */
function renderControlTabInterface() {
  const container = document.getElementById("player-tabs");
  container.innerHTML = "";

  state.players.forEach(p => {
    const selected = p.name === state.selectedPlayerName;
    const buttonStyleClass = selected 
      ? "bg-cyan-500 text-black font-extrabold border-cyan-400 shadow-md shadow-cyan-500/10 scale-105" 
      : "bg-gray-900 text-gray-400 border-gray-800 hover:border-gray-700 hover:text-white";

    container.innerHTML += `
      <button onclick="switchActivePlayer('${escapeSelector(p.name)}')" class="px-3 py-1 rounded-lg text-xs font-bold tracking-wide uppercase border transition-all duration-150 ${buttonStyleClass}">
        ${p.name}
      </button>
    `;
  });
}

/**
 * Generates Matrix Dashboard Panels showing correctness breakdowns
 */
function renderDetailedShowcasePanel() {
  const container = document.getElementById("profile-showcase-container");
  const current = state.players.find(p => p.name === state.selectedPlayerName);

  if (!current) {
    container.innerHTML = `<div class="text-center py-10 text-gray-400 text-xs">No valid player data target profile discovered.</div>`;
    return;
  }

  // Structural markup engine configuration for card showcases
  const matchIcon = (isHit) => isHit 
    ? `<span class="bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[10px] font-black px-2 py-0.5 rounded flex items-center gap-1"><i class="fa-solid fa-check"></i> HIT</span>` 
    : `<span class="bg-gray-900 border border-gray-800 text-gray-500 text-[10px] font-semibold px-2 py-0.5 rounded flex items-center gap-1"><i class="fa-solid fa-clock"></i> PENDING/MISS</span>`;

  let semiFinalsMatrixHTML = "";
  current.breakdown.semiDetails.forEach(semi => {
    semiFinalsMatrixHTML += `
      <div class="bg-gray-900/60 border ${semi.hit ? 'border-emerald-500/20' : 'border-gray-800'} p-2.5 rounded-lg flex items-center justify-between">
        <div class="flex items-center gap-2">
          <i class="fa-regular fa-circle-dot ${semi.hit ? 'text-emerald-400' : 'text-gray-600'} text-xs"></i>
          <span class="text-xs font-bold ${semi.hit ? 'text-white' : 'text-gray-400'}">${semi.name}</span>
        </div>
        ${matchIcon(semi.hit)}
      </div>
    `;
  });

  // Handle empty state configurations elegantly
  if (current.breakdown.semiDetails.length === 0) {
    semiFinalsMatrixHTML = `<div class="col-span-2 text-center text-xs text-gray-500 py-3 border border-dashed border-gray-800 rounded-lg">No Semifinalist selections processed.</div>`;
  }

  container.className = "bg-[#141d2c] border border-gray-700/60 rounded-xl p-5 animate__animated animate__fadeIn animate__faster";
  container.innerHTML = `
    <div class="flex items-center justify-between border-b border-gray-800 pb-4 mb-4">
      <div class="flex items-center gap-3">
        <div class="w-10 h-10 rounded-full bg-gradient-to-tr from-cyan-600 to-indigo-600 flex items-center justify-center font-black text-white text-base shadow-inner">
          ${current.name.charAt(0).toUpperCase()}
        </div>
        <div>
          <h3 class="text-base font-black tracking-wide text-white uppercase">${current.name}</h3>
          <p class="text-[11px] text-gray-400 uppercase tracking-widest font-semibold">Prediction Strategy Matrix</p>
        </div>
      </div>
      <div class="text-right">
        <div class="text-[10px] text-gray-500 font-bold uppercase tracking-wider">Total Evaluated Score</div>
        <div class="text-2xl font-black text-cyan-400 font-mono tracking-tight">${current.totalPoints}<span class="text-xs text-gray-400 font-normal ml-0.5">PTS</span></div>
      </div>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 gap-5">
      
      <div class="space-y-3">
        <h4 class="text-xs font-black uppercase tracking-wider text-gray-400 mb-1 flex items-center gap-1.5">
          <i class="fa-solid fa-circle-nodes text-cyan-400"></i> Main Outright Picks
        </h4>
        
        <div class="bg-gray-900/40 p-2.5 rounded-lg flex items-center justify-between border border-gray-800/40">
          <div>
            <div class="text-[9px] font-bold text-gray-500 uppercase tracking-wide">🏆 Champion Prediction</div>
            <div class="text-xs font-bold mt-0.5 text-amber-200">${current.champion || '—'}</div>
          </div>
          ${matchIcon(current.breakdown.championMatch)}
        </div>

        <div class="bg-gray-900/40 p-2.5 rounded-lg flex items-center justify-between border border-gray-800/40">
          <div>
            <div class="text-[9px] font-bold text-gray-500 uppercase tracking-wide">🥈 Runner Up Prediction</div>
            <div class="text-xs font-bold mt-0.5 text-gray-300">${current.runnerUp || '—'}</div>
          </div>
          ${matchIcon(current.breakdown.runnerUpMatch)}
        </div>

        <div class="bg-gray-900/40 p-2.5 rounded-lg flex items-center justify-between border border-gray-800/40">
          <div>
            <div class="text-[9px] font-bold text-gray-500 uppercase tracking-wide">👟 Golden Boot Winner</div>
            <div class="text-xs font-bold mt-0.5 text-orange-300">${current.goldenBoot || '—'}</div>
          </div>
          ${matchIcon(current.breakdown.goldenBootMatch)}
        </div>
      </div>

      <div>
        <h4 class="text-xs font-black uppercase tracking-wider text-gray-400 mb-2 flex items-center justify-between">
          <span class="flex items-center gap-1.5"><i class="fa-solid fa-diagram-project text-cyan-400"></i> Semifinalist Slots</span>
          <span class="text-[10px] text-emerald-400 font-mono bg-emerald-500/10 px-1.5 py-0.2 rounded border border-emerald-500/20">${current.breakdown.correctSemisCount}/4 Correct</span>
        </h4>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
          ${semiFinalsMatrixHTML}
        </div>
      </div>

    </div>
  `;
}

/**
 * State Transition Setter
 */
window.switchActivePlayer = function(name) {
  state.selectedPlayerName = decodeURIComponent(name);
  compileDOMRenderCycle();
};

/**
 * Escape single quotes logic for clean DOM callbacks
 */
function escapeSelector(str) {
  return encodeURIComponent(str).replace(/'/g, "%27");
}

// Global initialization sequence binding directly on page layout generation loop
document.addEventListener("DOMContentLoaded", () => {
  syncDashboardPipeline();
  
  // Installs active real-time tracking polling routine interval updating every 30 seconds
  setInterval(syncDashboardPipeline, 30000);
});
