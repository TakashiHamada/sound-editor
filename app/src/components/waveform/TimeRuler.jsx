// Time ruler drawn above the waveform: labelled major ticks and unlabelled minor ticks for the
// currently visible time range, rendered on a HiDPI-aware canvas.

import { useEffect, useRef } from 'react';
import { formatTime } from '../../utils/format.js';

// Canvas height in CSS px (matches RULER_HEIGHT in WaveformView).
const RULER_CANVAS_HEIGHT = 24;

// Picks a major tick interval (seconds) and the number of minor subdivisions per major tick so that
// roughly 8 or fewer major ticks span `visibleDuration`.
function chooseTickSpacing(visibleDuration) {
  let candidates = [
      [0.01, 5],
      [0.02, 4],
      [0.05, 5],
      [0.1, 5],
      [0.2, 4],
      [0.5, 5],
      [1, 5],
      [2, 4],
      [5, 5],
      [10, 5],
      [15, 3],
      [30, 6],
      [60, 6],
      [120, 4],
      [300, 5],
      [600, 6],
    ],
    minimumMajor = visibleDuration / 8,
    chosen = candidates[candidates.length - 1];
  for (let candidate of candidates)
    if (candidate[0] >= minimumMajor) {
      chosen = candidate;
      break;
    }
  return { major: chosen[0], subTicks: chosen[1] };
}

export function TimeRuler({ duration, zoom, scrollX, width }) {
  const canvasRef = useRef(null);
  useEffect(() => {
    let canvas = canvasRef.current;
    if (!canvas) return;
    let pixelRatio = window.devicePixelRatio || 1;
    canvas.width = width * pixelRatio;
    canvas.height = RULER_CANVAS_HEIGHT * pixelRatio;
    let ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(pixelRatio, pixelRatio);
    ctx.fillStyle = '#0f0f1a';
    ctx.fillRect(0, 0, width, RULER_CANVAS_HEIGHT);
    if (duration <= 0) return;
    let totalWidth = width * zoom,
      visibleDuration = duration / zoom,
      pxPerSecond = totalWidth / duration,
      { major, subTicks } = chooseTickSpacing(visibleDuration),
      minorStep = major / subTicks,
      viewStart = (scrollX / totalWidth) * duration,
      viewEnd = viewStart + visibleDuration,
      firstTick = Math.floor(viewStart / major) * major;
    ctx.textBaseline = 'top';
    ctx.font = '10px monospace';
    for (let tick = firstTick; tick <= viewEnd + major; tick += minorStep) {
      // Round to 0.1 ms to cancel accumulated floating-point drift from `tick += minorStep`.
      let tickTime = Math.round(tick * 10000) / 10000;
      if (tickTime < 0) continue;
      if (tickTime > duration) break;
      let x = (tickTime - viewStart) * pxPerSecond;
      if (x < -50 || x > width + 50) continue;
      if (Math.abs(Math.round(tickTime / major) * major - tickTime) < minorStep * 0.01) {
        // Major tick: taller line plus a time label.
        ctx.strokeStyle = '#8888aa';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x, 14);
        ctx.lineTo(x, 24);
        ctx.stroke();
        ctx.fillStyle = '#e0e0e0';
        ctx.fillText(formatTime(tickTime), x + 3, 3);
      } else {
        // Minor tick.
        ctx.strokeStyle = '#444466';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x, 19);
        ctx.lineTo(x, 24);
        ctx.stroke();
      }
    }
    // Bottom border line.
    ctx.strokeStyle = '#2a2a4a';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, 23.5);
    ctx.lineTo(width, 23.5);
    ctx.stroke();
  }, [duration, zoom, scrollX, width]);
  return (
    <canvas ref={canvasRef} style={{ width: `${width}px`, height: '24px', display: 'block' }} />
  );
}
