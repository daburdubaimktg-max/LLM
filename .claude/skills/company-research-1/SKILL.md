---
name: company-research-1
description: Systematic company research skill for interview prep or competitive intelligence. Covers company overview, financial analysis (annual report deep-dive with CFA-grade rigor), operating model & strategy, leadership profiling, organizational structure, culture & values mapping, and job description gap analysis. Produces structured intelligence briefs with specific data points, not generic summaries. Trigger with "COMPANY RESEARCH" or when user uploads a job description and asks for company analysis. Part 1 of 2 — see company-research-2 for brand, product, competitive, and e-commerce intelligence.
---

# COMPANY RESEARCH SKILL — PART 1
## Company, Financial, Leadership & Organizational Intelligence

### When to Trigger
Use when the user says "COMPANY RESEARCH" or uploads a job description and wants to prepare for an interview by deeply understanding the target company. Also use when the user wants competitive intelligence on any company.

### Research Protocol

Before producing any output, Claude should ask ONE clarifying question:
"What is the company name, the specific role/division you're targeting, and do you have the annual report or job description to upload?"

Then proceed through the following modules IN ORDER. Each module produces a structured output section.

---

## MODULE 1: Company Overview & History

**What to research (web search):**
- Founding story, heritage, and corporate evolution (mergers, spin-offs, acquisitions)
- Current corporate structure (parent company, subsidiaries, JVs)
- Stock exchange listing, ticker, market cap
- Headquarters location, global footprint (number of countries, employees)
- Purpose statement, mission, vision
- Recent major announcements (last 6 months)

**Output format:**
- One-paragraph company summary (who they are, what they do, how big they are)
- Timeline of 5-7 key milestones
- Current corporate structure diagram (text-based)

---

## MODULE 2: Financial Deep Dive (Annual Report Analysis)

**If user uploads annual report or results statement, perform CFA-grade analysis:**

### 2A: Financial Health Snapshot Table
| Metric | Current Year | Prior Year | Change | Assessment (🟢/🟡/🔴) |

Required metrics:
- Revenue (reported and organic growth)
- Gross profit and gross margin (adjusted if available)
- Operating profit and operating margin
- Net profit and EPS (basic and diluted)
- Free cash flow
- Net debt and leverage ratio (Net Debt / EBITDA)
- A&P spend as % of revenue
- R&D spend as % of revenue
- Dividend per share and payout ratio
- Share buyback programme (if any)

### 2B: Revenue Decomposition
- By category/segment (revenue, growth rate, % of total)
- By geography/region (revenue, organic growth, price vs volume/mix split)
- Identify the STAR category (highest growth + highest share of revenue)
- Identify the PROBLEM category (declining or underperforming)

### 2C: Profit Bridge
- Walk from revenue to operating profit showing: gross margin expansion, A&P investment, R&D investment, SG&A leverage, restructuring costs, FX impact
- Distinguish organic vs reported growth (strip out FX, M&A, divestments)

### 2D: Cash Flow & Balance Sheet Health
- Operating cash flow → Free cash flow bridge
- Working capital cycle (days)
- Capex as % of revenue
- Net debt trajectory and refinancing schedule
- Credit rating (if available)

### 2E: Forward Guidance
- Management's guidance for next year (revenue, profit, margin)
- Medium-term targets (3-5 year)
- Key assumptions and risks management has flagged
- Analyst consensus vs management guidance (if searchable)

### 2F: Peer Comparison Table
| Metric | Target Company | Peer 1 | Peer 2 | Peer 3 |

Select 3 most relevant peers. Compare: organic growth, gross margin, operating margin, leverage, star category growth, stock performance.

### 2G: Career Motivators & Concerns
Based on financial analysis, produce:
- 5-7 reasons this is an attractive company to join (career motivators)
- 4-6 risks or concerns a candidate should be aware of
- The RIGHT question: reframe the financial story from the perspective of the specific role

---

## MODULE 3: Operating Model & Strategy

**What to research:**
- Current strategy framework (name it — e.g., "Win as One")
- Strategic pillars and priorities
- Operating model (regional vs category-led vs matrix)
- Recent organizational changes (restructures, new roles, new OUs)
- Innovation strategy and R&D approach
- Supply chain strategy and productivity programmes
- Digital transformation initiatives
- Sustainability / ESG commitments
- Capital allocation priorities (growth investment vs shareholder returns vs M&A)

**Output format:**
- Strategy summary (3-5 sentences)
- Operating model diagram (text-based: who reports to whom, how decisions flow)
- Key strategic initiatives with status (launched / in progress / planned)

---

## MODULE 4: Leadership Profiling

**For each key leader relevant to the role (hiring manager, skip-level, functional heads):**

### Research checklist:
- Full name, current title, tenure in role
- Career history (companies, roles, progression)
- Educational background (MBA school, undergrad, any notable credentials)
- LinkedIn profile analysis (posting themes, endorsements, recommendations)
- Public speaking / conference appearances (topics, quotes)
- Published interviews or press quotes
- Known strategic priorities or pet projects
- Management style indicators (from interviews, Glassdoor, team feedback)

### Output format per leader:
- One-paragraph bio
- Career trajectory (table: year, company, role)
- Known priorities and hot buttons
- Suggested conversation starters for interview
- Any connection points with the candidate (shared alma mater, shared markets, shared categories)

**Special attention to:**
- The person who will INTERVIEW you (what do they care about?)
- The person you would REPORT TO (what's their leadership style?)
- The person who PREVIOUSLY held the role (why did they leave? what's unfinished?)

---

## MODULE 5: Organizational Structure

**What to research:**
- Organization chart (as much as publicly available)
- Reporting lines for the target role
- Team size and composition (direct reports, dotted lines)
- Matrix relationships (who else does this role interact with?)
- Recent org changes (new roles created, roles eliminated, restructures)
- Board composition (relevant for C-suite roles)

**Output format:**
- Org chart (text-based hierarchy)
- Role positioning map (who the role reports to, who reports to it, key matrix partners)
- Recent changes and their implications for the role

---

## MODULE 6: Culture & Values

**What to research:**
- Official values/behaviours framework
- Glassdoor reviews (themes, scores, trends)
- Employee engagement scores (if disclosed)
- Leadership development programmes
- Diversity & inclusion initiatives
- Working style (remote/hybrid/office, hours culture, travel expectations)
- Any cultural transformation underway

**Output format:**
- Values framework summary
- Glassdoor sentiment summary (top 3 positives, top 3 negatives)
- Cultural fit assessment for the candidate

---

## MODULE 7: Job Description Gap Analysis

**If user provides their CV and the JD:**

### 7A: Requirement-by-Requirement Mapping
For each JD requirement:
- ✅ Strong match (with specific CV evidence)
- 🟡 Partial match (what's there, what's missing)
- ❌ Gap (what to address in interview)

### 7B: CV Revision Strategy
- What to elevate (buried experience that maps to JD)
- What to reframe (experience that's adjacent but not identical)
- What language to adopt (mirror the company's terminology)
- What gaps to address proactively in cover letter or interview

### 7C: Interview Risk Assessment
- The 3 questions they're MOST LIKELY to ask based on gaps
- Prepared answers for each
- The 1 question you should ask THEM to reframe the gap as a strength

---

## Quality Standards

- Every data point must be sourced (annual report page, web search result, LinkedIn)
- Distinguish confirmed facts from estimates
- Flag where data is missing and what the user should try to find
- Use tables for comparisons, not prose
- Apply "So What?" discipline: every fact must connect to an insight relevant to the role
- Cross-reference financial data with strategy narrative: do the numbers support the story management is telling?
