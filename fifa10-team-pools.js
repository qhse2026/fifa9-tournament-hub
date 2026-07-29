(() => {
  "use strict";

  const pools = {
    "4": [
      "Girona FC",
      "Brighton & Hove Albion",
      "Crystal Palace",
      "Olympique de Marseille",
      "Villarreal CF",
      "West Ham United",
      "Real Betis Balompié",
      "VfB Stuttgart",
      "AFC Bournemouth",
      "OGC Nice",
      "VfL Wolfsburg",
      "CA Osasuna",
      "Rayo Vallecano",
      "AS Monaco",
      "Olympique Lyonnais",
      "LOSC Lille",
      "Eintracht Frankfurt",
      "Brentford",
      "Fulham",
      "Al Hilal",
      "River Plate",
      "Fiorentina",
      "Valencia CF",
      "Olympiacos",
      "Al Nassr",
      "Feyenoord",
      "Ajax",
      "FC Porto",
      "Bologna",
      "Stade Rennais",
      "Borussia M'gladbach",
      "SC Freiburg",
      "RC Celta de Vigo",
      "Torino",
      "Flamengo",
      "RCD Mallorca",
      "Beşiktaş",
      "Stade Brestois 29",
      "Everton",
      "Wolverhampton Wanderers",
      "Sevilla FC",
      "Leicester City",
      "RC Lens",
      "Celtic",
      "Getafe CF",
      "Trabzonspor",
      "UD Las Palmas",
      "TSG Hoffenheim"
    ],
    "4.5": [
      "Atlético de Madrid",
      "Newcastle United",
      "Borussia Dortmund",
      "Aston Villa",
      "Milano FC",
      "Tottenham Hotspur",
      "Juventus",
      "Manchester United",
      "Fenerbahçe",
      "RB Leipzig",
      "Atalanta",
      "Chelsea",
      "Lazio",
      "Benfica",
      "Sporting CP",
      "Athletic Club de Bilbao",
      "Galatasaray",
      "Roma",
      "Napoli"
    ],
    "5": [
      "Real Madrid",
      "Manchester City",
      "Inter",
      "FC Barcelona",
      "Liverpool",
      "Bayern München",
      "Paris Saint-Germain",
      "Bayer 04 Leverkusen",
      "Arsenal"
    ]
  };

  window.FIFA10_TEAM_POOLS = Object.freeze(Object.fromEntries(
    Object.entries(pools).map(([stars, teams]) => [stars, Object.freeze([...teams])])
  ));
  window.FIFA10_TEAM_POOL_VERSION = "FC26-2026.07-MEN-ONLY";
})();
