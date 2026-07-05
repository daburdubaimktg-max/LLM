# Known issues in the handover kit (found during Vietnam calibration QC, 2026-07-05)

Three skill files arrived **truncated mid-sentence** — likely cut during export/zip from the source
account. Re-export these from the original account and replace:

| File | Truncation point | Impact |
|---|---|---|
| `.claude/skills/country-analysis/SKILL.md` | line 185: "Each category report **references the macro" | Phase 2 tail, Phase 3 (cross-country), Phase 4 (QC/self-check) instructions missing |
| `.claude/skills/country-analysis/references/information-heads.md` | line 237, inside C12: "share-of-vo" | C12 (tail) and C13–C18 head definitions missing |
| `.claude/skills/country-analysis/references/report-template.md` | line 38, inside C8 row: "**Pe" | C8–C18 required-artifact rows missing |

**Workaround in use:** the missing C-head definitions are reconstructed from (a) the DEPTH MANDATE's
8 mandatory modules list in SKILL.md (which is intact), (b) the C1–C18 section structure of the four
Vietnam benchmark decks in `benchmarks/vietnam/`, and (c) `kit/1_PROJECT_INSTRUCTIONS.md` §5. The
macro spec (M1–M11, O1–O6) is complete and unaffected.
