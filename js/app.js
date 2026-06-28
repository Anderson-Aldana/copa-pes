// Copa PES - State Management and Tournament Logic
// Pure Vanilla JavaScript

const TEAMS_DATABASE = [
  { name: "Argentina", code: "ar" },
  { name: "Brasil", code: "br" },
  { name: "Francia", code: "fr" },
  { name: "Alemania", code: "de" },
  { name: "España", code: "es" },
  { name: "Inglaterra", code: "gb" },
  { name: "Italia", code: "it" },
  { name: "Portugal", code: "pt" },
  { name: "Países Bajos", code: "nl" },
  { name: "Bélgica", code: "be" },
  { name: "Croacia", code: "hr" },
  { name: "Uruguay", code: "uy" },
  { name: "Colombia", code: "co" },
  { name: "Senegal", code: "sn" },
  { name: "Marruecos", code: "ma" },
  { name: "Japón", code: "jp" },
  { name: "EE. UU.", code: "us" },
  { name: "México", code: "mx" },
  { name: "Suiza", code: "ch" },
  { name: "Dinamarca", code: "dk" },
  { name: "Suecia", code: "se" },
  { name: "Polonia", code: "pl" },
  { name: "Ucrania", code: "ua" },
  { name: "Chile", code: "cl" },
  { name: "Ecuador", code: "ec" },
  { name: "Perú", code: "pe" },
  { name: "Canadá", code: "ca" },
  { name: "Corea del Sur", code: "kr" },
  { name: "Australia", code: "au" },
  { name: "Arabia Saudita", code: "sa" },
  { name: "Camerún", code: "cm" },
  { name: "Ghana", code: "gh" }
];

const DEFAULT_STATE = {
  players: [],
  groups: [],
  bracket: {
    r16: [],
    qf: [],
    sf: [],
    final: []
  },
  currentPhase: "sorteo", // "sorteo", "grupos_sorteo", "grupos_juego", "fase_final", "campeon"
  activeMatch: null, // For big screen
  champion: null
};

// Core LocalStorage functions
function loadState() {
  try {
    const raw = localStorage.getItem("copa_pes_state");
    if (!raw) return JSON.parse(JSON.stringify(DEFAULT_STATE));
    return JSON.parse(raw);
  } catch (e) {
    console.error("Error loading state from localStorage", e);
    return JSON.parse(JSON.stringify(DEFAULT_STATE));
  }
}

function saveState(state) {
  try {
    localStorage.setItem("copa_pes_state", JSON.stringify(state));
  } catch (e) {
    console.error("Error saving state to localStorage", e);
  }
}

function resetTournament() {
  localStorage.removeItem("copa_pes_state");
  window.location.href = "index.html";
}

// Player registration
function addPlayer(state, name) {
  name = name.trim();
  if (!name) return { success: false, message: "El nombre no puede estar vacío" };
  if (state.players.length >= 32) return { success: false, message: "El límite máximo es de 32 jugadores" };
  
  // Unique name check
  if (state.players.some(p => p.name.toLowerCase() === name.toLowerCase())) {
    return { success: false, message: "Ya existe un jugador con este nombre" };
  }

  const newPlayer = {
    id: "p_" + Date.now() + "_" + Math.random().toString(36).substr(2, 4),
    name: name,
    team: null
  };

  state.players.push(newPlayer);
  saveState(state);
  return { success: true, player: newPlayer };
}

function removePlayer(state, id) {
  state.players = state.players.filter(p => p.id !== id);
  saveState(state);
  return state;
}

// Sorteo de equipos (Completamente aleatorio)
function performSorteoEquipos(state) {
  if (state.players.length < 3) {
    return { success: false, message: "Se necesitan al menos 3 jugadores" };
  }
  
  // Shuffle countries
  const shuffledTeams = [...TEAMS_DATABASE].sort(() => Math.random() - 0.5);
  
  // Assign a country to each player
  state.players.forEach((player, index) => {
    player.team = shuffledTeams[index % shuffledTeams.length];
  });
  
  state.currentPhase = "grupos_sorteo";
  saveState(state);
  return { success: true };
}

