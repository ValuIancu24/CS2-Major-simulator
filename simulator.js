// Swiss-system simulator: seeding, matchmaking, and round generation.
// Implements the Valve rulebook used at the Majors (BO1 default in Stages 1/2,
// BO3 for advancement/elimination matches, BO3 everywhere in Stage 3).

// ---------- Constants ----------

const RECORDS_ORDER = [
  "0-0",
  "1-0", "0-1",
  "2-0", "1-1", "0-2",
  "3-0", "2-1", "1-2", "0-3",
  "3-1", "3-2", "2-2", "2-3", "1-3",
];

// Round in which each W-L record first becomes a "destination" (no further matches)
// or the round into which teams at that record are about to play.
// e.g. teams at 2-1 play in round 4; teams at 3-1 are done.

const QUALIFIED_RECORDS = new Set(["3-0", "3-1", "3-2"]);
const ELIMINATED_RECORDS = new Set(["0-3", "1-3", "2-3"]);

// Valve priority table for groups of exactly 6. Each row gives 3 pairs,
// using POSITIONS (1..6) within the group sorted by current seed.
const PRIORITY_TABLE = [
  [[1, 6], [2, 5], [3, 4]],
  [[1, 6], [2, 4], [3, 5]],
  [[1, 5], [2, 6], [3, 4]],
  [[1, 5], [2, 4], [3, 6]],
  [[1, 4], [2, 6], [3, 5]],
  [[1, 4], [2, 5], [3, 6]],
  [[1, 6], [2, 3], [4, 5]],
  [[1, 5], [2, 3], [4, 6]],
  [[1, 3], [2, 6], [4, 5]],
  [[1, 3], [2, 5], [4, 6]],
  [[1, 4], [2, 3], [5, 6]],
  [[1, 3], [2, 4], [5, 6]],
  [[1, 2], [3, 6], [4, 5]],
  [[1, 2], [3, 5], [4, 6]],
  [[1, 2], [3, 4], [5, 6]],
];

// ---------- State helpers ----------

function recordOf(team) {
  return `${team.wins}-${team.losses}`;
}

function isActive(team) {
  return team.status === "active";
}

function teamByName(state, name) {
  return state.teams.find(t => t.name === name);
}

function difficultyScore(state, team) {
  let score = 0;
  for (const oppName of team.opponentsFaced) {
    const opp = teamByName(state, oppName);
    if (opp) score += (opp.wins - opp.losses);
  }
  return score;
}

// Recalculate the current seed (1..n) for every ACTIVE team in the stage.
// Sort key: wins desc, difficulty desc, initial seed asc.
function recalculateSeeds(state) {
  const active = state.teams.filter(isActive);
  active.sort((a, b) => {
    if (b.wins !== a.wins) return b.wins - a.wins;
    const da = difficultyScore(state, a);
    const db = difficultyScore(state, b);
    if (db !== da) return db - da;
    return a.initialSeed - b.initialSeed;
  });
  active.forEach((t, i) => { t.currentSeed = i + 1; });
}

// ---------- Match format ----------

function matchFormat(state, teamA, teamB) {
  if (state.stageNumber === 3) return "BO3";
  // Stage 1 or 2: BO3 if either team is on 2 wins (advancement) or 2 losses (elimination)
  const onEdge = (t) => t.wins === 2 || t.losses === 2;
  return (onEdge(teamA) || onEdge(teamB)) ? "BO3" : "BO1";
}

// ---------- Pairing within a single W-L group ----------

function hasFaced(a, b) {
  return a.opponentsFaced.includes(b.name);
}

// Highest-vs-lowest pairing with no-rematch preference.
// Used for groups of size 2, 4, and as fallback for size 6.
function pairHighestVsLowest(group) {
  const pool = group.slice().sort((a, b) => a.currentSeed - b.currentSeed);
  const pairs = [];
  while (pool.length > 0) {
    const top = pool.shift();
    // Find lowest-seeded opponent in pool who hasn't faced top.
    let oppIdx = -1;
    for (let i = pool.length - 1; i >= 0; i--) {
      if (!hasFaced(top, pool[i])) { oppIdx = i; break; }
    }
    if (oppIdx === -1) oppIdx = pool.length - 1; // forced rematch
    const opp = pool.splice(oppIdx, 1)[0];
    pairs.push([top, opp]);
  }
  return pairs;
}

// Try priority table for groups of 6. Returns null if no row produces a clean
// (no-rematch) set of pairs, in which case caller should fall back.
function pairByPriorityTable(group) {
  const sorted = group.slice().sort((a, b) => a.currentSeed - b.currentSeed);
  for (const row of PRIORITY_TABLE) {
    let clean = true;
    const pairs = [];
    for (const [i, j] of row) {
      const a = sorted[i - 1];
      const b = sorted[j - 1];
      if (hasFaced(a, b)) { clean = false; break; }
      pairs.push([a, b]);
    }
    if (clean) return pairs;
  }
  return null;
}

function pairGroup(group, round) {
  if (group.length === 0) return [];
  if (group.length === 1) return [];
  if (round >= 4 && group.length === 6) {
    const tablePairs = pairByPriorityTable(group);
    if (tablePairs) return tablePairs;
  }
  return pairHighestVsLowest(group);
}

// ---------- Round generation ----------

