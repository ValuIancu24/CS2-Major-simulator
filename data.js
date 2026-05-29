// Team data for all three stages of IEM Cologne 2026 Major.
// Stage 1 is fully populated; Stage 2 and Stage 3 have direct invites only
// (seeds 9-16 are filled in after the previous stage completes).

const STAGE1_TEAMS = [
  { seed: 1,  name: "GamerLegion",      rating: 258 },
  { seed: 2,  name: "B8",               rating: 171 },
  { seed: 3,  name: "Heroic",           rating: 77  },
  { seed: 4,  name: "BetBoom",          rating: 136 },
  { seed: 5,  name: "BIG",              rating: 42  },
  { seed: 6,  name: "M80",              rating: 89  },
  { seed: 7,  name: "MIBR",             rating: 126 },
  { seed: 8,  name: "SINNERS",          rating: 51  },
  { seed: 9,  name: "NRG",              rating: 49  },
  { seed: 10, name: "TYLOO",            rating: 63  },
  { seed: 11, name: "SHARKS",           rating: 22  },
  { seed: 12, name: "GaiminGladiators", rating: 19  },
  { seed: 13, name: "Liquid",           rating: 75  },
  { seed: 14, name: "LynnVision",       rating: 51  },
  { seed: 15, name: "ThunderDownunder", rating: 15  },
  { seed: 16, name: "FlyQuest",         rating: 21  },
];

const STAGE2_DIRECT_INVITES = [
  { seed: 1, name: "FUT",      rating: 222 },
  { seed: 2, name: "Spirit",   rating: 517 },
  { seed: 3, name: "Astralis", rating: 251 },
  { seed: 4, name: "G2",       rating: 223 },
  { seed: 5, name: "Legacy",   rating: 296 },
  { seed: 6, name: "Pain",     rating: 133 },
  { seed: 7, name: "Monte",    rating: 100 },
  { seed: 8, name: "9Z",       rating: 122 },
];

const STAGE3_DIRECT_INVITES = [
  { seed: 1, name: "Vitality", rating: 1000 },
  { seed: 2, name: "NaVi",     rating: 709  },
  { seed: 3, name: "Falcons",  rating: 508  },
  { seed: 4, name: "MGLZ",     rating: 298  },
  { seed: 5, name: "PARI",     rating: 260  },
  { seed: 6, name: "Aurora",   rating: 346  },
  { seed: 7, name: "Furia",    rating: 398  },
  { seed: 8, name: "Mouz",     rating: 302  },
];

// Map team name -> logo filename slug used in assets/logos/<slug>.png
function logoSlug(name) {
  return name.toLowerCase().replace(/\s+/g, "");
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
  logoSlug,
  colorFromName,
  teamInitials,
};
