// Bottom status bar: last log message (click to copy its details), playhead position, selection,
// zoom, duration, undo-history position, clipboard summary and a live stereo level meter.

import { useState, useEffect, useRef, useCallback } from 'react';
import { getLevels } from '../audio/playback.js';
import { getSelectionRange } from '../store/editorStore.js';
import { colors } from '../theme.js';
import { formatTime } from '../utils/format.js';
import { Divider } from './Divider.jsx';

// Level at or above which the meter is drawn red (clip warning line).
const CLIP_LEVEL = 0.9;
// Canvas width of the level meter in px.
const METER_WIDTH = 120;
// Height of one channel bar in px.
const METER_BAR_HEIGHT = 6;
// Vertical gap between the left and right channel bars in px.
const METER_BAR_GAP = 2;
// A new peak is held for this many frames, then decays by PEAK_DECAY per frame.
const PEAK_HOLD_FRAMES = 30;
const PEAK_DECAY = 0.95;

const styles = {
  bar: {
    height: 24,
    minHeight: 24,
    backgroundColor: colors.bgDark,
    borderTop: `1px solid ${colors.border}`,
    display: 'flex',
    alignItems: 'center',
    padding: '0 8px',
    fontFamily: 'monospace',
    fontSize: 11,
    color: colors.textDim,
    gap: 0,
  },
  item: { padding: '0 10px', whiteSpace: 'nowrap' },
  value: { color: colors.text },
  spacer: { flex: 1 },
  meterContainer: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '0 4px',
  },
};

// Separator between status items.
function StatusDivider() {
  return <Divider height={14} flexShrink={0} />;
}

// Text colour of the log area: red for errors, green otherwise, grey before the first message.
function logColor(logMessage) {
  if (!logMessage) return colors.textEmpty;
  return logMessage.level === 'error' ? colors.logError : colors.logInfo;
}

// Selection readout, e.g. "00:01.000 - 00:02.500 (1.500s)".
function formatSelection({ start, end }) {
  return `${formatTime(start)} - ${formatTime(end)} (${(end - start).toFixed(3)}s)`;
}

// Draws one channel bar of the level meter at vertical offset `y`. The meter's full scale is 1.2
// (20% headroom above 1.0): green up to CLIP_LEVEL, red beyond it, a faint red line marking
// CLIP_LEVEL, and a 2px peak-hold tick (only drawn once the held peak exceeds 0.01).
function drawMeterBar(ctx, level, peak, y, width, height) {
  const clipX = (CLIP_LEVEL / 1.2) * width;
  const levelX = Math.min(level / 1.2, 1) * width;
  ctx.fillStyle = colors.meterBg;
  ctx.fillRect(0, y, width, height);
  if (levelX > 0) {
    const greenWidth = Math.min(levelX, clipX);
    if (greenWidth > 0) {
      ctx.fillStyle = colors.meterLevel;
      ctx.fillRect(0, y, greenWidth, height);
    }
    if (levelX > clipX) {
      ctx.fillStyle = colors.meterClip;
      ctx.fillRect(clipX, y, levelX - clipX, height);
    }
  }
  ctx.fillStyle = colors.meterClipLine;
  ctx.fillRect(clipX, y, 1, height);
  if (peak > 0.01) {
    const peakX = Math.min(peak / 1.2, 1) * width;
    ctx.fillStyle = peak >= CLIP_LEVEL ? colors.meterClip : colors.meterPeak;
    ctx.fillRect(Math.max(0, peakX - 1), y, 2, height);
  }
}

// Advances one channel's peak-hold state (`{ peak, holdFrames }`) by a frame with the current
// `level` and returns the held peak.
function updatePeak(meter, level) {
  if (level > meter.peak) {
    meter.peak = level;
    meter.holdFrames = 0;
  } else {
    meter.holdFrames++;
    if (meter.holdFrames > PEAK_HOLD_FRAMES) meter.peak *= PEAK_DECAY;
  }
  return meter.peak;
}

