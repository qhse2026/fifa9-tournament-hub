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

  const TRACKS = [
    {
      id: "oruc-reis", name: "Oruç Reis Circuit", country: "Türkiye",
      character: "Dengeli · teknik", mastery: "Viraj ritmi ve fren kontrolü",
      laps: 5, roadWidth: 76, difficulty: 2, accent: "gold",
      tireWear: 1.00, rainChance: 22, overtake: 62, pitLoss: 3.2,
      points: [[.50,.09],[.72,.11],[.87,.25],[.84,.46],[.71,.59],[.88,.76],[.70,.90],[.49,.84],[.30,.92],[.12,.75],[.18,.55],[.07,.37],[.20,.17]]
    },
    {
      id: "dragon-ring", name: "Dragon Ring", country: "Final Chapter",
      character: "Hızlı · agresif", mastery: "ERS, DRS ve yüksek hız",
      laps: 5, roadWidth: 80, difficulty: 3, accent: "red",
      tireWear: 1.08, rainChance: 18, overtake: 78, pitLoss: 3.0,
      points: [[.23,.14],[.63,.09],[.88,.23],[.75,.41],[.91,.62],[.72,.87],[.43,.81],[.20,.92],[.07,.68],[.18,.47],[.06,.27]]
    },
    {
      id: "filyos-street", name: "Filyos Street GP", country: "Black Sea",
      character: "Dar · taktiksel", mastery: "Temiz sürüş ve savunma",
      laps: 6, roadWidth: 68, difficulty: 4, accent: "cyan",
      tireWear: 1.14, rainChance: 42, overtake: 38, pitLoss: 3.8,
      points: [[.13,.22],[.40,.09],[.77,.15],[.91,.35],[.75,.51],[.90,.76],[.65,.91],[.36,.78],[.12,.88],[.05,.59],[.26,.44]]
    },
    {
      id: "champion-arena", name: "Champion Arena", country: "FIFA 9",
      character: "Akıcı · yüksek tempo", mastery: "Geçiş ve yarış çizgisi",
      laps: 5, roadWidth: 82, difficulty: 3, accent: "green",
      tireWear: .94, rainChance: 16, overtake: 74, pitLoss: 2.9,
      points: [[.47,.08],[.76,.12],[.90,.34],[.79,.55],[.90,.76],[.67,.91],[.44,.79],[.20,.91],[.08,.69],[.17,.48],[.08,.29],[.27,.12]]
    },
    {
      id: "bosphorus-gp", name: "Bosphorus Grand Prix", country: "İstanbul",
      character: "Dalgalı · çok yönlü", mastery: "Frenleme ve yön değişimi",
      laps: 6, roadWidth: 75, difficulty: 4, accent: "blue",
      tireWear: 1.18, rainChance: 36, overtake: 58, pitLoss: 3.4,
      points: [[.16,.18],[.42,.07],[.72,.11],[.91,.30],[.80,.50],[.91,.71],[.68,.91],[.45,.79],[.20,.91],[.07,.70],[.17,.49],[.06,.31]]
    },
    {
      id: "anatolian-speed", name: "Anatolian Speed Park", country: "Anadolu",
      character: "Uzun düzlük · sert fren", mastery: "Maksimum hız ve geç fren",
      laps: 5, roadWidth: 84, difficulty: 3, accent: "orange",
      tireWear: 1.02, rainChance: 12, overtake: 86, pitLoss: 2.8,
      points: [[.10,.22],[.51,.08],[.88,.17],[.90,.40],[.70,.50],[.88,.72],[.55,.91],[.21,.86],[.08,.64],[.23,.49]]
    },
    {
      id: "black-sea-storm", name: "Black Sea Storm Circuit", country: "Karadeniz",
      character: "Islak · değişken", mastery: "Yağmur becerisi ve lastik kararı",
      laps: 6, roadWidth: 73, difficulty: 5, accent: "storm",
      tireWear: 1.12, rainChance: 74, overtake: 51, pitLoss: 3.6,
      points: [[.18,.14],[.55,.08],[.85,.22],[.73,.39],[.91,.57],[.78,.83],[.51,.91],[.33,.74],[.09,.87],[.06,.55],[.24,.42],[.08,.27]]
    },
    {
      id: "mediterranean-night", name: "Mediterranean Night GP", country: "Akdeniz",
      character: "Gece · düşük aşınma", mastery: "İstikrar ve yarış temposu",
      laps: 5, roadWidth: 80, difficulty: 3, accent: "purple",
      tireWear: .88, rainChance: 8, overtake: 68, pitLoss: 3.1,
      points: [[.31,.09],[.71,.10],[.89,.31],[.75,.47],[.90,.68],[.72,.90],[.40,.83],[.16,.91],[.06,.66],[.19,.47],[.07,.25]]
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
      Math.max(22, Math.round(Math.min(width, height) / 28))
    ).map(point => ({ x: point.x + padding, y: point.y + padding }));
    return {
      ...definition,
      path,
      roadWidth: clamp(definition.roadWidth * Math.min(width / 1200, height / 760), 42, 92)
    };
  }

  window.F1_TRACKS = Object.freeze({ TRACKS, getTrack, buildTrack, clamp, wrap });
})();
