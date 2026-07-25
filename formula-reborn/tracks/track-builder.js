import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.185.1/build/three.module.min.js";

const UP = new THREE.Vector3(0, 1, 0);

function stripGeometry(samples, innerOffset, outerOffset, yOffset = 0) {
  const positions = [];
  const uvs = [];
  const indices = [];
  const count = samples.length;

  for (let index = 0; index < count; index += 1) {
    const sample = samples[index];
    const inner = sample.point.clone().addScaledVector(sample.normal, innerOffset).addScaledVector(UP, yOffset);
    const outer = sample.point.clone().addScaledVector(sample.normal, outerOffset).addScaledVector(UP, yOffset);
    positions.push(inner.x, inner.y, inner.z, outer.x, outer.y, outer.z);
    const u = index / Math.max(1, count - 1);
    uvs.push(0, u * 40, 1, u * 40);
  }

  for (let index = 0; index < count; index += 1) {
    const next = (index + 1) % count;
    const a = index * 2;
    const b = a + 1;
    const c = next * 2;
    const d = c + 1;
    indices.push(a, c, b, c, d, b);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function createMaterial(color, options = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: options.roughness ?? 0.86,
    metalness: options.metalness ?? 0.04,
    emissive: options.emissive ?? 0x000000,
    emissiveIntensity: options.emissiveIntensity ?? 0,
    side: THREE.DoubleSide
  });
}

function sceneryClearance(track, extra = 0) {
  return track.width / 2 + track.runoff + 7.5 + extra;
}

function createTrackSamples(curve, track, sampleCount = 960) {
  const samples = [];
  const previousTangent = new THREE.Vector3();
  const tangentDelta = new THREE.Vector3();

  for (let index = 0; index < sampleCount; index += 1) {
    const u = index / sampleCount;
    const point = curve.getPointAt(u);
    const tangent = curve.getTangentAt(u).normalize();
    const normal = new THREE.Vector3().crossVectors(UP, tangent).normalize();
    const nextTangent = curve.getTangentAt((u + 1 / sampleCount) % 1).normalize();
    const angle = Math.acos(THREE.MathUtils.clamp(tangent.dot(nextTangent), -1, 1));
    const nextPoint = curve.getPointAt((u + 1 / sampleCount) % 1);
    const distance = Math.max(0.01, point.distanceTo(nextPoint));
    const curvature = angle / distance;
    const direction = Math.sign(normal.dot(tangentDelta.copy(nextTangent).sub(tangent))) || 1;

    samples.push({
      index,
      u,
      point,
      tangent,
      normal,
      curvature,
      signedCurvature: curvature * direction,
      roadHalfWidth: track.width / 2,
      runoff: track.runoff
    });
    previousTangent.copy(tangent);
  }

  // Cumulative distance and total length.
  let totalDistance = 0;
  for (let index = 0; index < samples.length; index += 1) {
    const next = samples[(index + 1) % samples.length];
    samples[index].distance = totalDistance;
    totalDistance += samples[index].point.distanceTo(next.point);
  }
  samples.forEach(sample => {
    sample.progress = sample.distance / totalDistance;
  });

  return { samples, totalDistance };
}