// Calcular estructura de grupos basándose en N
function getTournamentConfig(n) {
  if (n < 3) return null;
  if (n <= 5) return { G: 1, K: n === 5 ? 4 : 2, round: n === 5 ? "sf" : "final" };
  if (n <= 8) return { G: 2, K: 4, round: "sf" };
  if (n === 9) return { G: 3, K: 4, round: "sf" };
  if (n <= 11) return { G: 3, K: 8, round: "qf" };
  if (n <= 17) return { G: 4, K: 8, round: "qf" };
  if (n <= 23) return { G: 6, K: 16, round: "r16" };
  return { G: 8, K: 16, round: "r16" };
}

// Realizar el sorteo de Grupos
function performSorteoGrupos(state) {
  const N = state.players.length;
  const config = getTournamentConfig(N);
  if (!config) return { success: false, message: "Número de jugadores inválido" };

  const G = config.G;
  
  // Shuffled teams list
  const teamsList = state.players.map(p => ({
    playerId: p.id,
    playerName: p.name,
    name: p.team.name,
    code: p.team.code
  })).sort(() => Math.random() - 0.5);

  // Initialize G groups
  const groups = [];
  for (let i = 0; i < G; i++) {
    const char = String.fromCharCode(65 + i); // A, B, C, D...
    groups.push({
      id: char,
      name: `Grupo ${char}`,
      teams: [],
      matches: [],
      standings: []
    });
  }

  // Distribute teams evenly
  teamsList.forEach((team, index) => {
    const groupIdx = index % G;
    groups[groupIdx].teams.push(team);
  });

  // Calculate fixtures for each group using Berger's Circle Method
  groups.forEach(group => {
    group.matches = generateRoundRobinMatches(group.teams, group.id);
    group.standings = calculateStandings(group.teams, group.matches);
  });

  state.groups = groups;
  state.currentPhase = "grupos_juego";
  saveState(state);
  return { success: true };
}

// Berger Round-Robin Scheduling Algorithm
function generateRoundRobinMatches(teams, groupId) {
  let list = [...teams];
  const isOdd = list.length % 2 !== 0;
  if (isOdd) {
    list.push(null); // NULL represents a BYE / descanso
  }

  const numTeams = list.length;
  const numRounds = numTeams - 1;
  const matchesPerRound = numTeams / 2;
  const matches = [];

  for (let round = 0; round < numRounds; round++) {
    for (let match = 0; match < matchesPerRound; match++) {
      const homeIdx = (round + match) % (numTeams - 1);
      let awayIdx = (round - match + numTeams - 1) % (numTeams - 1);
      
      if (match === 0) {
        awayIdx = numTeams - 1;
      }
      
      const home = list[homeIdx];
      const away = list[awayIdx];
      
      // Skip BYE matches
      if (home !== null && away !== null) {
        // Swap home/away every other round to balance home games
        const isSwapped = round % 2 === 0;
        matches.push({
          id: `${groupId}_r${round + 1}_m${match + 1}`,
          groupId: groupId,
          round: round + 1,
          home: isSwapped ? away : home,
          away: isSwapped ? home : away,
          homeScore: null,
          awayScore: null,
          played: false
        });
      }
    }
  }
  return matches;
}

// Calcula la tabla de posiciones para un grupo
function calculateStandings(teams, matches) {
  const standings = teams.map(t => ({
    playerId: t.playerId,
    playerName: t.playerName,
    name: t.name,
    code: t.code,
    pj: 0, // Partidos jugados
    pg: 0, // Ganados
    pe: 0, // Empatados
    pp: 0, // Perdidos
    gf: 0, // Goles a favor
    gc: 0, // Goles en contra
    dg: 0, // Diferencia de goles
    pts: 0 // Puntos
  }));

  const teamMap = {};
  standings.forEach(t => {
    teamMap[t.playerId] = t;
  });

  matches.forEach(m => {
    if (m.played && m.homeScore !== null && m.awayScore !== null) {
      const home = teamMap[m.home.playerId];
      const away = teamMap[m.away.playerId];

      if (home && away) {
        home.pj++;
        away.pj++;
        home.gf += m.homeScore;
        home.gc += m.awayScore;
        away.gf += m.awayScore;
        away.gc += m.homeScore;

        if (m.homeScore > m.awayScore) {
          home.pg++;
          home.pts += 3;
          away.pp++;
        } else if (m.homeScore < m.awayScore) {
          away.pg++;
          away.pts += 3;
          home.pp++;
        } else {
          home.pe++;
          home.pts += 1;
          away.pe++;
          away.pts += 1;
        }
      }
    }
  });

  // Calculate goal difference
  standings.forEach(t => {
    t.dg = t.gf - t.gc;
  });

  // Sort standings by FIFA tiebreaker rules:
  // 1. Points
  // 2. Goal Difference
  // 3. Goals For
  // 4. Alphabetical by team name (as fallback)
  standings.sort((a, b) => {
    if (b.pts !== a.pts) return b.pts - a.pts;
    if (b.dg !== a.dg) return b.dg - a.dg;
    if (b.gf !== a.gf) return b.gf - a.gf;
    return a.name.localeCompare(b.name);
  });

  return standings;
}

