# Assets and licenses

No Nintendo game data, extracted models, recordings, or copyrighted textures are included. No external asset URLs or API credentials are required at runtime.

| Material / asset | Source | License |
| --- | --- | --- |
| Grass, meadow, masonry, rock, bark and gold textures | Deterministic Canvas generators in `src/App.tsx`, `src/nature.tsx` | MIT, same as project |
| Leaf clusters and cloud textures | Original local Canvas generators in `src/nature.tsx` | MIT |
| Terrain, vegetation, pipes, blocks, coins, enemies, mushrooms, flag and castle | Original procedural Three.js geometry | MIT |
| Lighting / environment reflections | Drei Sky and local Lightformer environment, no downloaded HDRI | MIT (Drei) |
| Sound effects | Original Web Audio synthesized tones | MIT |
| Interface fonts | Installed system fonts; no font files distributed | System font licenses apply |

PBR materials use roughness, metalness, bump maps, and environment reflections. These are generated alternatives to downloaded photographic PBR texture sets; they should not be described as photographic scans or downloaded CC0 materials. There are no missing downloads to repair.

Open-source libraries: React (MIT), Vite (MIT), TypeScript (Apache-2.0), Three.js (MIT), React Three Fiber (MIT), Drei (MIT), React Three Rapier (MIT), Rapier (Apache-2.0), Playwright (Apache-2.0). Their license files are included by the package manager in installed dependencies.