function createRoadMeshes(track, samples) {
  const group = new THREE.Group();
  group.name = `${track.id}-track-surfaces`;

  const asphalt = new THREE.Mesh(
    stripGeometry(samples, -track.width / 2, track.width / 2, 0.03),
    createMaterial(0x3f454e, { roughness: 0.88 })
  );
  asphalt.receiveShadow = true;
  asphalt.name = "asphalt";
  group.add(asphalt);

  const kerbWidth = 0.85;
  const leftKerb = new THREE.Mesh(
    stripGeometry(samples, -track.width / 2 - kerbWidth, -track.width / 2, 0.055),
    createMaterial(track.environment === "volcanic" ? 0xff7045 : 0xe7e7e1, { roughness: 0.75 })
  );
  const rightKerb = new THREE.Mesh(
    stripGeometry(samples, track.width / 2, track.width / 2 + kerbWidth, 0.055),
    createMaterial(track.environment === "coastal" ? 0x36c6dc : 0xd9483f, { roughness: 0.75 })
  );
  leftKerb.receiveShadow = true;
  rightKerb.receiveShadow = true;
  group.add(leftKerb, rightKerb);

  const runoffOuter = track.width / 2 + track.runoff;
  const leftRunoff = new THREE.Mesh(
    stripGeometry(samples, -runoffOuter, -track.width / 2 - kerbWidth, 0.01),
    createMaterial(track.environment === "harbour" ? 0x50555a : 0x4b4a43, { roughness: 1 })
  );
  const rightRunoff = new THREE.Mesh(
    stripGeometry(samples, track.width / 2 + kerbWidth, runoffOuter, 0.01),
    createMaterial(track.environment === "harbour" ? 0x50555a : 0x4b4a43, { roughness: 1 })
  );
  group.add(leftRunoff, rightRunoff);

  const edgeLineWidth = 0.18;
  const leftEdgeLine = new THREE.Mesh(
    stripGeometry(samples, -track.width / 2 + 0.08, -track.width / 2 + 0.08 + edgeLineWidth, 0.065),
    createMaterial(0xf5f5ef, { roughness: 0.62, emissive: 0x111111, emissiveIntensity: 0.12 })
  );
  const rightEdgeLine = new THREE.Mesh(
    stripGeometry(samples, track.width / 2 - 0.08 - edgeLineWidth, track.width / 2 - 0.08, 0.065),
    createMaterial(0xf5f5ef, { roughness: 0.62, emissive: 0x111111, emissiveIntensity: 0.12 })
  );
  group.add(leftEdgeLine, rightEdgeLine);

  const dashMaterial = createMaterial(0xf1efe5, { roughness: 0.66, emissive: 0x101010, emissiveIntensity: 0.08 });
  for (let index = 0; index < samples.length; index += 18) {
    const sample = samples[index];
    const next = samples[(index + 5) % samples.length];
    const length = Math.max(2.4, sample.point.distanceTo(next.point));
    const dash = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.05, length), dashMaterial);
    dash.position.copy(sample.point).addScaledVector(UP, 0.075);
    dash.rotation.y = Math.atan2(sample.tangent.x, sample.tangent.z);
    group.add(dash);
  }

  // Start/finish line.
  const start = samples[0];
  const line = new THREE.Mesh(
    new THREE.BoxGeometry(track.width + 1.6, 0.055, 1.25),
    createMaterial(0xf4f4ef, { roughness: 0.8 })
  );
  line.position.copy(start.point).addScaledVector(UP, 0.07);
  line.rotation.y = Math.atan2(start.tangent.x, start.tangent.z);
  group.add(line);

  return group;
}

function createBarriers(track, samples) {
  const stride = track.environment === "harbour" ? 5 : 8;
  const instanceCount = Math.ceil(samples.length / stride) * 2;
  const geometry = new THREE.BoxGeometry(0.34, track.environment === "harbour" ? 1.6 : 1.2, 2.6);
  const material = createMaterial(track.environment === "volcanic" ? 0x39211d : 0x9ca6aa, {
    roughness: 0.72,
    metalness: 0.18
  });
  const barriers = new THREE.InstancedMesh(geometry, material, instanceCount);
  barriers.castShadow = true;
  barriers.receiveShadow = true;
  barriers.name = "barriers";

  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3(1, 1, 1);
  const position = new THREE.Vector3();
  let instance = 0;

  for (let index = 0; index < samples.length; index += stride) {
    const sample = samples[index];
    const yaw = Math.atan2(sample.tangent.x, sample.tangent.z);
    quaternion.setFromEuler(new THREE.Euler(0, yaw, 0));
    for (const side of [-1, 1]) {
      const offset = side * sceneryClearance(track, 0.6);
      position.copy(sample.point)
        .addScaledVector(sample.normal, offset)
        .addScaledVector(UP, track.environment === "harbour" ? 0.82 : 0.62);
      matrix.compose(position, quaternion, scale);
      barriers.setMatrixAt(instance++, matrix);
    }
  }
  barriers.count = instance;
  barriers.instanceMatrix.needsUpdate = true;
  return barriers;
}

function createBrakeMarkers(track, samples) {
  const group = new THREE.Group();
  group.name = "brake-markers";
  for (const marker of track.brakeMarkers || []) {
    const index = Math.floor(marker * samples.length) % samples.length;
    const sample = samples[index];
    for (const side of [-1, 1]) {
      const board = new THREE.Mesh(
        new THREE.BoxGeometry(1.25, 1.0, 0.12),
        createMaterial(0xf5f3e9, { roughness: 0.65 })
      );
      board.position.copy(sample.point)
        .addScaledVector(sample.normal, side * (track.width / 2 + 3))
        .addScaledVector(UP, 1.0);
      board.rotation.y = Math.atan2(sample.tangent.x, sample.tangent.z);
      group.add(board);
    }
  }
  return group;
}

