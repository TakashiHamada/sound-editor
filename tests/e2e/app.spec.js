import { expect, test } from '@playwright/test';
import { makeWav } from '../helpers/audioFixtures.js';
import { loadFiles, logLine, openApp } from '../helpers/app.js';

test('loads without console errors and shows the empty state', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await openApp(page);
  await expect(page.locator('#waveform-placeholder')).toBeAttached();
  expect(errors).toEqual([]);
});

test('version banner shows the branch and a JST build time', async ({ page }) => {
  await openApp(page);
  await expect(page.getByText(/ \| \d{4}-\d{2}-\d{2} \d{2}:\d{2} JST$/)).toBeVisible();
});

test('help dialog opens with F1 and lists the selection shortcuts', async ({ page }) => {
  await openApp(page);
  await page.keyboard.press('F1');
  await expect(page.getByText('Keyboard Shortcuts & Operations')).toBeVisible();
  await expect(page.getByText('Extend selection to start / end')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByText('Keyboard Shortcuts & Operations')).toBeHidden();
});

test('loading files, the 8-file limit and closing', async ({ page }) => {
  await openApp(page);
  const files = Array.from({ length: 9 }, (_, i) => ({
    name: `f${i}.wav`,
    buffer: makeWav({ seconds: 0.1 }),
  }));
  await loadFiles(page, files);
  await expect(logLine(page)).toContainText('Load failed');
  await expect(page.getByText('f7.wav')).toHaveCount(2); // list entry + file info header
  await expect(page.getByText('f8.wav')).toHaveCount(0);
  await page.getByRole('button', { name: 'Close All' }).click();
  await expect(logLine(page)).toContainText('Closed all files (8)');
  await expect(page.getByText('Ctrl+O or drag & drop')).toBeVisible();
});

test('an MP3 file can be loaded and played', async ({ page }) => {
  await openApp(page);
  // A WAV renamed .mp3 still decodes through the native path; this checks the UI flow.
  await loadFiles(page, [{ name: 'song.mp3', buffer: makeWav({ seconds: 0.5 }) }]);
  await expect(logLine(page)).toContainText('Loaded "song.mp3"');
  await page.keyboard.press('Space');
  await expect(page.getByTitle('Pause', { exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTitle('Play', { exact: true })).toBeVisible();
});
