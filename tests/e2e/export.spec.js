import { expect, test } from '@playwright/test';
import { makeWav, parseMp3Header, parseWavHeader } from '../helpers/audioFixtures.js';
import {
  exportActive,
  loadFiles,
  logLine,
  openApp,
  openSettings,
  saveSettings,
  settingsSelect,
} from '../helpers/app.js';

const SOURCES = [
  { name: 'pcm8_mono_8k.wav', opts: { bits: 8, channels: 1, sampleRate: 8000 } },
  { name: 'pcm16_stereo_44k.wav', opts: { bits: 16, channels: 2, sampleRate: 44100 } },
  { name: 'pcm24_stereo_96k.wav', opts: { bits: 24, channels: 2, sampleRate: 96000 } },
  { name: 'float32_mono_48k.wav', opts: { bits: 32, channels: 1, sampleRate: 48000, float: true } },
];

test.describe('default export keeps the source format', () => {
  for (const source of SOURCES) {
    test(source.name, async ({ page }) => {
      await openApp(page);
      await loadFiles(page, [{ name: source.name, buffer: makeWav(source.opts) }]);
      const out = await exportActive(page);
      const h = parseWavHeader(out.buffer);
      expect(out.name).toBe(source.name);
      expect(h).toMatchObject({
        riff: 'RIFF',
        wave: 'WAVE',
        channels: source.opts.channels,
        sampleRate: source.opts.sampleRate,
        bitsPerSample: source.opts.bits,
        format: source.opts.bits === 32 ? 3 : 1,
      });
      expect(h.dataSize).toBe(h.fileSize - 44);
      await expect(logLine(page)).toContainText('Exported');
    });
  }
});

test('8-bit WAV is written as unsigned PCM (regression: used to fail with a DataView RangeError)', async ({
  page,
}) => {
  await openApp(page);
  await loadFiles(page, [
    {
      name: 'eight.wav',
      buffer: makeWav({ bits: 8, channels: 2, sampleRate: 22050, seconds: 0.5 }),
    },
  ]);
  await openSettings(page);
  await expect(settingsSelect(page, 'Bit Depth')).toHaveValue('8');
  await page.getByRole('button', { name: 'Cancel' }).click();
  const out = await exportActive(page);
  const h = parseWavHeader(out.buffer);
  expect(h.bitsPerSample).toBe(8);
  expect(h.dataSize).toBe(Math.round(22050 * 0.5) * 2);
  // Silence-centred unsigned samples: the first sample of a sine is ~128.
  expect(Math.abs(out.buffer[44] - 128)).toBeLessThanOrEqual(1);
});

test.describe('WAV settings matrix', () => {
  const cases = [
    { 'Bit Depth': 8, Channels: 'mono', 'Sample Rate': 22050 },
    { 'Bit Depth': 16, Channels: 'stereo', 'Sample Rate': 48000 },
    { 'Bit Depth': 24, Channels: 'stereo', 'Sample Rate': 96000 },
    { 'Bit Depth': 32, Channels: 'mono', 'Sample Rate': 8000 },
  ];
  for (const c of cases) {
    test(JSON.stringify(c), async ({ page }) => {
      await openApp(page);
      // Mono source + "stereo" setting must still produce two channels.
      await loadFiles(page, [{ name: 'src.wav', buffer: makeWav({ channels: 1, seconds: 0.5 }) }]);
      await saveSettings(page, { Format: 'wav', ...c });
      const h = parseWavHeader((await exportActive(page)).buffer);
      expect(h).toMatchObject({
        bitsPerSample: c['Bit Depth'],
        channels: c.Channels === 'mono' ? 1 : 2,
        sampleRate: c['Sample Rate'],
      });
    });
  }
});

