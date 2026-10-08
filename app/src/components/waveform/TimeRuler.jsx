// Time ruler drawn above the waveform: labelled major ticks and unlabelled minor ticks for the
// currently visible time range, rendered on a HiDPI-aware canvas.

import { useEffect, useRef } from 'react';
import { colors } from '../../theme.js';
import { formatTime } from '../../utils/format.js';
import { RULER_HEIGHT } from './layout.js';

// Picks a major tick interval (seconds) and the number of minor subdivisions per major tick so that
// roughly 8 or fewer major ticks span `visibleDuration`.
function chooseTickSpacing(visibleDuration) {
  const candidates = [
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
  ];
  const minimumMajor = visibleDuration / 8;
  let chosen = candidates[candidates.length - 1];
  for (const candidate of candidates)
    if (candidate[0] >= minimumMajor) {
      chosen = candidate;
      break;
    }
  return { major: chosen[0], subTicks: chosen[1] };
}

export function TimeRuler({ duration, zoom, scrollX, width }) {
  const canvasRef = useRef(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const pixelRatio = window.devicePixelRatio || 1;
    canvas.width = width * pixelRatio;
    canvas.height = RULER_HEIGHT * pixelRatio;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(pixelRatio, pixelRatio);
    ctx.fillStyle = colors.bgDark;
    ctx.fillRect(0, 0, width, RULER_HEIGHT);
    if (duration <= 0) return;
    const totalWidth = width * zoom;
    const visibleDuration = duration / zoom;
    const pxPerSecond = totalWidth / duration;
    const { major, subTicks } = chooseTickSpacing(visibleDuration);
    const minorStep = major / subTicks;
    const viewStart = (scrollX / totalWidth) * duration;
    const viewEnd = viewStart + visibleDuration;
    const firstTick = Math.floor(viewStart / major) * major;
    ctx.textBaseline = 'top';
    ctx.font = '10px monospace';
    for (let tick = firstTick; tick <= viewEnd + major; tick += minorStep) {
      // Round to 0.1 ms to cancel accumulated floating-point drift from `tick += minorStep`.
      const tickTime = Math.round(tick * 10000) / 10000;
      if (tickTime < 0) continue;
      if (tickTime > duration) break;
      const x = (tickTime - viewStart) * pxPerSecond;
      if (x < -50 || x > width + 50) continue;
      if (Math.abs(Math.round(tickTime / major) * major - tickTime) < minorStep * 0.01) {
        // Major tick: taller line plus a time label.
        ctx.strokeStyle = colors.textDim;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x, 14);
        ctx.lineTo(x, RULER_HEIGHT);
        ctx.stroke();
        ctx.fillStyle = colors.text;
        ctx.fillText(formatTime(tickTime), x + 3, 3);
      } else {
        // Minor tick.
        ctx.strokeStyle = colors.rulerMinorTick;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x, 19);
        ctx.lineTo(x, RULER_HEIGHT);
        ctx.stroke();
      }
    }
    // Bottom border line (centred on the last pixel row).
    ctx.strokeStyle = colors.border;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, 23.5);
    ctx.lineTo(width, 23.5);
    ctx.stroke();
  }, [duration, zoom, scrollX, width]);
  return (
    <canvas
      ref={canvasRef}
      style={{ width: `${width}px`, height: `${RULER_HEIGHT}px`, display: 'block' }}
    />
  );
}
