// Bounded visual/interaction checks for the redesigned routes, without cloud writes.
const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.BROWSER_EXECUTABLE });
  try {
    const page = await browser.newPage(); const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }, { width: 320, height: 740 }]) {
      await page.setViewportSize(viewport);
      await page.goto('http://localhost:3000/?demo=true');
      await page.getByRole('link', { name: /开始上传/ }).waitFor();
      await page.waitForFunction(() => { const c = document.querySelector('.home-orbit canvas'); return c && c.width === Math.round(c.clientWidth * Math.min(devicePixelRatio, 1.5)); });
      const home = await page.evaluate(() => ({ black: getComputedStyle(document.querySelector('main')).backgroundColor, overflow: document.documentElement.scrollWidth > innerWidth }));
      assert.equal(home.black, 'rgb(0, 0, 0)'); assert.equal(home.overflow, false);
      await page.screenshot({ path: path.join(__dirname, `fixtures/home-${viewport.width}.png`), fullPage: true });
      await page.getByRole('link', { name: /开始上传/ }).click();
      await page.getByText('本地测试模式', { exact: false }).waitFor();
      assert(page.url().endsWith('/upload?demo=true'));
      await page.screenshot({ path: path.join(__dirname, `fixtures/upload-idle-${viewport.width}.png`), fullPage: true });
      await page.locator('input[type=file]').setInputFiles(path.join(__dirname, 'fixtures/astronaut.png'));
      await page.getByAltText('待上传照片预览').waitFor();
      assert.equal(await page.getByRole('button', { name: '上传到展览' }).isEnabled(), true);
      const upload = await page.evaluate(() => ({ black: getComputedStyle(document.querySelector('main')).backgroundColor, overflow: document.documentElement.scrollWidth > innerWidth, fit: getComputedStyle(document.querySelector('.photo-selector img')).objectFit, stage: document.querySelector('main').dataset.stage }));
      assert.equal(upload.black, 'rgb(0, 0, 0)'); assert.equal(upload.overflow, false); assert.equal(upload.fit, 'contain'); assert.equal(upload.stage, 'selected');
      await page.screenshot({ path: path.join(__dirname, `fixtures/upload-selected-${viewport.width}.png`), fullPage: true });
      console.log('Layout and selection passed:', viewport, upload);
    }
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('http://localhost:3000/?demo=true');
    await page.waitForFunction(() => { const c = document.querySelector('.home-orbit canvas'); return c && c.width === Math.round(c.clientWidth * Math.min(devicePixelRatio, 1.5)); });
    const first = await page.locator('.home-orbit canvas').evaluate(c => c.toDataURL());
    await page.waitForTimeout(250);
    assert.equal(await page.locator('.home-orbit canvas').evaluate(c => c.toDataURL()), first);
    // Defer model network responses to inspect the waiting stage without another download.
    await page.route('https://staticimgly.com/**', () => new Promise(() => {}));
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.goto('http://localhost:3000/upload?demo=true');
    await page.getByText('本地测试模式', { exact: false }).waitFor();
    await page.locator('input[type=file]').setInputFiles(path.join(__dirname, 'fixtures/astronaut.png'));
    await page.getByRole('button', { name: '上传到展览' }).click();
    await page.waitForFunction(() => { const e = document.querySelector('.processing-overlay'); return e && Number(getComputedStyle(e).opacity) > .99; });
    for (const viewport of [{ width: 390, height: 844 }, { width: 568, height: 320 }]) {
      await page.setViewportSize(viewport);
      await page.waitForFunction(() => { const c = document.querySelector('.particle-processing'); return c && c.width === Math.round(c.clientWidth * Math.min(devicePixelRatio, 1.5)); });
      const layout = await page.evaluate(() => { const e = document.querySelector('.processing-overlay'), r = document.querySelector('.processing-copy').getBoundingClientRect(); return { black: getComputedStyle(e).backgroundColor, width: e.clientWidth, height: e.clientHeight, copyBottom: r.bottom }; });
      assert.equal(layout.black, 'rgb(0, 0, 0)'); assert.equal(layout.width, viewport.width); assert.equal(layout.height, viewport.height); assert(layout.copyBottom < viewport.height - 35);
      await page.screenshot({ path: path.join(__dirname, `fixtures/processing-${viewport.width}.png`) });
      console.log('Processing layout passed:', viewport);
    }
    await page.goto('http://localhost:3000/upload?demo=true');
    await page.getByText('本地测试模式', { exact: false }).waitFor();
    await page.locator('input[type=file]').setInputFiles({ name: 'broken.png', mimeType: 'image/png', buffer: Buffer.from('invalid image bytes') });
    await page.getByRole('button', { name: '上传到展览' }).click();
    await page.waitForFunction(() => document.querySelector('.feedback')?.textContent?.length > 0);
    await page.locator('.processing-overlay').waitFor({ state: 'hidden' });
    assert.equal(await page.locator('.upload-content').evaluate(e => e.inert), false);
    assert.equal(await page.evaluate(() => document.body.style.overflow), '');
    assert.equal(await page.getByRole('button', { name: '上传到展览' }).isEnabled(), true);
    console.log('Failed processing returns to a usable upload page with scroll restored.');
    assert.deepEqual(errors, []); console.log('Reduced motion and runtime checks passed.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
