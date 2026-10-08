import { expect, test } from '@playwright/test';
import { makeWav } from '../helpers/audioFixtures.js';
import {
  drag,
  loadFiles,
  openApp,
  selectionFromStatusBar,
  setTimeField,
  statusValue,
  timeField,
  waveformBox,
} from '../helpers/app.js';

test.beforeEach(async ({ page }) => {
  await openApp(page);
  await loadFiles(page, [{ name: 'one-second.wav', buffer: makeWav({ seconds: 1 }) }]);
});

test('dragging past the canvas edge clamps to exactly 0 / the end', async ({ page }) => {
  const box = await waveformBox(page);
  const y = box.y + box.height / 2;
  await drag(page, box.x + box.width * 0.5, box.x - 100, y);
  expect(await selectionFromStatusBar(page)).toEqual({ start: 0, end: 0.5 });
  await page.getByTitle('Clear selection').click();
  await drag(page, box.x + box.width * 0.5, box.x + box.width + 100, y);
  expect(await selectionFromStatusBar(page)).toEqual({ start: 0.5, end: 1 });
});

test('dragging close to the clip edge snaps onto it', async ({ page }) => {
  const box = await waveformBox(page);
  const y = box.y + box.height / 2;
  await drag(page, box.x + box.width * 0.3, box.x + box.width - 4, y);
  expect((await selectionFromStatusBar(page)).end).toBe(1);
  await drag(page, box.x + box.width * 0.3, box.x + 4, y);
  expect((await selectionFromStatusBar(page)).start).toBe(0);
});

test('a selection edge can be grabbed and moved', async ({ page }) => {
  const box = await waveformBox(page);
  const y = box.y + box.height / 2;
  await drag(page, box.x + box.width * 0.4, box.x + box.width * 0.8, y);
  await page.mouse.move(box.x + box.width * 0.4 + 2, y);
  await expect(page.locator('#root canvas').nth(1)).toHaveCSS('cursor', 'ew-resize');
  await drag(page, box.x + box.width * 0.4 + 2, box.x + box.width * 0.1, y);
  const sel = await selectionFromStatusBar(page);
  expect(sel.start).toBeCloseTo(0.1, 1);
  expect(sel.end).toBeCloseTo(0.8, 2);
});

test('a plain click seeks without leaving a tiny selection', async ({ page }) => {
  const box = await waveformBox(page);
  await page.mouse.click(box.x + box.width * 0.25, box.y + box.height / 2);
  expect(await selectionFromStatusBar(page)).toBeNull();
  const [min, sec] = (await statusValue(page, 'Position')).split(':').map(Number);
  expect(min * 60 + sec).toBeCloseTo(0.25, 2);
});

test('selection bar buttons jump to and select up to the exact ends', async ({ page }) => {
  await page.getByTitle('Jump playhead to the very end (End)').click();
  expect(await statusValue(page, 'Position')).toBe('00:01.000');
  await page.getByTitle('Jump playhead to the very start (Home)').click();
  expect(await statusValue(page, 'Position')).toBe('00:00.000');

  const box = await waveformBox(page);
  await page.mouse.click(box.x + box.width * 0.4, box.y + box.height / 2);
  await page.getByTitle('Set selection end to the very end of the clip (Shift+End)').click();
  const sel = await selectionFromStatusBar(page);
  expect(sel.start).toBeCloseTo(0.4, 2);
  expect(sel.end).toBe(1);
  await page.getByTitle('Set selection start to the very start of the clip (Shift+Home)').click();
  expect(await selectionFromStatusBar(page)).toEqual({ start: 0, end: 1 });
  await page.getByTitle('Clear selection').click();
  expect(await selectionFromStatusBar(page)).toBeNull();
});

test('In / Out fields accept typed times and reject garbage', async ({ page }) => {
  await setTimeField(page, 'Out', '0:00.75');
  await setTimeField(page, 'In', '0.25');
  expect(await selectionFromStatusBar(page)).toEqual({ start: 0.25, end: 0.75 });
  await expect(timeField(page, 'In')).toHaveValue('00:00.250');

  const out = timeField(page, 'Out');
  await out.click();
  await out.fill('not a time');
  await out.press('Enter');
  await expect(out).toHaveCSS('border-color', 'rgb(239, 83, 80)');
  await out.press('Escape');
  await expect(out).toHaveValue('00:00.750');
  expect(await selectionFromStatusBar(page)).toEqual({ start: 0.25, end: 0.75 });
});

test('Home / End and Shift+Home / Shift+End', async ({ page }) => {
  const box = await waveformBox(page);
  await page.mouse.click(box.x + box.width * 0.6, box.y + box.height / 2);
  await page.keyboard.press('End');
  expect(await statusValue(page, 'Position')).toBe('00:01.000');
  await page.keyboard.press('Home');
  expect(await statusValue(page, 'Position')).toBe('00:00.000');
  await page.mouse.click(box.x + box.width * 0.6, box.y + box.height / 2);
  await page.keyboard.press('Shift+End');
  const sel = await selectionFromStatusBar(page);
  expect(sel.start).toBeCloseTo(0.6, 2);
  expect(sel.end).toBe(1);
  await page.keyboard.press('Shift+Home');
  expect(await selectionFromStatusBar(page)).toEqual({ start: 0, end: 1 });
});
