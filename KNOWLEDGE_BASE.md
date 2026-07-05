# Knowledge base — querying the reports with an LLM

The HTML reports in `reports/` are the board deliverables. The `facts/` folder is the
**machine-readable knowledge layer** on top of them, so category heads can get a global
cross-market view from a single Claude session — with citations — instead of training a
custom model (which would destroy source/date/confidence provenance and go stale with
every new country).

## The layer

- `facts/<country>/<report>.md` — auto-extracted from each HTML report: every T-numbered
  table (converted to markdown, `[!]` re-validate flags preserved), the play/callout, the
  "so what" blocks, and the Reputation Bet. ~5–8k words per report vs ~200KB of HTML.
- `facts/INDEX.md` — the master index (country × report × word count).
- Regenerate any time with: `python3 tools/extract_facts.py` (deterministic; run it after
  every new report ships, commit `facts/` together with the report).

## Level 0 — today, zero build (Claude Project)

Create a Project on claude.ai, upload the contents of `facts/` (not the HTML) as project
knowledge, and set project instructions:

> You answer questions about Dabur's country-entry research using ONLY the fact sheets
> provided. Always cite the report and table number (e.g. "UAE OTC deck, T24"). Preserve
> every `[!]` re-validate flag when quoting a number — those figures are not yet
> board-grade. If the sheets don't contain the answer, say "not covered — check the full
> report or queue it for research"; never fill gaps from general knowledge. Public data
> only: if a user pastes internal Dabur figures, tell them to use the secure enterprise
> environment.

Category heads then just ask: "Compare the halal positioning across Malaysia and UAE oral
care" or "Which markets have an open mid-premium honey tier?"

## Level 1 — this repo (done)

The `tools/extract_facts.py` pipeline above. Scales to all 42 countries: ~210 reports
distill to roughly 10–12 MB of markdown; per-batch or per-category subsets stay well
inside a single session's context.

## Level 2 — production (when the sprint finishes)

A small Claude API app (or Claude Code / Cowork session pointed at this repo) that:
1. greps `facts/` for the relevant sheets (agentic search beats an embeddings pipeline at
   this corpus size and is far simpler to maintain),
2. answers with enforced citations (report + table),
3. refuses to strip `[!]` flags or invent numbers.

Governance: the moment users start pasting **internal** Dabur numbers into any query
tool, it must move to the secure enterprise environment — same public-data rule that
governs the reports (`CLAUDE.md` §5).