// Update match score in Group stage
function updateMatchScore(state, matchId, homeScore, awayScore) {
  let matchFound = null;
  state.groups.forEach(g => {
    const match = g.matches.find(m => m.id === matchId);
    if (match) {
      match.homeScore = homeScore === "" || homeScore === null ? null : parseInt(homeScore);
      match.awayScore = awayScore === "" || awayScore === null ? null : parseInt(awayScore);
      match.played = match.homeScore !== null && match.awayScore !== null;
      matchFound = match;
      
      // Recalculate standings for this group
      g.standings = calculateStandings(g.teams, g.matches);
    }
  });

  // If this match was the active match for big screen, sync it
  if (state.activeMatch && state.activeMatch.id === matchId && matchFound) {
    state.activeMatch = { ...matchFound };
  }

  saveState(state);
  return { success: !!matchFound, match: matchFound };
}

// Set active match for big screen
function setActiveMatch(state, match) {
  state.activeMatch = match;
  saveState(state);
  // Force storage event to trigger listener in same page if needed
  localStorage.setItem("copa_pes_active_trigger", Date.now());
}

// Advance to Knockout stage
function advanceToKnockout(state) {
  // Check if all group stage matches are finished
  const allMatchesFinished = state.groups.every(g => g.matches.every(m => m.played));
  if (!allMatchesFinished) {
    return { success: false, message: "Debes terminar todos los partidos de la Fase de Grupos antes de avanzar." };
  }

  const N = state.players.length;
  const config = getTournamentConfig(N);
  const K = config.K;
  const G = state.groups.length;

  let qualifiers = [];

  if (G === 1) {
    // 1 Group (N=3,4,5)
    // Take top K teams
    qualifiers = state.groups[0].standings.slice(0, K).map((t, idx) => ({
      ...t,
      seed: idx + 1 // Rank in group
    }));
  } else if (G === 2) {
    // 2 Groups (N=6,7,8)
    // Qualifiers: top 2 from each group. K=4.
    const A = state.groups[0].standings;
    const B = state.groups[1].standings;
    qualifiers = [
      { ...A[0], seed: "A1" },
      { ...B[1], seed: "B2" },
      { ...B[0], seed: "B1" },
      { ...A[1], seed: "A2" }
    ];
  } else if (G === 3) {
    // 3 Groups (N=9,10,11)
    if (K === 4) {
      // N=9. K=4. Qualifiers: 3 winners + best 2nd place.
      const winners = state.groups.map((g, i) => ({ ...g.standings[0], groupIdx: i }));
      // Rank winners
      winners.sort(compareGroupRecords);
      
      // Find best 2nd place
      const runnerUps = state.groups.map((g, i) => ({ ...g.standings[1], groupIdx: i }));
      runnerUps.sort(compareGroupRecords);
      const best2nd = runnerUps[0];

      qualifiers = [
        { ...winners[0], seed: "W1" },
        { ...best2nd, seed: "B2nd" },
        { ...winners[1], seed: "W2" },
        { ...winners[2], seed: "W3" }
      ];
    } else if (K === 8) {
      // N=10,11. K=8. Qualifiers: top 2 from each group (6 teams) + 2 best 3rd places.
      const top2 = [];
      state.groups.forEach(g => {
        top2.push({ ...g.standings[0], rank: 1, groupId: g.id });
        top2.push({ ...g.standings[1], rank: 2, groupId: g.id });
      });

      // Find best 3rd places
      const thirdPlaces = state.groups.map(g => ({ ...g.standings[2], rank: 3, groupId: g.id }));
      thirdPlaces.sort(compareGroupRecords);
      
      const best3rds = thirdPlaces.slice(0, 2);

      // We have our 8 teams. Let's sort them:
      // Winners ranked 1-3, Runner-ups 4-6, Best 3rds 7-8.
      const winners = top2.filter(t => t.rank === 1).sort(compareGroupRecords);
      const runners = top2.filter(t => t.rank === 2).sort(compareGroupRecords);

      const ranked = [
        ...winners,
        ...runners,
        ...best3rds
      ];

      qualifiers = ranked.map((t, idx) => ({ ...t, seed: idx + 1 }));
    }
  } else if (G === 4) {
    // 4 Groups (N=12 to 17). K=8.
    // Top 2 from each group.
    const A = state.groups[0].standings;
    const B = state.groups[1].standings;
    const C = state.groups[2].standings;
    const D = state.groups[3].standings;

    qualifiers = [
      { ...A[0], seed: "A1" }, { ...B[1], seed: "B2" },
      { ...C[0], seed: "C1" }, { ...D[1], seed: "D2" },
      { ...B[0], seed: "B1" }, { ...A[1], seed: "A2" },
      { ...D[0], seed: "D1" }, { ...C[1], seed: "C2" }
    ];
  } else if (G === 6) {
    // 6 Groups (N=18 to 23). K=16.
    // Top 2 from each group (12 teams) + 4 best 3rd places.
    const top2 = [];
    state.groups.forEach(g => {
      top2.push({ ...g.standings[0], rank: 1, groupId: g.id });
      top2.push({ ...g.standings[1], rank: 2, groupId: g.id });
    });

    const thirdPlaces = state.groups.map(g => ({ ...g.standings[2], rank: 3, groupId: g.id }));
    thirdPlaces.sort(compareGroupRecords);
    const best3rds = thirdPlaces.slice(0, 4);

    const winners = top2.filter(t => t.rank === 1).sort(compareGroupRecords);
    const runners = top2.filter(t => t.rank === 2).sort(compareGroupRecords);

    const ranked = [
      ...winners, // 1-6
      ...runners, // 7-12
      ...best3rds // 13-16
    ];

    qualifiers = ranked.map((t, idx) => ({ ...t, seed: idx + 1 }));
  } else if (G === 8) {
    // 8 Groups (N=24 to 32). K=16.
    // Top 2 from each group.
    const A = state.groups[0].standings;
    const B = state.groups[1].standings;
    const C = state.groups[2].standings;
    const D = state.groups[3].standings;
    const E = state.groups[4].standings;
    const F = state.groups[5].standings;
    const G_gp = state.groups[6].standings;
    const H = state.groups[7].standings;

    qualifiers = [
      { ...A[0], seed: "A1" }, { ...B[1], seed: "B2" },
      { ...C[0], seed: "C1" }, { ...D[1], seed: "D2" },
      { ...E[0], seed: "E1" }, { ...F[1], seed: "F2" },
      { ...G_gp[0], seed: "G1" }, { ...H[1], seed: "H2" },
      { ...B[0], seed: "B1" }, { ...A[1], seed: "A2" },
      { ...D[0], seed: "D1" }, { ...C[1], seed: "C2" },
      { ...F[0], seed: "F1" }, { ...E[1], seed: "E2" },
      { ...H[0], seed: "H1" }, { ...G_gp[1], seed: "G2" }
    ];
  }

  // Create matches based on initial phase
  const startRound = config.round;
  state.bracket = {
    r16: [],
    qf: [],
    sf: [],
    final: []
  };

  if (startRound === "r16") {
    // 8 matches
    for (let i = 0; i < 8; i++) {
      let home = null;
      let away = null;
      if (G === 8) {
        // A1 vs B2, C1 vs D2, etc. (standard pairing in qualifiers array order)
        home = qualifiers[i * 2];
        away = qualifiers[i * 2 + 1];
      } else {
        // Seed 1 vs Seed 16, Seed 2 vs Seed 15, etc.
        home = qualifiers[i];
        away = qualifiers[15 - i];
      }

      state.bracket.r16.push({
        id: `r16_m${i + 1}`,
        home: home,
        away: away,
        homeScore: null,
        awayScore: null,
        homePenalties: null,
        awayPenalties: null,
        played: false,
        winner: null,
        nextMatchId: `qf_m${Math.floor(i / 2) + 1}`,
        nextMatchSide: i % 2 === 0 ? "home" : "away"
      });
    }
    // Initialize QF, SF, Final with placeholders
    for (let i = 0; i < 4; i++) {
      state.bracket.qf.push({
        id: `qf_m${i + 1}`, home: null, away: null, homeScore: null, awayScore: null,
        homePenalties: null, awayPenalties: null, played: false, winner: null,
        nextMatchId: `sf_m${Math.floor(i / 2) + 1}`, nextMatchSide: i % 2 === 0 ? "home" : "away"
      });
    }
    for (let i = 0; i < 2; i++) {
      state.bracket.sf.push({
        id: `sf_m${i + 1}`, home: null, away: null, homeScore: null, awayScore: null,
        homePenalties: null, awayPenalties: null, played: false, winner: null,
        nextMatchId: `final_m1`, nextMatchSide: i % 2 === 0 ? "home" : "away"
      });
    }
    state.bracket.final.push({
      id: `final_m1`, home: null, away: null, homeScore: null, awayScore: null,
      homePenalties: null, awayPenalties: null, played: false, winner: null,
      nextMatchId: null, nextMatchSide: null
    });
  } else if (startRound === "qf") {
    // 4 matches
    for (let i = 0; i < 4; i++) {
      let home = null;
      let away = null;
      if (G === 4) {
        // A1 vs B2, etc. (qualifiers array order)
        home = qualifiers[i * 2];
        away = qualifiers[i * 2 + 1];
      } else {
        // Seed 1 vs Seed 8, Seed 2 vs Seed 7, etc.
        home = qualifiers[i];
        away = qualifiers[7 - i];
      }

      state.bracket.qf.push({
        id: `qf_m${i + 1}`,
        home: home,
        away: away,
        homeScore: null,
        awayScore: null,
        homePenalties: null,
        awayPenalties: null,
        played: false,
        winner: null,
        nextMatchId: `sf_m${Math.floor(i / 2) + 1}`,
        nextMatchSide: i % 2 === 0 ? "home" : "away"
      });
    }
    // Initialize SF, Final placeholders
    for (let i = 0; i < 2; i++) {
      state.bracket.sf.push({
        id: `sf_m${i + 1}`, home: null, away: null, homeScore: null, awayScore: null,
        homePenalties: null, awayPenalties: null, played: false, winner: null,
        nextMatchId: `final_m1`, nextMatchSide: i % 2 === 0 ? "home" : "away"
      });
    }
    state.bracket.final.push({
      id: `final_m1`, home: null, away: null, homeScore: null, awayScore: null,
      homePenalties: null, awayPenalties: null, played: false, winner: null,
      nextMatchId: null, nextMatchSide: null
    });
  } else if (startRound === "sf") {
    // 2 matches
    for (let i = 0; i < 2; i++) {
      let home = null;
      let away = null;
      if (G === 2 || G === 3) {
        // A1 vs B2, B1 vs A2 (qualifiers array order)
        home = qualifiers[i * 2];
        away = qualifiers[i * 2 + 1];
      } else {
        // 1 Group of 5: Seed 1 vs Seed 4, Seed 2 vs Seed 3
        home = qualifiers[i];
        away = qualifiers[3 - i];
      }

      state.bracket.sf.push({
        id: `sf_m${i + 1}`,
        home: home,
        away: away,
        homeScore: null,
        awayScore: null,
        homePenalties: null,
        awayPenalties: null,
        played: false,
        winner: null,
        nextMatchId: `final_m1`,
        nextMatchSide: i % 2 === 0 ? "home" : "away"
      });
    }
    // Initialize Final placeholder
    state.bracket.final.push({
      id: `final_m1`, home: null, away: null, homeScore: null, awayScore: null,
      homePenalties: null, awayPenalties: null, played: false, winner: null,
      nextMatchId: null, nextMatchSide: null
    });
  } else if (startRound === "final") {
    // 1 match (N=3,4)
    state.bracket.final.push({
      id: `final_m1`,
      home: qualifiers[0],
      away: qualifiers[1],
      homeScore: null,
      awayScore: null,
      homePenalties: null,
      awayPenalties: null,
      played: false,
      winner: null,
      nextMatchId: null,
      nextMatchSide: null
    });
  }

  state.currentPhase = "fase_final";
  saveState(state);
  return { success: true };
}

