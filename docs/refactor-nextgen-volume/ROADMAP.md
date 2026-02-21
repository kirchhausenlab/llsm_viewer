# Roadmap

Status: **V1 complete; V2 complete**

## V2 phase status (2026-02-21)

- Phase 0: Baseline and targets (`DONE`)
- Phase 1: Strict pyramid validator (`DONE`)
- Phase 2: Profile-driven scale policy unification (`DONE`)
- Phase 3: Demand-driven residency scheduler (`DONE`)
- Phase 4: Mixed-LOD rendering (`DONE`)
- Phase 5: Sliced-mode parity (`DONE`)
- Phase 6: Playback QoS and prefetch tuning (`DONE`)
- Phase 7: Hard cutover and cleanup (`DONE`)

## Completion summary

All V2 roadmap phases are complete. V1 closure phases remain complete.

## Phase status

- Phase 0: Baseline and targets (`DONE`)
- Phase 1: Manifest vNext and schema contracts (`DONE`)
- Phase 2: Preprocessing rewrite (`DONE`)
- Phase 3: Runtime data/cache scheduler (`DONE`)
- Phase 4: Renderer integration (`DONE`)
- Phase 5: Tuning and hardening (`DONE`)
- Phase 6: Cutover and cleanup (`DONE`)
- Phase 7: True brick residency cutover (`DONE`)
- Phase 8: Multiscale streaming and final closure (`DONE`)

## Final closure criteria status

- No open Architecture Completion Backlog items remain in `BACKLOG.md` (`NGR-090+` all `DONE`).
- `SCHEMA_VNEXT.md` has no unresolved architecture-gap blockers.
- `SESSION_HANDOFF.md` reflects completed status with no contradictory caveats.
- Final verification and benchmark evidence is recorded.

## Final verification snapshot

Executed on **2026-02-13**:

- `npm run -s typecheck` ✅
- `npm run -s typecheck:tests` ✅
- `npm run -s test` ✅
- `npm run -s benchmark:nextgen-volume` ✅
