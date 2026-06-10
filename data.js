// Team data for all three stages of IEM Cologne 2026 Major.
// Stage 1 is fully populated; Stage 2 and Stage 3 have direct invites only
// (seeds 9-16 are filled in after the previous stage completes).

const STAGE1_TEAMS = [
  { seed: 1,  name: "GamerLegion",      rating: 259 },
  { seed: 2,  name: "B8",               rating: 179 },
  { seed: 3,  name: "Heroic",           rating: 66  },
  { seed: 4,  name: "BetBoom",          rating: 145 },
  { seed: 5,  name: "BIG",              rating: 64  },
  { seed: 6,  name: "M80",              rating: 83  },
  { seed: 7,  name: "MIBR",             rating: 124 },
  { seed: 8,  name: "SINNERS",          rating: 49  },
  { seed: 9,  name: "NRG",              rating: 54  },
  { seed: 10, name: "TYLOO",            rating: 91  },
  { seed: 11, name: "SHARKS",           rating: 47  },
  { seed: 12, name: "GaiminGladiators", rating: 7  },
  { seed: 13, name: "Liquid",           rating: 83  },
  { seed: 14, name: "LynnVision",       rating: 56  },
  { seed: 15, name: "ThunderDownunder", rating: 23  },
  { seed: 16, name: "FlyQuest",         rating: 45  },
];

const STAGE2_DIRECT_INVITES = [
  { seed: 1, name: "FUT",      rating: 190 },
  { seed: 2, name: "Spirit",   rating: 544 },
  { seed: 3, name: "Astralis", rating: 214 },
  { seed: 4, name: "G2",       rating: 206 },
  { seed: 5, name: "Legacy",   rating: 297 },
  { seed: 6, name: "Pain",     rating: 128 },
  { seed: 7, name: "Monte",    rating: 95 },
  { seed: 8, name: "9Z",       rating: 123 },
];

const STAGE3_DIRECT_INVITES = [
  { seed: 1, name: "Vitality",   rating: 991 },
  { seed: 2, name: "NaVi",       rating: 712  },
  { seed: 3, name: "Falcons",    rating: 509  },
  { seed: 4, name: "Mongolz",    rating: 260  },
  { seed: 5, name: "Parivision", rating: 259  },
  { seed: 6, name: "Aurora",     rating: 354  },
  { seed: 7, name: "Furia",      rating: 393  },
  { seed: 8, name: "Mouz",       rating: 301  },
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
