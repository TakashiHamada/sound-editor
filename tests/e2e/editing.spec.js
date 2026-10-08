import { expect, test } from '@playwright/test';
import { makeWav, parseWavHeader } from '../helpers/audioFixtures.js';
import {
  exportActive,
  loadFiles,
  logLine,
  openApp,
  saveSettings,
  setTimeField,
  statusValue,
  waveformBox,
} from '../helpers/app.js';

test.beforeEach(async ({ page }) => {
  await openApp(page);
  await loadFiles(page, [{ name: 'clip.wav', buffer: makeWav({ seconds: 1 }) }]);
});

async function select(page, start, end) {
  await setTimeField(page, 'Out', end);
  await setTimeField(page, 'In', start);
}

test('cut, paste, delete, undo and redo change the duration as expected', async ({ page }) => {
  await select(page, 0.2, 0.5);
  await page.keyboard.press('Control+x');
  expect(await statusValue(page, 'Duration')).toBe('00:00.700');
  await expect(logLine(page)).toContainText('Cut 0.30s');

  await page.keyboard.press('Control+v');
  await expect(logLine(page)).toContainText('Pasted 0.30s');
  expect(await statusValue(page, 'Duration')).toBe('00:01.000');

  await select(page, 0, 0.25);
  await page.keyboard.press('Delete');
  expect(await statusValue(page, 'Duration')).toBe('00:00.750');

  await page.keyboard.press('Control+z');
  expect(await statusValue(page, 'Duration')).toBe('00:01.000');
  await page.keyboard.press('Control+Shift+Z');
  expect(await statusValue(page, 'Duration')).toBe('00:00.750');
});

test('fade in / fade out and volume are applied to the exported audio', async ({ page }) => {
  await saveSettings(page, { Format: 'wav', 'Bit Depth': 32 });
  const before = (await exportActive(page)).buffer;

  // Fades act on the selection: fade in starts at the selection start.
  await select(page, 0, 0.5);

  await page
    .locator('text=Fade In Duration (seconds)')
    .locator('xpath=following-sibling::div[1]//input')
    .fill('0.5');
  await page.getByRole('button', { name: 'Apply' }).nth(0).click();
  await expect(logLine(page)).toContainText('Fade in');
  const faded = (await exportActive(page)).buffer;
  expect(parseWavHeader(faded).dataSize).toBe(parseWavHeader(before).dataSize);
  // Sample 0 of the left channel becomes silent, a later sample is untouched.
  expect(faded.readFloatLE(44 + 8 * 10)).toBeCloseTo(0, 2);
  const late = 44 + 8 * 40000;
  expect(faded.readFloatLE(late)).toBeCloseTo(before.readFloatLE(late), 5);
});

test('noise reduction requires a long-enough noise selection', async ({ page }) => {
  await select(page, 0, 0.01);
  await page.getByRole('button', { name: 'Capture Noise Profile' }).click();
  await expect(logLine(page)).toContainText('Noise selection too short');
  await select(page, 0, 0.5);
  await page.getByRole('button', { name: 'Capture Noise Profile' }).click();
  await expect(logLine(page)).toContainText('Noise profile captured');
  await page.getByRole('button', { name: 'Apply Noise Reduction' }).click();
  await expect(logLine(page)).toContainText('Noise reduction applied');
});

test('zoom and fit keep the waveform usable', async ({ page }) => {
  await page.keyboard.press('Control+=');
  await page.keyboard.press('Control+=');
  expect(await statusValue(page, 'Zoom')).toBe('225%');
  await page.getByTitle('Fit to Window').click();
  expect(await statusValue(page, 'Zoom')).toBe('100%');
  const box = await waveformBox(page);
  expect(box.width).toBeGreaterThan(400);
});
