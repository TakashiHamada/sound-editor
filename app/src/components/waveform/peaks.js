// Min/max peak reduction of one channel's samples for the visible part of the waveform.

// Returns `width` entries of `{ min, max }`, one per screen pixel column, for the samples that fall
// under that column when the whole clip (`length` samples) is stretched over `width * zoom` px and
// scrolled by `scrollX` px. Columns with no samples get `{ min: 0, max: 0 }`.
export function computePeaks(samples, length, zoom, scrollX, width) {
  let samplesPerPixel = length / (width * zoom),
    peaks = Array(width);
  for (let column = 0; column < width; column++) {
    let firstSample = Math.floor((scrollX + column) * samplesPerPixel),
      endSample = Math.min(Math.ceil((scrollX + column + 1) * samplesPerPixel), length),
      min = 1,
      max = -1;
    for (let index = firstSample; index < endSample; index++) {
      let sample = samples[index];
      if (sample < min) min = sample;
      if (sample > max) max = sample;
    }
    if (min > max) {
      min = 0;
      max = 0;
    }
    peaks[column] = { min: min, max: max };
  }
  return peaks;
}
