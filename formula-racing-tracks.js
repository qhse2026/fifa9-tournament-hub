(() => {
  "use strict";

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const wrap = (value, length) => ((value % length) + length) % length;

  function catmullRom(p0, p1, p2, p3, t) {
    const t2 = t * t;
    const t3 = t2 * t;
    return {
      x: 0.5 * ((2 * p1.x) + (-p0.x + p2.x) * t + (2*p0.x - 5*p1.x + 4*p2.x - p3.x) * t2 + (-p0.x + 3*p1.x - 3*p2.x + p3.x) * t3),
      y: 0.5 * ((2 * p1.y) + (-p0.y + p2.y) * t + (2*p0.y - 5*p1.y + 4*p2.y - p3.y) * t2 + (-p0.y + 3*p1.y - 3*p2.y + p3.y) * t3)
    };
  }

  function buildSmoothPath(controlPoints, width, height, samplesPerSegment = 28) {
    const points = controlPoints.map(([x, y]) => ({ x: x * width, y: y * height }));
    const result = [];
    for (let index = 0; index < points.length; index += 1) {
      const p0 = points[wrap(index - 1, points.length)];
      const p1 = points[index];
      const p2 = points[wrap(index + 1, points.length)];
      const p3 = points[wrap(index + 2, points.length)];
      for (let sample = 0; sample < samplesPerSegment; sample += 1) {
        result.push(catmullRom(p0, p1, p2, p3, sample / samplesPerSegment));
      }
    }
    return result;
  }

  function pathLength(path) {
    let total = 0;
    for (let index = 0; index < path.length; index += 1) {
      const current = path[index];
      const next = path[wrap(index + 1, path.length)];
      total += Math.hypot(next.x - current.x, next.y - current.y);
    }
    return total;
  }

  const TRACKS = [
    {
      id: "oruc-reis", name: "Oruç Reis Circuit", country: "Türkiye",
      character: "Liman · teknik sektörler", mastery: "Viraj ritmi ve fren kontrolü",
      theme: "ocean", layoutCode: "ORC", baseLapSeconds: 74,
      laps: 5, roadWidth: 74, difficulty: 3, accent: "gold", kerbA: "#f4c75e", kerbB: "#f7f1dc",
      tireWear: 1.00, rainChance: 24, overtake: 58, pitLoss: 3.2,
      points: [[.12,.48],[.17,.24],[.34,.12],[.58,.13],[.78,.22],[.88,.40],[.75,.53],[.89,.69],[.76,.88],[.51,.83],[.38,.66],[.20,.83],[.08,.68]]
    },
    {
      id: "dragon-ring", name: "Dragon Ring", country: "Final Chapter",
      character: "Üçgen hız tapınağı", mastery: "ERS, DRS ve yüksek hız",
      theme: "volcanic", layoutCode: "DRG", baseLapSeconds: 67,
      laps: 5, roadWidth: 82, difficulty: 3, accent: "red", kerbA: "#ff463c", kerbB: "#141414",
      tireWear: 1.10, rainChance: 14, overtake: 84, pitLoss: 2.8,
      points: [[.11,.79],[.18,.19],[.50,.08],[.82,.18],[.91,.77],[.62,.69],[.52,.47],[.40,.70]]
    },
    {
      id: "filyos-street", name: "Filyos Street GP", country: "Black Sea",
      character: "Keskin şehir virajları", mastery: "Temiz sürüş ve savunma",
      theme: "street", layoutCode: "FLY", baseLapSeconds: 82,
      laps: 6, roadWidth: 64, difficulty: 5, accent: "cyan", kerbA: "#38bdf8", kerbB: "#e5edf1",
      tireWear: 1.16, rainChance: 44, overtake: 34, pitLoss: 4.0,
      points: [[.09,.17],[.45,.12],[.45,.30],[.83,.30],[.83,.51],[.61,.51],[.61,.76],[.89,.76],[.89,.90],[.28,.90],[.28,.70],[.08,.70]]
    },
    {
      id: "champion-arena", name: "Champion Arena", country: "FIFA 9",
      character: "Oval + iç teknik bölüm", mastery: "Geçiş ve yarış çizgisi",
      theme: "arena", layoutCode: "CHA", baseLapSeconds: 69,
      laps: 5, roadWidth: 86, difficulty: 3, accent: "green", kerbA: "#55e29d", kerbB: "#f3fff8",
      tireWear: .94, rainChance: 12, overtake: 80, pitLoss: 2.7,
      points: [[.18,.22],[.48,.08],[.78,.15],[.91,.38],[.82,.70],[.60,.90],[.28,.88],[.08,.67],[.12,.38],[.31,.22],[.55,.29],[.67,.48],[.53,.65],[.34,.58],[.30,.40]]
    },
    {
      id: "bosphorus-gp", name: "Bosphorus Grand Prix", country: "İstanbul",
      character: "Köprü geçişi · çift kıta", mastery: "Frenleme ve yön değişimi",
      theme: "strait", layoutCode: "BOS", baseLapSeconds: 79,
      laps: 6, roadWidth: 72, difficulty: 4, accent: "blue", kerbA: "#2f7df4", kerbB: "#f4f7ff",
      tireWear: 1.18, rainChance: 38, overtake: 54, pitLoss: 3.5,
      points: [[.08,.36],[.25,.13],[.52,.16],[.73,.08],[.91,.24],[.76,.43],[.92,.62],[.74,.88],[.48,.78],[.28,.91],[.10,.72],[.29,.57],[.52,.61],[.54,.38],[.31,.34]]
    },
    {
      id: "anatolian-speed", name: "Anatolian Speed Park", country: "Anadolu",
      character: "Dev düzlük · saç tokası", mastery: "Maksimum hız ve geç fren",
      theme: "desert", layoutCode: "ASP", baseLapSeconds: 65,
      laps: 5, roadWidth: 88, difficulty: 3, accent: "orange", kerbA: "#f97316", kerbB: "#fff4df",
      tireWear: 1.04, rainChance: 8, overtake: 90, pitLoss: 2.6,
      points: [[.08,.23],[.78,.11],[.92,.24],[.89,.45],[.66,.49],[.89,.68],[.73,.90],[.18,.87],[.07,.72],[.34,.60],[.16,.46]]
    },
    {
      id: "black-sea-storm", name: "Black Sea Storm Circuit", country: "Karadeniz",
      character: "Daralan kıyı yolu · fırtına", mastery: "Yağmur becerisi ve lastik kararı",
      theme: "storm", layoutCode: "BSS", baseLapSeconds: 84,
      laps: 6, roadWidth: 70, difficulty: 5, accent: "storm", kerbA: "#22d3ee", kerbB: "#102f3b",
      tireWear: 1.13, rainChance: 78, overtake: 46, pitLoss: 3.7,
      points: [[.11,.21],[.32,.08],[.66,.10],[.87,.25],[.72,.40],[.91,.56],[.82,.80],[.57,.91],[.39,.73],[.19,.90],[.07,.68],[.24,.51],[.08,.36]]
    },
    {
      id: "mediterranean-night", name: "Mediterranean Night GP", country: "Akdeniz",
      character: "Neon marina · hızlı S'ler", mastery: "İstikrar ve yarış temposu",
      theme: "neon", layoutCode: "MED", baseLapSeconds: 71,
      laps: 5, roadWidth: 79, difficulty: 4, accent: "purple", kerbA: "#c084fc", kerbB: "#f0e8ff",
      tireWear: .89, rainChance: 7, overtake: 70, pitLoss: 3.0,
      points: [[.14,.63],[.10,.30],[.30,.10],[.61,.09],[.83,.19],[.91,.43],[.77,.57],[.91,.78],[.68,.91],[.42,.80],[.20,.91],[.31,.63],[.50,.53],[.52,.31],[.29,.38]]
    }
  ];

  function getTrack(id) {
    return TRACKS.find(track => track.id === id) || TRACKS[0];
  }

  function buildTrack(id, width, height) {
    const definition = getTrack(id);
    const padding = Math.max(20, Math.min(width, height) * 0.035);
    const path = buildSmoothPath(
      definition.points,
      width - padding * 2,
      height - padding * 2,
      Math.max(20, Math.round(Math.min(width, height) / 30))
    ).map(point => ({ x: point.x + padding, y: point.y + padding }));
    return {
      ...definition,
      path,
      pathLength:pathLength(path),
      roadWidth: clamp(definition.roadWidth * Math.min(width / 1200, height / 760), 40, 94)
    };
  }

  window.F1_TRACKS = Object.freeze({ TRACKS, getTrack, buildTrack, clamp, wrap });
})();