// Compare two teams by their group stage records
function compareGroupRecords(a, b) {
  if (b.pts !== a.pts) return b.pts - a.pts;
  if (b.dg !== a.dg) return b.dg - a.dg;
  if (b.gf !== a.gf) return b.gf - a.gf;
  return 0;
}

// Update knockout score
function updateKnockoutScore(state, round, matchId, homeScore, awayScore, homePenalties, awayPenalties) {
  const roundMatches = state.bracket[round];
  if (!roundMatches) return { success: false, message: "Ronda no válida" };

  const match = roundMatches.find(m => m.id === matchId);
  if (!match) return { success: false, message: "Partido no encontrado" };

  if (homeScore === "" || homeScore === null || awayScore === "" || awayScore === null) {
    match.homeScore = null;
    match.awayScore = null;
    match.homePenalties = null;
    match.awayPenalties = null;
    match.played = false;
    match.winner = null;
    
    // Clear in child match too
    clearChildKnockoutMatch(state, match.nextMatchId, match.nextMatchSide);
  } else {
    match.homeScore = parseInt(homeScore);
    match.awayScore = parseInt(awayScore);
    match.played = true;

    // Check winner
    if (match.homeScore > match.awayScore) {
      match.winner = match.home;
      match.homePenalties = null;
      match.awayPenalties = null;
    } else if (match.homeScore < match.awayScore) {
      match.winner = match.away;
      match.homePenalties = null;
      match.awayPenalties = null;
    } else {
      // Penales obligatorios
      match.homePenalties = homePenalties === "" || homePenalties === null ? null : parseInt(homePenalties);
      match.awayPenalties = awayPenalties === "" || awayPenalties === null ? null : parseInt(awayPenalties);
      
      if (match.homePenalties !== null && match.awayPenalties !== null) {
        if (match.homePenalties > match.awayPenalties) {
          match.winner = match.home;
        } else if (match.homePenalties < match.awayPenalties) {
          match.winner = match.away;
        } else {
          return { success: false, message: "Los penales no pueden quedar empatados en eliminación directa." };
        }
      } else {
        return { success: false, message: "El partido quedó empatado. Por favor ingresa el resultado de los penales." };
      }
    }

    // Advance winner to next match if exists
    if (match.nextMatchId) {
      advanceWinner(state, match.nextMatchId, match.nextMatchSide, match.winner);
    } else {
      // It was the Gran Final!
      state.champion = match.winner;
      state.currentPhase = "campeon";
    }
  }

  // Sync active match if needed
  if (state.activeMatch && state.activeMatch.id === matchId) {
    state.activeMatch = { ...match };
  }

  saveState(state);
  return { success: true, match: match };
}