function createCoastalEnvironment(scene, trackModel) {
  const { samples } = trackModel;
  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(1800, 1800),
    new THREE.MeshStandardMaterial({ color: 0x1f8799, roughness: 0.35, metalness: 0.18 })
  );
  sea.rotation.x = -Math.PI / 2;
  sea.position.y = -6;
  sea.receiveShadow = true;
  scene.add(sea);

  const helideck = new THREE.Group();
  const deck = new THREE.Mesh(
    new THREE.CylinderGeometry(24, 24, 1.8, 48),
    createMaterial(0x303c43, { roughness: 0.82 })
  );
  deck.position.set(45, 9, -330);
  helideck.add(deck);
  const hRing = new THREE.Mesh(
    new THREE.RingGeometry(8, 12, 48),
    new THREE.MeshBasicMaterial({ color: 0xf2d458, side: THREE.DoubleSide })
  );
  hRing.rotation.x = -Math.PI / 2;
  hRing.position.set(45, 10, -330);
  helideck.add(hRing);
  scene.add(helideck);

  const cliffGeometry = new THREE.DodecahedronGeometry(14, 0);
  const cliffMaterial = createMaterial(0x3f574f, { roughness: 1 });
  const cliffs = new THREE.InstancedMesh(cliffGeometry, cliffMaterial, 70);
  const matrix = new THREE.Matrix4();
  for (let index = 0; index < 70; index += 1) {
    const sample = samples[(index * 13) % samples.length];
    const side = index % 2 ? -1 : 1;
    const p = sample.point.clone().addScaledVector(sample.normal, side * sceneryClearance(trackModel.track, 16 + (index % 5) * 6));
    p.y -= 1 + (index % 3) * 2;
    const scale = new THREE.Vector3(1.2 + index % 4 * 0.3, 0.8 + index % 3 * 0.25, 1.0 + index % 5 * 0.18);
    matrix.compose(p, new THREE.Quaternion(), scale);
    cliffs.setMatrixAt(index, matrix);
  }
  cliffs.castShadow = true;
  cliffs.receiveShadow = true;
  scene.add(cliffs);
}

function createHarbourEnvironment(scene, trackModel) {
  const { samples } = trackModel;
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(1000, 1000),
    createMaterial(0x252e34, { roughness: 1 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.2;
  ground.receiveShadow = true;
  scene.add(ground);

  const containerGeometry = new THREE.BoxGeometry(5.8, 2.7, 2.5);
  const containerMaterials = [0xb64034, 0x2e688c, 0xd28c2f, 0x4d7d55].map(color => createMaterial(color, { roughness: 0.78 }));
  const matrix = new THREE.Matrix4();
  for (let batch = 0; batch < containerMaterials.length; batch += 1) {
    const mesh = new THREE.InstancedMesh(containerGeometry, containerMaterials[batch], 24);
    for (let index = 0; index < 24; index += 1) {
      const sample = samples[(index * 31 + batch * 17) % samples.length];
      const side = (index + batch) % 2 ? -1 : 1;
      const p = sample.point.clone().addScaledVector(sample.normal, side * sceneryClearance(trackModel.track, 10 + (index % 4) * 4));
      p.y = 1.35 + (index % 3) * 2.7;
      const yaw = Math.atan2(sample.tangent.x, sample.tangent.z);
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0));
      matrix.compose(p, q, new THREE.Vector3(1, 1, 1));
      mesh.setMatrixAt(index, matrix);
    }
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
  }

  // Procedural port cranes.
  for (let index = 0; index < 7; index += 1) {
    const sample = samples[(index * 127 + 80) % samples.length];
    const side = index % 2 ? -1 : 1;
    const crane = new THREE.Group();
    const tower = new THREE.Mesh(new THREE.BoxGeometry(1.5, 18, 1.5), createMaterial(0xe0a52b));
    tower.position.y = 9;
    const arm = new THREE.Mesh(new THREE.BoxGeometry(18, 1.0, 1.2), createMaterial(0xe0a52b));
    arm.position.set(side * 6.5, 17, 0);
    crane.add(tower, arm);
    crane.position.copy(sample.point).addScaledVector(sample.normal, side * sceneryClearance(trackModel.track, 16));
    scene.add(crane);
  }
}

