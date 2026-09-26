// Run with playwright-cli run-code --filename against an owned, guarded Desktop CDP session.
// Seed an isolated vault with Heading Layout.md: first, later, and wrapped H1s, each followed by a paragraph.
async page => {
  const errors = [], failures = [], measurements = [], screenshots = {};
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  const check = (condition, message) => { if (!condition) failures.push(message); };
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1512, height: 949, deviceScaleFactor: 2, mobile: false });
  await page.getByRole('button', { name: 'TockTutor', exact: true }).click();
  await page.getByRole('button', { name: 'Heading Layout.md', exact: true }).click();
  const headings = page.locator('.ProseMirror > :is(h1,h2,h3,h4,h5,h6)');
  await headings.first().waitFor();
  check(await headings.count() === 3, 'fixture has three headings');
  for (const theme of ['dark', 'light']) {
    check(await page.evaluate(() => document.documentElement.style.colorScheme) === theme, `explicit ${theme} theme`);
    for (let index = 0; index < 3; index++) {
      const heading = headings.nth(index);
      const measure = () => heading.evaluate(el => {
        const css = getComputedStyle(el), box = el.getBoundingClientRect(), origin = el.parentElement.getBoundingClientRect().top;
        return { tag: el.tagName, text: el.textContent, top: box.top - origin, height: box.height,
          followingTop: el.nextElementSibling.getBoundingClientRect().top - origin,
          lineHeight: css.lineHeight, padding: css.padding, marginTop: css.marginTop, marginBottom: css.marginBottom };
      });
      const initial = await measure();
      check(initial.tag === 'H1', `${theme}/${index}: starts as H1`);
      if (index === 2) check(initial.height > parseFloat(initial.lineHeight), 'fixture includes a wrapped heading');
      let previous = initial;
      if (theme === 'dark' && index === 0) screenshots.h1 = (await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })).data;
      for (const level of [2, 3, 4, 5, 6, 1]) {
        await heading.click();
        // Select the start of this block, including wrapped headings, without changing the document.
        await heading.evaluate(el => { const selection = getSelection(); selection.collapse(el, 0); });
        await page.keyboard.type('#'.repeat(level) + ' ');
        await page.waitForFunction(({ index, level }) => document.querySelectorAll('.ProseMirror > :is(h1,h2,h3,h4,h5,h6)')[index]?.tagName === `H${level}`, { index, level });
        const current = await measure();
        check(current.text === initial.text, `${theme}/${index}/H${level}: text preserved`);
        check(level === 1 ? current.followingTop === initial.followingTop : current.followingTop < previous.followingTop, `${theme}/${index}/H${level}: following content shrinks with heading and restores for H1`);
        if (level !== 1) check(current.height < previous.height, `${theme}/${index}/H${level}: heading box shrinks`);
        if (index === 0) check(current.top === initial.top, `first H${level}: top stays anchored`);
        measurements.push({ theme, index, level, before: previous, after: current });
        previous = current;
        if (theme === 'dark' && index === 0 && level === 2) screenshots.h2 = (await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })).data;
      }
    }
    await page.keyboard.press('Meta+Shift+.');
    await page.waitForFunction(theme => document.documentElement.style.colorScheme !== theme, theme);
  }
  const state = await page.evaluate(() => ({ route: location.pathname, viewport: [innerWidth, innerHeight, devicePixelRatio], theme: document.documentElement.style.colorScheme,
    htmlSkin: document.documentElement.dataset.tockteamSkin ?? null, bodySkin: document.body.dataset.tockteamSkin ?? null,
    mode: document.querySelector('.tocktutor-document-stats')?.textContent }));
  check(state.theme === 'dark' && state.htmlSkin === null && state.bodySkin === null, 'canonical dark, unskinned capture');
  check(state.mode.includes('Live Preview'), 'Live Preview active');
  check(errors.length === 0, 'no runtime errors');
  return { failures, errors, measurements, state, screenshots };
}