function advanceWinner(state, nextMatchId, nextMatchSide, winner) {
  // Search in all rounds
  let found = false;
  const rounds = ["qf", "sf", "final"];
  for (let r of rounds) {
    const match = state.bracket[r].find(m => m.id === nextMatchId);
    if (match) {
      match[nextMatchSide] = winner;
      found = true;
      break;
    }
  }
}

function clearChildKnockoutMatch(state, nextMatchId, nextMatchSide) {
  if (!nextMatchId) return;
  const rounds = ["qf", "sf", "final"];
  for (let r of rounds) {
    const match = state.bracket[r].find(m => m.id === nextMatchId);
    if (match) {
      match[nextMatchSide] = null;
      match.homeScore = null;
      match.awayScore = null;
      match.homePenalties = null;
      match.awayPenalties = null;
      match.played = false;
      match.winner = null;
      
      // Recursively clear children
      clearChildKnockoutMatch(state, match.nextMatchId, match.nextMatchSide);
      break;
    }
  }
}

// Helper to check if page navigation is allowed based on currentPhase
function checkPhaseRedirect() {
  const state = loadState();
  const path = window.location.pathname.split("/").pop();
  
  if ((state.currentPhase === "sorteo" || state.currentPhase === "grupos_sorteo") && 
      path !== "index.html" && path !== "") {
    window.location.href = "index.html";
  }
}
