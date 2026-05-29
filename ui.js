// Rendering layer. Pure DOM construction from the current stage state.
// Click handlers delegate back to MajorApp (defined in main.js).

// ---------- Layout config ----------

// Round → ordered list of W-L groups shown in that column. Special "zones"
// (qualified / eliminated terminal records) live in the column matching the
// round AFTER they're first populated.
const ROUND_LAYOUT = {
  1: [{ kind: "matches", record: "0-0", size: 8 }],
  2: [
    { kind: "matches", record: "1-0", size: 4 },
    { kind: "matches", record: "0-1", size: 4 },
  ],
  3: [
    { kind: "matches", record: "2-0", size: 2 },
    { kind: "matches", record: "1-1", size: 4 },
    { kind: "matches", record: "0-2", size: 2 },
  ],
  4: [
    { kind: "qualified-zone", records: ["3-0"], slotCounts: [2] },
    { kind: "matches", record: "2-1", size: 3 },
    { kind: "matches", record: "1-2", size: 3 },
    { kind: "eliminated-zone", records: ["0-3"], slotCounts: [2] },
  ],
  5: [
    { kind: "qualified-zone", records: ["3-1", "3-2"], slotCounts: [3, 3] },
    { kind: "matches", record: "2-2", size: 3 },
    { kind: "eliminated-zone", records: ["1-3", "2-3"], slotCounts: [3, 3] },
  ],
};

// ---------- DOM helpers ----------

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") node.className = v;
    else if (k === "style") node.setAttribute("style", v);
    else if (k.startsWith("on") && typeof v === "function") {
      node.addEventListener(k.slice(2).toLowerCase(), v);
    } else if (k === "dataset") {
      for (const [dk, dv] of Object.entries(v)) node.dataset[dk] = dv;
    } else if (v !== null && v !== undefined) {
      node.setAttribute(k, v);
    }
  }
  for (const c of [].concat(children)) {
    if (c == null || c === false) continue;
    node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
  }
  return node;
}

// Try each candidate filename in order until one loads; then apply it.
// The team-logo element shows a colored initials fallback while it tries —
// if every candidate fails, the fallback simply stays visible.
function loadTeamLogo(logoEl, name) {
  const candidates = window.MajorData.logoCandidates(name);
  let i = 0;
  const tryNext = () => {
    if (i >= candidates.length) return;
    const slug = candidates[i++];
    const url = `assets/logos/${slug}.png`;
    const img = new Image();
    img.onload = () => {
      logoEl.style.backgroundImage = `url("${url}")`;
      // Drop the initials-fallback background so transparent PNGs show the
      // page color through, not the colored circle behind them.
      logoEl.style.backgroundColor = "transparent";
      logoEl.textContent = "";
    };
    img.onerror = tryNext;
    img.src = url;
  };
  tryNext();
}

// Build a team "chip" (logo + name). team can be null for unknown TBD.
function teamChip(team, options = {}) {
  const { clickable = false, onClick = null, highlight = null } = options;

  const logoEl = el("div", { class: "team-logo" });
  if (team) {
    // Fallback (colored circle + initials) shown immediately; replaced if a
    // candidate logo file loads.
    logoEl.style.backgroundColor = window.MajorData.colorFromName(team.name);
    logoEl.textContent = window.MajorData.teamInitials(team.name);
    loadTeamLogo(logoEl, team.name);
  } else {
    logoEl.textContent = "?";
    logoEl.style.backgroundColor = "#2c3245";
  }

  const nameEl = el("div", { class: "team-name" }, [team ? team.name : ""]);

  const classes = ["team-card"];
  if (!clickable) classes.push("non-clickable");
  if (highlight === "winner") classes.push("winner");
  if (highlight === "loser") classes.push("loser");

  const card = el("div", { class: classes.join(" ") }, [logoEl, nameEl]);
  if (clickable && onClick) {
    card.addEventListener("click", onClick);
  }
  return card;
}

