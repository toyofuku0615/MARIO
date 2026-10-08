import * as THREE from "three";
import type { RapierRigidBody } from "@react-three/rapier";
export const SPAWN: [number, number, number] = [0, 2.5, 7];
export const keys: Set<string> =
  import.meta.hot?.data.keys ?? new Set<string>();
if (import.meta.hot) import.meta.hot.data.keys = keys;
export const player = {
  position: new THREE.Vector3(...SPAWN),
  velocity: 0,
  yaw: 0,
  pitch: 0,
  grounded: false,
  body: null as RapierRigidBody | null,
};
