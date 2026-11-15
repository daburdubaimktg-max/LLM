// Browser end-to-end run of the full lifecycle through the real UI:
// Discover → Apply → Get approved → Onboard → Test → Report → Review → Validate → Improve → Retest (+ privacy check).
// Needs: scripts/dev-db.sh fstb_e2e ; the dev gateway on :54331 against that database ; the web export served on :8099.
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');

const APP = process.env.APP_URL ?? 'http://localhost:8099';
const SHOTS = new URL('./screenshots/', import.meta.url).pathname;
mkdirSync(SHOTS, { recursive: true });
const POCKET_ROUND = '12000000-0000-4000-a000-000000000001';
const POCKET_PRODUCT = '10000000-0000-4000-a000-000000000001';
const email = `e2e.${Date.now()}@test.local`;
const steps = [];

const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
page.on('dialog', (d) => d.accept());
page.on('pageerror', (e) => console.log('  [pageerror]', e.message));
page.setDefaultTimeout(15000);

const vis = (loc) => loc.locator('visible=true').last();
const t = (id) => vis(page.locator(`[data-testid="${id}"]`));
const tPrefix = (prefix) => vis(page.locator(`[data-testid^="${prefix}"]`));
const text = (s, exact = true) => vis(page.getByText(s, { exact }));
const click = async (id) => { const l = t(id); await l.scrollIntoViewIfNeeded(); await l.click(); };
const clickText = async (s, within) => { const l = within ? vis(page.locator(`[data-testid="${within}"]`).getByText(s, { exact: true })) : text(s); await l.scrollIntoViewIfNeeded(); await l.click(); };
const fill = async (id, v) => { const l = t(id); await l.scrollIntoViewIfNeeded(); await l.fill(v); };
const see = async (s, exact = false) => { await text(s, exact).waitFor({ state: 'visible' }); };
const shot = (name) => page.screenshot({ path: `${SHOTS}${name}.png`, fullPage: true });
const go = async (path) => { await page.goto(APP + path); await page.waitForLoadState('networkidle'); };
async function step(name, fn) {
  process.stdout.write(`• ${name} … `);
  try { await fn(); steps.push({ name, ok: true }); console.log('ok'); }
  catch (e) { steps.push({ name, ok: false, error: String(e.message).split('\n')[0] }); console.log('FAILED\n   ', String(e.message).split('\n').slice(0, 4).join('\n    ')); await shot(`FAIL-${steps.length}`); throw e; }
}
async function signOut() { await go('/profile'); await click('sign-out'); await page.waitForTimeout(500); }
async function demoSignIn(label) { await go('/sign-in'); await click(`demo-${label}`); await page.waitForTimeout(1200); }

