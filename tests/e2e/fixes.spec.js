// Regression tests for bugs found while de-minifying the original bundle.
import { expect, test } from '@playwright/test';
import { makeWav } from '../helpers/audioFixtures.js';
import {
  drag,
  exportActive,
  loadFiles,
  logLine,
  openApp,
  openSettings,
  saveSettings,
  setTimeField,
  settingsSelect,
  timeField,
  waveformBox,
} from '../helpers/app.js';

test.beforeEach(async ({ page }) => {
  await openApp(page);
  await loadFiles(page, [{ name: 'clip.wav', buffer: makeWav({ seconds: 1 }) }]);
});

/** Number of waveform-colored pixels (#4fc3f7) on the waveform canvas. */
async function waveformPixelCount(page) {
  return page.$$eval('#root canvas', (canvases) => {
    const canvas = canvases.sort((a, b) => b.width * b.height - a.width * a.height)[0];
    const { data } = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
    let count = 0;
    for (let i = 0; i < data.length; i += 4)
      if (data[i] === 79 && data[i + 1] === 195 && data[i + 2] === 247) count++;
    return count;
  });
}

test('dragging the scrollbar at 100% zoom does not blank the waveform', async ({ page }) => {
  const before = await waveformPixelCount(page);
  const box = await waveformBox(page);
  // The scrollbar track sits directly below the waveform canvas.
  const y = box.y + box.height + 7;
  // Hold the thumb and wobble vertically: a move with zero horizontal delta used to compute
  // 0 / 0 = NaN for the scroll position.
  await page.mouse.move(box.x + box.width / 2, y);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, y + 3, { steps: 3 });
  await page.mouse.up();
  // A broken (NaN) scroll position still draws a flat centre line, so compare with the full
  // waveform instead of just checking for "some" waveform pixels.
  expect(await waveformPixelCount(page)).toBe(before);
});

test('times that round up to a whole second carry over', async ({ page }) => {
  await setTimeField(page, 'Out', '0.9996');
  await expect(timeField(page, 'Out')).toHaveValue('00:01.000');
});

test('the volume slider reaches +20 dB and logs real decibels', async ({ page }) => {
  await saveSettings(page, { Format: 'wav', 'Bit Depth': 32 });
  const before = (await exportActive(page)).buffer;
  await page.keyboard.press('Control+a');
  const slider = page.locator('input[type=range]').first();
  const s = await slider.boundingBox();
  await drag(page, s.x + s.width / 2, s.x + s.width + 50, s.y + s.height / 2);
  await expect(logLine(page)).toContainText('Volume +20.0 dB (selection)');
  const after = (await exportActive(page)).buffer;
  const offset = 44 + 8 * 1000; // a non-zero left-channel sample
  expect(after.readFloatLE(offset) / before.readFloatLE(offset)).toBeCloseTo(10, 3);
});

test('renaming from the File Info header keeps the input open until Enter', async ({ page }) => {
  await page.getByTitle('Double-click to rename').dblclick();
  // Rename inputs are the only <input>s without a type attribute.
  const input = page.locator('input:not([type])');
  await expect(input).toHaveCount(1);
  await expect(input).toHaveValue('clip.wav');
  await page.waitForTimeout(300);
  await expect(input).toBeFocused();
  await input.fill('renamed.wav');
  await input.press('Enter');
  await expect(page.getByText('renamed.wav')).toHaveCount(2); // list row + File Info header
});

test('without saved settings the preset reads "Custom"', async ({ page }) => {
  await openSettings(page);
  await expect(settingsSelect(page, 'Preset')).toHaveValue('custom');
  await expect(settingsSelect(page, 'Format')).toHaveValue('wav');
});

test('the scroll position stays usable after zooming in and dragging the scrollbar', async ({
  page,
}) => {
  await page.keyboard.press('Control+=');
  const box = await waveformBox(page);
  await drag(page, box.x + 20, box.x + box.width - 5, box.y + box.height + 7);
  expect(await waveformPixelCount(page)).toBeGreaterThan(100);
});
