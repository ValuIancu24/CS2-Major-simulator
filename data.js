// Team data for all three stages of IEM Cologne 2026 Major.
// Stage 1 is fully populated; Stage 2 and Stage 3 have direct invites only
// (seeds 9-16 are filled in after the previous stage completes).

const STAGE1_TEAMS = [
  { seed: 1,  name: "GamerLegion",      rating: 265 },
  { seed: 2,  name: "B8",               rating: 154 },
  { seed: 3,  name: "Heroic",           rating: 65  },
  { seed: 4,  name: "BetBoom",          rating: 110 },
  { seed: 5,  name: "BIG",              rating: 32  },
  { seed: 6,  name: "M80",              rating: 57  },
  { seed: 7,  name: "MIBR",             rating: 114 },
  { seed: 8,  name: "SINNERS",          rating: 52  },
  { seed: 9,  name: "NRG",              rating: 45  },
  { seed: 10, name: "TYLOO",            rating: 52  },
  { seed: 11, name: "SHARKS",           rating: 44  },
  { seed: 12, name: "GaiminGladiators", rating: 6  },
  { seed: 13, name: "Liquid",           rating: 75  },
  { seed: 14, name: "LynnVision",       rating: 51  },
  { seed: 15, name: "ThunderDownunder", rating: 14  },
  { seed: 16, name: "FlyQuest",         rating: 12  },
];

const STAGE2_DIRECT_INVITES = [
  { seed: 1, name: "FUT",      rating: 205 },
  { seed: 2, name: "Spirit",   rating: 517 },
  { seed: 3, name: "Astralis", rating: 226 },
  { seed: 4, name: "G2",       rating: 205 },
  { seed: 5, name: "Legacy",   rating: 311 },
  { seed: 6, name: "Pain",     rating: 119 },
  { seed: 7, name: "Monte",    rating: 87 },
  { seed: 8, name: "9Z",       rating: 112 },
];

const STAGE3_DIRECT_INVITES = [
  { seed: 1, name: "Vitality",   rating: 1000 },
  { seed: 2, name: "NaVi",       rating: 711  },
  { seed: 3, name: "Falcons",    rating: 509  },
  { seed: 4, name: "Mongolz",    rating: 288  },
  { seed: 5, name: "Parivision", rating: 249  },
  { seed: 6, name: "Aurora",     rating: 353  },
  { seed: 7, name: "Furia",      rating: 396  },
  { seed: 8, name: "Mouz",       rating: 302  },
];

// Map team name -> ordered list of candidate filenames to try in
// assets/logos/<slug>.png. The loader tries them in order until one loads.
// We accept several spellings so users can name files naturally
// (e.g. gaimin_gladiators.png, lynn_vision.png, or the squished form).
const LOGO_OVERRIDES = {
  // Real-world rebrandings: data.js uses the spec name, the world uses the
  // current org name on the logo file.
  "pari": "parivision",
  "mglz": "mongolz",
};

function logoCandidates(name) {
  const lower = name.toLowerCase();
  const noSpace = lower.replace(/\s+/g, "");
  const underscore = lower.replace(/\s+/g, "_");
  const dash = lower.replace(/\s+/g, "-");
  // Split camelCase: "GaiminGladiators" -> "gaimin_gladiators"
  const camelSplit = name.replace(/([a-z])([A-Z])/g, "$1_$2").toLowerCase();

  const list = [];
  if (LOGO_OVERRIDES[noSpace]) list.push(LOGO_OVERRIDES[noSpace]);
  list.push(noSpace, underscore, dash);
  list.push(camelSplit.replace(/\s+/g, "_"));
  list.push(camelSplit.replace(/\s+/g, "-"));
  list.push(camelSplit.replace(/\s+/g, ""));
  // Dedupe preserving order
  return [...new Set(list)];
}

// Stable color generator for the initials-fallback circle.
function colorFromName(name) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) | 0;
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 55%, 45%)`;
}

function teamInitials(name) {
  const stripped = name.replace(/[^A-Za-z0-9]/g, "");
  if (stripped.length <= 2) return stripped.toUpperCase();
  return stripped.slice(0, 2).toUpperCase();
}

window.MajorData = {
  STAGE1_TEAMS,
  STAGE2_DIRECT_INVITES,
  STAGE3_DIRECT_INVITES,
  logoCandidates,
  colorFromName,
  teamInitials,
};
