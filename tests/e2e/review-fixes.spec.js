// Regression tests for issues found in the post-refactor code review.
import { expect, test } from '@playwright/test';
import { floatWavPeak, makeFloatWav, makeWav, seededNoise } from '../helpers/audioFixtures.js';
import {
  exportActive,
  loadFiles,
  logLine,
  openApp,
  openSettings,
  saveSettings,
  selectionFromStatusBar,
  setTimeField,
  statusValue,
} from '../helpers/app.js';

async function select(page, start, end) {
  await setTimeField(page, 'Out', end);
  await setTimeField(page, 'In', start);
}

test('noise reduction does not add spikes at the end of the selection', async ({ page }) => {
  // 1 s of quiet noise, then a 0.3 sine with the same noise (peak ≈ 0.31).
  const sampleRate = 44100;
  const noise = seededNoise(7);
  const samples = new Float32Array(sampleRate * 4);
  for (let i = 0; i < samples.length; i++)
    samples[i] =
      0.02 * 2 * noise() +
      (i >= sampleRate ? 0.3 * Math.sin((2 * Math.PI * 440 * i) / sampleRate) : 0);
  const sourcePeak = samples.reduce((m, v) => Math.max(m, Math.abs(v)), 0);

  await openApp(page);
  await loadFiles(page, [{ name: 'noisy.wav', buffer: makeFloatWav([samples], sampleRate) }]);
  await saveSettings(page, { Format: 'wav', 'Bit Depth': 32 });
  await select(page, 0, 1);
  await page.getByRole('button', { name: 'Capture Noise Profile' }).click();
  // Selection lengths that used to leave the last frame's tail badly normalised.
  for (const end of [2.3093, 2.3062, 1.35]) {
    await select(page, 1.3, end);
    await page.getByRole('button', { name: 'Apply Noise Reduction' }).click();
    await expect(logLine(page)).toContainText('Noise reduction applied');
    const peak = floatWavPeak((await exportActive(page)).buffer);
    expect(peak, `selection 1.3-${end}`).toBeLessThan(sourcePeak * 1.1);
    await page.keyboard.press('Control+z');
  }
});

test('undo keeps the selection and playhead inside the restored audio', async ({ page }) => {
  await openApp(page);
  await loadFiles(page, [{ name: 'two.wav', buffer: makeWav({ seconds: 2 }) }]);
  await page.keyboard.press('Control+a');
  await page.keyboard.press('Control+c');
  await page.keyboard.press('Control+v');
  await expect(logLine(page)).toContainText('Pasted');
  expect(await statusValue(page, 'Duration')).toBe('00:04.000');
  await select(page, 3, 3.5);
  await page.keyboard.press('Control+z');
  expect(await statusValue(page, 'Duration')).toBe('00:02.000');
  // The old selection lay entirely past the end, so it is dropped instead of dangling.
  expect(await selectionFromStatusBar(page)).toBeNull();
  await page.keyboard.press('Delete');
  expect(await statusValue(page, 'Duration')).toBe('00:02.000');
});

test('switching files stops playback of the previous file', async ({ page }) => {
  await openApp(page);
  await loadFiles(page, [
    // Long enough that playback cannot simply finish during the assertions.
    { name: 'a.wav', buffer: makeWav({ seconds: 10 }) },
    { name: 'b.wav', buffer: makeWav({ seconds: 10 }) },
  ]);
  await page.getByText('a.wav', { exact: true }).first().click();
  await page.waitForTimeout(400);
  await page.keyboard.press('Space');
  await expect(page.getByTitle('Pause', { exact: true })).toBeVisible();
  await page.getByText('b.wav', { exact: true }).first().click();
  await expect(page.getByTitle('Play', { exact: true })).toBeVisible({ timeout: 1500 });
  await page.waitForTimeout(300);
  expect(await statusValue(page, 'Position')).toBe('00:00.000');
});

test('shortcuts are suspended while the settings dialog is open', async ({ page }) => {
  await openApp(page);
  await loadFiles(page, [{ name: 'clip.wav', buffer: makeWav({ seconds: 1 }) }]);
  await page.keyboard.press('Control+a');
  await openSettings(page);
  await page.getByRole('heading', { name: 'Export Settings' }).click();
  await page.keyboard.press('Delete');
  await page.getByRole('button', { name: 'Cancel' }).click();
  expect(await statusValue(page, 'Duration')).toBe('00:01.000');
});

test('Ctrl+Z with Caps Lock (upper-case key, no Shift) undoes', async ({ page }) => {
  await openApp(page);
  await loadFiles(page, [{ name: 'clip.wav', buffer: makeWav({ seconds: 1 }) }]);
  await select(page, 0, 0.5);
  await page.keyboard.press('Delete');
  expect(await statusValue(page, 'Duration')).toBe('00:00.500');
  await page.evaluate(() =>
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Z', code: 'KeyZ', ctrlKey: true })),
  );
  expect(await statusValue(page, 'Duration')).toBe('00:01.000');
});

test('an undecodable file fails cleanly without a busy loop', async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => {
    window.__mediaLoads = 0;
    const load = HTMLMediaElement.prototype.load;
    HTMLMediaElement.prototype.load = function (...args) {
      window.__mediaLoads++;
      return load.apply(this, args);
    };
    const src = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'src');
    Object.defineProperty(HTMLMediaElement.prototype, 'src', {
      ...src,
      set(value) {
        window.__mediaLoads++;
        src.set.call(this, value);
      },
    });
  });
  // No 0xFF bytes, so not even the MPEG decoder can find a frame: every strategy runs and fails,
  // including the <audio>-element capture.
  const garbage = Buffer.alloc(5000, 0x41);
  await loadFiles(page, [{ name: 'bad.mp3', buffer: garbage }]);
  await expect(logLine(page)).toContainText('Load failed');
  const settled = await page.evaluate(() => window.__mediaLoads);
  await page.waitForTimeout(1000);
  expect(await page.evaluate(() => window.__mediaLoads)).toBe(settled);
});

test('rename inputs: double-click keeps the text, switching files cancels the info rename', async ({
  page,
}) => {
  await openApp(page);
  await loadFiles(page, [{ name: 'a.wav', buffer: makeWav({ seconds: 0.2 }) }]);
  await page.getByTitle('Double-click to rename').dblclick();
  const input = page.locator('input:not([type])');
  await input.fill('my new name.wav');
  await input.dblclick();
  await expect(input).toHaveValue('my new name.wav');
  await loadFiles(page, [{ name: 'b.wav', buffer: makeWav({ seconds: 0.2 }) }]);
  await expect(input).toHaveCount(0);
  await page.getByText('a.wav', { exact: true }).first().click();
  await page.waitForTimeout(400);
  await expect(input).toHaveCount(0);
  await expect(page.getByText('a.wav', { exact: true })).toHaveCount(2);
});
