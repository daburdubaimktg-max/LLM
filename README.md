# Dabur Country-Entry Deep Research

Board-grade CPG/FMCG market-entry research for **Dabur India** across **42 countries × 5 reports = 210 deliverables**
(one Country-Macro foundation + four category decks: Oral Care, OTC Health Care, Hair Care, Skin Care per country).

**Public-web data only. No confidential Dabur data ever enters this repo.**

| Where | What |
|---|---|
| `CLAUDE.md` | Operating instructions for Claude Code sessions in this repo |
| `TRACKER.md` | Live sprint tracker — 42 countries, status per report |
| `kit/` | Original handover kit (methodology, run prompts per batch, teammate messages) |
| `.claude/skills/` | The method: `country-analysis` orchestrator + 8 core skills + 7 regional experts |
| `benchmarks/vietnam/` | Reference-standard reports — the quality bar every deck must match |
| `reports/` | Output — one folder per country |
| `tracker/` | Original Excel sprint tracker for the human team |

## Running a country (in Claude Code)

Open a session in this repo and paste the batch's filled prompt from `kit/3_RUN_PROMPTS_BY_BATCH.md`,
swapping in the country name. Macro report first, then Hair → Oral → OTC Health → Skin — **one
category per pass, full depth** (~6,000–9,000 words, ≥20 tables, all 8 mandatory modules). Each
finished report is committed together with its `TRACKER.md` status update.