test.describe('MP3 settings matrix', () => {
  const cases = [
    {
      settings: { 'Sample Rate': 44100, 'Bitrate (CBR)': 192, 'Lowpass Filter': 12000 },
      expect: { sampleRate: 44100, kbps: 192 },
    },
    {
      settings: { 'Sample Rate': 48000, 'Bitrate (CBR)': 320, 'Lowpass Filter': 0 },
      expect: { sampleRate: 48000, kbps: 320 },
    },
    {
      settings: { 'Sample Rate': 22050, 'Bitrate (CBR)': 320 },
      expect: { sampleRate: 22050, kbps: 160 },
    },
    {
      settings: { 'Sample Rate': 8000, 'Bitrate (CBR)': 32 },
      expect: { sampleRate: 8000, kbps: 32 },
    },
    {
      settings: { 'Sample Rate': 32000, Channels: 'mono', 'Bitrate (CBR)': 64 },
      expect: { sampleRate: 32000, kbps: 64, mono: true },
    },
  ];
  for (const c of cases) {
    test(JSON.stringify(c.settings), async ({ page }) => {
      await openApp(page);
      await loadFiles(page, [
        { name: 'src.wav', buffer: makeWav({ sampleRate: 96000, seconds: 0.5 }) },
      ]);
      await saveSettings(page, { Format: 'mp3', ...c.settings });
      const out = await exportActive(page);
      expect(out.name).toBe('src.mp3');
      expect(parseMp3Header(out.buffer)).toMatchObject(c.expect);
    });
  }

  test('MP3 offers only legal MPEG sample rates and warns about the MPEG-2 bitrate cap', async ({
    page,
  }) => {
    await openApp(page);
    await loadFiles(page, [
      { name: 'src.wav', buffer: makeWav({ sampleRate: 96000, seconds: 0.2 }) },
    ]);
    await openSettings(page);
    await settingsSelect(page, 'Format').selectOption('mp3');
    const rates = await settingsSelect(page, 'Sample Rate')
      .locator('option')
      .evaluateAll((o) => o.map((x) => +x.value));
    expect(rates).toEqual([8000, 11025, 12000, 16000, 22050, 24000, 32000, 44100, 48000]);
    await expect(settingsSelect(page, 'Sample Rate')).toHaveValue('48000');
    await settingsSelect(page, 'Sample Rate').selectOption('22050');
    await settingsSelect(page, 'Bitrate (CBR)').selectOption('320');
    await expect(page.getByText(/supports at most 160 kbps/)).toBeVisible();
  });
});

test('presets apply their documented values', async ({ page }) => {
  await openApp(page);
  await loadFiles(page, [{ name: 'src.wav', buffer: makeWav({ seconds: 0.3 }) }]);
  await openSettings(page);
  await settingsSelect(page, 'Preset').selectOption('voice');
  await expect(settingsSelect(page, 'Format')).toHaveValue('mp3');
  await expect(settingsSelect(page, 'Channels')).toHaveValue('mono');
  await expect(settingsSelect(page, 'Sample Rate')).toHaveValue('22050');
  await expect(settingsSelect(page, 'Bitrate (CBR)')).toHaveValue('64');
  // Music presets must not inherit the voice preset's 22.05 kHz rate.
  await settingsSelect(page, 'Preset').selectOption('music_high');
  await expect(settingsSelect(page, 'Sample Rate')).toHaveValue('44100');
  await expect(settingsSelect(page, 'Bitrate (CBR)')).toHaveValue('192');
  await expect(settingsSelect(page, 'Channels')).toHaveValue('stereo');
  // Changing any field switches the preset to Custom.
  await settingsSelect(page, 'Bitrate (CBR)').selectOption('128');
  await expect(settingsSelect(page, 'Preset')).toHaveValue('custom');
});

test('original format survives an edit + undo (metadata is carried across buffers)', async ({
  page,
}) => {
  await openApp(page);
  await loadFiles(page, [
    { name: 'src.wav', buffer: makeWav({ bits: 24, sampleRate: 96000, seconds: 1 }) },
  ]);
  await page.keyboard.press('Control+a');
  await page.keyboard.press('Delete');
  await page.keyboard.press('Control+z');
  const h = parseWavHeader((await exportActive(page)).buffer);
  expect(h).toMatchObject({ bitsPerSample: 24, sampleRate: 96000, channels: 2 });
});

test('WAV with a chunk before `fmt ` still keeps its original format', async ({ page }) => {
  await openApp(page);
  const buffer = makeWav({
    bits: 24,
    channels: 1,
    sampleRate: 48000,
    seconds: 0.3,
    extraChunk: true,
  });
  await loadFiles(page, [{ name: 'list-chunk.wav', buffer }]);
  const h = parseWavHeader((await exportActive(page)).buffer);
  expect(h).toMatchObject({ bitsPerSample: 24, channels: 1, sampleRate: 48000 });
});
