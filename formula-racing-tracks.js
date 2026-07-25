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
      id: "oruc-reis",
      name: "Oruç Reis Circuit",
      country: "Türkiye",
      character: "Dengeli · teknik",
      mastery: "Viraj ritmi ve fren kontrolü",
      laps: 3,
      roadWidth: 76,
      difficulty: 2,
      accent: "gold",
      points: [[.50,.09],[.72,.11],[.87,.25],[.84,.46],[.71,.59],[.88,.76],[.70,.90],[.49,.84],[.30,.92],[.12,.75],[.18,.55],[.07,.37],[.20,.17]]
    },
    {
      id: "dragon-ring",
      name: "Dragon Ring",
      country: "Final Chapter",
      character: "Hızlı · agresif",
      mastery: "ERS kullanımı ve yüksek hız",
      laps: 3,
      roadWidth: 80,
      difficulty: 3,
      accent: "red",
      points: [[.23,.14],[.63,.09],[.88,.23],[.75,.41],[.91,.62],[.72,.87],[.43,.81],[.20,.92],[.07,.68],[.18,.47],[.06,.27]]
    },
    {
      id: "filyos-street",
      name: "Filyos Street GP",
      country: "Black Sea",
      character: "Dar · taktiksel",
      mastery: "Temiz sürüş ve savunma",
      laps: 4,
      roadWidth: 68,
      difficulty: 4,
      accent: "cyan",
      points: [[.13,.22],[.40,.09],[.77,.15],[.91,.35],[.75,.51],[.90,.76],[.65,.91],[.36,.78],[.12,.88],[.05,.59],[.26,.44]]
    },
    {
      id: "champion-arena",
      name: "Champion Arena",
      country: "FIFA 9",
      character: "Akıcı · yüksek tempo",
      mastery: "Geçiş ve yarış çizgisi",
      laps: 3,
      roadWidth: 82,
      difficulty: 3,
      accent: "green",
      points: [[.47,.08],[.76,.12],[.90,.34],[.79,.55],[.90,.76],[.67,.91],[.44,.79],[.20,.91],[.08,.69],[.17,.48],[.08,.29],[.27,.12]]
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
