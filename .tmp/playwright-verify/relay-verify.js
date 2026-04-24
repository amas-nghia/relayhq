
const { chromium } = require('playwright');

const baseURL = process.env.RELAYHQ_BASE_URL || 'http://127.0.0.1:4310';

function norm(value) {
  return (value || '').replace(/\s+/g, ' ').trim();
}

async function capturePage(page, path, screenshotPath) {
  await page.goto(baseURL + path, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: screenshotPath, fullPage: true });
  return await page.evaluate(() => {
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
      paragraphs: Array.from(document.querySelectorAll('p')).slice(0, 8).map((el) => norm(el.textContent)).filter(Boolean),
      columns,
    };
  });
}

(async() => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 2200 } });
  const consoleMessages = [];
  page.on('console', msg => consoleMessages.push(`${msg.type()}: ${msg.text()}`));
  page.on('pageerror', err => consoleMessages.push(`pageerror: ${err.message}`));

  const home = await capturePage(page, '/', '/tmp/relay-home.png');
  const boardLinks = await page.locator('a[href^="/boards/"]').evaluateAll((els) => els.map((el) => ({ href: el.getAttribute('href'), text: (el.textContent || '').replace(/\s+/g, ' ').trim() })));

  const devBoard = await capturePage(page, '/boards/board-dev-sprint', '/tmp/relay-dev-board.png');
  await page.waitForTimeout(3000);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: '/tmp/relay-dev-board-refresh.png', fullPage: true });
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

  const demoBoard = await capturePage(page, '/boards/board-demo', '/tmp/relay-demo-board.png');

  console.log(JSON.stringify({ baseURL, home, boardLinks, devBoard, devBoardAfterRefresh, demoBoard, consoleMessages }, null, 2));
  await browser.close();
})().catch(async (error) => {
  console.error('SCRIPT_ERROR', error);
  process.exit(1);
});
