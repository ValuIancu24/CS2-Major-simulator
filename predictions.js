// Prediction system — a fully self-contained parallel to the Simulator page.
//
// It reuses the stateless engine (window.MajorSim), the team data
// (window.MajorData) and the rendering layer (window.MajorUI, in "predict"
// mode). It keeps its OWN state container (PRED) and its OWN localStorage key,
// so it never touches the Simulator/Pickems state in main.js.
//
// Prediction model (per match):
//   predicted : the team the user thinks will win
//   resolved  : null (pending) | "confirmed" (pick was right) | "denied" (wrong)
//   winner    : the EFFECTIVE winner the bracket engine advances. Equals
//               `predicted` while pending or confirmed; flips to the opponent
//               when denied. This is what reshapes downstream matchups.
//
// Each confirmed prediction is worth 3 points.

const STORAGE_KEY_PRED = "iem-cologne-2026-major-predictions-v1";

const PRED = {
  stages: { 1: null, 2: null, 3: null, playoffs: null },
  currentStage: "1",
  unlocked: ["1"],
};

// ---------- Persistence ----------

function predSaveState() {
  try {
    localStorage.setItem(STORAGE_KEY_PRED, JSON.stringify({
      stages: PRED.stages,
      currentStage: PRED.currentStage,
      unlocked: PRED.unlocked,
    }));
  } catch (e) { /* quota or disabled */ }
}

function predLoadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_PRED);
    if (!raw) return false;
    const payload = JSON.parse(raw);
    if (payload.stages) PRED.stages = payload.stages;
    if (payload.currentStage) PRED.currentStage = payload.currentStage;
    if (payload.unlocked) PRED.unlocked = payload.unlocked;
    return true;
  } catch (e) { return false; }
}

// ---------- Stage initialization ----------

function predInitStage1() {
  const specs = window.MajorData.STAGE1_TEAMS;
  PRED.stages[1] = window.MajorSim.buildInitialStageState(1, specs);
  PRED.stages[1].matchesByRound[1] = window.MajorSim.generateRoundMatches(PRED.stages[1], 1);
}

function predInitStage(stageNumber, directInvites, prevStageState) {
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
  PRED.stages[stageNumber] = window.MajorSim.buildInitialStageState(stageNumber, specs);
  PRED.stages[stageNumber].matchesByRound[1] = window.MajorSim.generateRoundMatches(
    PRED.stages[stageNumber], 1
  );
  return true;
}

function predInitPlayoffs(stage3State) {
  const advancing = window.MajorSim.advancingTeamsOrdered(stage3State);
  if (advancing.length !== 8) return false;
  const seedPairs = [[0, 7], [3, 4], [1, 6], [2, 5]];
  const qfMatches = seedPairs.map(([i, j]) => ({
    teamA: advancing[i].name,
    teamB: advancing[j].name,
    format: "BO3",
    winner: null,
    predicted: null,
    resolved: null,
  }));
  PRED.stages.playoffs = { matchesByRound: { 1: qfMatches, 2: [], 3: [] } };
  return true;
}

// ---------- Recompute (re-derive a stage from its effective winners) ----------
//
// Identical in spirit to main.js recomputeStage, but operates on a passed-in
// state object (so it can run against any PRED stage). Only reads `m.winner`.

