# Krunked & Fred

[![Krunked & Fred CI & Deploy Pages](https://github.com/krunked-fpv/krunked-n-fred/actions/workflows/ci.yml/badge.svg)](https://github.com/krunked-fpv/krunked-n-fred/actions/workflows/ci.yml)

**Play Live:** https://krunked-fpv.github.io/krunked-n-fred/

A crisp `480 x 270` pixel-art, `50 Hz` deterministic rope-tethered co-op precision platformer built for the Krunked Foundry.

Two chubby penguins—**Krunked** (crimson scarf) and **Fred** (emerald scarf)—are bound together by a taut `40 px` climbing rope as they scale perilous alpine peaks, dark minecart shafts, windswept crags, slick glacial summits, and a high-voltage subterranean Laboratory.

## Highlights

- **Exact 50 Hz Rope-Tethered Physics**: Unilateral `2.5 u` (`40 px`) climbing rope with 20-iteration Position-Based Dynamics, 35-segment braided Verlet visuals, wall-cling stamina with red-tint warning & sweat drops, counterweight anchoring, tangential pendulum slingshot swings, ledge-drag escalation, and `SmoothStep` ice momentum.
- **Three Native Play Modes**:
  - **Local 2P Couch Co-Op**: Shared keyboard, dual controllers, keyboard + controller, split-controller 1-pad co-op, or dual-edge tabletop touch.
  - **Zero-Backend Online P2P Co-Op**: WebRTC DataChannel via copy/paste compressed Room Codes (works directly on static GitHub Pages with no server) plus instant same-browser Dual-Tab `BroadcastChannel` Co-Op.
  - **Solo Modes**: Climb with **Jeff the Rock** (carry, toss, anchor, wall-cling, and swing) or toggle **AI Buddy Fred** to tackle the Co-Op Mountain, Laboratory DLC, and Time Trials solo.
- **Full Content Suite**:
  - **Co-Op & Solo Mountains (`0..498 m`)**: Village Hub, Snowy Foothills, Dark Mines (with 2D headlamp lighting & Seal rescue), Windy Crags (cyclic gusts, swing platforms, crumbling blocks), and Frozen Summit.
  - **Laboratory DLC (`0..661 m`)**: Circuit buttons, glowing traces, lasers, pneumatic Troncho pistons, color-filtered Krunked/Fred ledges, and the **Bachicha 4-Chain Boss Arena**.
  - **10 Time Trials (`TT1`–`TT10`)** with Bronze / Silver / Gold / Platinum medals.
  - **Meta & Collectibles**: 16 Co-Op Skins, 6 Jeff Skins, 12 Rope Skins, 12 Polaroid Photos, 7 Field Manual Pages, 11 Jukebox Tracks, 26 Achievements, Clap & Rock-Paper-Scissors Emotes, and 4 Assist Mode toggles (including Flag + Charlie bird checkpoints).
- **Full Controller & Auto-Hiding Touch Support**: Native Xbox, DualSense, Switch Pro, and Tesla In-Car Browser Gamepad support across gameplay and every menu. Translucent touch controls stay 100% hidden on desktop and materialize automatically on touch input.
- **Dual Art Pack Support**: Ships with complete built-in Krunked pixel art and procedural Web Audio synth across 14 terrain surfaces, plus live hot-swap support for user-owned Custom Asset Packs via dev middleware or browser folder picker.

## Controls

| Action | P1 (Krunked) | P2 (Fred) | Gamepad |
| --- | --- | --- | --- |
| Move | `A` / `D` | `Left` / `Right` | Left Stick / D-Pad |
| Jump | `Space` | `Enter` | `A` / Cross |
| Wall Grab / Carry Jeff | `Left Shift` | `Right Shift` | `RB` / `RT` / `X` |
| Anchor (Counterweight) | `C` | `/` | `LT` / `LB` / `B` |
| Assist Pull Rope | `Q` | `.` | `Y` / Triangle |
| Plant Flag / Call Charlie | `F` / Hold `R` | `F` / Hold `R` | `Select` / Hold `LB+RB` |
| Emote (Clap / RPS) | `E` | `E` | `RS` / Up+Y |
| Pause | `Esc` | `Esc` | `Start` |
| Dev Playtest Drawer | `F9` | `F9` | — |

## Scripts

```bash
npm install          # Install dev dependencies
npm run dev          # Start local dev server (http://127.0.0.1:5173)
npm run play         # Alias for dev server
npm run typecheck    # Strict TypeScript check
npm run test         # Run Vitest unit & integration suites
npm run verify:assets# Gate A: Asset, Oracle & IP hygiene verification
npm run verify:sim   # Gate B: Deterministic physics & full-world reachability soak
npm run verify       # Run full verification suite
npm run build        # Build static bundle into dist/
```