// A small initials/logo circle (used inside zone boxes).
function teamSlot(team) {
  if (!team) {
    return el("div", { class: "empty-slot" }, ["?"]);
  }
  const slot = el("div", { class: "filled-slot", title: team.name });
  slot.style.backgroundColor = window.MajorData.colorFromName(team.name);
  slot.textContent = window.MajorData.teamInitials(team.name);
  loadTeamLogo(slot, team.name);
  return slot;
}

// ---------- Match card ----------

function renderMatchCard(state, match, matchIndex, round) {
  const teamA = match.teamA ? window.MajorSim.teamByName(state, match.teamA) : null;
  const teamB = match.teamB ? window.MajorSim.teamByName(state, match.teamB) : null;

  const winnerName = match.winner;
  const highlightA = winnerName ? (winnerName === match.teamA ? "winner" : "loser") : null;
  const highlightB = winnerName ? (winnerName === match.teamB ? "winner" : "loser") : null;

  const onClickA = teamA ? () => window.MajorApp.handleMatchClick(round, matchIndex, teamA.name) : null;
  const onClickB = teamB ? () => window.MajorApp.handleMatchClick(round, matchIndex, teamB.name) : null;

  const row = el("div", { class: "match-row" }, [
    teamChip(teamA, { clickable: !!teamA, onClick: onClickA, highlight: highlightA }),
    el("span", { class: "match-vs" }, ["vs"]),
    teamChip(teamB, { clickable: !!teamB, onClick: onClickB, highlight: highlightB }),
  ]);

  const fmt = match.format
    || (teamA && teamB ? window.MajorSim.matchFormat(state, teamA, teamB) : "");

  return el("div", { class: "match-card" }, [
    fmt ? el("div", { class: "match-format" }, [fmt]) : null,
    row,
  ]);
}

function renderPlaceholderMatchCard() {
  const row = el("div", { class: "match-row" }, [
    teamChip(null, { clickable: false }),
    el("span", { class: "match-vs" }, ["vs"]),
    teamChip(null, { clickable: false }),
  ]);
  return el("div", { class: "match-card" }, [row]);
}

// ---------- Group rendering ----------

function renderMatchGroup(state, round, record, expectedSize) {
  const matches = state.matchesByRound[round] || [];
  // Find matches whose participants currently sit at this record (pre-match).
  // We rely on the fact that matchups are generated based on pre-round records,
  // which means at the time of generation, both teams in a match share the same
  // record. We snapshot that record by checking: if winner is set, deduce
  // pre-match record by reverting; otherwise both teams' current record == group.
  const groupMatches = matches.filter(m => isMatchInGroup(m, record));

  const children = [
    el("div", { class: "record-group-header" }, [record]),
  ];

  if (groupMatches.length > 0) {
    for (let i = 0; i < groupMatches.length; i++) {
      const m = groupMatches[i];
      const matchIdx = matches.indexOf(m);
      children.push(renderMatchCard(state, m, matchIdx, round));
    }
  } else {
    for (let i = 0; i < expectedSize; i++) {
      children.push(renderPlaceholderMatchCard());
    }
  }

  return el("div", { class: "record-group" }, children);
}

// The group record is stamped on the match at generation time.
function isMatchInGroup(match, record) {
  return match.groupRecord === record;
}

// ---------- Zone rendering ----------

function renderZone(state, kind, records, slotCounts) {
  const isQual = kind === "qualified-zone";
  const cls = "zone " + (isQual ? "zone-qualified" : "zone-eliminated");
  const children = [];

  for (let i = 0; i < records.length; i++) {
    const rec = records[i];
    const count = slotCounts[i];
    children.push(el("div", { class: "zone-header" }, [rec]));

    const teamsAtRecord = state.teams
      .filter(t => `${t.wins}-${t.losses}` === rec)
      .sort((a, b) => a.currentSeed - b.currentSeed);

    const slots = [];
    for (let s = 0; s < count; s++) {
      slots.push(teamSlot(teamsAtRecord[s] || null));
    }
    children.push(el("div", { class: "slot-row" }, slots));
  }

  return el("div", { class: cls }, children);
}

