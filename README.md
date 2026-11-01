# Expression Puppet

**Interactive character and pose toy · Rive web runtime + application state · single-player · phone required · flat-screen app**

> Planned design, not implemented or browser-tested. `index.pseudo.mjs` is an explanatory entry point, not a playable game.

## Experience

Direct an expressive character with a few meaningful controls and complete short pose-matching challenges.

## What this demonstrates

- Rigged character blending
- Pointer-driven look and facial control
- Data binding and authored constraints

## Rules and complete loop

- Free-play lets user control look, mood and pose within authored ranges.
- Challenge mode shows a target expression and scores the logical parameter match, not computer vision.
- No webcam, face recognition or MediaPipe dependency in the initial release.

## Bounded polished release

One original rig, eight expression challenges, six saved pose slots in the project file.

- Eye/gaze changes bounded and comfortable
- Readable target silhouette
- Accessible numeric controls, not only gestures

No multiplayer, accounts, server simulation or generic editor is required. Start, rules/help, play/activity, pause, outcome/goal feedback and retry must all be complete. Settings include volume/mute, reduced motion, contrast and game-specific options where meaningful. State changes occur in the game model; animations illustrate them.

## Rive inside this app

Main rig with authored pose blends; contains all visible character artwork. The requested asset is `expression-puppet.riv`; it is **not included**. See [RIVE.md](RIVE.md) for the authoring/integration contract. A placeholder or unrelated animated logo does not satisfy this requirement.

## Save behavior

Canonical pose values and named slots; no embedded image or executable content. See [SAVE.md](SAVE.md). Loading starts paused; resume is explicit. Restart and load cancel stale callbacks and any owned AI work.

## Build sequence

Implement the rule loop in [gameplay.pseudo.txt](gameplay.pseudo.txt); bind the exact app lifecycle from [index.pseudo.mjs](index.pseudo.mjs); complete [CONTROLS.md](CONTROLS.md); author/integrate [RIVE.md](RIVE.md); then satisfy [ACCEPTANCE.md](ACCEPTANCE.md). Do not add XR or a 3D engine solely to widen the technology list.

Target wave: **2**. Integrator first reads [AGENTS.md](../../AGENTS.md); do not guess host APIs from symbolic helper names.

Use original/licensed artwork and audio. Keep the scope small enough to polish; expand content only after the release gates pass.