// Canvas level meter redrawn every animation frame. While playing it reads the live levels; when
// stopped it draws zero levels but keeps the last channel count.
function LevelMeter({ isPlaying }) {
  const canvasRef = useRef(null);
  const animationFrameRef = useRef(null);
  // Peak-hold state of the left and right channel.
  const metersRef = useRef([
    { peak: 0, holdFrames: 0 },
    { peak: 0, holdFrames: 0 },
  ]);
  const channelCountRef = useRef(1);
  const drawFrame = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const levels = isPlaying
      ? getLevels()
      : { left: 0, right: 0, channels: channelCountRef.current };
    channelCountRef.current = levels.channels;
    const isStereo = levels.channels >= 2;
    const canvasHeight = isStereo ? METER_BAR_HEIGHT * 2 + METER_BAR_GAP : METER_BAR_HEIGHT;
    canvas.height = canvasHeight;
    canvas.style.height = `${canvasHeight}px`;
    const [leftMeter, rightMeter] = metersRef.current;
    const leftPeak = updatePeak(leftMeter, levels.left);
    drawMeterBar(ctx, levels.left, leftPeak, 0, METER_WIDTH, METER_BAR_HEIGHT);
    if (isStereo) {
      const rightPeak = updatePeak(rightMeter, levels.right);
      drawMeterBar(
        ctx,
        levels.right,
        rightPeak,
        METER_BAR_HEIGHT + METER_BAR_GAP,
        METER_WIDTH,
        METER_BAR_HEIGHT,
      );
    }
    animationFrameRef.current = requestAnimationFrame(drawFrame);
  }, [isPlaying]);
  useEffect(() => {
    animationFrameRef.current = requestAnimationFrame(drawFrame);
    return () => {
      if (animationFrameRef.current !== null) cancelAnimationFrame(animationFrameRef.current);
    };
  }, [drawFrame]);
  const stereoHeight = METER_BAR_HEIGHT * 2 + METER_BAR_GAP;
  return (
    <div style={styles.meterContainer}>
      <span style={{ color: colors.textDim, fontSize: 10 }}>Level</span>
      <canvas
        ref={canvasRef}
        width={METER_WIDTH}
        height={stereoHeight}
        style={{ width: METER_WIDTH, height: stereoHeight, borderRadius: 2 }}
      />
    </div>
  );
}

export function StatusBar({
  audioBuffer,
  currentTime,
  selectionStart,
  selectionEnd,
  zoom,
  historyIndex,
  historyLength,
  clipboard,
  isPlaying,
  logMessage,
}) {
  const range = getSelectionRange({ selectionStart, selectionEnd });
  const [flashMessage, setFlashMessage] = useState(null);
  // The "Copied to clipboard" flash replaces the log text for 2 seconds.
  useEffect(() => {
    if (!flashMessage) return;
    const timer = setTimeout(() => setFlashMessage(null), 2000);
    return () => clearTimeout(timer);
  }, [flashMessage]);
  let logContent = 'No log';
  if (flashMessage) logContent = flashMessage;
  else if (logMessage)
    logContent = (
      <>
        {logMessage.level === 'error' ? '✘ ' : '✔ '}
        {logMessage.text}
      </>
    );
  return (
    <div style={styles.bar}>
      <div
        style={{
          ...styles.item,
          width: 220,
          flexShrink: 0,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          cursor: logMessage ? 'pointer' : 'default',
          color: logColor(logMessage),
        }}
        title={logMessage ? 'Click to copy details' : null}
        onClick={() => {
          if (!logMessage) return;
          // The Clipboard API is missing in insecure contexts and may reject (permissions).
          const copy = navigator.clipboard?.writeText(logMessage.detail);
          if (!copy) setFlashMessage('Copy not available');
          else
            copy.then(
              () => setFlashMessage('Copied to clipboard'),
              () => setFlashMessage('Copy failed'),
            );
        }}
      >
        {logContent}
      </div>
      <StatusDivider />
      <div style={styles.item}>
        Position: <span style={styles.value}>{formatTime(currentTime)}</span>
      </div>
      <StatusDivider />
      <div style={styles.item}>
        {range ? (
          <>
            Selection: <span style={styles.value}>{formatSelection(range)}</span>
          </>
        ) : (
          'No selection'
        )}
      </div>
      <StatusDivider />
      <div style={styles.item}>
        Zoom: <span style={styles.value}>{Math.round(zoom * 100)}%</span>
      </div>
      <StatusDivider />
      <div style={styles.item}>
        Duration:{' '}
        <span style={styles.value}>{formatTime(audioBuffer ? audioBuffer.duration : 0)}</span>
      </div>
      <StatusDivider />
      <div style={styles.item}>
        History:{' '}
        <span style={styles.value}>
          {historyLength > 0 ? `${historyIndex} / ${historyLength - 1}` : '--'}
        </span>
      </div>
      {clipboard && (
        <>
          <StatusDivider />
          <div style={styles.item}>
            Clipboard:{' '}
            <span style={styles.value}>
              {clipboard.buffer.duration.toFixed(1)}s{' '}
              {clipboard.numberOfChannels === 1 ? 'mono' : 'stereo'}
            </span>
          </div>
        </>
      )}
      <div style={styles.spacer} />
      <LevelMeter isPlaying={isPlaying} />
    </div>
  );
}
