import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
  Suspense,
} from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Environment, Lightformer, Sky, Sparkles } from "@react-three/drei";
import {
  Physics,
  RigidBody,
  CapsuleCollider,
  CuboidCollider,
  CylinderCollider,
  useRapier,
  useBeforePhysicsStep,
  useAfterPhysicsStep,
  type RapierRigidBody,
} from "@react-three/rapier";
import * as THREE from "three";
import "./style.css";
import { Grass, Landscape, Foliage, treePositions } from "./nature";
import { keys, player, SPAWN } from "./gameState";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";

type Status = "title" | "playing" | "paused" | "dead" | "won";
type Quality = "high" | "balanced";
type Vec3 = [number, number, number];
let audio: AudioContext | undefined;
function sound(kind: "coin" | "jump" | "hit" | "win" | "step") {
  try {
    audio ??= new AudioContext();
    if (audio.state === "suspended") void audio.resume();
    const frequencies = {
      coin: [880, 1320],
      jump: [240, 520],
      hit: [140, 60],
      win: [523, 659, 784, 1046],
      step: [65],
    }[kind];
    frequencies.forEach((f, i) => {
      const o = audio!.createOscillator(),
        g = audio!.createGain();
      o.type = kind === "hit" ? "sawtooth" : "sine";
      o.frequency.setValueAtTime(f, audio!.currentTime + i * 0.095);
      o.connect(g);
      g.connect(audio!.destination);
      g.gain.setValueAtTime(0.065, audio!.currentTime + i * 0.095);
      g.gain.exponentialRampToValueAtTime(
        0.001,
        audio!.currentTime + i * 0.095 + 0.17,
      );
      o.start(audio!.currentTime + i * 0.095);
      o.stop(audio!.currentTime + i * 0.095 + 0.2);
    });
  } catch {
    /* Audio is optional. */
  }
}
function random(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function texture(kind: "grass" | "brick" | "rock" | "wood" | "gold") {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 512;
  const c = canvas.getContext("2d")!;
  const rng = random(93);
  const bases = {
    grass: "#658942",
    brick: "#ad6947",
    rock: "#8a8f80",
    wood: "#6d4e32",
    gold: "#eabd38",
  };
  c.fillStyle = bases[kind];
  c.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 25000; i++) {
    const x = rng() * 512,
      y = rng() * 512;
    const v = rng();
    c.fillStyle =
      v > 0.5 ? `rgba(255,247,210,${v * 0.13})` : `rgba(20,32,14,${0.15})`;
    c.fillRect(
      x,
      y,
      kind === "wood" ? 2 : 1 + rng() * 4,
      kind === "grass" ? 1 + rng() * 7 : kind === "wood" ? 30 : 1 + rng() * 4,
    );
  }
  if (kind === "brick") {
    for (let row = 0; row < 6; row++) {
      const y = row * 86;
      c.fillStyle = "#514436";
      c.fillRect(0, y, 512, 5);
      c.fillStyle = "#db9b70";
      c.fillRect(0, y + 5, 512, 2);
      for (let col = -1; col < 4; col++) {
        const x = col * 170 + (row % 2) * 85;
        c.fillStyle = "#514436";
        c.fillRect(x, y, 5, 86);
        c.fillStyle = "#db9b70";
        c.fillRect(x + 5, y + 5, 2, 75);
      }
    }
  }
  if (kind === "wood") {
    for (let i = 0; i < 40; i++) {
      c.strokeStyle = "rgba(20,12,2,.22)";
      c.beginPath();
      c.moveTo(rng() * 512, 0);
      c.bezierCurveTo(rng() * 512, 170, rng() * 512, 320, rng() * 512, 512);
      c.stroke();
    }
  }
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.anisotropy = 8;
  if (kind === "grass") map.repeat.set(18, 18);
  return map;
}
const questionMap = (() => {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#fff0b9";
  ctx.shadowColor = "#875322";
  ctx.shadowOffsetX = 3;
  ctx.shadowOffsetY = 4;
  ctx.font = "bold 190px Georgia";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("?", 128, 136);
  ctx.shadowOffsetX = ctx.shadowOffsetY = 0;
  for (const x of [26, 230])
    for (const y of [26, 230]) {
      ctx.fillStyle = "#8b692e";
      ctx.beginPath();
      ctx.arc(x, y, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#ead495";
      ctx.fillRect(x - 2, y - 2, 3, 2);
    }
  const map = new THREE.CanvasTexture(c);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 4;
  return map;
})();
const blockGeometry = new RoundedBoxGeometry(1.06, 1.06, 1.06, 3, 0.045);
const maps = {
  grass: texture("grass"),
  brick: texture("brick"),
  rock: texture("rock"),
  wood: texture("wood"),
  gold: texture("gold"),
};
const grassMaterial = new THREE.MeshStandardMaterial({
  map: maps.grass,
  bumpMap: maps.grass,
  bumpScale: 0.13,
  roughness: 0.93,
  color: "#d2dfad",
});
const brickMaterial = new THREE.MeshStandardMaterial({
  map: maps.brick,
  bumpMap: maps.brick,
  bumpScale: 0.055,
  roughness: 0.87,
});
const pipeMaterial = new THREE.MeshStandardMaterial({
  color: "#287443",
  metalness: 0.72,
  roughness: 0.28,
  roughnessMap: maps.rock,
  bumpMap: maps.rock,
  bumpScale: 0.008,
});
const terrainSections = [
  { start: 15, end: -43 },
  { start: -47, end: -94 },
  { start: -99, end: -215 },
  { start: -220, end: -335 },
];
const pipeSpecs: Vec3[] = [
  [-4, 0, -19],
  [4, 0, -37],
  [-3.7, 0, -61],
  [4.5, 0, -81],
  [-4, 0, -110],
  [3.9, 0, -134],
  [-4, 0, -178],
  [4, 0, -201],
  [-3.8, 0, -236],
  [4.5, 0, -258],
  [-4, 0, -281],
  [3.9, 0, -304],
];
const blockSpecs: { p: Vec3; type: "question" | "brick" }[] = [];
[
  -12, -30, -55, -75, -105, -125, -148, -177, -198, -235, -255, -277, -299,
].forEach((z, j) => {
  for (let i = -1; i <= 1; i++)
    blockSpecs.push({
      p: [i * 1.15 + (j % 2 ? 2 : -1.8), 3.7, z],
      type: i === 0 ? "question" : "brick",
    });
});
const coinSpecs: Vec3[] = [];
for (let i = 0; i < 86; i++) {
  const z = -5 - i * 3.55;
  if ((z < -42 && z > -48) || (z < -93 && z > -100) || (z < -214 && z > -221))
    continue;
  coinSpecs.push([Math.sin(i * 0.45) * 2.3, 1.35, z]);
}
pipeSpecs.forEach(([x, , z]) => coinSpecs.push([x, 4.3, z]));
const enemyLocations: Vec3[] = [];
const enemySpecs: Vec3[] = [
  [-1, 0, -24],
  [2, 0, -50],
  [-2, 0, -71],
  [0, 0, -86],
  [2, 0, -115],
  [-2, 0, -140],
  [0, 0, -156],
  [-1, 0, -182],
  [2, 0, -206],
  [-2, 0, -243],
  [1, 0, -266],
  [0, 0, -299],
];

function Terrain() {
  return (
    <>
      {terrainSections.map((s, i) => (
        <RigidBody key={i} type="fixed" colliders={false}>
          <CuboidCollider
            args={[10, 1, (s.start - s.end) / 2]}
            position={[0, -1, (s.start + s.end) / 2]}
          />
          <mesh receiveShadow position={[0, -0.07, (s.start + s.end) / 2]}>
            <boxGeometry args={[20, 0.14, s.start - s.end]} />
            <primitive object={grassMaterial} attach="material" />
          </mesh>
          <mesh
            position={[0, -1.3, (s.start + s.end) / 2]}
            castShadow
            receiveShadow
          >
            <boxGeometry args={[20, 2.4, s.start - s.end]} />
            <meshStandardMaterial
              color="#69523c"
              map={maps.rock}
              roughness={1}
            />
          </mesh>
        </RigidBody>
      ))}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -12, -80]}>
        <planeGeometry args={[1600, 1600]} />
        <meshStandardMaterial color="#697e59" roughness={1} />
      </mesh>
    </>
  );
}
function Pipe({ p, index }: { p: Vec3; index: number }) {
  const h = 2.1 + (index % 3) * 0.55;
  return (
    <RigidBody type="fixed" colliders={false} position={p}>
      <CylinderCollider args={[h / 2, 1.05]} position={[0, h / 2, 0]} />
      <mesh
        castShadow
        receiveShadow
        position={[0, h / 2, 0]}
        material={pipeMaterial}
      >
        <cylinderGeometry args={[1.04, 1.04, h, 48]} />
      </mesh>
      <mesh
        castShadow
        receiveShadow
        position={[0, h, 0]}
        material={pipeMaterial}
      >
        <cylinderGeometry args={[1.23, 1.23, 0.45, 64, 1, true]} />
      </mesh>
      <mesh
        castShadow
        position={[0, h + 0.225, 0]}
        rotation={[Math.PI / 2, 0, 0]}
        material={pipeMaterial}
      >
        <torusGeometry args={[1.115, 0.12, 12, 64]} />
      </mesh>
      <mesh position={[0, h - 0.12, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[1.09, 48]} />
        <meshStandardMaterial color="#10281a" roughness={0.8} />
      </mesh>
      <mesh position={[0, 0.13, 0]} material={pipeMaterial}>
        <cylinderGeometry args={[1.13, 1.13, 0.22, 48]} />
      </mesh>
      {[0, 1, 2, 3].map((i) => (
        <mesh
          key={i}
          position={[
            Math.sin((i * Math.PI) / 2) * 1.06,
            0.22,
            Math.cos((i * Math.PI) / 2) * 1.06,
          ]}
        >
          <sphereGeometry args={[0.055, 8, 8]} />
          <meshStandardMaterial
            color="#809981"
            metalness={0.9}
            roughness={0.3}
          />
        </mesh>
      ))}
    </RigidBody>
  );
}
function Mushroom({ p, scale = 1 }: { p: Vec3; scale?: number }) {
  return (
    <group position={p} scale={scale}>
      <mesh castShadow position={[0, 0.3, 0]}>
        <cylinderGeometry args={[0.12, 0.21, 0.6, 12]} />
        <meshStandardMaterial color="#e8dec2" roughness={0.8} />
      </mesh>
      <mesh castShadow position={[0, 0.57, 0]}>
        <sphereGeometry args={[0.48, 32, 20, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color="#ad3729" roughness={0.54} />
      </mesh>
      {[
        [0, 0.99, 0],
        [0.33, 0.83, 0],
        [-0.24, 0.87, 0.18],
        [0, 0.83, -0.35],
      ].map((p, i) => (
        <mesh key={i} position={p as Vec3}>
          <sphereGeometry args={[0.085, 12, 8]} />
          <meshStandardMaterial color="#f1e6c9" />
        </mesh>
      ))}
    </group>
  );
}
function Tree({
  p,
  scale = 1,
  quality,
}: {
  p: Vec3;
  scale?: number;
  quality: Quality;
}) {
  return (
    <group position={p} scale={scale}>
      {quality === "balanced" && (
        <mesh castShadow position={[0, 5, 0]} scale={[2.4, 1.8, 2.4]}>
          <sphereGeometry args={[1, 12, 8]} />
          <meshBasicMaterial colorWrite={false} depthWrite={false} />
        </mesh>
      )}
      <mesh castShadow position={[0, 2.3, 0]}>
        <cylinderGeometry args={[0.16, 0.44, 4.6, 14]} />
        <meshStandardMaterial
          map={maps.wood}
          bumpMap={maps.wood}
          bumpScale={0.09}
          roughness={0.95}
        />
      </mesh>
      {[0, 1, 2].map((i) => (
        <mesh
          key={i}
          castShadow
          position={[
            Math.sin(i * 2.1) * 0.6,
            3.8 + i * 0.2,
            Math.cos(i * 2.1) * 0.6,
          ]}
          rotation={[Math.cos(i * 2.1) * 0.7, 0, -Math.sin(i * 2.1) * 0.7]}
        >
          <cylinderGeometry args={[0.07, 0.2, 2.4, 8]} />
          <meshStandardMaterial map={maps.wood} roughness={0.95} />
        </mesh>
      ))}
    </group>
  );
}
function Scenery({ quality }: { quality: Quality }) {
  const flower = useRef<THREE.InstancedMesh>(null);
  const count = quality === "high" ? 30000 : 9500;
  useEffect(() => {
    const rng = random(12),
      dummy = new THREE.Object3D();
    for (let i = 0; i < 350; i++) {
      dummy.position.set(
        (rng() > 0.5 ? 1 : -1) * (5 + rng() * 4),
        0.22,
        12 - rng() * 335,
      );
      dummy.scale.setScalar(0.04 + rng() * 0.055);
      dummy.updateMatrix();
      flower.current!.setMatrixAt(i, dummy.matrix);
      flower.current!.setColorAt(
        i,
        new THREE.Color(["#fff1bc", "#e6be6a", "#eee8d5", "#d6a6a3"][i % 4]),
      );
    }
    flower.current!.instanceMatrix.needsUpdate = true;
  }, []);
  return (
    <>
      <Grass count={count} sections={terrainSections} />
      <Landscape />
      <Foliage high={quality === "high"} />
      <instancedMesh ref={flower} args={[undefined, undefined, 350]}>
        <sphereGeometry args={[1, 5, 4]} />
        <meshStandardMaterial roughness={0.8} />
      </instancedMesh>
      {treePositions.map((t, i) => (
        <Tree key={i} {...t} quality={quality} />
      ))}
      {Array.from({ length: 30 }, (_, i) => (
        <Mushroom
          key={i}
          p={[(i % 2 ? 1 : -1) * (6.4 + (i % 4) * 0.6), 0, 8 - i * 11]}
          scale={0.3 + (i % 3) * 0.15}
        />
      ))}
      {Array.from({ length: 32 }, (_, i) => (
        <mesh
          castShadow
          key={i}
          position={[(i % 2 ? 1 : -1) * (7.4 + (i % 4) * 0.35), 0.2, -i * 10]}
          scale={[0.8, 0.5, 0.65]}
          rotation={[i, 0.3 * i, 0]}
        >
          <icosahedronGeometry args={[0.5, 2]} />
          <meshStandardMaterial
            map={maps.rock}
            bumpMap={maps.rock}
            bumpScale={0.12}
            roughness={0.95}
          />
        </mesh>
      ))}
      <group position={[0, 0, -322]}>
        <mesh position={[0, 8, 0]} castShadow>
          <cylinderGeometry args={[0.07, 0.13, 16, 16]} />
          <meshStandardMaterial
            color="#d8d9c3"
            metalness={0.7}
            roughness={0.28}
          />
        </mesh>
        <mesh position={[0, 16.2, 0]}>
          <sphereGeometry args={[0.25, 20, 16]} />
          <meshStandardMaterial
            color="#e7be50"
            metalness={0.8}
            roughness={0.22}
          />
        </mesh>
        <mesh position={[1.3, 14.2, 0]}>
          <boxGeometry args={[2.5, 1.5, 0.04]} />
          <meshStandardMaterial color="#eee9cf" roughness={0.75} />
        </mesh>
        <mesh position={[1.3, 14.2, 0.04]}>
          <circleGeometry args={[0.4, 32]} />
          <meshStandardMaterial color="#34734c" />
        </mesh>
        <mesh position={[0, 0.25, 0]} castShadow>
          <cylinderGeometry args={[0.9, 1.15, 0.5, 24]} />
          <primitive object={brickMaterial} attach="material" />
        </mesh>
        <Sparkles
          count={30}
          scale={[8, 7, 8]}
          position={[0, 3, 0]}
          size={3}
          speed={0.3}
          color="#fce4a0"
        />
      </group>
      <group position={[0, 0, -342]}>
        {[-1, 1].map((n) => (
          <group key={n} position={[n * 5, 0, 0]}>
            <mesh castShadow position={[0, 4, 0]}>
              <cylinderGeometry args={[2, 2.5, 8, 24]} />
              <primitive object={brickMaterial} attach="material" />
            </mesh>
            <mesh castShadow position={[0, 9, 0]}>
              <coneGeometry args={[2.6, 3, 24]} />
              <meshStandardMaterial color="#526c5d" roughness={0.65} />
            </mesh>
          </group>
        ))}
        <mesh position={[0, 3, 0]} castShadow>
          <boxGeometry args={[8, 6, 5]} />
          <primitive object={brickMaterial} attach="material" />
        </mesh>
        <mesh position={[0, 1.7, 2.55]}>
          <circleGeometry args={[1.5, 32, 0, Math.PI]} />
          <meshStandardMaterial color="#322d22" side={THREE.DoubleSide} />
        </mesh>
      </group>
    </>
  );
}

type BurstData = {
  id: number;
  p: Vec3;
  color: string;
  kind: "coin" | "dust" | "brick";
};
function Burst({ data }: { data: BurstData }) {
  const ref = useRef<THREE.Group>(null),
    age = useRef(0),
    rng = random(data.id);
  const dirs = useRef(
    Array.from(
      { length: data.kind === "dust" ? 10 : 16 },
      () =>
        new THREE.Vector3((rng() - 0.5) * 4, rng() * 4 + 1, (rng() - 0.5) * 4),
    ),
  );
  useFrame((_, dt) => {
    age.current += dt;
    if (!ref.current) return;
    ref.current.visible = age.current < 1;
    ref.current.children.forEach((m, i) => {
      const t = age.current;
      m.position.copy(dirs.current[i]).multiplyScalar(t);
      m.position.y -= 3 * t * t;
      m.scale.setScalar(
        Math.max(0.001, 1 - t) * (data.kind === "brick" ? 0.17 : 0.08),
      );
    });
  });
  return (
    <group ref={ref} position={data.p}>
      {dirs.current.map((_, i) => (
        <mesh key={i}>
          <icosahedronGeometry args={[1, 0]} />
          <meshStandardMaterial
            color={data.color}
            roughness={0.8}
            emissive={data.kind === "coin" ? data.color : "#000"}
            emissiveIntensity={0.3}
          />
        </mesh>
      ))}
    </group>
  );
}
const coinGeometry = new THREE.CylinderGeometry(0.31, 0.31, 0.075, 32).rotateX(
  Math.PI / 2,
);
const coinRimGeometry = new THREE.TorusGeometry(0.265, 0.018, 8, 32).translate(
  0,
  0,
  0.043,
);
const coinStampGeometry = new THREE.BoxGeometry(0.05, 0.3, 0.016).translate(
  0,
  0,
  0.045,
);
function Coins({
  active,
  onCollect,
}: {
  active: boolean;
  onCollect: (p: Vec3) => void;
}) {
  const bodies = useRef<THREE.InstancedMesh>(null),
    rims = useRef<THREE.InstancedMesh>(null),
    stamps = useRef<THREE.InstancedMesh>(null);
  const taken = useRef(new Uint8Array(coinSpecs.length)),
    dummy = useRef(new THREE.Object3D()),
    phase = useRef(0);
  useFrame(({ clock }) => {
    phase.current = clock.elapsedTime;
    const d = dummy.current;
    coinSpecs.forEach((p, i) => {
      d.position.set(
        p[0],
        p[1] + Math.sin(phase.current * 2 + p[2]) * 0.1,
        p[2],
      );
      d.rotation.set(0, phase.current * 1.8, 0);
      d.scale.setScalar(taken.current[i] ? 0 : 1);
      d.updateMatrix();
      bodies.current!.setMatrixAt(i, d.matrix);
      rims.current!.setMatrixAt(i, d.matrix);
      stamps.current!.setMatrixAt(i, d.matrix);
    });
    for (const mesh of [bodies.current, rims.current, stamps.current])
      if (mesh) mesh.instanceMatrix.needsUpdate = true;
  });
  useAfterPhysicsStep(() => {
    if (!active || !player.body) return;
    const pos = player.body.translation();
    coinSpecs.forEach((p, i) => {
      if (taken.current[i]) return;
      const y = p[1] + Math.sin(phase.current * 2 + p[2]) * 0.1;
      if (Math.hypot(pos.x - p[0], pos.y - y, pos.z - p[2]) < 1.05) {
        taken.current[i] = 1;
        onCollect(p);
      }
    });
  });
  return (
    <>
      <instancedMesh
        ref={bodies}
        args={[coinGeometry, undefined, coinSpecs.length]}
        castShadow
        frustumCulled={false}
      >
        <meshStandardMaterial
          map={maps.gold}
          color="#ffe185"
          metalness={0.68}
          roughness={0.29}
          emissive="#473003"
          emissiveIntensity={0.13}
          envMapIntensity={1.3}
        />
      </instancedMesh>
      <instancedMesh
        ref={rims}
        args={[coinRimGeometry, undefined, coinSpecs.length]}
        frustumCulled={false}
      >
        <meshStandardMaterial
          color="#efdca6"
          metalness={0.72}
          roughness={0.25}
        />
      </instancedMesh>
      <instancedMesh
        ref={stamps}
        args={[coinStampGeometry, undefined, coinSpecs.length]}
        frustumCulled={false}
      >
        <meshStandardMaterial
          color="#b98e23"
          metalness={0.6}
          roughness={0.38}
        />
      </instancedMesh>
    </>
  );
}
function Block({
  p,
  type,
  onHit,
}: {
  p: Vec3;
  type: "question" | "brick";
  onHit: (p: Vec3, type: string) => void;
}) {
  const [used, setUsed] = useState(false),
    [broken, setBroken] = useState(false);
  const mesh = useRef<THREE.Group>(null),
    bounce = useRef(0);
  useFrame((_, dt) => {
    bounce.current = Math.max(0, bounce.current - dt);
    if (mesh.current)
      mesh.current.position.y =
        Math.sin((bounce.current / 0.22) * Math.PI) * 0.2;
  });
  const consumed = useRef(false);
  const activate = () => {
    if (consumed.current) return;
    consumed.current = true;
    bounce.current = 0.22;
    onHit(p, type);
    if (type === "brick") setBroken(true);
    else setUsed(true);
  };
  useBeforePhysicsStep(() => {
    const b = player.body;
    if (!b || consumed.current || b.linvel().y <= 0) return;
    const pos = b.translation();
    const dx = Math.max(0, Math.abs(pos.x - p[0]) - 0.53),
      dz = Math.max(0, Math.abs(pos.z - p[2]) - 0.53);
    const gap = p[1] - 0.53 - (pos.y + 0.8);
    if (
      dx * dx + dz * dz < 0.32 * 0.32 &&
      gap < Math.max(0.06, b.linvel().y / 60 + 0.025) &&
      gap > -0.12
    )
      activate();
  });
  if (broken) return null;
  return (
    <RigidBody
      type="fixed"
      colliders={false}
      position={p}
      onCollisionEnter={(e) => {
        if (e.other.rigidBodyObject?.name !== "player" || used) return;
        if (player.position.y < p[1] - 1.1) {
          activate();
        }
      }}
    >
      <CuboidCollider args={[0.53, 0.53, 0.53]} />
      <group ref={mesh}>
        <mesh castShadow receiveShadow geometry={blockGeometry}>
          {type === "brick" ? (
            <primitive object={brickMaterial} attach="material" />
          ) : (
            <meshStandardMaterial
              color={used ? "#917957" : "#dcb64e"}
              map={used ? maps.wood : maps.gold}
              bumpMap={maps.gold}
              bumpScale={0.025}
              metalness={used ? 0.08 : 0.32}
              roughness={0.5}
            />
          )}
        </mesh>
        {type === "question" &&
          !used &&
          [0, 1, 2, 3].map((i) => (
            <group key={i} rotation={[0, (i * Math.PI) / 2, 0]}>
              <mesh position={[0, 0, 0.537]}>
                <planeGeometry args={[1, 1]} />
                <meshStandardMaterial
                  map={questionMap}
                  transparent
                  alphaTest={0.1}
                  roughness={0.7}
                  depthWrite={false}
                />
              </mesh>
            </group>
          ))}
      </group>
    </RigidBody>
  );
}
function Enemy({
  p,
  index,
  onStomp,
  onDamage,
  active,
}: {
  p: Vec3;
  index: number;
  active: boolean;
  onStomp: (p: Vec3) => void;
  onDamage: () => void;
}) {
  const body = useRef<RapierRigidBody>(null),
    model = useRef<THREE.Group>(null),
    feet = useRef<THREE.Group>(null);
  const dead = useRef(false),
    time = useRef(0);
  const [removed, setRemoved] = useState(false);
  useBeforePhysicsStep(() => {
    const dt = 1 / 60;
    if (!active) return;
    time.current += dt;
    const x = p[0] + Math.sin(time.current * 0.65 + index) * 1.9;
    if (dead.current) {
      if (model.current)
        model.current.scale.y = Math.max(0.06, model.current.scale.y - dt * 5);
      return;
    }
    enemyLocations[index] = [x, 0.54, p[2]];
    body.current?.setNextKinematicTranslation({ x, y: 0.54, z: p[2] });
    if (feet.current)
      feet.current.rotation.z = Math.sin(time.current * 9) * 0.12;
    if (model.current)
      model.current.rotation.y =
        Math.cos(time.current * 0.65 + index) > 0 ? Math.PI / 2 : -Math.PI / 2;
    const dist = Math.hypot(player.position.x - x, player.position.z - p[2]);
    if (dist < 0.95 && player.position.y < 2.1 && player.position.y > 0.2) {
      if (player.velocity < -0.3 && player.position.y > 1.35) {
        dead.current = true;
        onStomp([x, 0.55, p[2]]);
        setTimeout(() => setRemoved(true), 400);
      } else onDamage();
    }
  });
  return removed ? null : (
    <RigidBody
      ref={body}
      type="kinematicPosition"
      colliders={false}
      position={[p[0], 0.54, p[2]]}
    >
      <group ref={model}>
        <mesh castShadow position={[0, 0.33, 0]} scale={[1, 0.85, 0.8]}>
          <sphereGeometry args={[0.65, 32, 20]} />
          <meshStandardMaterial
            color="#885339"
            map={maps.wood}
            roughness={0.86}
          />
        </mesh>
        <mesh castShadow position={[0, -0.05, 0]}>
          <sphereGeometry args={[0.38, 24, 16]} />
          <meshStandardMaterial color="#c9ac7a" roughness={0.9} />
        </mesh>
        <group ref={feet}>
          {[-1, 1].map((n) => (
            <mesh
              key={n}
              castShadow
              position={[n * 0.31, -0.35, 0.04]}
              scale={[1, 0.5, 1.65]}
            >
              <sphereGeometry args={[0.25, 20, 12]} />
              <meshStandardMaterial color="#46322a" roughness={0.9} />
            </mesh>
          ))}
        </group>
        {[-1, 1].map((n) => (
          <group key={n}>
            <mesh position={[n * 0.21, 0.4, 0.43]} scale={[0.85, 1.25, 0.35]}>
              <sphereGeometry args={[0.14, 20, 12]} />
              <meshStandardMaterial color="#eee7d0" roughness={0.6} />
            </mesh>
            <mesh position={[n * 0.18, 0.4, 0.482]} scale={[0.6, 1, 0.3]}>
              <sphereGeometry args={[0.075, 16, 12]} />
              <meshStandardMaterial color="#1d211b" />
            </mesh>
            <mesh position={[n * 0.22, 0.57, 0.44]} rotation={[0, 0, n * 0.3]}>
              <boxGeometry args={[0.29, 0.075, 0.05]} />
              <meshStandardMaterial color="#332c22" />
            </mesh>
          </group>
        ))}
      </group>
    </RigidBody>
  );
}
function Arms({ speed, jumping }: { speed: number; jumping: boolean }) {
  const ref = useRef<THREE.Group>(null);
  const { camera } = useThree();
  useFrame(({ clock }) => {
    const g = ref.current!;
    const bob =
      Math.sin(clock.elapsedTime * 9) * Math.min(speed / 8, 1) * 0.018;
    g.children.forEach((a, i) => {
      a.rotation.x = (jumping ? -0.25 : 0.05) + bob * (i ? 1 : -1);
    });
  });
  return (
    <primitive object={camera}>
      <group ref={ref}>
        {[-1, 1].map((n) => (
          <group
            key={n}
            position={[n * 0.34, -0.32, -0.53]}
            rotation={[0.2, 0, n * 0.18]}
          >
            <mesh position={[0, -0.17, 0.09]}>
              <capsuleGeometry args={[0.085, 0.32, 6, 12]} />
              <meshStandardMaterial color="#9f332a" roughness={0.9} />
            </mesh>
            <mesh position={[0, 0.06, -0.025]} scale={[0.9, 1, 1.2]}>
              <sphereGeometry args={[0.1, 16, 12]} />
              <meshStandardMaterial color="#ece7d8" roughness={0.7} />
            </mesh>
            <mesh position={[-n * 0.075, 0.055, -0.025]} scale={[0.65, 0.9, 1]}>
              <sphereGeometry args={[0.055, 12, 8]} />
              <meshStandardMaterial color="#ece7d8" roughness={0.7} />
            </mesh>
          </group>
        ))}
      </group>
    </primitive>
  );
}
function AvatarBody() {
  const ref = useRef<THREE.Group>(null);
  useFrame(() => {
    ref.current!.position.copy(player.position);
    ref.current!.rotation.y = player.yaw;
  });
  return (
    <group ref={ref}>
      <mesh position={[0, 0.03, 0]}>
        <cylinderGeometry args={[0.22, 0.24, 0.5, 16]} />
        <meshStandardMaterial color="#a53d30" roughness={0.95} />
      </mesh>
      <mesh position={[0, -0.24, 0]}>
        <boxGeometry args={[0.4, 0.3, 0.23]} />
        <meshStandardMaterial color="#304967" roughness={0.95} />
      </mesh>
      {[-1, 1].map((n) => (
        <group key={n}>
          <mesh position={[n * 0.11, -0.47, 0]}>
            <capsuleGeometry args={[0.09, 0.27, 6, 12]} />
            <meshStandardMaterial color="#304967" roughness={0.95} />
          </mesh>
          <mesh position={[n * 0.11, -0.68, -0.07]} scale={[0.9, 0.6, 1.55]}>
            <sphereGeometry args={[0.12, 16, 12]} />
            <meshStandardMaterial color="#634933" roughness={0.9} />
          </mesh>
        </group>
      ))}
    </group>
  );
}
function Controller({
  onDeath,
  onGoal,
  onLand,
  status,
  bounceRef,
}: {
  onDeath: () => void;
  onGoal: () => void;
  onLand: (p: Vec3) => void;
  status: Status;
  bounceRef: React.RefObject<boolean>;
}) {
  const body = useRef<RapierRigidBody>(null);
  const { camera, gl } = useThree();
  const { world, rapier } = useRapier();
  const [motion, setMotion] = useState({ speed: 0, jumping: false });
  const state = useRef({
    jumpHeld: false,
    grounded: false,
    coyote: 0,
    steps: 0,
    fall: 0,
    bob: 0,
    landing: 0,
  });
  useEffect(() => {
    if (import.meta.env.DEV) {
      window.__kingdom = {
        enemies: () => enemyLocations.map((p) => [...p]),
        snapshot: () => ({
          x: player.position.x,
          y: player.position.y,
          z: player.position.z,
          grounded: player.grounded,
          velocity: player.velocity,
        }),
        teleport: (x, y, z, vy = 0, vz = 0) => {
          body.current?.setTranslation({ x, y, z }, true);
          body.current?.setLinvel({ x: 0, y: vy, z: vz }, true);
        },
      };
    }
    return () => {
      delete window.__kingdom;
    };
  }, []);
  useEffect(() => {
    player.position.set(...SPAWN);
    player.yaw = 0;
    player.pitch = 0;
    const move = (e: MouseEvent) => {
      if (document.pointerLockElement === gl.domElement) {
        player.yaw -= e.movementX * 0.002;
        player.pitch = THREE.MathUtils.clamp(
          player.pitch - e.movementY * 0.002,
          -1.35,
          1.35,
        );
      }
    };
    document.addEventListener("mousemove", move);
    return () => document.removeEventListener("mousemove", move);
  }, [gl]);
  useBeforePhysicsStep(() => {
    const b = body.current;
    if (!b) return;
    const dt = 1 / 60,
      s = state.current;
    const pos = b.translation();
    player.position.set(pos.x, pos.y, pos.z);
    const v = b.linvel();
    player.velocity = v.y;
    if (status === "playing") {
      const ray = new rapier.Ray(
        { x: pos.x, y: pos.y - 0.79, z: pos.z },
        { x: 0, y: -1, z: 0 },
      );
      const hit = world.castRay(
        ray,
        0.22,
        true,
        undefined,
        undefined,
        undefined,
        b,
      );
      const ground = !!hit && v.y <= 0.5;
      player.grounded = ground;
      if (ground) {
        s.coyote = 0.11;
        if (!s.grounded && s.fall < -3) {
          s.landing = 0.08;
          onLand([pos.x, 0.05, pos.z]);
          sound("step");
        }
      } else s.coyote = Math.max(0, s.coyote - dt);
      s.grounded = ground;
      s.fall = v.y;
      const forward =
        Number(keys.has("KeyW") || keys.has("ArrowUp")) -
        Number(keys.has("KeyS") || keys.has("ArrowDown"));
      const side =
        Number(keys.has("KeyD") || keys.has("ArrowRight")) -
        Number(keys.has("KeyA") || keys.has("ArrowLeft"));
      const direction = new THREE.Vector3(side, 0, -forward)
        .normalize()
        .applyAxisAngle(new THREE.Vector3(0, 1, 0), player.yaw);
      const sprint = keys.has("ShiftLeft") || keys.has("ShiftRight");
      const speed = sprint ? 7.8 : 4.8;
      const blend = 1 - Math.exp(-(ground ? 16 : 5) * dt);
      let vy = v.y;
      if (keys.has("Space") && !s.jumpHeld && s.coyote > 0) {
        vy = 12.8;
        s.coyote = 0;
        s.grounded = false;
        sound("jump");
      }
      s.jumpHeld = keys.has("Space");
      if (bounceRef.current) {
        vy = 7.5;
        bounceRef.current = false;
      }
      b.setLinvel(
        {
          x: THREE.MathUtils.lerp(v.x, direction.x * speed, blend),
          y: vy,
          z: THREE.MathUtils.lerp(v.z, direction.z * speed, blend),
        },
        true,
      );
      if (pos.y < -9) onDeath();
      if (pos.z < -319 && Math.abs(pos.x) < 3.5) onGoal();
    }
  });
  useAfterPhysicsStep(() => {
    if (player.body) {
      const p = player.body.translation();
      player.position.set(p.x, p.y, p.z);
      player.velocity = player.body.linvel().y;
    }
  });
  useFrame((_, rawDt) => {
    const b = body.current;
    if (!b) return;
    const pos = b.translation(),
      v = b.linvel(),
      dt = Math.min(rawDt, 0.05),
      s = state.current,
      ground = s.grounded,
      sprint = keys.has("ShiftLeft") || keys.has("ShiftRight");
    if (status === "playing") {
      const actual = Math.hypot(v.x, v.z);
      s.bob += dt * actual * 1.8;
      s.landing = THREE.MathUtils.lerp(s.landing, 0, dt * 12);
      camera.position.set(
        pos.x,
        pos.y + 0.63 + (ground ? Math.sin(s.bob) * 0.027 : 0) - s.landing,
        pos.z,
      );
      camera.rotation.set(
        player.pitch,
        player.yaw,
        ground ? Math.sin(s.bob * 0.5) * 0.003 : 0,
        "YXZ",
      );
      (camera as THREE.PerspectiveCamera).fov = THREE.MathUtils.lerp(
        (camera as THREE.PerspectiveCamera).fov,
        sprint && actual > 2 ? 79 : 73,
        dt * 4,
      );
      camera.updateProjectionMatrix();
      if (Math.abs(motion.speed - actual) > 1 || motion.jumping === ground)
        setMotion({ speed: actual, jumping: !ground });
    } else if (status === "title") {
      camera.position.set(5.8, 2.8, 10);
      camera.lookAt(-1, 2, -24);
    } else {
      camera.position.set(pos.x, pos.y + 0.63, pos.z);
    }
  });
  return (
    <>
      <RigidBody
        ref={(b) => {
          body.current = b;
          player.body = b;
        }}
        name="player"
        position={SPAWN}
        colliders={false}
        enabledRotations={[false, false, false]}
        linearDamping={0}
        canSleep={false}
        ccd
      >
        <CapsuleCollider args={[0.48, 0.32]} friction={0} restitution={0} />
      </RigidBody>
      {status !== "title" && (
        <>
          <Arms speed={motion.speed} jumping={motion.jumping} />
          <AvatarBody />
        </>
      )}
    </>
  );
}

function World({
  status,
  quality,
  onCoin,
  onScore,
  onDeath,
  onGoal,
  onDistance,
}: {
  status: Status;
  quality: Quality;
  onCoin: () => void;
  onScore: (n: number) => void;
  onDeath: () => void;
  onGoal: () => void;
  onDistance: (n: number) => void;
}) {
  const [bursts, setBursts] = useState<BurstData[]>([]);
  const id = useRef(1),
    bounce = useRef(false),
    immune = useRef(0),
    tick = useRef(0);
  const addBurst = (p: Vec3, color: string, kind: BurstData["kind"]) =>
    setBursts((a) => [...a.slice(-12), { p, color, kind, id: id.current++ }]);
  useFrame((_, dt) => {
    if (status !== "playing") return;
    tick.current += dt;
    immune.current = Math.max(0, immune.current - dt);
    if (tick.current > 0.2) {
      onDistance(
        Math.min(100, Math.max(0, ((7 - player.position.z) / 326) * 100)),
      );
      tick.current = 0;
    }
  });
  return (
    <>
      <color attach="background" args={["#b4d5e3"]} />
      <fog attach="fog" args={["#b4d5e3", 90, 330]} />
      <Sky
        distance={450000}
        sunPosition={[70, 75, 40]}
        turbidity={2.4}
        rayleigh={1.4}
        mieCoefficient={0.004}
        mieDirectionalG={0.82}
      />
      <ambientLight intensity={0.16} />
      <hemisphereLight args={["#d8efff", "#7b784b", 0.72]} />
      <directionalLight
        position={[25, 55, 25]}
        color="#fff0d5"
        intensity={3.1}
        castShadow
        shadow-mapSize={quality === "high" ? [2048, 2048] : [512, 512]}
        shadow-camera-left={-28}
        shadow-camera-right={28}
        shadow-camera-top={36}
        shadow-camera-bottom={-36}
        shadow-camera-near={1}
        shadow-camera-far={130}
        shadow-bias={-0.00015}
        shadow-normalBias={0.035}
      />
      <SunFollower />
      <Environment resolution={128}>
        <Sky
          distance={100}
          sunPosition={[70, 75, 40]}
          turbidity={2.4}
          rayleigh={1.4}
        />
        <Lightformer
          form="rect"
          intensity={2}
          position={[0, 10, 0]}
          rotation={[Math.PI / 2, 0, 0]}
          scale={[60, 60, 1]}
          color="#b7d8ef"
        />
        <Lightformer
          form="circle"
          intensity={5}
          position={[10, 8, 5]}
          scale={7}
          color="#fff1cf"
        />
        <Lightformer
          intensity={0.6}
          position={[0, -5, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
          scale={50}
          color="#54763d"
        />
      </Environment>
      <Physics
        gravity={[0, -24, 0]}
        paused={status !== "playing"}
        timeStep={1 / 60}
      >
        <Terrain />
        <Scenery quality={quality} />
        {pipeSpecs.map((p, i) => (
          <Pipe key={i} p={p} index={i} />
        ))}
        {blockSpecs.map((b, i) => (
          <Block
            key={i}
            {...b}
            onHit={(p, type) => {
              sound(type === "question" ? "coin" : "hit");
              onScore(type === "question" ? 200 : 50);
              if (type === "question") onCoin();
              addBurst(
                p,
                type === "question" ? "#ffd45e" : "#b57c55",
                type === "question" ? "coin" : "brick",
              );
            }}
          />
        ))}
        <Coins
          active={status === "playing"}
          onCollect={(p) => {
            onCoin();
            onScore(100);
            sound("coin");
            addBurst(p, "#ffd45e", "coin");
          }}
        />
        {enemySpecs.map((p, i) => (
          <Enemy
            key={i}
            p={p}
            index={i}
            active={status === "playing"}
            onStomp={(p) => {
              if (status !== "playing") return;
              bounce.current = true;
              onScore(200);
              sound("hit");
              addBurst(p, "#caa985", "dust");
            }}
            onDamage={() => {
              if (status === "playing" && immune.current <= 0) {
                immune.current = 2;
                sound("hit");
                onDeath();
              }
            }}
          />
        ))}
        <Controller
          status={status}
          bounceRef={bounce}
          onDeath={onDeath}
          onGoal={onGoal}
          onLand={(p) => addBurst(p, "#c1b99b", "dust")}
        />
        {bursts.map((b) => (
          <Burst key={b.id} data={b} />
        ))}
      </Physics>
    </>
  );
}
function SunFollower() {
  const { scene } = useThree();
  useFrame(() => {
    const light = scene.children.find(
      (c) => c instanceof THREE.DirectionalLight,
    ) as THREE.DirectionalLight | undefined;
    if (light) {
      light.position.set(player.position.x + 25, 55, player.position.z + 25);
      light.target.position.set(player.position.x, 0, player.position.z);
      light.target.updateMatrixWorld();
    }
  });
  return null;
}
export default function App() {
  const [status, setStatus] = useState<Status>("title"),
    [quality, setQuality] = useState<Quality>(() => {
      try {
        return localStorage.getItem("kingdom-quality") === "balanced"
          ? "balanced"
          : "high";
      } catch {
        return "high";
      }
    }),
    [coins, setCoins] = useState(0),
    [score, setScore] = useState(0),
    [distance, setDistance] = useState(0),
    [session, setSession] = useState(0),
    [time, setTime] = useState(0),
    [error, setError] = useState("");
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const statusRef = useRef(status);
  statusRef.current = status;
  useEffect(() => {
    try {
      localStorage.setItem("kingdom-quality", quality);
    } catch {}
  }, [quality]);
  const lock = () => {
    const result = canvas.current?.requestPointerLock();
    if (result && "catch" in result)
      result.catch(() =>
        setError("視点操作を有効にするには、画面をクリックしてください。"),
      );
  };
  const start = () => {
    keys.clear();
    setError("");
    setCoins(0);
    setScore(0);
    setDistance(0);
    setTime(0);
    setSession((s) => s + 1);
    setStatus("playing");
    sound("coin");
    lock();
  };
  const resume = () => {
    setStatus("playing");
    lock();
  };
  const death = useCallback(() => {
    if (statusRef.current !== "playing") return;
    statusRef.current = "dead";
    setStatus("dead");
    document.exitPointerLock();
    keys.clear();
  }, []);
  const goal = useCallback(() => {
    if (statusRef.current !== "playing") return;
    statusRef.current = "won";
    setStatus("won");
    sound("win");
    document.exitPointerLock();
    keys.clear();
  }, []);
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (
        ["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(
          e.code,
        )
      )
        e.preventDefault();
      keys.add(e.code);
      if (e.code === "Escape" && statusRef.current === "playing") {
        setStatus("paused");
        document.exitPointerLock();
      }
      if (e.code === "KeyR" && ["dead", "won"].includes(statusRef.current))
        start();
    };
    const up = (e: KeyboardEvent) => keys.delete(e.code);
    const unlock = () => {
      if (!document.pointerLockElement && statusRef.current === "playing")
        setStatus("paused");
    };
    const blur = () => {
      keys.clear();
      if (statusRef.current === "playing") {
        setStatus("paused");
        document.exitPointerLock();
      }
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    document.addEventListener("pointerlockchange", unlock);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      document.removeEventListener("pointerlockchange", unlock);
      window.removeEventListener("blur", blur);
    };
  }, []);
  useEffect(() => {
    if (status !== "playing") return;
    const t = setInterval(() => setTime((t) => t + 1), 1000);
    return () => clearInterval(t);
  }, [status]);
  return (
    <main className={`app ${status === "title" ? "is-title" : ""}`}>
      <Canvas
        shadows
        dpr={quality === "high" ? [1, 1.7] : [1, 1]}
        camera={{ fov: 73, near: 0.06, far: 500 }}
        gl={{
          antialias: true,
          powerPreference: "high-performance",
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 0.95,
        }}
        onCreated={({ gl }) => {
          canvas.current = gl.domElement;
          gl.domElement.setAttribute("aria-label", "緑の王国・3Dゲーム画面");
        }}
        onPointerDown={() => {
          if (status === "playing" && !document.pointerLockElement) lock();
        }}
      >
        <Suspense fallback={null}>
          <World
            key={session}
            status={status}
            quality={quality}
            onCoin={() => setCoins((c) => c + 1)}
            onScore={(n) => setScore((s) => s + n)}
            onDeath={death}
            onGoal={goal}
            onDistance={setDistance}
          />
        </Suspense>
      </Canvas>
      <div className="vignette" />
      <header className="topbar">
        <a className="brand" href="#" onClick={(e) => e.preventDefault()}>
          <span className="brand-mark">✳</span>
          <span>
            VERDANT<span className="brand-sub">KINGDOM</span>
          </span>
        </a>
        <div className="world-label">
          <span className="status-dot" /> WORLD 01{" "}
          <span className="divider">/</span> THE GREEN MEADOWS
        </div>
        <button
          className="quality"
          onClick={() =>
            setQuality((q) => (q === "high" ? "balanced" : "high"))
          }
          aria-label="画質を切り替える"
        >
          <span className="quality-dot" />
          {quality === "high" ? "HIGH QUALITY" : "BALANCED"} <span>⌄</span>
        </button>
      </header>
      {status === "title" ? (
        <>
          <div className="title-shade" />
          <section className="title-panel">
            <div className="eyebrow">
              <span /> A FIRST-PERSON ADVENTURE
            </div>
            <h1>
              A familiar world.
              <br />
              <em>A new perspective.</em>
            </h1>
            <p className="intro">
              あの冒険を、あなたの目で。
              <br />
              風に揺れる草原、輝くコイン、丘の向こうの景色。
              <br />
              緑の王国へ、一歩踏み出そう。
            </p>
            <button className="primary" onClick={start}>
              冒険をはじめる <span>↗</span>
            </button>
            <div className="title-meta">
              <span>01 — 緑の草原</span>
              <span>約 2–3 分の冒険</span>
            </div>
          </section>
          <div className="scene-caption">
            <span className="caption-line" />
            <div>
              THE GREEN MEADOWS<small>光あふれる草原、その先へ。</small>
            </div>
            <span className="caption-index">01</span>
          </div>
          <footer className="title-footer">
            <span>EXPLORE. COLLECT. DISCOVER.</span>
            <span>
              ヘッドフォン推奨 <span className="footer-sep">/</span>{" "}
              デスクトップ専用
            </span>
          </footer>
        </>
      ) : (
        <>
          <div className="hud">
            <div>
              <span className="hud-label">SCORE</span>
              <strong>{String(score).padStart(6, "0")}</strong>
            </div>
            <div>
              <span className="hud-label">COINS</span>
              <strong>
                <span className="coin-icon">◈</span>{" "}
                {String(coins).padStart(2, "0")}
              </strong>
            </div>
            <div>
              <span className="hud-label">TIME</span>
              <strong>
                {Math.floor(time / 60)}:{String(time % 60).padStart(2, "0")}
              </strong>
            </div>
          </div>
          <div className="crosshair" />
          <div className="progress">
            <span>草原の入口</span>
            <div>
              <i style={{ width: `${distance}%` }} />
            </div>
            <span>⚑</span>
          </div>
          {status === "playing" && (
            <div className="play-hint">
              コインをたどって、丘の向こうの旗へ <span>ESC ポーズ</span>
            </div>
          )}
        </>
      )}
      {["paused", "dead", "won"].includes(status) && (
        <div className="modal-backdrop">
          <section className="modal">
            <div className="eyebrow">
              {status === "won"
                ? "STAGE COMPLETE"
                : status === "dead"
                  ? "ANOTHER ADVENTURE AWAITS"
                  : "TAKE A BREATH"}
            </div>
            <div className="modal-symbol">
              {status === "won" ? "⚑" : status === "dead" ? "↻" : "Ⅱ"}
            </div>
            <h2>
              {status === "won"
                ? "草原の、その先へ。"
                : status === "dead"
                  ? "もう一度、冒険へ。"
                  : "ひと休み。"}
            </h2>
            <p>
              {status === "won"
                ? "緑の王国の最初の冒険をクリアしました。"
                : status === "dead"
                  ? "敵は上から踏もう。谷はダッシュしてジャンプ。"
                  : "冒険は、ここであなたを待っています。"}
            </p>
            <div className="result">
              <div>
                <small>SCORE</small>
                <strong>{String(score).padStart(6, "0")}</strong>
              </div>
              <div>
                <small>COINS</small>
                <strong>{coins}</strong>
              </div>
              <div>
                <small>TIME</small>
                <strong>
                  {Math.floor(time / 60)}:{String(time % 60).padStart(2, "0")}
                </strong>
              </div>
            </div>
            <button
              className="primary"
              onClick={status === "paused" ? resume : start}
            >
              {status === "paused" ? "冒険をつづける" : "最初からプレイ"}{" "}
              <span>→</span>
            </button>
            <button
              className="text-button"
              onClick={() => {
                setStatus("title");
                setSession((s) => s + 1);
                document.exitPointerLock();
              }}
            >
              タイトルへ戻る
            </button>
          </section>
        </div>
      )}
      {(status === "title" || status === "paused") && (
        <div className="controls">
          <span>
            <kbd>W A S D</kbd> 移動
          </span>
          <span>
            <kbd>マウス</kbd> 視点
          </span>
          <span>
            <kbd>SPACE</kbd> ジャンプ
          </span>
          <span>
            <kbd>SHIFT</kbd> ダッシュ
          </span>
          <span>
            <kbd>ESC</kbd> ポーズ
          </span>
        </div>
      )}
      {error && (
        <div role="alert" className="error">
          {error}
        </div>
      )}
      <div className="mobile-notice">
        この冒険はキーボードとマウスでプレイします。
        <br />
        デスクトップの Chrome / Edge でお楽しみください。
      </div>
    </main>
  );
}
