# Deferred items — Phase 3

Out-of-scope discoveries logged rather than fixed. Each names the plan that found it.

| Found by | Item | Why deferred |
|---|---|---|
| 03-11 | **No `.gitattributes`.** The working tree has genuinely mixed line endings (`props.ts` CRLF; `materials.ts`, `inkPaper.ts`, `domCopy.ts`, `foldRig.ts` LF) with `core.autocrlf=true`, so git normalises on commit and the mixture is invisible in history — until a tool rewrites a file's endings and a source gate anchored on `;\n` fails for a reason that has nothing to do with the change. `* text=auto eol=lf` at the site root would end the class. Touches the whole repo, including the Electron app outside this project's scope, so it is not a Phase-3 edit. |
| 03-11 | **`src/island/index.ts` — `systems` is assigned and never read** (`ts(6133)`, a warning since 02). It is the rooted handle a teardown would use, and there is no teardown (nothing unmounts the island). Belongs with the teardown when one lands, beside `registry.dispose()`, `ktx2.dispose()` and `materials.dispose()`. |