// ---------- Round column ----------

function renderControls(round) {
  const reset = el("button", {
    onClick: () => window.MajorApp.handleRoundReset(round),
  }, ["Reset"]);
  const shuffle = el("button", {
    onClick: () => window.MajorApp.handleRoundShuffle(round),
    title: "Random winners",
  }, [el("span", { class: "shuffle-icon" }, ["⇄"])]);
  const higher = el("button", {
    onClick: () => window.MajorApp.handleRoundHigherSeed(round),
  }, ["Higher seed"]);
  return el("div", { class: "column-controls" }, [reset, shuffle, higher]);
}

function renderRoundColumn(state, round) {
  const layout = ROUND_LAYOUT[round];
  const children = [renderControls(round)];

  for (const item of layout) {
    if (item.kind === "matches") {
      children.push(renderMatchGroup(state, round, item.record, item.size));
    } else {
      children.push(renderZone(state, item.kind, item.records, item.slotCounts));
    }
  }

  return el("div", { class: "bracket-column", dataset: { round } }, children);
}

// ---------- Top-level bracket render ----------

function renderBracket(state) {
  const root = document.getElementById("bracket-view");
  root.innerHTML = "";
  for (let r = 1; r <= 5; r++) {
    root.appendChild(renderRoundColumn(state, r));
  }
}

// ---------- Statistics rendering ----------

function renderStats(stats, runs) {
  const body = document.getElementById("stats-body");
  body.innerHTML = "";

  if (!stats || runs === 0) {
    body.innerHTML = '<p class="stats-empty">Run a simulation first.</p>';
    return;
  }

  const sorted = Object.values(stats).sort(
    (a, b) => (b.qualified / b.runs) - (a.qualified / a.runs)
  );

  const grid = el("div", { class: "stats-grid" });
  for (const s of sorted) {
    const qualPct = ((s.qualified / s.runs) * 100).toFixed(1);

    const logo = el("div", { class: "team-logo" });
    logo.style.backgroundColor = window.MajorData.colorFromName(s.name);
    logo.textContent = window.MajorData.teamInitials(s.name);
    loadTeamLogo(logo, s.name);

    let recordCls = "start-record";
    if (s.startStatus === "qualified") recordCls += " qual";
    else if (s.startStatus === "eliminated") recordCls += " elim";

    const header = el("div", { class: "stat-card-header" }, [
      logo,
      el("div", { class: "team-name" }, [s.name]),
      el("div", { class: recordCls }, [s.startRecord]),
      el("div", { class: "qual-rate" }, [`${qualPct}%`]),
    ]);

    const recRows = [];
    for (const rec of ["3-0", "3-1", "3-2", "2-3", "1-3", "0-3"]) {
      const pct = ((s.records[rec] / s.runs) * 100).toFixed(1);
      const cls = ["3-0", "3-1", "3-2"].includes(rec) ? "qual" : "elim";
      recRows.push(
        el("div", { class: cls }, [
          el("span", {}, [rec]),
          el("span", {}, [`${pct}%`]),
        ])
      );
    }
    const breakdown = el("div", { class: "record-breakdown" }, recRows);

    const oppLines = [];
    for (const [roundStr, oppMap] of Object.entries(s.opponentsByRound)) {
      const total = Object.values(oppMap).reduce((a, b) => a + b, 0);
      const top3 = Object.entries(oppMap)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([n, c]) => `${n} ${((c / total) * 100).toFixed(0)}%`)
        .join(" · ");
      oppLines.push(
        el("div", { class: "opp-line" }, [
          el("strong", {}, [`R${roundStr} opponents:`]),
          " ",
          top3,
        ])
      );
    }

    grid.appendChild(el("div", { class: "stat-card" }, [
      header, breakdown, ...oppLines,
    ]));
  }

  body.appendChild(grid);
}

// ---------- Stage tabs ----------

