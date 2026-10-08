// Page-object style helpers for driving the editor UI in Playwright tests.
import fs from 'node:fs';
import { expect } from '@playwright/test';

export async function openApp(page) {
  await page.goto('/');
  await expect(page.getByText('Ctrl+O or drag & drop')).toBeVisible();
}

/** Load one or more in-memory files through the hidden <input type=file>. */
export async function loadFiles(page, files) {
  await page.setInputFiles(
    'input[type=file]',
    files.map(({ name, buffer }) => ({
      name,
      mimeType: name.endsWith('.mp3') ? 'audio/mpeg' : 'audio/wav',
      buffer,
    })),
  );
  // Files are decoded one after another; the last one has finished once the log mentions it
  // (or reports a failure). The overlay alone is not enough: it only appears after 500 ms.
  const last = files[files.length - 1].name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  await expect(logLine(page)).toContainText(new RegExp(`Loaded "${last}"|Load failed`), {
    timeout: 30_000,
  });
  await waitIdle(page);
}

/** Wait until the processing overlay (if any) is gone. */
export async function waitIdle(page) {
  await page.waitForTimeout(50);
  await expect(
    page.locator('text=/(Loading|Exporting|Encoding|Pasting|Applying)[^\\n]*\\.\\.\\./'),
  ).toHaveCount(0, {
    timeout: 60_000,
  });
}

/** Latest status-bar log line, e.g. "✔ Exported "a.wav"". */
export function logLine(page) {
  return page.getByTitle('Click to copy details');
}

/** Run the quick export (Ctrl+Shift+E) and return the downloaded file. */
export async function exportActive(page) {
  // Shortcuts are ignored while an input (e.g. a slider just dragged) has focus.
  await page.evaluate(() => document.activeElement?.blur());
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.keyboard.press('Control+Shift+E'),
  ]);
  await waitIdle(page);
  return { name: download.suggestedFilename(), buffer: fs.readFileSync(await download.path()) };
}

export async function openSettings(page) {
  await page.getByRole('button', { name: /^Settings/ }).click();
  await expect(page.getByRole('heading', { name: 'Export Settings' })).toBeVisible();
}

export function settingsSelect(page, label) {
  return page.locator(`label:text-is("${label}") + select`);
}

export async function saveSettings(page, values) {
  await openSettings(page);
  for (const [label, value] of Object.entries(values)) {
    await settingsSelect(page, label).selectOption(String(value));
  }
  await page.getByRole('button', { name: 'Save' }).click();
}

/** Bounding box of the waveform canvas (the largest canvas on the page). */
export async function waveformBox(page) {
  const boxes = await page.$$eval('#root canvas', (canvases) =>
    canvases.map((c) => {
      const r = c.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    }),
  );
  return boxes.sort((a, b) => b.width * b.height - a.width * a.height)[0];
}

export async function drag(page, fromX, toX, y) {
  await page.mouse.move(fromX, y);
  await page.mouse.down();
  await page.mouse.move(toX, y, { steps: 6 });
  await page.mouse.up();
}

/** Parse the status bar's "Selection: 00:00.200 - 00:00.500 (0.300s)" (null = no selection). */
export async function selectionFromStatusBar(page) {
  const item = page.locator('text=/^Selection:/').first();
  if ((await item.count()) === 0) return null;
  const text = await item.textContent();
  const m = text.match(/(\d+):(\d+\.\d+) - (\d+):(\d+\.\d+)/);
  return m ? { start: +m[1] * 60 + +m[2], end: +m[3] * 60 + +m[4] } : null;
}

export async function statusValue(page, label) {
  const item = page.locator(`text=/^${label}:/`).first();
  return (await item.textContent()).replace(`${label}:`, '').trim();
}

export function timeField(page, label) {
  return page.locator(`label:has-text("${label}") input`);
}

export async function setTimeField(page, label, value) {
  const field = timeField(page, label);
  await field.click();
  await field.fill(String(value));
  await field.press('Enter');
}
