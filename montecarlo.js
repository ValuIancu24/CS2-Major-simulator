// Monte Carlo simulation engine. Given the current bracket state, runs N
// simulations of the remaining rounds and aggregates per-team statistics.

const SIM_RUNS = 1000;

function winProbability(ratingA, ratingB) {
  const total = ratingA + ratingB;
  if (total <= 0) return 0.5;
  return ratingA / total;
}

// Decide a single match outcome based on team ratings.
function decideMatch(teamA, teamB) {
  const p = winProbability(teamA.rating, teamB.rating);
  return Math.random() < p ? teamA.name : teamB.name;
}

// Simulate from the given state to stage completion.
// Returns the finished state plus a per-team record-of-opponents map.
function simulateOneRun(initialState) {
  const state = window.MajorSim.cloneState(initialState);

  // Track opponents faced per round per team (only the rounds simulated in
  // this run — we want to report likely future opponents).
  const opponentsByRound = {}; // teamName -> { roundNum: opponentName }
  for (const t of state.teams) opponentsByRound[t.name] = {};

  // Ensure round counter & matches are aligned. If a round's matches haven't
  // been generated yet (e.g. user has only locked in round 1 results), keep
  // moving through them.
  while (!window.MajorSim.stageComplete(state)) {
    // If matches for the current round don't exist yet, generate them.
    if (!state.matchesByRound[state.round]) {
      window.MajorSim.recalculateSeeds(state);
      state.matchesByRound[state.round] = window.MajorSim.generateRoundMatches(state, state.round);
    }
    const matches = state.matchesByRound[state.round];
    if (matches.length === 0) break; // no one left to play

    for (const m of matches) {
      const a = window.MajorSim.teamByName(state, m.teamA);
      const b = window.MajorSim.teamByName(state, m.teamB);
      // Track who they played this round (only if newly simulated here).
      if (m.winner === null) {
        m.winner = decideMatch(a, b);
        opponentsByRound[a.name][state.round] = b.name;
        opponentsByRound[b.name][state.round] = a.name;
      }
      window.MajorSim.applyMatchResult(state, m);
    }

    if (window.MajorSim.stageComplete(state)) break;
    state.round += 1;
    if (state.round > 5) break; // safety
  }

  return { state, opponentsByRound };
}

// Aggregate stats across runs.
function runSimulation(initialState, runs = SIM_RUNS, firstUnplayedRound = null) {
  const stats = {};
  for (const t of initialState.teams) {
    stats[t.name] = {
      name: t.name,
      runs: 0,
      qualified: 0,
      eliminated: 0,
      records: { "3-0": 0, "3-1": 0, "3-2": 0, "2-3": 0, "1-3": 0, "0-3": 0 },
      opponentsByRound: {},  // roundNum -> { oppName: count }
    };
  }

  for (let i = 0; i < runs; i++) {
    const { state, opponentsByRound } = simulateOneRun(initialState);
    for (const t of state.teams) {
      const s = stats[t.name];
      s.runs += 1;
      const rec = `${t.wins}-${t.losses}`;
      if (s.records[rec] !== undefined) s.records[rec] += 1;
      if (t.status === "qualified") s.qualified += 1;
      else if (t.status === "eliminated") s.eliminated += 1;

      const ops = opponentsByRound[t.name] || {};
      for (const [roundStr, oppName] of Object.entries(ops)) {
        const r = Number(roundStr);
        // Only track rounds at or after the first unplayed round
        // (we already know the opponents in already-locked rounds).
        if (firstUnplayedRound !== null && r < firstUnplayedRound) continue;
        if (!s.opponentsByRound[r]) s.opponentsByRound[r] = {};
        s.opponentsByRound[r][oppName] = (s.opponentsByRound[r][oppName] || 0) + 1;
      }
    }
  }

  return { stats, runs };
}

window.MajorMC = {
  SIM_RUNS,
  runSimulation,
  winProbability,
};