function recomputeState(state) {
  if (!state) return;
  for (const t of state.teams) {
    t.wins = 0;
    t.losses = 0;
    t.opponentsFaced = [];
    t.status = "active";
    t.currentSeed = t.initialSeed;
  }
  if (!state.matchesByRound[1]) {
    state.matchesByRound[1] = window.MajorSim.generateRoundMatches(state, 1);
  }
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

// ---------- Downstream cascade (mirrors main.js, on PRED) ----------

function predAdvancingNames(stageState) {
  return window.MajorSim.advancingTeamsOrdered(stageState).map(t => t.name);
}

function predSeededNames(nextStageState) {
  if (!nextStageState || !nextStageState.teams) return [];
  return nextStageState.teams
    .filter(t => t.initialSeed >= 9)
    .sort((a, b) => a.initialSeed - b.initialSeed)
    .map(t => t.name);
}

function predNamesEqual(a, b) {
  return a.length === b.length && a.every((n, i) => n === b[i]);
}

function predTearDown(nextKey) {
  PRED.stages[nextKey] = null;
  PRED.unlocked = PRED.unlocked.filter(s => s !== String(nextKey));
  if (PRED.currentStage === String(nextKey)) {
    const order = ["1", "2", "3", "playoffs"];
    for (let i = order.indexOf(String(nextKey)) - 1; i >= 0; i--) {
      if (PRED.unlocked.includes(order[i])) { PRED.currentStage = order[i]; break; }
    }
  }
}

function predSyncStage1to2() {
  const stage1 = PRED.stages[1];
  if (!stage1 || !window.MajorSim.stageComplete(stage1)) {
    if (PRED.stages[2]) predTearDown(2);
    return;
  }
  const expected = predAdvancingNames(stage1);
  if (!PRED.stages[2]) {
    predInitStage(2, window.MajorData.STAGE2_DIRECT_INVITES, stage1);
    if (!PRED.unlocked.includes("2")) PRED.unlocked.push("2");
    return;
  }
  if (!predNamesEqual(predSeededNames(PRED.stages[2]), expected)) {
    predInitStage(2, window.MajorData.STAGE2_DIRECT_INVITES, stage1);
  }
}

function predSyncStage2to3() {
  const stage2 = PRED.stages[2];
  if (!stage2 || !window.MajorSim.stageComplete(stage2)) {
    if (PRED.stages[3]) predTearDown(3);
    return;
  }
  const expected = predAdvancingNames(stage2);
  if (!PRED.stages[3]) {
    predInitStage(3, window.MajorData.STAGE3_DIRECT_INVITES, stage2);
    if (!PRED.unlocked.includes("3")) PRED.unlocked.push("3");
    return;
  }
  if (!predNamesEqual(predSeededNames(PRED.stages[3]), expected)) {
    predInitStage(3, window.MajorData.STAGE3_DIRECT_INVITES, stage2);
  }
}

function predPlayoffsMatchesExpected(stage3) {
  const po = PRED.stages.playoffs;
  if (!po || !po.matchesByRound[1] || po.matchesByRound[1].length !== 4) return false;
  const adv = window.MajorSim.advancingTeamsOrdered(stage3).map(t => t.name);
  const expectedPairs = [[0, 7], [3, 4], [1, 6], [2, 5]];
  return expectedPairs.every(([i, j], idx) => {
    const m = po.matchesByRound[1][idx];
    return m && m.teamA === adv[i] && m.teamB === adv[j];
  });
}

function predSyncStage3toPlayoffs() {
  const stage3 = PRED.stages[3];
  if (!stage3 || !window.MajorSim.stageComplete(stage3)) {
    if (PRED.stages.playoffs) predTearDown("playoffs");
    return;
  }
  if (!PRED.stages.playoffs) {
    predInitPlayoffs(stage3);
    if (!PRED.unlocked.includes("playoffs")) PRED.unlocked.push("playoffs");
    return;
  }
  if (!predPlayoffsMatchesExpected(stage3)) {
    predInitPlayoffs(stage3);
  }
}

function predSyncDownstream(fromStage) {
  const n = (typeof fromStage === "number") ? fromStage : 1;
  if (n <= 1) predSyncStage1to2();
  if (n <= 2) predSyncStage2to3();
  if (n <= 3) predSyncStage3toPlayoffs();
}

// Rebuild SF/F from QF effective winners, preserving prediction metadata when
// the matchup is unchanged (so confirming a QF doesn't wipe later picks).
function predRecomputePlayoffs() {
  const po = PRED.stages.playoffs;
  if (!po) return;

  const buildOrKeep = (oldList, idx, teamA, teamB, format) => {
    if (!teamA || !teamB) return null;
    const prev = oldList && oldList[idx];
    if (prev && prev.teamA === teamA && prev.teamB === teamB) return prev;
    return { teamA, teamB, format, winner: null, predicted: null, resolved: null };
  };

  const qfWinners = (po.matchesByRound[1] || []).map(m => m.winner);
  const oldSF = po.matchesByRound[2] || [];
  const sf1 = buildOrKeep(oldSF, 0, qfWinners[0], qfWinners[1], "BO3");
  const sf2 = buildOrKeep(oldSF, 1, qfWinners[2], qfWinners[3], "BO3");
  const newSF = [];
  if (sf1) newSF.push(sf1);
  if (sf2) newSF.push(sf2);
  po.matchesByRound[2] = newSF;

  const oldF = po.matchesByRound[3] || [];
  const newF = [];
  if (sf1 && sf2 && sf1.winner && sf2.winner) {
    const f = buildOrKeep(oldF, 0, sf1.winner, sf2.winner, "BO5");
    if (f) newF.push(f);
  }
  po.matchesByRound[3] = newF;
}

// ---------- Stage navigation helpers ----------

function predCurrentStageNumber() {
  return PRED.currentStage === "playoffs" ? "playoffs" : Number(PRED.currentStage);
}

function predCurrentStageState() {
  return PRED.stages[predCurrentStageNumber()];
}

function predAfterStageEdit(stageNum) {
  recomputeState(PRED.stages[stageNum]);
  predSyncDownstream(stageNum);
}

// ---------- Swiss prediction handlers ----------

// Delete the matches generated for rounds after `round` (their matchups are
// now invalid because an effective winner changed).
function predInvalidateAfter(stage, round) {
  for (let r = round + 1; r <= 5; r++) delete stage.matchesByRound[r];
}

function predHandleMatchClick(round, matchIdx, teamName) {
  const stage = predCurrentStageState();
  if (!stage) return;
  const match = stage.matchesByRound[round] && stage.matchesByRound[round][matchIdx];
  if (!match) return;

  const oldWinner = match.winner;
  if (!match.resolved && match.predicted === teamName) {
    // Toggle the pending prediction off.
    match.predicted = null;
    match.winner = null;
  } else {
    match.predicted = teamName;
    match.resolved = null;
    match.winner = teamName;
  }
  if (match.winner !== oldWinner) predInvalidateAfter(stage, round);

  predAfterStageEdit(predCurrentStageNumber());
  predRefresh();
}

function predHandleConfirm(round, matchIdx) {
  const stage = predCurrentStageState();
  if (!stage) return;
  const match = stage.matchesByRound[round] && stage.matchesByRound[round][matchIdx];
  if (!match || !match.predicted) return;
  // Effective winner stays = predicted, so downstream matchups are unchanged.
  match.resolved = "confirmed";
  match.winner = match.predicted;
  predAfterStageEdit(predCurrentStageNumber());
  predRefresh();
}

function predHandleDeny(round, matchIdx) {
  const stage = predCurrentStageState();
  if (!stage) return;
  const match = stage.matchesByRound[round] && stage.matchesByRound[round][matchIdx];
  if (!match || !match.predicted) return;
  const opponent = match.predicted === match.teamA ? match.teamB : match.teamA;
  const oldWinner = match.winner;
  match.resolved = "denied";
  match.winner = opponent; // reality advanced the other team
  if (match.winner !== oldWinner) predInvalidateAfter(stage, round);
  predAfterStageEdit(predCurrentStageNumber());
  predRefresh();
}

function predHandleReopen(round, matchIdx) {
  const stage = predCurrentStageState();
  if (!stage) return;
  const match = stage.matchesByRound[round] && stage.matchesByRound[round][matchIdx];
  if (!match || !match.predicted) return;
  const oldWinner = match.winner;
  match.resolved = null;
  match.winner = match.predicted; // back to the pending pick
  if (match.winner !== oldWinner) predInvalidateAfter(stage, round);
  predAfterStageEdit(predCurrentStageNumber());
  predRefresh();
}

function predHandleRoundReset(round) {
  const stage = predCurrentStageState();
  if (!stage) return;
  if (stage.matchesByRound[round]) {
    for (const m of stage.matchesByRound[round]) {
      m.predicted = null;
      m.resolved = null;
      m.winner = null;
    }
  }
  predInvalidateAfter(stage, round);
  predAfterStageEdit(predCurrentStageNumber());
  predRefresh();
}

// Bulk-predict a round (Shuffle / Higher seed). Overwrites that round and
// everything after it, then sets a fresh pending prediction per match.
function predApplyRoundPicker(round, pickWinner) {
  const stage = predCurrentStageState();
  if (!stage) return;

  for (let r = round; r <= 5; r++) delete stage.matchesByRound[r];
  recomputeState(stage);

  const matches = stage.matchesByRound[round];
  if (matches) {
    for (const m of matches) {
      const a = window.MajorSim.teamByName(stage, m.teamA);
      const b = window.MajorSim.teamByName(stage, m.teamB);
      if (!a || !b) continue;
      const w = pickWinner(a, b);
      m.predicted = w;
      m.resolved = null;
      m.winner = w;
    }
  }
  predAfterStageEdit(predCurrentStageNumber());
  predRefresh();
}

function predHandleRoundShuffle(round) {
  predApplyRoundPicker(round, (a, b) => (Math.random() < 0.5 ? a.name : b.name));
}

function predHandleRoundHigherSeed(round) {
  predApplyRoundPicker(round, (a, b) => (a.initialSeed <= b.initialSeed ? a.name : b.name));
}

// ---------- Playoffs prediction handlers ----------

function predPlayoffMatch(round, matchIdx) {
  const po = PRED.stages.playoffs;
  if (!po) return null;
  return (po.matchesByRound[round] && po.matchesByRound[round][matchIdx]) || null;
}

function predHandlePlayoffsClick(round, matchIdx, teamName) {
  const match = predPlayoffMatch(round, matchIdx);
  if (!match) return;
  if (!match.resolved && match.predicted === teamName) {
    match.predicted = null;
    match.winner = null;
  } else {
    match.predicted = teamName;
    match.resolved = null;
    match.winner = teamName;
  }
  predRecomputePlayoffs();
  predRefresh();
}

function predHandlePlayoffsConfirm(round, matchIdx) {
  const match = predPlayoffMatch(round, matchIdx);
  if (!match || !match.predicted) return;
  match.resolved = "confirmed";
  match.winner = match.predicted;
  predRecomputePlayoffs();
  predRefresh();
}

function predHandlePlayoffsDeny(round, matchIdx) {
  const match = predPlayoffMatch(round, matchIdx);
  if (!match || !match.predicted) return;
  match.resolved = "denied";
  match.winner = match.predicted === match.teamA ? match.teamB : match.teamA;
  predRecomputePlayoffs();
  predRefresh();
}

function predHandlePlayoffsReopen(round, matchIdx) {
  const match = predPlayoffMatch(round, matchIdx);
  if (!match || !match.predicted) return;
  match.resolved = null;
  match.winner = match.predicted;
  predRecomputePlayoffs();
  predRefresh();
}

// ---------- Points ----------

function predTotalPoints() {
  let confirmed = 0;
  const countStage = (state) => {
    if (!state || !state.matchesByRound) return;
    for (const ms of Object.values(state.matchesByRound)) {
      if (!Array.isArray(ms)) continue;
      for (const m of ms) {
        if (m.resolved === "confirmed") confirmed++;
      }
    }
  };
  countStage(PRED.stages[1]);
  countStage(PRED.stages[2]);
  countStage(PRED.stages[3]);
  countStage(PRED.stages.playoffs);
  return confirmed * 3;
}

// ---------- Reset ----------

function predResetCurrentStage() {
  const num = predCurrentStageNumber();
  if (num === "playoffs") {
    const po = PRED.stages.playoffs;
    if (po) {
      for (const m of po.matchesByRound[1] || []) {
        m.winner = null; m.predicted = null; m.resolved = null;
      }
      po.matchesByRound[2] = [];
      po.matchesByRound[3] = [];
    }
  } else if (num === 1) {
    predInitStage1();
    PRED.stages[2] = null;
    PRED.stages[3] = null;
    PRED.stages.playoffs = null;
    PRED.unlocked = ["1"];
  } else if (num === 2) {
    if (PRED.stages[1]) predInitStage(2, window.MajorData.STAGE2_DIRECT_INVITES, PRED.stages[1]);
    PRED.stages[3] = null;
    PRED.stages.playoffs = null;
    PRED.unlocked = PRED.unlocked.filter(s => !["3", "playoffs"].includes(s));
  } else if (num === 3) {
    if (PRED.stages[2]) predInitStage(3, window.MajorData.STAGE3_DIRECT_INVITES, PRED.stages[2]);
    PRED.stages.playoffs = null;
    PRED.unlocked = PRED.unlocked.filter(s => s !== "playoffs");
  }
  predRefresh();
}

// ---------- Render ----------

function predRenderStageTabs() {
  const tabs = document.querySelectorAll("#pred-stage-tabs .stage-tab");
  tabs.forEach(tab => {
    const stage = tab.dataset.stage;
    tab.classList.remove("active", "locked");
    if (stage == PRED.currentStage) tab.classList.add("active");
    if (!PRED.unlocked.includes(stage)) tab.classList.add("locked");
  });
}

function predSetStage(stage) {
  if (!PRED.unlocked.includes(String(stage))) return;
  PRED.currentStage = String(stage);
  predRefresh();
}

function predRefresh() {
  predRenderStageTabs();

  const num = predCurrentStageNumber();
  const bracketRoot = document.getElementById("pred-bracket-view");
  const playoffsRoot = document.getElementById("pred-playoffs-view");

  if (num === "playoffs") {
    bracketRoot.classList.add("hidden");
    playoffsRoot.classList.remove("hidden");
    window.MajorUI.renderPlayoffs(PRED.stages.playoffs, {
      controller: window.MajorPred,
      mode: "predict",
      playoffsRootId: "pred-playoffs-bracket",
    });
  } else {
    bracketRoot.classList.remove("hidden");
    playoffsRoot.classList.add("hidden");
    window.MajorUI.renderBracket(PRED.stages[num], {
      controller: window.MajorPred,
      mode: "predict",
      rootId: "pred-bracket-view",
    });
  }

  const pts = document.getElementById("pred-points");
  if (pts) pts.textContent = `Prediction points: ${predTotalPoints()}`;

  predSaveState();
}

// ---------- Page switching (Simulator <-> Predictions) ----------

function switchPage(page) {
  const sim = document.getElementById("simulator-page");
  const pred = document.getElementById("predictions-page");
  document.querySelectorAll("#page-nav .page-tab").forEach(t => {
    t.classList.toggle("active", t.dataset.page === page);
  });
  if (page === "predictions") {
    sim.classList.add("hidden");
    pred.classList.remove("hidden");
    predRefresh();
  } else {
    pred.classList.add("hidden");
    sim.classList.remove("hidden");
  }
}

// ---------- Wire-up & boot ----------

function predWireEvents() {
  document.querySelectorAll("#pred-stage-tabs .stage-tab").forEach(tab => {
    tab.addEventListener("click", () => predSetStage(tab.dataset.stage));
  });
  document.getElementById("pred-reset-stage").addEventListener("click", predResetCurrentStage);
  document.querySelectorAll("#page-nav .page-tab").forEach(tab => {
    tab.addEventListener("click", () => switchPage(tab.dataset.page));
  });
}

function predBoot() {
  const loaded = predLoadState();
  if (!loaded || !PRED.stages[1]) {
    predInitStage1();
  }
  // Re-derive each loaded stage so it's consistent with the current engine.
  if (PRED.stages[1]) recomputeState(PRED.stages[1]);
  if (PRED.stages[2]) recomputeState(PRED.stages[2]);
  if (PRED.stages[3]) recomputeState(PRED.stages[3]);
  predSyncDownstream(1);
  if (PRED.stages.playoffs) predRecomputePlayoffs();

  predWireEvents();
  predRefresh();
}

window.MajorPred = {
  // Swiss
  handleMatchClick: predHandleMatchClick,
  handleConfirm: predHandleConfirm,
  handleDeny: predHandleDeny,
  handleReopen: predHandleReopen,
  handleRoundReset: predHandleRoundReset,
  handleRoundShuffle: predHandleRoundShuffle,
  handleRoundHigherSeed: predHandleRoundHigherSeed,
  // Playoffs
  handlePlayoffsClick: predHandlePlayoffsClick,
  handlePlayoffsConfirm: predHandlePlayoffsConfirm,
  handlePlayoffsDeny: predHandlePlayoffsDeny,
  handlePlayoffsReopen: predHandlePlayoffsReopen,
  // Nav
  setStage: predSetStage,
};

document.addEventListener("DOMContentLoaded", predBoot);
