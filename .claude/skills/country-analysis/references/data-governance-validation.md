# Data governance & the local-language validation pipeline

## The public-only rule
This environment is for **public data + synthetic/scrubbed shapes only**. Never solicit or accept
confidential company P&L, SKU/country-level revenue or margin, distributor lists, A&P spend, or the NPD
pipeline here. If the user pastes a real internal number, redirect warmly: real numbers belong in their
secure enterprise-AI environment; here, work with the directional shape.

## The re-validation register (M10)
Maintain one table across the whole engagement. Every non-trivial number gets a row:

| Claim / number | Value (public range) | Source | Date | Confidence | Re-validate? |
|---|---|---|---|---|---|
| e.g. Category e-com GMV | ⚠ range | source + url | 2026 | Low | YES — logged-in in-country query below |

Rules: publish **ranges, not false precision**; mark in-country-platform / GMV / share numbers `⚠ re-
validate`; give the *exact query* to run from a logged-in in-country workstation. The register is a
deliverable, not an afterthought — it is the board-grade honesty layer and the entrant's next-step queue.

## The language-barrier escalation (generalises the China KIMI→DeepSeek pipeline)
Western search engines under-index some countries' decisive sources (in-country commerce reviews, local
social, vernacular news, regulator sites). When that applies, **do not fabricate depth** — emit a ready-
to-paste **local-language deep-research prompt** for an engine/model that reaches those sources, and a
**reconciliation prompt** to fold the return back in.

Pick the tool by country:
- **China** → KIMI.AI (research) → DeepSeek (strategy). Sources: Tmall/JD/Douyin/RED/regulator.
- **Korea** → a Naver-aware search/model. **Japan** → a Yahoo!Japan/Rakuten-aware pass.
- **Russophone** → Yandex-aware. **MENA** → Arabic-native pass (+ ARABIC EXPERT for essence).
- **Ethiopia / Amharic, Sub-Saharan vernaculars** → there is often *no* strong local research model;
  substitute (a) local-language site fetches where reachable, (b) in-country distributor/agency primary
  research, (c) pan-African panels (e.g. GeoPoll, Kantar Africa) — and say so plainly.

### Prompt pattern to emit (fill the brackets)
```
DEEP LOCAL RESEARCH — [COUNTRY], [CATEGORY]
Search in [local language(s): ___] across [named local commerce sites], [named social platforms],
[named news/magazine sites], and [regulator/govt sites]. Return in executive English:
1) Category size, growth, sub-segments (with sources + dates).
2) Top 8 brands: share, price bands (local currency + USD), pack, positioning, hero claims.
3) Channel structure & margins (front/back) — retail, pharmacy, e-com, social-commerce.
4) The entrant's own brands ([list]): availability (retail/e-com/social), ratings, reviews, sentiment,
   grey-market presence.
5) Regulatory: registration route, claim rules, import/label/duty reality for a foreign entrant.
6) Consumer culture: occasions, taboos, semiotics, media & influencer map.
Flag every number's source and confidence. Do NOT invent — mark gaps.
```
Then reconcile: *"Compare the above against my draft [category] deck; confirm/refute the hero-ingredient
bet, the price bands, the competitor shares, the regulatory findings; list what changes."*

## Never cross
- Never recommend uploading confidential data here.
- Never treat an in-country-platform number sourced here as fact without re-validation.
- Never invent local sentiment/quotes — mine real ones or mark `Source gap`.
