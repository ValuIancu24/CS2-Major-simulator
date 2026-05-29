// App entry point: state container, event wiring, localStorage persistence.

const STORAGE_KEY = "iem-cologne-2026-major-state-v1";

const APP = {
  // Per-stage state: stage1, stage2, stage3, playoffs
  stages: {
    1: null,
    2: null,
    3: null,
    playoffs: null,
  },
  // Which stage tab is currently shown ("1" | "2" | "3" | "playoffs")
  currentStage: "1",
  // Stage tabs that are unlocked
  unlocked: ["1"],
  // Last simulation results per stage
  lastSim: { 1: null, 2: null, 3: null },
  // Has the bracket changed since the last simulation?
  stateChangedSinceSim: { 1: true, 2: true, 3: true },
};

// ---------- Persistence ----------

function saveState() {
  try {
    const payload = {
      stages: APP.stages,
      currentStage: APP.currentStage,
      unlocked: APP.unlocked,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch (e) { /* quota or disabled */ }
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const payload = JSON.parse(raw);
    if (payload.stages) APP.stages = payload.stages;
    if (payload.currentStage) APP.currentStage = payload.currentStage;
    if (payload.unlocked) APP.unlocked = payload.unlocked;
    return true;
  } catch (e) { return false; }
}

// ---------- Stage initialization ----------

function initStage1() {
  const specs = window.MajorData.STAGE1_TEAMS;
  APP.stages[1] = window.MajorSim.buildInitialStageState(1, specs);
  APP.stages[1].matchesByRound[1] = window.MajorSim.generateRoundMatches(APP.stages[1], 1);
  APP.stateChangedSinceSim[1] = true;
}

function initStage(stageNumber, directInvites, prevStageState) {
  const advancing = window.MajorSim.advancingTeamsOrdered(prevStageState);
  if (advancing.length !== 8) return false;

  const specs = [];
  for (const di of directInvites) {
    specs.push({ seed: di.seed, name: di.name, rating: di.rating });
  }
  for (let i = 0; i < 8; i++) {
    const t = advancing[i];
    specs.push({ seed: 9 + i, name: t.name, rating: t.rating });
  }
  APP.stages[stageNumber] = window.MajorSim.buildInitialStageState(stageNumber, specs);
  APP.stages[stageNumber].matchesByRound[1] = window.MajorSim.generateRoundMatches(
    APP.stages[stageNumber], 1
  );
  APP.stateChangedSinceSim[stageNumber] = true;
  return true;
}

function initPlayoffs(stage3State) {
  const advancing = window.MajorSim.advancingTeamsOrdered(stage3State);
  if (advancing.length !== 8) return false;

  // Single-elimination bracket: 1v8, 4v5, 2v7, 3v6 in quarters.
  const seedPairs = [[0, 7], [3, 4], [1, 6], [2, 5]];
  const qfMatches = seedPairs.map(([i, j]) => ({
    teamA: advancing[i].name,
    teamB: advancing[j].name,
    format: "BO3",
    winner: null,
  }));
  APP.stages.playoffs = {
    matchesByRound: { 1: qfMatches, 2: [], 3: [] },
  };
  return true;
}

// ---------- Recompute (re-derive a stage from its locked-in winners) ----------

function recomputeStage(stageNumber) {
  const state = APP.stages[stageNumber];
  if (!state) return;

  // Reset all team progress.
  for (const t of state.teams) {
    t.wins = 0;
    t.losses = 0;
    t.opponentsFaced = [];
    t.status = "active";
    t.currentSeed = t.initialSeed;
  }

  // Ensure round 1 exists.
  if (!state.matchesByRound[1]) {
    state.matchesByRound[1] = window.MajorSim.generateRoundMatches(state, 1);
  }

  // Walk rounds 1..5 forward.
  for (let r = 1; r <= 5; r++) {
    let matches = state.matchesByRound[r];
    if (!matches) {
      if (r > 1 && !window.MajorSim.roundComplete(state, r - 1)) break;
      window.MajorSim.recalculateSeeds(state);
      matches = window.MajorSim.generateRoundMatches(state, r);
      state.matchesByRound[r] = matches;
    }
    for (const m of matches) {
      if (m.winner) window.MajorSim.applyMatchResult(state, m);
    }
    if (!window.MajorSim.roundComplete(state, r)) {
      state.round = r;
      break;
    }
    state.round = r;
  }

}

// ---------- Downstream cascade ----------
//
// After a stage is edited, the stages that depend on it (its seeds 9-16, or
// the playoffs bracket) may be out of sync. syncDownstream() walks the
// pipeline and either:
//   - tears down the next stage if the current one is no longer complete, or
//   - rebuilds the next stage if the advancing teams don't match what's
//     currently seeded there, or
//   - leaves it alone if everything still lines up.

function advancingNames(stageState) {
  return window.MajorSim.advancingTeamsOrdered(stageState).map(t => t.name);
}

function seededNames(nextStageState) {
  if (!nextStageState || !nextStageState.teams) return [];
  return nextStageState.teams
    .filter(t => t.initialSeed >= 9)
    .sort((a, b) => a.initialSeed - b.initialSeed)
    .map(t => t.name);
}

function namesEqual(a, b) {
  return a.length === b.length && a.every((n, i) => n === b[i]);
}

function tearDown(nextKey) {
  APP.stages[nextKey] = null;
  if (nextKey !== "playoffs") APP.lastSim[nextKey] = null;
  APP.unlocked = APP.unlocked.filter(s => s !== String(nextKey));
  if (APP.currentStage === String(nextKey)) {
    // Walk back to the most recent unlocked stage.
    const order = ["1", "2", "3", "playoffs"];
    for (let i = order.indexOf(String(nextKey)) - 1; i >= 0; i--) {
      if (APP.unlocked.includes(order[i])) { APP.currentStage = order[i]; break; }
    }
  }
}

function syncStage1to2() {
  const stage1 = APP.stages[1];
  if (!stage1 || !window.MajorSim.stageComplete(stage1)) {
    if (APP.stages[2]) tearDown(2);
    return;
  }
  const expected = advancingNames(stage1);
  if (!APP.stages[2]) {
    initStage(2, window.MajorData.STAGE2_DIRECT_INVITES, stage1);
    if (!APP.unlocked.includes("2")) APP.unlocked.push("2");
    return;
  }
  if (!namesEqual(seededNames(APP.stages[2]), expected)) {
    initStage(2, window.MajorData.STAGE2_DIRECT_INVITES, stage1);
    APP.lastSim[2] = null;
  }
}

function syncStage2to3() {
  const stage2 = APP.stages[2];
  if (!stage2 || !window.MajorSim.stageComplete(stage2)) {
    if (APP.stages[3]) tearDown(3);
    return;
  }
  const expected = advancingNames(stage2);
  if (!APP.stages[3]) {
    initStage(3, window.MajorData.STAGE3_DIRECT_INVITES, stage2);
    if (!APP.unlocked.includes("3")) APP.unlocked.push("3");
    return;
  }
  if (!namesEqual(seededNames(APP.stages[3]), expected)) {
    initStage(3, window.MajorData.STAGE3_DIRECT_INVITES, stage2);
    APP.lastSim[3] = null;
  }
}

// Compares existing QF bracket against the matchups initPlayoffs would build.
function playoffsMatchesExpected(stage3) {
  const po = APP.stages.playoffs;
  if (!po || !po.matchesByRound[1] || po.matchesByRound[1].length !== 4) return false;
  const adv = window.MajorSim.advancingTeamsOrdered(stage3).map(t => t.name);
  const expectedPairs = [[0, 7], [3, 4], [1, 6], [2, 5]];
  return expectedPairs.every(([i, j], idx) => {
    const m = po.matchesByRound[1][idx];
    return m && m.teamA === adv[i] && m.teamB === adv[j];
  });
}

function syncStage3toPlayoffs() {
  const stage3 = APP.stages[3];
  if (!stage3 || !window.MajorSim.stageComplete(stage3)) {
    if (APP.stages.playoffs) tearDown("playoffs");
    return;
  }
  if (!APP.stages.playoffs) {
    initPlayoffs(stage3);
    if (!APP.unlocked.includes("playoffs")) APP.unlocked.push("playoffs");
    return;
  }
  if (!playoffsMatchesExpected(stage3)) {
    initPlayoffs(stage3);
  }
}

function syncDownstream(fromStage) {
  const n = (typeof fromStage === "number") ? fromStage : 1;
  if (n <= 1) syncStage1to2();
  if (n <= 2) syncStage2to3();
  if (n <= 3) syncStage3toPlayoffs();
}

// ---------- Click handlers ----------

function afterStageEdit(stageNum) {
  recomputeStage(stageNum);
  APP.stateChangedSinceSim[stageNum] = true;
  syncDownstream(stageNum);
}

function handleMatchClick(round, matchIdx, teamName) {
  const stage = currentStageState();
  if (!stage) return;
  const match = stage.matchesByRound[round][matchIdx];

  // Toggle: clicking the existing winner re-opens the match.
  if (match.winner === teamName) match.winner = null;
  else match.winner = teamName;

  // Any change beyond this round invalidates subsequent rounds in this stage.
  for (let r = round + 1; r <= 5; r++) delete stage.matchesByRound[r];

  afterStageEdit(currentStageNumber());
  refresh();
}

function handleRoundReset(round) {
  const stage = currentStageState();
  if (!stage) return;
  if (stage.matchesByRound[round]) {
    for (const m of stage.matchesByRound[round]) m.winner = null;
  }
  for (let r = round + 1; r <= 5; r++) delete stage.matchesByRound[r];
  afterStageEdit(currentStageNumber());
  refresh();
}

// Higher Seed and Shuffle behave as "select all winners in this round" —
// they OVERWRITE existing winners. To do that correctly we first wipe round R
// and everything after it, then let recomputeStage regenerate round R from
// scratch. That ensures `currentSeed` reflects the correct start-of-round-R
// state (otherwise it could be stale from a later round in a previous run).
function applyRoundPicker(round, pickWinner) {
  const stage = currentStageState();
  if (!stage) return;

  for (let r = round; r <= 5; r++) delete stage.matchesByRound[r];
  recomputeStage(currentStageNumber());

  const matches = stage.matchesByRound[round];
  if (!matches) {
    // Round R can't run yet (upstream incomplete). Nothing to do.
    afterStageEdit(currentStageNumber());
    refresh();
    return;
  }

  for (const m of matches) {
    const a = window.MajorSim.teamByName(stage, m.teamA);
    const b = window.MajorSim.teamByName(stage, m.teamB);
    if (!a || !b) continue;
    m.winner = pickWinner(a, b);
  }

  afterStageEdit(currentStageNumber());
  refresh();
}

function handleRoundShuffle(round) {
  applyRoundPicker(round, (a, b) => (Math.random() < 0.5 ? a.name : b.name));
}

function handleRoundHigherSeed(round) {
  // "Higher seed" = the team seeded higher at the START of the stage,
  // not the mid-stage seed (which is a matchmaking artifact).
  applyRoundPicker(round, (a, b) =>
    a.initialSeed <= b.initialSeed ? a.name : b.name
  );
}

// Build SF/F preserving downstream winners when the matchup is unchanged.
// Without this, clicking an SF or F team would set the winner and the very
// next rebuild would replace the match object with `winner: null`.
function recomputePlayoffs() {
  const po = APP.stages.playoffs;
  if (!po) return;

  const buildOrKeep = (oldList, idx, teamA, teamB) => {
    if (!teamA || !teamB) return null;
    const prev = oldList && oldList[idx];
    const sameMatchup = prev && prev.teamA === teamA && prev.teamB === teamB;
    return {
      teamA, teamB, format: "BO3",
      winner: sameMatchup ? prev.winner : null,
    };
  };

  const qfWinners = (po.matchesByRound[1] || []).map(m => m.winner);
  const oldSF = po.matchesByRound[2] || [];
  const sf1 = buildOrKeep(oldSF, 0, qfWinners[0], qfWinners[1]);
  const sf2 = buildOrKeep(oldSF, 1, qfWinners[2], qfWinners[3]);
  const newSF = [];
  if (sf1) newSF.push(sf1);
  if (sf2) newSF.push(sf2);
  po.matchesByRound[2] = newSF;

  const oldF = po.matchesByRound[3] || [];
  const newF = [];
  if (sf1 && sf2 && sf1.winner && sf2.winner) {
    const f = buildOrKeep(oldF, 0, sf1.winner, sf2.winner);
    if (f) newF.push(f);
  }
  po.matchesByRound[3] = newF;
}

function handlePlayoffsClick(round, matchIdx, teamName) {
  const po = APP.stages.playoffs;
  if (!po) return;
  const match = po.matchesByRound[round] && po.matchesByRound[round][matchIdx];
  if (!match) return;

  if (match.winner === teamName) match.winner = null;
  else match.winner = teamName;

  recomputePlayoffs();
  refresh();
}

// ---------- Simulation ----------

function runSimulationForCurrent() {
  const stageNum = currentStageNumber();
  if (stageNum === "playoffs") return;
  const stage = APP.stages[stageNum];
  if (!stage) return;

  window.MajorUI.setSimStatus("Simulating... 1000 runs");
  const btn = document.getElementById("btn-simulate");
  btn.disabled = true;

  // Defer to next tick so UI shows the "Simulating..." text.
  setTimeout(() => {
    const firstUnplayedRound = stage.round || 1;
    const result = window.MajorMC.runSimulation(stage, window.MajorMC.SIM_RUNS, firstUnplayedRound);
    APP.lastSim[stageNum] = result;
    APP.stateChangedSinceSim[stageNum] = false;
    window.MajorUI.setSimStatus(`Done — ${result.runs} runs`);
    btn.disabled = false;
    refresh();
  }, 30);
}

// ---------- Stage navigation ----------

function setStage(stage) {
  if (!APP.unlocked.includes(String(stage))) return;
  APP.currentStage = String(stage);
  refresh();
}

function currentStageNumber() {
  return APP.currentStage === "playoffs" ? "playoffs" : Number(APP.currentStage);
}

function currentStageState() {
  return APP.stages[currentStageNumber()];
}

// ---------- Reset ----------

function resetCurrentStage() {
  const num = currentStageNumber();
  if (num === "playoffs") {
    if (APP.stages.playoffs) {
      for (const m of APP.stages.playoffs.matchesByRound[1] || []) m.winner = null;
      APP.stages.playoffs.matchesByRound[2] = [];
      APP.stages.playoffs.matchesByRound[3] = [];
    }
  } else if (num === 1) {
    initStage1();
    APP.stages[2] = null;
    APP.stages[3] = null;
    APP.stages.playoffs = null;
    APP.unlocked = ["1"];
    APP.lastSim = { 1: null, 2: null, 3: null };
  } else if (num === 2) {
    if (APP.stages[1]) initStage(2, window.MajorData.STAGE2_DIRECT_INVITES, APP.stages[1]);
    APP.stages[3] = null;
    APP.stages.playoffs = null;
    APP.unlocked = APP.unlocked.filter(s => !["3", "playoffs"].includes(s));
  } else if (num === 3) {
    if (APP.stages[2]) initStage(3, window.MajorData.STAGE3_DIRECT_INVITES, APP.stages[2]);
    APP.stages.playoffs = null;
    APP.unlocked = APP.unlocked.filter(s => s !== "playoffs");
  }
  refresh();
}

// ---------- Refresh / wire-up ----------

function refresh() {
  window.MajorUI.renderStageTabs(APP.currentStage, APP.unlocked);

  const num = currentStageNumber();
  const bracketRoot = document.getElementById("bracket-view");
  const playoffsRoot = document.getElementById("playoffs-view");

  if (num === "playoffs") {
    bracketRoot.classList.add("hidden");
    document.getElementById("warning-banner").classList.add("hidden");
    document.querySelector(".simulate-bar").classList.add("hidden");
    playoffsRoot.classList.remove("hidden");
    window.MajorUI.renderPlayoffs(APP.stages.playoffs);
  } else {
    bracketRoot.classList.remove("hidden");
    playoffsRoot.classList.add("hidden");
    document.querySelector(".simulate-bar").classList.remove("hidden");
    window.MajorUI.renderBracket(APP.stages[num]);
    window.MajorUI.showWarningBanner(APP.stateChangedSinceSim[num] && APP.lastSim[num] !== null);
  }

  saveState();
}

function wireEvents() {
  document.querySelectorAll("#stage-tabs .stage-tab").forEach(tab => {
    tab.addEventListener("click", () => setStage(tab.dataset.stage));
  });
  document.getElementById("btn-simulate").addEventListener("click", runSimulationForCurrent);
  document.getElementById("reset-stage").addEventListener("click", resetCurrentStage);

  document.getElementById("open-stats").addEventListener("click", () => {
    const num = currentStageNumber();
    if (num === "playoffs") {
      document.getElementById("stats-body").innerHTML =
        '<p class="stats-empty">Statistics not available for playoffs.</p>';
    } else {
      const last = APP.lastSim[num];
      if (last) window.MajorUI.renderStats(last.stats, last.runs);
      else window.MajorUI.renderStats(null, 0);
    }
    document.getElementById("stats-modal").classList.remove("hidden");
  });

  document.getElementById("close-stats").addEventListener("click", () => {
    document.getElementById("stats-modal").classList.add("hidden");
  });

  document.getElementById("stats-modal").addEventListener("click", (e) => {
    if (e.target.id === "stats-modal") {
      document.getElementById("stats-modal").classList.add("hidden");
    }
  });
}

// ---------- Boot ----------

function boot() {
  const loaded = loadState();
  if (!loaded || !APP.stages[1]) {
    initStage1();
  }
  // Re-derive each loaded stage to make sure it's consistent with current
  // simulator logic (e.g. if rules changed).
  if (APP.stages[1]) recomputeStage(1);
  if (APP.stages[2]) recomputeStage(2);
  if (APP.stages[3]) recomputeStage(3);

  // Cascade once on boot so any stale downstream stage gets reseeded.
  syncDownstream(1);
  if (APP.stages.playoffs) recomputePlayoffs();

  wireEvents();
  refresh();
}

window.MajorApp = {
  handleMatchClick,
  handleRoundReset,
  handleRoundShuffle,
  handleRoundHigherSeed,
  handlePlayoffsClick,
  setStage,
};

document.addEventListener("DOMContentLoaded", boot);
