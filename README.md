# Expression Puppet — desktop integration

Expression Puppet is a single-player face and pose activity with eight
expression challenges and a free-play mode. Look, smile, eyebrow and pose
values have one canonical, clamped model write path shared by sliders and
pointer dragging. Match scoring uses only the application model values.

The app exports synchronous `mount(host)` and owns its Canvas2D presentation,
animation loop, input listeners, synthesized audio and file subscription.
Closing or losing focus pauses the activity, and disposal is idempotent.

Save and Open use the signed-in desktop's My files through
`host.storage.mirrorFileContext()`. Projects contain canonical pose values,
challenge and score state, all six pose slots and RNG state. Loading validates
every range and slot before replacing the current activity, then resumes paused.
Files-route launches restore directly without a second file picker.

## Current limitation

No authored `expression-puppet.riv` is included. The face is an explicitly
labeled procedural development fallback. `src/rive/contract.ts` records the
required `Main` artboard, `Presentation` state machine, five numeric inputs,
`blink`/`celebrate` triggers and authored visual states. The Rive artwork gate
remains open, as does physical-phone testing.

Save captures the encoded project and destination before asynchronous work,
keeps the desktop close guard active while the write is pending, and preserves
newer edits if controls change during the operation. Open verifies a stable
snapshot after confirmation and after the file read. The app pauses when its
window loses focus, is hidden or rolled up, or the browser loses visibility.
The bundled Rive WASM notice is retained in `LICENSE.rive.txt`.

## Verification

```sh
npm run typecheck --prefix apps/games/04-rive-interactives/expression-puppet
npm test --prefix apps/games/04-rive-interactives/expression-puppet
node tests/expression-puppet-browser.test.mjs
CODI_PHONE=1 node tests/expression-puppet-browser.test.mjs
node tests/expression-puppet-account.test.mjs
```
