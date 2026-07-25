# Formula Horizon Reborn V45 — Track Data Schema

Each circuit is manually authored as a closed list of world-space control points. The shared track builder converts this data into a Catmull-Rom centerline and real 3D surface meshes.

## Required fields

```js
{
  id: "oruc-reis-coastal",
  version: "45.0.0-orc-1",
  name: "Oruç Reis Coastal Circuit",
  shortName: "Oruç Reis Coastal",
  location: "Black Sea Research Coast",
  category: "High-Speed Coastal",
  difficulty: 2,

  width: 13.5,        // metres; validated between 8 and 20
  runoff: 5.5,       // extra low-grip/runoff width
  laps: 5,
  sectors: [0.333, 0.666, 1],

  environment: "coastal",
  accent: "#59e0ef",
  sky: "#72c9e8",
  fog: "#9dd3dd",
  ground: "#183b39",
  surfaceGrip: 1.18,

  description: "...",
  drivingTips: ["..."],

  signatureSections: [
    {
      name: "Gun Deck Hairpin",
      start: 0.53,
      end: 0.66,
      type: "hairpin",
      targetSpeedKph: 68
    }
  ],

  brakeMarkers: [0.145, 0.505, 0.785],

  controlPoints: [
    point(x, elevationY, z),
    // minimum 12; Phase 1 tracks use 26–29
  ]
}
```

## Geometry contract

- `controlPoints` must form a non-self-intersecting closed route when passed to a closed Catmull-Rom curve.
- Elevation is stored in the Y coordinate.
- Track width is in metres.
- Sector fractions must be strictly increasing and end at `1`.
- Signature section fractions are measured around the centreline from `0` to `1`.
- Brake-marker fractions identify major braking zones for scenery/racing-line guidance.

## Generated track model

`track-builder.js` creates:
- sampled centreline points;
- tangent and normal vectors;
- local curvature and signed curvature;
- cumulative distance and progress;
- asphalt mesh;
- left/right kerbs;
- runoff surfaces;
- barrier positions;
- environment/scenery;
- nearest-point and progress helpers for physics/timing.

## Adding future circuits

The remaining 22 circuits should not be added until Phase 1 acceptance is completed. A new circuit must:

1. use unique manually designed control points;
2. pass the track data validation test;
3. have no self-intersections;
4. contain three sectors;
5. include at least three named signature sections;
6. include meaningful braking zones;
7. pass full-throttle failure and proper-braking validation;
8. have a unique version string for leaderboard integrity;
9. include PC and mobile performance validation.