function createVolcanicEnvironment(scene, trackModel) {
  const { samples } = trackModel;
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(1500, 1500, 1, 1),
    createMaterial(0x201716, { roughness: 1 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -8;
  ground.receiveShadow = true;
  scene.add(ground);

  const rockGeometry = new THREE.DodecahedronGeometry(6, 0);
  const rockMaterial = createMaterial(0x392621, { roughness: 1 });
  const rocks = new THREE.InstancedMesh(rockGeometry, rockMaterial, 120);
  const matrix = new THREE.Matrix4();
  for (let index = 0; index < 120; index += 1) {
    const sample = samples[(index * 19) % samples.length];
    const side = index % 2 ? -1 : 1;
    const p = sample.point.clone().addScaledVector(sample.normal, side * sceneryClearance(trackModel.track, 14 + (index % 7) * 6));
    p.y += (index % 5) - 7;
    const scale = new THREE.Vector3(0.7 + (index % 5) * 0.22, 0.8 + (index % 4) * 0.35, 0.7 + (index % 6) * 0.18);
    matrix.compose(p, new THREE.Quaternion(), scale);
    rocks.setMatrixAt(index, matrix);
  }
  rocks.castShadow = true;
  rocks.receiveShadow = true;
  scene.add(rocks);

  const lavaMaterial = new THREE.MeshStandardMaterial({
    color: 0xff4a20,
    emissive: 0xff2a08,
    emissiveIntensity: 2.2,
    roughness: 0.4
  });
  for (let index = 0; index < 12; index += 1) {
    const sample = samples[(index * 73 + 20) % samples.length];
    const lava = new THREE.Mesh(new THREE.SphereGeometry(3 + (index % 4), 12, 8), lavaMaterial);
    lava.scale.y = 0.18;
    lava.position.copy(sample.point).addScaledVector(sample.normal, (index % 2 ? -1 : 1) * sceneryClearance(trackModel.track, 18 + (index % 3) * 5));
    lava.position.y -= 2;
    scene.add(lava);
  }
}

function createEnvironment(scene, track, trackModel) {
  if (track.environment === "coastal") createCoastalEnvironment(scene, trackModel);
  else if (track.environment === "harbour") createHarbourEnvironment(scene, trackModel);
  else createVolcanicEnvironment(scene, trackModel);
}

export function buildTrack(scene, track, options = {}) {
  const points = track.controlPoints.map(point => new THREE.Vector3(point.x, point.y, point.z));
  const curve = new THREE.CatmullRomCurve3(points, true, "centripetal", 0.45);
  const { samples, totalDistance } = createTrackSamples(curve, track, options.sampleCount || 960);
  const group = new THREE.Group();
  group.name = `formula-track-${track.id}`;
  group.add(createRoadMeshes(track, samples));
  group.add(createBarriers(track, samples));
  group.add(createBrakeMarkers(track, samples));
  scene.add(group);

  const trackModel = {
    track,
    curve,
    samples,
    totalDistance,
    sampleCount: samples.length,
    group,
    sectorIndices: track.sectors.map(value => Math.floor(value * samples.length) % samples.length),
    startIndex: 0,
    dispose() {
      group.traverse(object => {
        if (object.geometry) object.geometry.dispose();
        if (Array.isArray(object.material)) object.material.forEach(material => material.dispose());
        else object.material?.dispose?.();
      });
      scene.remove(group);
    }
  };

  createEnvironment(scene, track, trackModel);
  return trackModel;
}

export function findNearestSample(trackModel, position, hintIndex = 0, radius = 45) {
  const { samples } = trackModel;
  let bestIndex = hintIndex;
  let bestDistanceSq = Infinity;
  const count = samples.length;

  for (let offset = -radius; offset <= radius; offset += 1) {
    const index = (hintIndex + offset + count) % count;
    const sample = samples[index];
    const dx = position.x - sample.point.x;
    const dz = position.z - sample.point.z;
    const distanceSq = dx * dx + dz * dz;
    if (distanceSq < bestDistanceSq) {
      bestDistanceSq = distanceSq;
      bestIndex = index;
    }
  }

  return {
    sample: samples[bestIndex],
    index: bestIndex,
    distanceSq: bestDistanceSq
  };
}
