import { useEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { RigidBody } from "@react-three/rapier";

function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function foliageTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const x = c.getContext("2d")!,
    r = rng(234);
  for (let i = 0; i < 650; i++) {
    const a = r() * Math.PI * 2,
      d = Math.sqrt(r()) * 115,
      px = 128 + Math.cos(a) * d,
      py = 128 + Math.sin(a) * d;
    x.save();
    x.translate(px, py);
    x.rotate(r() * 6.28);
    x.fillStyle = ["#557234", "#6e8e40", "#405b2b", "#8d9b46", "#9baf59"][
      i % 5
    ];
    x.beginPath();
    x.ellipse(0, 0, 3 + r() * 3, 6 + r() * 7, 0, 0, Math.PI * 2);
    x.fill();
    x.strokeStyle = "#cad17a33";
    x.beginPath();
    x.moveTo(0, -7);
    x.lineTo(0, 7);
    x.stroke();
    x.restore();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
const leaves = foliageTexture();
const blade = new THREE.BufferGeometry();
blade.setAttribute(
  "position",
  new THREE.Float32BufferAttribute(
    [
      -0.035, 0, 0, 0.035, 0, 0, -0.027, 0.24, 0.02, 0.027, 0.24, 0.02, 0, 0.52,
      0.08,
    ],
    3,
  ),
);
blade.setAttribute(
  "uv",
  new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 0.5, 1, 0.5, 0.5, 1], 2),
);
blade.setIndex([0, 1, 2, 1, 3, 2, 2, 3, 4]);
blade.computeVertexNormals();
const hills = new THREE.PlaneGeometry(500, 580, 160, 180);
hills.rotateX(-Math.PI / 2);
const hp = hills.attributes.position;
for (let i = 0; i < hp.count; i++) {
  const x = hp.getX(i),
    z = hp.getZ(i) - 95;
  const edge = THREE.MathUtils.smoothstep(Math.abs(x), 10, 38);
  const y =
    -0.22 +
    edge *
      (7 +
        Math.sin(x * 0.034 + z * 0.021) * 8 +
        Math.sin(z * 0.046 - x * 0.03) * 5 +
        Math.cos(x * 0.06 + z * 0.04) * 3);
  const ridge =
    Math.max(0, Math.abs(x) - 110) *
    0.35 *
    Math.pow(0.75 + 0.25 * Math.sin(z * 0.024), 2);
  hp.setXYZ(i, x, y + ridge, z);
}
const indices: number[] = [];
const hi = hills.index!;
for (let i = 0; i < hi.count; i += 3) {
  const ids = [hi.getX(i), hi.getX(i + 1), hi.getX(i + 2)];
  const x = ids.reduce((s, j) => s + hp.getX(j), 0) / 3,
    z = ids.reduce((s, j) => s + hp.getZ(j), 0) / 3;
  if (
    Math.abs(x) < 11 &&
    ((z < -42 && z > -48) || (z < -93 && z > -100) || (z < -214 && z > -221))
  )
    continue;
  indices.push(...ids);
}
hills.setIndex(indices);
hills.computeVertexNormals();
function meadowTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 512;
  const x = c.getContext("2d")!,
    r = rng(882);
  x.fillStyle = "#70834a";
  x.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 65000; i++) {
    x.fillStyle = ["#52693c", "#8b9958", "#a3a965", "#6b7e43", "#404e2a"][
      i % 5
    ];
    x.globalAlpha = 0.18 + r() * 0.35;
    const px = r() * 512,
      py = r() * 512;
    x.fillRect(px, py, 0.5 + r() * 2, 1 + r() * 5);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(95, 110);
  t.anisotropy = 8;
  return t;
}
const meadow = meadowTexture();
const cloudTexture = (() => {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 256;
  const x = c.getContext("2d")!,
    r = rng(29);
  for (let i = 0; i < 70; i++) {
    const px = 70 + r() * 370,
      py = 100 + r() * 65,
      rad = 20 + r() * 50;
    const g = x.createRadialGradient(px, py, 0, px, py, rad);
    g.addColorStop(0, "rgba(255,253,238,.24)");
    g.addColorStop(0.5, "rgba(255,255,248,.15)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    x.fillStyle = g;
    x.fillRect(px - rad, py - rad, rad * 2, rad * 2);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
})();
export const treePositions = Array.from({ length: 42 }, (_, i) => ({
  p: [(i % 2 ? 1 : -1) * (12 + (i % 4) * 3), -1, -i * 8] as [
    number,
    number,
    number,
  ],
  scale: 0.85 + (i % 3) * 0.25,
}));
export function Landscape() {
  return (
    <>
      <RigidBody type="fixed" colliders="trimesh">
        <mesh geometry={hills} receiveShadow>
          <meshStandardMaterial
            color="#b5be8a"
            map={meadow}
            bumpMap={meadow}
            bumpScale={0.09}
            roughness={1}
          />
        </mesh>
      </RigidBody>
      {Array.from({ length: 14 }, (_, i) => (
        <mesh
          key={i}
          position={[
            (i % 2 ? 1 : -1) * (65 + i * 4),
            48 + (i % 3) * 12,
            -20 - i * 24,
          ]}
          rotation={[0, i % 2 ? -0.5 : 0.5, 0]}
          scale={[68, 24, 1]}
        >
          <planeGeometry />
          <meshBasicMaterial
            map={cloudTexture}
            transparent
            opacity={0.8}
            depthWrite={false}
            side={THREE.DoubleSide}
            fog={false}
          />
        </mesh>
      ))}
    </>
  );
}
export function Foliage({ high }: { high: boolean }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  useEffect(() => {
    const r = rng(45),
      d = new THREE.Object3D();
    treePositions.forEach(({ p, scale }, j) => {
      for (let i = 0; i < 65; i++) {
        const a = r() * 6.28,
          theta = Math.acos(2 * r() - 1),
          radius = 1.5 + Math.cbrt(r()) * 1.2;
        d.position.set(
          p[0] + Math.cos(a) * Math.sin(theta) * radius * scale,
          p[1] + (5 + Math.cos(theta) * radius * 0.7) * scale,
          p[2] + Math.sin(a) * Math.sin(theta) * radius * scale,
        );
        d.rotation.set(r() * Math.PI, r() * Math.PI, r() * Math.PI);
        d.scale.setScalar((0.6 + r() * 0.55) * scale);
        d.updateMatrix();
        ref.current!.setMatrixAt(j * 65 + i, d.matrix);
        ref.current!.setColorAt(
          j * 65 + i,
          new THREE.Color().setHSL(
            0.21 + r() * 0.04,
            0.28 + r() * 0.2,
            0.35 + r() * 0.14,
          ),
        );
      }
    });
    ref.current!.instanceMatrix.needsUpdate = true;
  }, []);
  return (
    <instancedMesh
      ref={ref}
      args={[undefined, undefined, 42 * 65]}
      castShadow={high}
      receiveShadow
    >
      <planeGeometry args={[2, 2]} />
      <meshStandardMaterial
        map={leaves}
        alphaTest={0.38}
        side={THREE.DoubleSide}
        roughness={0.95}
        color="#dde2b3"
      />
    </instancedMesh>
  );
}
export function Grass({
  count,
  sections,
}: {
  count: number;
  sections: { start: number; end: number }[];
}) {
  const ref = useRef<THREE.InstancedMesh>(null);
  useEffect(() => {
    const r = rng(12),
      d = new THREE.Object3D();
    for (let i = 0; i < count; i++) {
      const z = 14 - r() * 350;
      let x = (r() - 0.5) * 19;
      if (Math.abs(x) < 2.7) x += x > 0 ? 2.7 : -2.7;
      d.position.set(x, 0, z);
      d.rotation.set(0, r() * Math.PI * 2, (r() - 0.5) * 0.2);
      d.scale.set(0.6 + r() * 0.8, 0.3 + r() * 0.65, 1);
      if (!sections.some((s) => z < s.start && z > s.end)) d.scale.setScalar(0);
      d.updateMatrix();
      ref.current!.setMatrixAt(i, d.matrix);
      ref.current!.setColorAt(
        i,
        new THREE.Color().setHSL(
          0.19 + r() * 0.06,
          0.25 + r() * 0.25,
          0.3 + r() * 0.16,
        ),
      );
    }
    ref.current!.instanceMatrix.needsUpdate = true;
  }, [count, sections]);
  useFrame(({ clock }) => {
    const m = ref.current?.material as THREE.Material | undefined;
    if (m?.userData.shader)
      m.userData.shader.uniforms.windTime.value = clock.elapsedTime;
  });
  return (
    <instancedMesh
      ref={ref}
      args={[blade, undefined, count]}
      frustumCulled={false}
    >
      <meshStandardMaterial
        color="#9dad68"
        roughness={1}
        side={THREE.DoubleSide}
        onBeforeCompile={(s) => {
          s.uniforms.windTime = { value: 0 };
          s.vertexShader = "uniform float windTime;\n" + s.vertexShader;
          s.vertexShader = s.vertexShader.replace(
            "#include <begin_vertex>",
            "#include <begin_vertex>\n transformed.x += sin(windTime * 1.4 + instanceMatrix[3].x + instanceMatrix[3].z) * 0.075 * pow(position.y / 0.52, 2.0);",
          );
          if (ref.current)
            (ref.current.material as THREE.Material).userData.shader = s;
        }}
      />
    </instancedMesh>
  );
}
