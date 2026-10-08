/// <reference types="vite/client" />
interface Window {
  __kingdom?: {
    enemies: () => number[][];
    snapshot: () => {
      x: number;
      y: number;
      z: number;
      grounded: boolean;
      velocity: number;
    };
    teleport: (
      x: number,
      y: number,
      z: number,
      vy?: number,
      vz?: number,
    ) => void;
  };
}
