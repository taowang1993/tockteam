// Run with playwright-cli run-code --filename on an owned, guarded Desktop CDP session.
// Open migration-fixtures/Images.md in Live Preview; no edits or screenshot publication occur here.
async page => {
  const images = page.getByRole('region', { name: 'Live Preview', exact: true }).locator('img');
  await page.waitForFunction(() => document.querySelectorAll('input[aria-label="Image Width"]').length === 3);
  for (const image of await images.all()) await image.evaluate(element => element.decode());
  const measurements = await images.evaluateAll(elements => {
    const box = element => { const r = element.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height, bottom: r.bottom }; };
    return elements.map(image => {
      const owner = image.closest('.tocktutor-local-embed, .milkdown-image-block');
      const caption = owner.querySelector('.caption-input');
      return { image: box(image), document: box(image.closest('.ProseMirror')), pixels: [image.naturalWidth, image.naturalHeight],
        actions: box(owner.querySelector('[aria-label="Image Actions"]')), width: Number(owner.querySelector('[aria-label="Image Width"]').value),
        caption: caption ? { text: caption.value, align: getComputedStyle(caption).textAlign } : null };
    });
  });
  if (measurements.length !== 3) throw Error('Expected all three image occurrences');
  for (const [index, value] of measurements.entries()) {
    if (Math.abs(value.image.x - value.document.x) > 1 || Math.abs(value.actions.x - value.image.x) > 1)
      throw Error(`Image ${index + 1} is not aligned with its document and controls: ${JSON.stringify(value)}`);
    const expectedHeight = index === 1 ? 120 : value.image.width * value.pixels[1] / value.pixels[0];
    if (Math.abs(value.image.height - expectedHeight) > 1) throw Error(`Image ${index + 1} has a cropped or stretched preview: ${JSON.stringify(value)}`);
    if (Math.abs(value.image.width - value.width) > 1 || value.actions.y < value.image.bottom - 1)
      throw Error(`Image ${index + 1} lost its authored width or controls below the image`);
    if (index && value.image.y < measurements[index - 1].actions.bottom) throw Error('Images overlap or render out of order');
  }
  if (measurements[2].width !== 96 || measurements[1].width !== 120 || !measurements[2].caption?.text.includes('Antoine Taveneaux')
    || !['start', 'left'].includes(measurements[2].caption.align)) throw Error('Neighbor size or authored, left-aligned caption was lost');
  return { geometry: await page.evaluate(() => [innerWidth, innerHeight, devicePixelRatio]), measurements };
}