let sessionPath = '';
try {
  await step('A1 marketplace lists Pocket Budget publicly', async () => {
    await go('/'); await see('Pocket Budget'); await see('FocusFlow'); await shot('01-marketplace');
    await click(`listing-${POCKET_ROUND}`); await see('What you'); await see('v0.8.2'); await shot('02-listing');
  });
  await step('A2 new tester signs up from the listing', async () => {
    await click('apply-to-test');
    await click('go-sign-in');
    await clickText('New here? Create an account');
    await fill('name', 'Amal E2E'); await fill('email', email); await fill('password', 'e2e-password-1'); await click('submit-auth');
    await page.waitForTimeout(1500);
    if (!(await t('apply-next').isVisible().catch(() => false))) { await go(`/rounds/${POCKET_ROUND}/apply`); }
    await t('apply-next').waitFor();
  });
  await step('A3 application steps 1–3, save and return later', async () => {
    await clickText('Beginner'); await clickText('No', 'q-used_budget_apps'); await shot('03-apply-step1'); await click('apply-next');
    await clickText('I check occasionally'); await clickText('Banking application'); await clickText('iPhone', 'q-device'); await clickText('United Arab Emirates'); await click('apply-next');
    await fill('q-motivation', 'I want to understand where my money goes.'); await clickText('Easy expense tracking'); await clickText('Simple and effortless');
    await click('apply-next'); await page.waitForTimeout(600);
    await click('save-later'); await page.waitForTimeout(1000);
    await go(`/rounds/${POCKET_ROUND}`); await click('continue-application'); await t('accept-terms').waitFor();   // resumed on step 4
  });
  await step('A4 availability + consent (optional consents left off), review, submit', async () => {
    await clickText('Sat', 'available-days'); await click('confirm-device'); await click('confirm-time'); await click('confirm-instructions'); await click('accept-terms');
    await shot('04-apply-step4'); await click('apply-next'); await t('submit-application').waitFor(); await shot('05-apply-review');
    await click('submit-application'); await see('Application sent'); await shot('06-application-submitted');
  });
  await step('B creator approves the application (no assignment yet)', async () => {
    await signOut(); await demoSignIn('Demo creator');
    await go(`/creator/rounds/${POCKET_ROUND}`); await see('Applications received'); await shot('07-creator-dashboard-before');
    await click('nav-applications'); await see('Amal E2E'); await shot('08-application-review');
    await tPrefix('approve-application-').click(); await page.waitForTimeout(1000);
    await click('tab-approved'); await see('Amal E2E');
  });
  await step('C creator assigns the approved tester', async () => {
    await text('Amal E2E').click(); await t('assign-tester').waitFor(); await shot('09-tester-profile-review');
    await click('assign-tester'); await page.waitForTimeout(1000); await see('invited', false);
  });
  await step('C2 tester sees approval, accepts and starts on v0.8.2', async () => {
    await signOut(); await go('/sign-in'); await fill('email', email); await fill('password', 'e2e-password-1'); await click('submit-auth'); await page.waitForTimeout(1200);
    await go('/inbox'); await see('approved', false); await shot('10-inbox-approval');
    await go('/tests'); await tPrefix('test-').first().click(); await t('accept-invitation').waitFor(); await see('v0.8.2'); await shot('11-onboarding');
    await click('accept-invitation'); await t('ack-instructions').waitFor();
    await click('ack-instructions'); await click('consent-screenshots'); await shot('12-instructions-consent'); await click('start-testing');
    await t('task-1').waitFor(); sessionPath = new URL(page.url()).pathname; await shot('13-task-overview');
  });
  await step('D tester completes five tasks, pausing once, with honest feedback and a bug', async () => {
    const doTask = async (n, difficulty, problem, comment) => {
      await click(`task-${n}`); await click('start-task'); await t('complete-task').waitFor();
      if (n === 1) await shot('14-task-screen');
      await clickText(difficulty, 'task-difficulty'); if (comment) await fill('task-comment', comment);
      await clickText(problem ? 'Yes' : 'No', 'task-had-problem');
      if (n === 1) await shot('15-task-feedback');
      await click('complete-task'); await page.waitForTimeout(900);
    };
    await doTask(1, 'Very easy', false, 'Found everything straight away.');
    await go(sessionPath); await click('pause-testing'); await page.waitForTimeout(700); await click('resume-testing'); await page.waitForTimeout(700);
    for (const n of [2, 3]) { await go(sessionPath); await doTask(n, 'Easy', false); }
    await go(sessionPath); await doTask(4, 'Somewhat difficult', false, 'The chart colours were hard to tell apart.');
    await go(sessionPath); await doTask(5, 'Difficult', true, 'I could not find where to edit the amount at first.');
    await t('bug-title').waitFor();                                                   // "had a problem" opens the bug flow
    await fill('bug-title', 'Edit option is hidden behind a long-press'); await fill('bug-expected', 'An obvious edit button on the transaction.');
    await fill('bug-actual', 'I only found editing by accident after long-pressing the row.'); await fill('bug-steps', '1. Open transactions\n2. Tap the AED 300 row');
    await vis(page.locator('[data-testid="bug-severity"]').getByText('Major', { exact: false })).click();
    await fill('bug-device', 'iPhone 14'); await fill('bug-os', 'iOS 18'); await shot('16-bug-report');
    await click('submit-bug'); await t('add-screenshot').waitFor();
    writeFileSync('/tmp/e2e-shot.png', Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64'));
    const [chooser] = await Promise.all([page.waitForEvent('filechooser'), click('add-screenshot')]);
    await chooser.setFiles('/tmp/e2e-shot.png'); await see('e2e-shot.png'); await shot('17-evidence-upload');
    if (await t('add-recording').isVisible().catch(() => false)) throw new Error('recording upload offered without consent');
    await click('bug-done');
  });
  await step('E tester submits the final verdict', async () => {
    await go(sessionPath); await click('go-final-review');
    await vis(page.getByLabel('3 out of 5')).click(); await clickText('Maybe, with improvements', 'verdict-would-use');
    await fill('verdict-improvement', 'Make editing a transaction obvious.'); await clickText('Good, needs improvements', 'verdict-choice');
    await fill('verdict-reason', 'Budgeting was easy but fixing a mistake was confusing.'); await shot('18-final-review');
    await click('submit-verdict'); await t('back-to-my-tests').waitFor(); await shot('19-submission-confirmation');
    await go('/tests'); await see('History'); await shot('20-testing-history');
  });
  await step('F creator sees the completion, feedback and evidence', async () => {
    await signOut(); await demoSignIn('Demo creator');
    await go(`/creator/rounds/${POCKET_ROUND}`); await see('Completed testing sessions'); await shot('21-creator-dashboard-after');
    await click('nav-bugs'); await see('Edit option is hidden behind a long-press'); await text('Edit option is hidden behind a long-press').click();
    await see('e2e-shot.png'); await shot('22-bug-management');
    await go(`/creator/rounds/${POCKET_ROUND}/feedback`); await see('I could not find where to edit the amount at first.'); await shot('23-feedback-explorer');
  });
  await step('G creator generates an evidence-linked validation report', async () => {
    await go(`/creator/rounds/${POCKET_ROUND}/report`); await click('generate-report');
    await see('Limitations'); await see('Rule-based', false); await see('Supported by 1 of', false); await shot('24-validation-report');
  });
  await step('H creator approves a finding and converts it into a project task', async () => {
    await vis(page.getByText(/^1\. /)).click(); await t('approve-finding').waitFor(); await see('Source feedback'); await shot('25-finding-evidence');
    await click('approve-finding'); await page.waitForTimeout(900);
    await fill('task-title', 'Improve transaction editing discoverability'); await fill('task-owner', 'Product team');
    await clickText('High', 'task-priority'); await fill('task-due', '2026-12-15'); await click('create-project-task');
    await page.waitForTimeout(1000); await see('Improve transaction editing discoverability'); await shot('26-project-task');
  });
  await step('I creator adds v0.9.0 and creates a follow-up round; the old round is unchanged', async () => {
    await go(`/creator/products/${POCKET_PRODUCT}`); await see('Improve transaction editing discoverability');
    await click('add-release'); await fill('release-version', 'v0.9.0'); await click('save-release'); await page.waitForTimeout(1000); await see('v0.9.0');
    await click(`retest-round-${POCKET_ROUND}`); await vis(page.getByRole('radio', { name: 'v0.9.0' })).click(); await click(`create-followup-${POCKET_ROUND}`); await t('publish-round').waitFor(); await see('v0.9.0'); await shot('27-followup-round');
    await go(`/creator/rounds/${POCKET_ROUND}`); await see('v0.8.2'); await see('Completed testing sessions');
    await go('/creator'); await shot('28-creator-home');
  });
  await step('J a second tester cannot open the first tester’s session', async () => {
    await signOut(); await demoSignIn('Second tester');
    await go(sessionPath); await see('Session not found'); await shot('29-privacy-check');
    await go('/tests'); if (await text('Pocket Budget').isVisible().catch(() => false)) throw new Error('second tester sees someone else’s test');
  });
} catch { /* reported below */ }
await browser.close();
const failed = steps.filter((s) => !s.ok);
console.log(`\n${steps.length - failed.length}/${steps.length} steps passed${failed.length ? ` — first failure: ${failed[0].name}: ${failed[0].error}` : ''}`);
process.exit(failed.length || steps.length < 13 ? 1 : 0);