function renderStageTabs(currentStage, unlockedStages) {
  const tabs = document.querySelectorAll("#stage-tabs .stage-tab");
  tabs.forEach(tab => {
    const stage = tab.dataset.stage;
    tab.classList.remove("active", "locked");
    if (stage == currentStage) tab.classList.add("active");
    if (!unlockedStages.includes(stage)) tab.classList.add("locked");
  });
}

function showWarningBanner(show) {
  document.getElementById("warning-banner").classList.toggle("hidden", !show);
}

function setSimStatus(text) {
  document.getElementById("sim-status").textContent = text || "";
}

// ---------- Playoffs (stub) ----------

function renderPlayoffs(state) {
  const root = document.getElementById("playoffs-bracket");
  root.innerHTML = "";
  if (!state) {
    root.appendChild(el("p", {}, ["Complete Stage 3 to unlock playoffs."]));
    return;
  }
  const rounds = [
    { name: "Quarterfinals", count: 4, format: "BO3" },
    { name: "Semifinals",    count: 2, format: "BO3" },
    { name: "Grand Final",   count: 1, format: "BO5" },
  ];

  for (let r = 0; r < rounds.length; r++) {
    const col = el("div", { class: "playoffs-round" }, [
      el("h3", {}, [rounds[r].name]),
    ]);
    const matches = state.matchesByRound?.[r + 1] || [];
    for (let i = 0; i < rounds[r].count; i++) {
      const m = matches[i] || { teamA: null, teamB: null, winner: null, format: rounds[r].format };
      const teamA = m.teamA ? { name: m.teamA } : null;
      const teamB = m.teamB ? { name: m.teamB } : null;
      const highlightA = m.winner ? (m.winner === m.teamA ? "winner" : "loser") : null;
      const highlightB = m.winner ? (m.winner === m.teamB ? "winner" : "loser") : null;

      const row = el("div", { class: "match-row" }, [
        teamChip(teamA, {
          clickable: !!teamA,
          highlight: highlightA,
          onClick: teamA ? () => window.MajorApp.handlePlayoffsClick(r + 1, i, m.teamA) : null,
        }),
        el("span", { class: "match-vs" }, ["vs"]),
        teamChip(teamB, {
          clickable: !!teamB,
          highlight: highlightB,
          onClick: teamB ? () => window.MajorApp.handlePlayoffsClick(r + 1, i, m.teamB) : null,
        }),
      ]);
      col.appendChild(el("div", { class: "match-card" }, [
        el("div", { class: "match-format" }, [rounds[r].format]),
        row,
      ]));
    }
    root.appendChild(col);
  }

  // Final results panel — appears only once the grand final has a winner.
  const finalMatch = state.matchesByRound?.[3]?.[0];
  if (finalMatch && finalMatch.winner) {
    const champion = finalMatch.winner;
    const runnerUp = finalMatch.teamA === champion ? finalMatch.teamB : finalMatch.teamA;
    root.appendChild(renderFinalResults(champion, runnerUp));
  }
}

function renderResultCard(label, teamName, kind) {
  const logoEl = el("div", { class: "result-logo team-logo" });
  logoEl.style.backgroundColor = window.MajorData.colorFromName(teamName);
  logoEl.textContent = window.MajorData.teamInitials(teamName);
  loadTeamLogo(logoEl, teamName);

  return el("div", { class: `result-card ${kind}` }, [
    el("div", { class: "result-label" }, [label]),
    logoEl,
    el("div", { class: "result-name" }, [teamName]),
  ]);
}

function renderFinalResults(champion, runnerUp) {
  return el("div", { class: "playoffs-results" }, [
    el("h3", { class: "results-header" }, ["FINAL RESULTS"]),
    renderResultCard("CHAMPION", champion, "champion"),
    renderResultCard("RUNNER-UP", runnerUp, "runner-up"),
  ]);
}

window.MajorUI = {
  renderBracket,
  renderStats,
  renderStageTabs,
  showWarningBanner,
  setSimStatus,
  renderPlayoffs,
};
