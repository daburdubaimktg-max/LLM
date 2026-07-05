# START HERE — Country Analysis Handover Kit

**From:** Nishant Sukumaran (Marketing Head, Dabur India)
**Purpose:** Run deep, board-grade CPG/FMCG **market-entry country research** in parallel, on a second Claude account, while the primary account is usage-capped.
**Deadline context:** deliverables needed **before 7 July 2026**. Speed matters — this kit is built to be picked up and run the same day.
**What you produce:** for each country, **five HTML reports** — one Country-Macro + four category decks (Oral Care, OTC Health Care, Hair Care, Skin Care).

---

## 1. What this kit contains

```
0_START_HERE_HANDOVER.md      <- this file (read first)
1_PROJECT_INSTRUCTIONS.md     <- paste into the Project's custom-instructions field
2_RUN_PROMPT.md               <- the exact prompt to type, per country
skills/
  country-analysis/           <- THE orchestrator skill (SKILL.md + references/ + assets/)
  core/                       <- 8 skills called on EVERY country (always load these)
  regional/                   <- 7 region-matched experts (load ONLY the one your country needs)
```

The `skills/` files are the **real, unmodified skill files** from Nishant's account — not summaries. The orchestrator (`country-analysis`) is a *conductor*: it calls the other skills for depth. You are handing Claude the whole orchestra.

---

## 2. Set-up — three paths depending on the account (pick one)

**Path A - Claude with Skills/Capabilities enabled (best).** If the account can install Skills (Settings -> Capabilities), install the `country-analysis` skill plus the `core/` skills, and the `regional/` expert(s) for your countries. Then just type the run prompt.

**Path B - Claude Project + knowledge files (most reliable on a standard Max account).**
1. Create a new Project (name it e.g. "Country Entry Research - [your countries]").
2. Paste `1_PROJECT_INSTRUCTIONS.md` into the Project's custom-instructions box.
3. Upload as Project knowledge: `skills/country-analysis/SKILL.md`, everything in `skills/country-analysis/references/`, the 8 `core/*/SKILL.md` files, and the `regional/` expert(s) matching your countries. (Skip regional experts you don't need - keeps it lean.)
4. Open a chat in that Project and use `2_RUN_PROMPT.md`.

**Path C - single-shot (fastest, lowest ceremony).** Start a chat, paste `1_PROJECT_INSTRUCTIONS.md` + `skills/country-analysis/SKILL.md` + `references/information-heads.md` at the top, then the run prompt. Use this only if you can't make a Project.

> Recommended: **Path B.** It keeps the methodology loaded across every message without re-pasting.

---

## 3. How to run it (the actual workflow)

Run **one country at a time**, and within a country produce reports in this order:

1. **COUNTRY_MACRO** report first (demographics -> economics -> politics/trade -> culture -> media/digital -> retail/e-com -> health-system + entry-lane map -> origin stance -> language/naming -> confidence register).
2. Then **four category decks**, each as its **own dedicated pass** (Oral, OTC Health, Hair, Skin), each citing the macro.

**Critical operating rule - depth over breadth.** The #1 failure mode is four thin reports. Each category deck must be **~6,000-9,000 words, >=20 data tables, all 8 mandatory deep-dive modules** (brand-by-brand entry teardown, N-move playbook, channel saliency, channel margins, e-commerce scrape, ad-copy decode + LEAP, cost-to-profit waterfall, >=25-term local glossary). **Do NOT let Claude batch all four categories into one compressed answer** - that divides the depth by four. If the model starts to compress, tell it: *"one category per pass, full depth; if you must trade off, give me fewer reports at full depth, not more that are thin."*

**Model note:** the reference-standard reports were written on the densest long-form model available. On this account, use the strongest model the plan offers for the category deep-writes. If long reports get truncated, ask for the report in **two halves** (C1-C9, then C10-C18) and stitch.

---

## 4. Data-governance line - DO NOT CROSS (binding)

This is **public-web research only.**

- **Never paste real Dabur numbers** - no SKU-level P&L, country/SKU revenue or margin, distributor lists, A&P spend, or NPD pipeline. Those belong only in Dabur's secure enterprise-AI (Microsoft 365 Copilot) environment, never here.
- Work in **defensible public ranges and bands**, never false precision.
- **Flag every in-country-platform / GMV / market-share number** as `[!] re-validate` with the exact query to re-run from a logged-in in-country workstation. Western search engines can't log into Tmall/JD/Douyin/RED (China), Naver (Korea), Shopee/TikTok-Shop dashboards, etc.
- When a country's decisive sources are in a language search indexes poorly (Chinese, Korean, Japanese, Arabic, Thai...), **do not fake depth** - have Claude emit a ready-to-paste **local-language deep-research prompt** for a native engine (e.g. KIMI/DeepSeek for China) or an in-country colleague to fill.

---

## 5. Country -> which regional expert to load

Load the matching expert from `skills/regional/`. If none matches, that's fine - the skill has a "gap rule" (use the generic senior lens, flag the gap, emit a local-language research prompt). Never fake regional depth.

| Target country / region | Load from `regional/` |
|---|---|
| China / Greater China | `chinese-language-expert` + `chinese-ad-expert` |
| GCC / Levant / Egypt / Maghreb (MENA) | `arabic-expert` + `mena-consumer-insight-expert` |
| Sub-Saharan Africa (Nigeria, Kenya, Ethiopia, SA...) | `africa-consumer-insight-expert` (language = generic) |
| India / Tamil Nadu | `tamil-expert` (+ `sanskrit-language-expert` for Indic naming) |
| Korea, Japan, Indonesia, Vietnam, Turkiye, Brazil, etc. | **No bespoke expert** - use generic lens + gap rule + local-language prompt |

The `core/` skills load for **every** country regardless.

---

## 6. Dividing the work across the team (parallel plan)

- Assign **whole countries** to people, not categories within a country - each country's four decks must share one macro foundation, so keep a country with one owner.
- Each owner runs Path B in their own Project, one country per chat, reports in the order above.
- Reconcile at the end: rank countries by **attractiveness x right-to-win** in a short cross-country comparison (the skill produces this automatically if you name several countries in one run; across separate owners you'll stitch it manually).

---

## 7. Quality bar - reject a report if any of these fail

- [ ] ~6,000+ visible words, >=20 tables
- [ ] All 8 mandatory modules present (teardown, N-move, channel saliency, margins, e-com scrape, ad decode + LEAP, waterfall, >=25-term glossary)
- [ ] Real **named** brands / channels / platforms in local script - no "leading competitor," "various players"
- [ ] Every hard number has a **source + date**; platform/GMV numbers marked `[!] re-validate`
- [ ] Closes with a **Reputation Bet** (falsifiable claim + dated window)
- [ ] China conclusions NOT transplanted - entry-lane, origin stance, demand engine, price bands all re-derived from the target country's data

---

## 8. One-line brief to give the teammate

> "Create a Claude Project, paste 1_PROJECT_INSTRUCTIONS.md as the instructions, upload the country-analysis skill files + the 8 core skills + your country's regional expert as knowledge, then run 2_RUN_PROMPT.md one country at a time. Public data only. Depth over breadth - reject thin reports."
