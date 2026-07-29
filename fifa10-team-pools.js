(() => {
  "use strict";

  const pools = {
    "4": [
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
      "Fiorentina",
      "Valencia CF",
      "Olympiacos",
      "Feyenoord",
      "Ajax",
      "FC Porto",
      "Bologna",
      "Stade Rennais",
      "Borussia M'gladbach",
      "SC Freiburg",
      "RC Celta de Vigo",
      "Torino",
      "RCD Mallorca",
      "Beşiktaş",
      "Stade Brestois 29",
      "Everton",
      "Wolverhampton Wanderers",
      "Sevilla FC"
    ],
    "4.5": [
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
      "Napoli",
      "Girona FC",
      "Brighton & Hove Albion",
      "Crystal Palace",
      "Olympique de Marseille",
      "Villarreal CF",
      "West Ham United",
      "Real Betis Balompié"
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
      "Arsenal",
      "Atlético de Madrid"
    ]
  };

  window.FIFA10_TEAM_POOLS = Object.freeze(Object.fromEntries(
    Object.entries(pools).map(([stars, teams]) => [stars, Object.freeze([...teams])])
  ));
  window.FIFA10_TEAM_POOL_VERSION = "FC25-42.1";
})();
