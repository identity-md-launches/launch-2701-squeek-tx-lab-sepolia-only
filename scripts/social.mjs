import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { requireDependency } from './dependencies.mjs';
const { chromium } = requireDependency('playwright');
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  await page.goto(pathToFileURL(resolve('src/assets/social.svg')).href);
  await page.screenshot({ path: 'public/social.png' });
  console.log('Saved public/social.png (1200 × 630).');
} finally { await browser.close(); }
