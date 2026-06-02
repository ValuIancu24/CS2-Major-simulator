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
  if (highlight === "predicted") classes.push("predicted");
  if (highlight === "wrong") classes.push("wrong");

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

// ---------- Render context ----------
//
// Both the Simulator and Predictions pages reuse this rendering layer. The
// context object decides which controller receives clicks and whether match
// cards render in plain "simulate" mode or "predict" mode (with predicted /
// confirmed / denied highlighting + Correct/Wrong buttons). Omitting ctx
// reproduces the original Simulator behavior exactly.
function normCtx(ctx) {
  return {
    controller: (ctx && ctx.controller) || window.MajorApp,
    mode: (ctx && ctx.mode) || "simulate",
    rootId: (ctx && ctx.rootId) || "bracket-view",
    playoffsRootId: (ctx && ctx.playoffsRootId) || "playoffs-bracket",
  };
}

// ---------- Match card ----------

function renderMatchCard(state, match, matchIndex, round, ctx) {
  const c = normCtx(ctx);
  const teamA = match.teamA ? window.MajorSim.teamByName(state, match.teamA) : null;
  const teamB = match.teamB ? window.MajorSim.teamByName(state, match.teamB) : null;

  const fmt = match.format
    || (teamA && teamB ? window.MajorSim.matchFormat(state, teamA, teamB) : "");

  if (c.mode === "predict") {
    return renderPredictionMatchCard(state, match, matchIndex, round, c, teamA, teamB, fmt);
  }

  const winnerName = match.winner;
  const highlightA = winnerName ? (winnerName === match.teamA ? "winner" : "loser") : null;
  const highlightB = winnerName ? (winnerName === match.teamB ? "winner" : "loser") : null;

  const onClickA = teamA ? () => c.controller.handleMatchClick(round, matchIndex, teamA.name) : null;
  const onClickB = teamB ? () => c.controller.handleMatchClick(round, matchIndex, teamB.name) : null;

  const row = el("div", { class: "match-row" }, [
    teamChip(teamA, { clickable: !!teamA, onClick: onClickA, highlight: highlightA }),
    el("span", { class: "match-vs" }, ["vs"]),
    teamChip(teamB, { clickable: !!teamB, onClick: onClickB, highlight: highlightB }),
  ]);

  return el("div", { class: "match-card" }, [
    fmt ? el("div", { class: "match-format" }, [fmt]) : null,
    row,
  ]);
}

// Predict-mode match card: highlights the predicted pick and exposes
// Correct/Wrong buttons once a pick is made.
//   - pending  : predicted team gets the blue "predicted" highlight.
//   - confirmed: predicted team = winner (green), "+3" badge.
//   - denied   : the real winner (opponent) = winner (green), predicted team
//                shown as a wrong pick (red).
function renderPredictionMatchCard(state, match, matchIndex, round, c, teamA, teamB, fmt) {
  const predicted = match.predicted || null;
  const resolved = match.resolved || null;
  const winner = match.winner || null; // effective winner used by the engine

  const highlightFor = (name) => {
    if (!name || !predicted) return null;
    if (resolved === "confirmed") return name === predicted ? "winner" : "loser";
    if (resolved === "denied") {
      if (name === winner) return "winner";          // reality advanced this team
      if (name === predicted) return "wrong";        // our pick lost
      return "loser";
    }
    // pending
    return name === predicted ? "predicted" : null;
  };

  const onClickA = teamA ? () => c.controller.handleMatchClick(round, matchIndex, teamA.name) : null;
  const onClickB = teamB ? () => c.controller.handleMatchClick(round, matchIndex, teamB.name) : null;

  const row = el("div", { class: "match-row" }, [
    teamChip(teamA, { clickable: !!teamA, onClick: onClickA, highlight: highlightFor(match.teamA) }),
    el("span", { class: "match-vs" }, ["vs"]),
    teamChip(teamB, { clickable: !!teamB, onClick: onClickB, highlight: highlightFor(match.teamB) }),
  ]);

  const cardClasses = ["match-card", "predict"];
  if (resolved) cardClasses.push("resolved-" + resolved);

  const children = [
    fmt ? el("div", { class: "match-format" }, [fmt]) : null,
    row,
  ];

  // Action footer — only meaningful once the user has predicted a winner.
  if (predicted) {
    children.push(renderPredictionActions(round, matchIndex, c, resolved));
  }

  return el("div", { class: cardClasses.join(" ") }, children);
}