// Round 1 is fixed: 1v9, 2v10, ..., 8v16 by INITIAL stage seed.
function generateRound1(state) {
  const bySeed = state.teams.slice().sort((a, b) => a.initialSeed - b.initialSeed);
  const matches = [];
  for (let i = 0; i < 8; i++) {
    const a = bySeed[i];
    const b = bySeed[i + 8];
    matches.push(makeMatch(state, a, b, "0-0"));
  }
  return matches;
}

function makeMatch(state, a, b, groupRecord) {
  return {
    teamA: a.name,
    teamB: b.name,
    format: matchFormat(state, a, b),
    winner: null,
    groupRecord: groupRecord || `${a.wins}-${a.losses}`,
  };
}

// Returns the W-L groups that play in a given round.
function groupsForRound(round) {
  switch (round) {
    case 1: return ["0-0"];
    case 2: return ["1-0", "0-1"];
    case 3: return ["2-0", "1-1", "0-2"];
    case 4: return ["2-1", "1-2"];
    case 5: return ["2-2"];
    default: return [];
  }
}

// Build the matches for `round` based on the current bracket state.
// Caller must have already recalculated seeds.
function generateRoundMatches(state, round) {
  if (round === 1) return generateRound1(state);
  const matches = [];
  for (const rec of groupsForRound(round)) {
    const group = state.teams.filter(t => isActive(t) && recordOf(t) === rec);
    const pairs = pairGroup(group, round);
    for (const [a, b] of pairs) {
      matches.push(makeMatch(state, a, b, rec));
    }
  }
  return matches;
}

// ---------- Applying / unapplying match results ----------

function applyMatchResult(state, match) {
  if (!match.winner) return;
  const w = teamByName(state, match.winner);
  const l = teamByName(state, match.winner === match.teamA ? match.teamB : match.teamA);
  w.wins += 1;
  l.losses += 1;
  if (!w.opponentsFaced.includes(l.name)) w.opponentsFaced.push(l.name);
  if (!l.opponentsFaced.includes(w.name)) l.opponentsFaced.push(w.name);
  if (w.wins >= 3) w.status = "qualified";
  if (l.losses >= 3) l.status = "eliminated";
}

// ---------- Stage construction ----------

function buildInitialStageState(stageNumber, teamSpecs) {
  // teamSpecs: array of {seed, name, rating}
  const teams = teamSpecs.map(s => ({
    name: s.name,
    rating: s.rating,
    initialSeed: s.seed,
    currentSeed: s.seed,
    wins: 0,
    losses: 0,
    opponentsFaced: [],
    status: "active",
  }));
  return {
    stageNumber,
    teams,
    round: 1,
    matchesByRound: {},   // { 1: [match...], 2: [...], ... }
  };
}

// Are all matches of a given round decided?
function roundComplete(state, round) {
  const matches = state.matchesByRound[round];
  if (!matches || matches.length === 0) return false;
  return matches.every(m => m.winner !== null);
}

// Number of teams still active.
function activeCount(state) {
  return state.teams.filter(isActive).length;
}

function stageComplete(state) {
  return state.teams.every(t => t.status !== "active");
}

// After a round is finished, generate the next round's matches and bump
// the round counter. Returns true if a new round was generated, false if
// the stage is now complete.
function advanceRoundIfReady(state) {
  if (!roundComplete(state, state.round)) return false;
  // Apply results (idempotent: only matters when called fresh, but we keep
  // application in the click handler instead — see ui.js).
  if (stageComplete(state)) return false;
  state.round += 1;
  recalculateSeeds(state);
  state.matchesByRound[state.round] = generateRoundMatches(state, state.round);
  return true;
}

// Final mid-stage seeds for the 8 advancing teams (used as seeds 9..16 of
// the next stage). Active teams are excluded.
//
// Tiebreakers, in order:
//   1. Fewer losses first (3-0 > 3-1 > 3-2)
//   2. Difficulty score DESC (Buchholz)
//   3. Initial stage seed ASC
//
// We do NOT sort by `currentSeed` here: that value is frozen at the moment a
// team qualified and is computed only against the active pool at that time,
// so a 3-1 team can share a currentSeed with a 3-0 team.
function advancingTeamsOrdered(state) {
  const qualified = state.teams.filter(t => t.status === "qualified");
  qualified.sort((a, b) => {
    if (a.losses !== b.losses) return a.losses - b.losses;
    const da = difficultyScore(state, a);
    const db = difficultyScore(state, b);
    if (db !== da) return db - da;
    return a.initialSeed - b.initialSeed;
  });
  return qualified;
}

// ---------- Deep clone for Monte Carlo ----------

function cloneState(state) {
  return {
    stageNumber: state.stageNumber,
    round: state.round,
    teams: state.teams.map(t => ({
      name: t.name,
      rating: t.rating,
      initialSeed: t.initialSeed,
      currentSeed: t.currentSeed,
      wins: t.wins,
      losses: t.losses,
      opponentsFaced: t.opponentsFaced.slice(),
      status: t.status,
    })),
    matchesByRound: Object.fromEntries(
      Object.entries(state.matchesByRound).map(([k, v]) => [
        k,
        v.map(m => ({ ...m })),
      ])
    ),
  };
}

window.MajorSim = {
  RECORDS_ORDER,
  QUALIFIED_RECORDS,
  ELIMINATED_RECORDS,
  recordOf,
  isActive,
  matchFormat,
  recalculateSeeds,
  generateRoundMatches,
  applyMatchResult,
  buildInitialStageState,
  roundComplete,
  stageComplete,
  advanceRoundIfReady,
  advancingTeamsOrdered,
  cloneState,
  teamByName,
  groupsForRound,
};
