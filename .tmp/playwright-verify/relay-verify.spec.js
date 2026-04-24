
const { test, expect } = require('@playwright/test');

const baseURL = process.env.RELAYHQ_BASE_URL || 'http://127.0.0.1:4310';

async function captureBoard(page, path) {
  await page.goto(baseURL + path, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle');
  const screenshotPath = `/tmp/${path.replaceAll('/', '_') || 'home'}.png`;
  await page.screenshot({ path: screenshotPath, fullPage: true });
  const data = await page.evaluate(() => {
    const norm = (value) => (value || '').replace(/\s+/g, ' ').trim();
    const columns = Array.from(document.querySelectorAll('article.column-card')).map((column) => ({
      title: norm(column.querySelector('.column-title')?.textContent),
      countLabel: norm(column.querySelector('.column-count')?.textContent),
      tasks: Array.from(column.querySelectorAll('.task-list-item')).map((item) => ({
        title: norm(item.querySelector('.task-title')?.textContent),
        note: norm(item.querySelector('.task-note')?.textContent),
        statuses: Array.from(item.querySelectorAll('.task-status')).map((el) => norm(el.textContent)).filter(Boolean),
        meta: Object.fromEntries(Array.from(item.querySelectorAll('.task-meta div')).map((div) => {
          const dt = norm(div.querySelector('dt')?.textContent);
          const dd = norm(div.querySelector('dd')?.textContent);
          return [dt, dd];
        }).filter(([k]) => k)),
      })),
    }));
    return {
      title: norm(document.querySelector('h1')?.textContent),
      intro: norm(document.querySelector('.intro-copy p:last-of-type')?.textContent),
      columns,
    };
  });
  return { path, screenshotPath, ...data };
}

test('verify relayhq boards', async ({ page }) => {
  const consoleMessages = [];
  page.on('console', msg => consoleMessages.push(`${msg.type()}: ${msg.text()}`));
  page.on('pageerror', err => consoleMessages.push(`pageerror: ${err.message}`));

  const home = await captureBoard(page, '/');
  const boardLinks = await page.locator('a[href^="/boards/"]').evaluateAll((els) => els.map((el) => ({ href: el.getAttribute('href'), text: (el.textContent || '').replace(/\s+/g, ' ').trim() })));

  const devBoard = await captureBoard(page, '/boards/board-dev-sprint');
  await page.waitForTimeout(3000);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle');
  const devBoardAfterRefresh = await page.evaluate(() => {
    const norm = (value) => (value || '').replace(/\s+/g, ' ').trim();
    return {
      title: norm(document.querySelector('h1')?.textContent),
      columns: Array.from(document.querySelectorAll('article.column-card')).map((column) => ({
        title: norm(column.querySelector('.column-title')?.textContent),
        countLabel: norm(column.querySelector('.column-count')?.textContent),
        tasks: Array.from(column.querySelectorAll('.task-list-item .task-title')).map((el) => norm(el.textContent)).filter(Boolean),
      })),
    };
  });
  await page.screenshot({ path: '/tmp/_boards_board-dev-sprint_refresh.png', fullPage: true });

  const demoBoard = await captureBoard(page, '/boards/board-demo');

  console.log('RESULT_JSON:' + JSON.stringify({
    baseURL,
    home: { path: home.path, title: home.title, boardLinks, screenshotPath: home.screenshotPath },
    devBoard,
    devBoardAfterRefresh,
    demoBoard,
    consoleMessages,
  }));
});