function renderPredictionActions(round, matchIndex, c, resolved) {
  if (resolved === "confirmed") {
    return el("div", { class: "pred-actions" }, [
      el("span", { class: "pred-result correct" }, ["✓ Correct +3"]),
      el("button", {
        class: "pred-undo",
        title: "Undo — reopen this prediction",
        onClick: () => c.controller.handleReopen(round, matchIndex),
      }, ["Undo"]),
    ]);
  }
  if (resolved === "denied") {
    return el("div", { class: "pred-actions" }, [
      el("span", { class: "pred-result wrong" }, ["✗ Wrong +0"]),
      el("button", {
        class: "pred-undo",
        title: "Undo — reopen this prediction",
        onClick: () => c.controller.handleReopen(round, matchIndex),
      }, ["Undo"]),
    ]);
  }
  // Pending: offer Correct / Wrong.
  return el("div", { class: "pred-actions" }, [
    el("button", {
      class: "pred-btn pred-correct",
      onClick: () => c.controller.handleConfirm(round, matchIndex),
    }, ["✓ Correct"]),
    el("button", {
      class: "pred-btn pred-wrong",
      onClick: () => c.controller.handleDeny(round, matchIndex),
    }, ["✗ Wrong"]),
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

function renderMatchGroup(state, round, record, expectedSize, ctx) {
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
      children.push(renderMatchCard(state, m, matchIdx, round, ctx));
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

function renderControls(round, ctx) {
  const c = normCtx(ctx);
  const reset = el("button", {
    onClick: () => c.controller.handleRoundReset(round),
  }, ["Reset"]);
  const shuffle = el("button", {
    onClick: () => c.controller.handleRoundShuffle(round),
    title: "Random winners",
  }, [el("span", { class: "shuffle-icon" }, ["⇄"])]);
  const higher = el("button", {
    onClick: () => c.controller.handleRoundHigherSeed(round),
  }, ["Higher seed"]);
  return el("div", { class: "column-controls" }, [reset, shuffle, higher]);
}

function renderRoundColumn(state, round, ctx) {
  const layout = ROUND_LAYOUT[round];
  const children = [renderControls(round, ctx)];

  for (const item of layout) {
    if (item.kind === "matches") {
      children.push(renderMatchGroup(state, round, item.record, item.size, ctx));
    } else {
      children.push(renderZone(state, item.kind, item.records, item.slotCounts));
    }
  }

  return el("div", { class: "bracket-column", dataset: { round } }, children);
}

// ---------- Top-level bracket render ----------

function renderBracket(state, ctx) {
  const c = normCtx(ctx);
  const root = document.getElementById(c.rootId);
  root.innerHTML = "";
  for (let r = 1; r <= 5; r++) {
    root.appendChild(renderRoundColumn(state, r, c));
  }
}

// ---------- Statistics rendering ----------

function renderStats(stats, runs, pickemPanel = null) {
  const body = document.getElementById("stats-body");
  body.innerHTML = "";

  if (pickemPanel) body.appendChild(pickemPanel);

  if (!stats || runs === 0) {
    if (!pickemPanel) {
      body.innerHTML = '<p class="stats-empty">Run a simulation first.</p>';
    } else {
      body.appendChild(el("p", { class: "stats-empty" }, ["Run a simulation first to see per-team breakdown."]));
    }
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

// One playoff match card. In predict mode it carries the same predicted /
// confirmed / denied highlighting and Correct/Wrong buttons as the Swiss cards.
function renderPlayoffMatchCard(m, round, matchIndex, format, c) {
  const teamA = m.teamA ? { name: m.teamA } : null;
  const teamB = m.teamB ? { name: m.teamB } : null;

  if (c.mode === "predict") {
    const predicted = m.predicted || null;
    const resolved = m.resolved || null;
    const winner = m.winner || null;

    const highlightFor = (name) => {
      if (!name || !predicted) return null;
      if (resolved === "confirmed") return name === predicted ? "winner" : "loser";
      if (resolved === "denied") {
        if (name === winner) return "winner";
        if (name === predicted) return "wrong";
        return "loser";
      }
      return name === predicted ? "predicted" : null;
    };

    const row = el("div", { class: "match-row" }, [
      teamChip(teamA, {
        clickable: !!teamA,
        highlight: highlightFor(m.teamA),
        onClick: teamA ? () => c.controller.handlePlayoffsClick(round, matchIndex, m.teamA) : null,
      }),
      el("span", { class: "match-vs" }, ["vs"]),
      teamChip(teamB, {
        clickable: !!teamB,
        highlight: highlightFor(m.teamB),
        onClick: teamB ? () => c.controller.handlePlayoffsClick(round, matchIndex, m.teamB) : null,
      }),
    ]);

    const cardClasses = ["match-card", "predict"];
    if (resolved) cardClasses.push("resolved-" + resolved);
    const children = [el("div", { class: "match-format" }, [format]), row];
    if (predicted) {
      children.push(renderPlayoffPredictionActions(round, matchIndex, c, resolved));
    }
    return el("div", { class: cardClasses.join(" ") }, children);
  }

  const highlightA = m.winner ? (m.winner === m.teamA ? "winner" : "loser") : null;
  const highlightB = m.winner ? (m.winner === m.teamB ? "winner" : "loser") : null;
  const row = el("div", { class: "match-row" }, [
    teamChip(teamA, {
      clickable: !!teamA,
      highlight: highlightA,
      onClick: teamA ? () => c.controller.handlePlayoffsClick(round, matchIndex, m.teamA) : null,
    }),
    el("span", { class: "match-vs" }, ["vs"]),
    teamChip(teamB, {
      clickable: !!teamB,
      highlight: highlightB,
      onClick: teamB ? () => c.controller.handlePlayoffsClick(round, matchIndex, m.teamB) : null,
    }),
  ]);
  return el("div", { class: "match-card" }, [
    el("div", { class: "match-format" }, [format]),
    row,
  ]);
}

// Mirrors renderPredictionActions but targets the playoff controller hooks.
function renderPlayoffPredictionActions(round, matchIndex, c, resolved) {
  if (resolved === "confirmed" || resolved === "denied") {
    const correct = resolved === "confirmed";
    return el("div", { class: "pred-actions" }, [
      el("span", { class: "pred-result " + (correct ? "correct" : "wrong") },
        [correct ? "✓ Correct +3" : "✗ Wrong +0"]),
      el("button", {
        class: "pred-undo",
        title: "Undo — reopen this prediction",
        onClick: () => c.controller.handlePlayoffsReopen(round, matchIndex),
      }, ["Undo"]),
    ]);
  }
  return el("div", { class: "pred-actions" }, [
    el("button", {
      class: "pred-btn pred-correct",
      onClick: () => c.controller.handlePlayoffsConfirm(round, matchIndex),
    }, ["✓ Correct"]),
    el("button", {
      class: "pred-btn pred-wrong",
      onClick: () => c.controller.handlePlayoffsDeny(round, matchIndex),
    }, ["✗ Wrong"]),
  ]);
}

function renderPlayoffs(state, ctx) {
  const c = normCtx(ctx);
  const root = document.getElementById(c.playoffsRootId);
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
      col.appendChild(renderPlayoffMatchCard(m, r + 1, i, rounds[r].format, c));
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

// ---------- Pickems modal ----------

const PICKEM_CATS = [
  { key: "threeZero", label: "3-0",       limit: 2, cls: "pickem-3-0" },
  { key: "qualify",   label: "3-1 / 3-2", limit: 6, cls: "pickem-qual" },
  { key: "zeroThree", label: "0-3",       limit: 2, cls: "pickem-0-3" },
];

function renderPickemsModal(stageNum, stageState, pickems) {
  const title = document.getElementById("pickems-title");
  const body = document.getElementById("pickems-body");
  title.textContent = `Pickems — Stage ${stageNum}`;
  body.innerHTML = "";

  if (!stageState || !stageState.teams) {
    body.appendChild(el("p", { class: "stats-empty" }, ["Stage not available yet."]));
    return;
  }

  // Header toolbar.
  const headerRow = el("div", { class: "pickem-header-row" }, [
    el("span", { class: "pickem-instructions" }, [
      "Drag teams from the pool into a colored zone. Drop on a filled slot to swap. Drop back in the pool to remove.",
    ]),
    el("button", {
      class: "btn-clear-pickems",
      onClick: () => window.MajorApp.handleClearPickems(stageNum),
    }, ["Clear all"]),
  ]);
  body.appendChild(headerRow);

  // ---------- Zones: visual destinations ----------
  const zones = el("div", { class: "pickem-zones" });
  for (const cat of PICKEM_CATS) {
    const slotsEl = el("div", { class: "pickem-zone-slots" });
    for (let i = 0; i < cat.limit; i++) {
      const teamName = pickems[cat.key][i];
      slotsEl.appendChild(
        teamName
          ? buildFilledSlot(stageNum, cat, i, teamName)
          : buildEmptySlot(stageNum, cat, i)
      );
    }
    const filled = pickems[cat.key].length;
    zones.appendChild(el("div", { class: `pickem-zone ${cat.cls}` }, [
      el("div", { class: "pickem-zone-header" }, [
        el("span", { class: "pickem-zone-label" }, [cat.label]),
        el("span", { class: "pickem-zone-count" }, [`${filled}/${cat.limit}`]),
      ]),
      slotsEl,
    ]));
  }
  body.appendChild(zones);

  // ---------- Pool: compact grid; drop here to unassign ----------
  const teams = stageState.teams.slice().sort((a, b) => a.initialSeed - b.initialSeed);
  const pool = el("div", { class: "pickem-pool" });
  for (const team of teams) {
    const isAssigned = currentCategoryFor(pickems, team.name) !== "none";
    pool.appendChild(buildPoolChip(team, isAssigned));
  }
  attachPoolDrop(pool, stageNum);
  body.appendChild(pool);
}

// ---------- Pickem sub-builders ----------

function buildFilledSlot(stageNum, cat, slotIdx, teamName) {
  const slot = el("div", {
    class: "pickem-slot filled",
    title: `${teamName} — drag to move or remove`,
  });
  slot.style.backgroundColor = window.MajorData.colorFromName(teamName);
  slot.textContent = window.MajorData.teamInitials(teamName);
  loadTeamLogo(slot, teamName);
  attachDrag(slot, teamName);
  attachSlotDrop(slot, stageNum, cat.key, slotIdx);
  return slot;
}

function buildEmptySlot(stageNum, cat, slotIdx) {
  const slot = el("div", { class: "pickem-slot empty" });
  attachSlotDrop(slot, stageNum, cat.key, slotIdx);
  return slot;
}

function buildPoolChip(team, isAssigned) {
  const chip = el("div", {
    class: "pickem-chip" + (isAssigned ? " assigned" : ""),
  });
  const logoEl = el("div", { class: "pickem-chip-logo team-logo" });
  if (isAssigned) {
    // Team is placed in a zone — show empty placeholder dot here.
    logoEl.classList.add("placeholder");
  } else {
    logoEl.style.backgroundColor = window.MajorData.colorFromName(team.name);
    logoEl.textContent = window.MajorData.teamInitials(team.name);
    loadTeamLogo(logoEl, team.name);
    attachDrag(chip, team.name);
  }
  chip.appendChild(logoEl);
  chip.appendChild(el("div", { class: "pickem-chip-name", title: team.name }, [team.name]));
  return chip;
}

// ---------- Drag & drop wiring ----------

function attachDrag(node, teamName) {
  node.draggable = true;
  node.classList.add("draggable");
  node.addEventListener("dragstart", (e) => {
    e.dataTransfer.setData("text/plain", teamName);
    e.dataTransfer.effectAllowed = "move";
    node.classList.add("dragging");
  });
  node.addEventListener("dragend", () => {
    node.classList.remove("dragging");
  });
}

function attachSlotDrop(slot, stageNum, categoryKey, slotIdx) {
  slot.addEventListener("dragover", (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    slot.classList.add("drag-over");
  });
  slot.addEventListener("dragleave", () => {
    slot.classList.remove("drag-over");
  });
  slot.addEventListener("drop", (e) => {
    e.preventDefault();
    e.stopPropagation(); // don't bubble up to pool's drop handler
    slot.classList.remove("drag-over");
    const teamName = e.dataTransfer.getData("text/plain");
    if (teamName) {
      window.MajorApp.handleDropOnPickemSlot(stageNum, teamName, categoryKey, slotIdx);
    }
  });
}

function attachPoolDrop(pool, stageNum) {
  pool.addEventListener("dragover", (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    pool.classList.add("drag-over");
  });
  pool.addEventListener("dragleave", (e) => {
    if (!pool.contains(e.relatedTarget)) pool.classList.remove("drag-over");
  });
  pool.addEventListener("drop", (e) => {
    e.preventDefault();
    pool.classList.remove("drag-over");
    const teamName = e.dataTransfer.getData("text/plain");
    if (teamName) {
      window.MajorApp.handleDropOnPickemPool(stageNum, teamName);
    }
  });
}

function currentCategoryFor(pickems, teamName) {
  if (pickems.threeZero.includes(teamName)) return "threeZero";
  if (pickems.qualify.includes(teamName)) return "qualify";
  if (pickems.zeroThree.includes(teamName)) return "zeroThree";
  return "none";
}

// ---------- Pickem stats panel (rendered inside Stats modal) ----------

function renderPickemStatsPanel(pickems, pickemStats, stageNum) {
  if (!pickems) return null;
  const totalPicks = pickems.threeZero.length + pickems.qualify.length + pickems.zeroThree.length;

  const viewBtn = el("button", {
    class: "btn-view-pickems",
    onClick: () => window.MajorApp.openPickemsFromStats(stageNum),
  }, ["View Pickems"]);

  const header = el("div", { class: "pickem-panel-header" }, [
    el("h3", {}, [`Pickems — Stage ${stageNum} (${totalPicks}/10 picked)`]),
    viewBtn,
  ]);

  // Only show stats once the user has committed all 10 picks. Until then
  // partial-pickem accuracy isn't meaningful (max possible score is lower).
  if (totalPicks < 10) {
    return el("div", { class: "pickem-panel empty" }, [
      header,
      el("p", { class: "stats-empty" }, [
        `Complete your pickems first — ${totalPicks}/10 set. ` +
        "You need 2 picks for 3-0, 6 for 3-1 / 3-2, and 2 for 0-3.",
      ]),
    ]);
  }

  if (!pickemStats || pickemStats.runs === 0) {
    return el("div", { class: "pickem-panel" }, [
      header,
      el("p", { class: "stats-empty" }, ["Run a simulation to compute pickem accuracy."]),
    ]);
  }

  const expectedStr = pickemStats.expected.toFixed(2);
  const pGte5Str = (pickemStats.pGte5 * 100).toFixed(1) + "%";
  const pPerfectStr = (pickemStats.pPerfect * 100).toFixed(1) + "%";

  return el("div", { class: "pickem-panel" }, [
    header,
    el("div", { class: "pickem-metrics" }, [
      pickemMetric("Average Correct Picks", `${expectedStr} / 10`),
      pickemMetric("Success Chances (≥5)", pGte5Str, "highlight"),
      pickemMetric("Perfect Pickem Chances", pPerfectStr),
    ]),
  ]);
}

function pickemMetric(label, value, extraCls = "") {
  return el("div", { class: `pickem-metric ${extraCls}` }, [
    el("div", { class: "pickem-metric-label" }, [label]),
    el("div", { class: "pickem-metric-value" }, [value]),
  ]);
}

window.MajorUI = {
  renderBracket,
  renderStats,
  renderStageTabs,
  showWarningBanner,
  setSimStatus,
  renderPlayoffs,
  renderPickemsModal,
  renderPickemStatsPanel,
};
