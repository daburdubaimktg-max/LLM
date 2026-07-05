# Ready-to-use checklists and question banks

Copy-paste-ready tools for meetings, reviews, and briefs. Adapt wording to the situation.

## Before commissioning any analysis (the brief)
- [ ] What decision will this inform? What actions change based on the answer?
- [ ] State the question narrowly and testably (not "is our advertising working?" but "what is the incremental offtake from GDN ads on Brand X in UAE modern trade, last 12 months?")
- [ ] Sales or profit? Specify the true governing objective.
- [ ] Has anyone (internal/public) already answered this?
- [ ] What's the cost of this data — collection, storage, privacy/brand risk?
- [ ] Pre-specify: metrics to track, analysis approach, sample size, run length.

## The six questions for any analyst/agency presenting numbers
1. What was the source of your data? (Created where, not accessed where)
2. How well does the sample represent the population?
3. Are there outliers? How did they affect the results? Show me the results without them.
4. What assumptions are behind this analysis? What conditions would invalidate them?
5. Why this method? What alternatives did you consider?
6. What's the evidence this is causal, not just correlated?

## Experiment / market-test design (7 checks)
1. Narrow question that feeds the strategic question
2. Big hammer — intervention large enough that a null means "don't care", not "didn't notice"
3. Data audit — outcomes to change + outcomes that must NOT change + external data
4. Representative test population (e-com users ≠ GT shoppers; UAE ≠ KSA)
5. True randomization; treatment/control differ only in the treatment (not Sunday-vs-Monday)
6. Pre-committed plan: sample size, duration, metrics — no early stopping, no peeking-driven calls
7. Report all outcomes; identify the mechanism; retest winners periodically

## A/B test review (3 failure modes)
- Did the test run its planned course, or was it stopped when results looked good?
- How many metrics were tracked? (More metrics = more spurious "wins")
- Has the winner been retested? Small lifts are the least reliable.

## Data trust audit (Friday Afternoon Measurement)
1. Take 100 records × 10–15 critical fields in a spreadsheet
2. Red-mark obvious errors, record by record
3. Count error-free records: lots of red → don't use; <5% errors → use with caution
4. Check error patterns — if concentrated in one field, drop the field, keep the rest
5. Clean: rinse (obvious fixes) → scrub a 1,000-record sample ruthlessly (your trusted core) → wash the rest (automated imputation)
6. Integration: same entity matched across sets? Units/definitions aligned? De-duplicated?

## Metric selection (Mauboussin chain)
1. Governing objective (economic value / market share / brand equity — pick and state it)
2. Theory of cause and effect (e.g., availability → trial → repeat → share); test the links statistically
3. Employee-controllable activities that move the drivers (fill rate, OSA, strike rate, promo compliance)
4. Re-evaluate as the market changes (quick-commerce shifts what drives availability)
- Vanity-metric test: if this number went up, can you PROVE the objective moves? If not, stop reporting it.
- Good metric test: measurable within a week, at ~no cost, replicable.

## Correlation-to-action decision (before acting on any "insight")
- Frequency: how often have these two things co-occurred historically?
- Causal clarity: how many plausible explanations exist? Can we rule some out?
- Risk/reward: cost of acting and being wrong vs benefit of acting and being right
- Rule: cheap action + costly inaction → act even on weak correlation; expensive/brand-risky action → demand causal clarity first (or find a lower-risk version of the action)

## Bias pre-flight (before finalizing any recommendation)
- Confirmation: What would the data look like if I'm wrong? Did I look? Who played devil's advocate?
- Overconfidence: Did we run a pre-mortem? What did my last 5 predictions vs actuals look like?
- Overfitting: Was the model validated on held-out data? Is there an alternative narrative for the same data?
- Outliers: Identified? Explained? Results shown with and without?
- Nonlinearity: Which of the 4 curve shapes applies? Did we test 3+ levels?

## Presentation pre-flight (Duarte + Davenport + Morgan)
- [ ] One-line story headline first (the quest), data woven in as support
- [ ] Six-part flow: problem → impact measure → data → hypothesis → solution → business impact
- [ ] Presenting (broad strokes, conclusions) or circulating (detail OK)?
- [ ] Right chart: bars to compare, lines for trend, pie only for one-dominant-share
- [ ] One bright color on the message; grey context; no 3D; honest axes and scales
- [ ] Uncertainty shown: range of outcomes, not just point estimate
- [ ] Methods in appendix, not the main flow
- [ ] Memorable: one visual metaphor for the key number

## When your data is challenged
1. Take their perspective — what do they care about, what data do they hold?
2. Acknowledge what's true in their data (both can be true at once)
3. Propose joint follow-up data collection aimed at their specific criticism
4. Convert challenger to collaborator — their buy-in is the goal, not the win

## Data-driven manager self-test (12 behaviors, score honestly)
1. Push decisions to the lowest possible level
2. Use data to understand the business context and problem
3. Appreciate variation
4. Deal reasonably well with uncertainty
5. Integrate data + implications with intuition
6. Recognize the importance of high-quality data and invest in improvement
7. Conduct experiments and research to supplement existing data
8. Recognize decision criteria vary with circumstances
9. Revise decisions as new data arrives
10. Learn new skills; bring new data and technologies into the organization
11. Learn from mistakes and help others do the same
12. Be a role model; work with leaders, peers, subordinates to make them data-driven
Score <7: change how you work now — start with partial-credit items. Retake every 6 months.
