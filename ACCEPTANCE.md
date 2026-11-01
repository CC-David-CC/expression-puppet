# Acceptance — Expression Puppet

**All runtime cases are NOT RUN.** This file is a plan; document checks are not gameplay evidence.

Apply all C01–C24 in [common acceptance](../../docs/ACCEPTANCE-COMMON.md). No immersive support is claimed or required for this flat-screen app.

## Game-specific cases

| ID | Experiment / invariant | Status |
|---|---|---|
| expression-puppet-G01 | All control values clamp to documented ranges. | not_run |
| expression-puppet-G02 | Pose score uses app values, not arbitrary Rive event payload. | not_run |
| expression-puppet-G03 | Saved slots restore all parameters. | not_run |
| expression-puppet-G04 | Controls work without camera permission. | not_run |
| expression-puppet-G05 | Low frame rate changes no score. | not_run |
| expression-puppet-G06 | Resize changes no logical pose. | not_run |

## Release evidence

Record rules/content and dependency versions, actual asset names/hashes, desktop browser, real phone and (where required) Galaxy XR build, commands/logs, complete-playthrough result, save restoration result, multiwindow/late-disposal behavior, frame timing and unresolved defects. Exercise actual Rive properties and texture input rather than substituting an HTML mock.

A pure rules unit test, a visual smoke test and a hardware XR test are different evidence. Preserve that distinction. All promised features must be demonstrated or explicitly left incomplete; do not relabel a generic engine scene as the finished game.
