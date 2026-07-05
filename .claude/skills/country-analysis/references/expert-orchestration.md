# Expert-skill orchestration & country→expert routing

This skill is a conductor. The depth comes from the user's specialist skills — call them; don't reinvent
their frameworks. Pick the region-matched expert by the **target country**, not by the entrant's origin.

## Routing table

| Phase / head | Invoke | Why |
|---|---|---|
| Phase 0 scope + every close | **FOCUS** | One-question-at-a-time scoping; the Reputation Bet close |
| M4, C4 (consumer & culture) | region **CONSUMER-INSIGHT expert** | Fact-vs-opinion firewall, culture roots, research-grade read |
| C4/C5/C6 (why-people-buy, demand design) | **MARKETING-PSYCHOLOGY** | Behavioural levers, decision biases |
| M9 + every glossary + naming | region **LANGUAGE expert** | Translation-integrity firewall, semiotic-landmine check, brand-name legality |
| C8 creative + C13 ad decode | **AD STRATEGIST** + region **AD expert** | LEAP scoring, ad-copy decode, benchmark teardown |
| M2, C6 sizing, confidence register | **HBR-DATA-ANALYST** | Data-trust, sizing method, "is this number real" |
| C3 competition, C12 e-com scrape, O1–O5 own-brand audit | **COMPANY-RESEARCH-1 / -2** | Competitor teardown, e-commerce & brand-presence intelligence |
| C9 stress test | **DEEP STRAT** | 3-persona + assumption audit + blind-spot + commitment block |
| C5 hero-bet | **DEEP THINK** | 7-lens single-hypothesis pressure test |
| Full 12-part engagement (real P&L) | **STRAT CONSULT** | Only on explicit ask, in a secure P&L environment |

## Country → regional-expert mapping

The user's installed regional experts are **China** (chinese-language-expert, chinese-ad-expert),
**MENA/Arabic** (arabic-expert, mena-consumer-insight-expert), **Tamil Nadu/India** (tamil-expert),
**Africa** (africa-consumer-insight-expert), and **Sanskrit** (for Indic naming). Map as follows:

- **China / Greater China** → CHINESE-LANGUAGE + CHINESE-AD + (no China consumer-insight skill → use the
  generic senior-insight lens + AFRICA/MENA method as a template, flagged).
- **MENA (GCC, Levant, Egypt, Maghreb)** → ARABIC + MENA-CONSUMER-INSIGHT + AD-STRATEGIST.
- **Sub-Saharan Africa (incl. Ethiopia, Nigeria, Kenya, SA)** → AFRICA-CONSUMER-INSIGHT + AD-STRATEGIST;
  **language expert = generic** (no Amharic/Swahili/Yoruba skill exists — see gap rule below).
- **India / Tamil Nadu** → TAMIL-EXPERT (+ SANSKRIT for Indic naming) + AD-STRATEGIST.
- **Any country with no region-matched expert** (Korea, Japan, Indonesia, Brazil, Türkiye, etc.) → use
  **generic senior-insight + generic language lens**, and apply the gap rule.

### The gap rule (do not fake regional depth)
When no bespoke regional expert exists for the country's language/culture:
1. Use the closest **method** template (e.g. the AFRICA/MENA consumer-insight *methodology*) but do not
   claim its regional knowledge.
2. **Flag the gap explicitly** in the report ("No bespoke [language] expert available — cultural/
   linguistic reads below are generalist and must be validated locally").
3. **Emit a local-language deep-research prompt** (see `data-governance-validation.md`) so a native-
   language model/engine or an in-country colleague fills it.
4. Suggest the user consider building that regional expert skill (e.g. an "AMHARIC EXPERT") if the country
   becomes a priority — this skill improves as the expert roster grows.

## Model selection
Use the strongest reasoning model available for **synthesis-heavy** work — whitespace synthesis (C5),
DEEP STRAT (C9), recommended strategy (C7), portfolio sequencing (M11). Opus 4.8 or Fable 5. Routine
extraction and formatting can run on the ambient model.
