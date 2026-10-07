// Bottom status bar: last log message (click to copy its details), playhead position, selection,
// zoom, duration, undo-history position, clipboard summary and a live stereo level meter.

import { useState, useEffect, useRef, useCallback } from 'react';
import { formatTime } from '../utils/format.js';
import { getLevels } from '../audio/playback.js';

// Level at or above which the meter is drawn red (clip warning line).
const CLIP_LEVEL = 0.9;
// Canvas width of the level meter in px.
const METER_WIDTH = 120;
// Height of one channel bar in px.
const METER_BAR_HEIGHT = 6;
// Vertical gap between the left and right channel bars in px.
const METER_BAR_GAP = 2;

const styles = {
  bar: {
    height: 24,
    minHeight: 24,
    backgroundColor: '#0f0f1a',
    borderTop: '1px solid #2a2a4a',
    display: 'flex',
    alignItems: 'center',
    padding: '0 8px',
    fontFamily: 'monospace',
    fontSize: 11,
    color: '#8888aa',
    gap: 0,
  },
  item: { padding: '0 10px', whiteSpace: 'nowrap' },
  divider: {
    width: 1,
    height: 14,
    backgroundColor: '#2a2a4a',
    flexShrink: 0,
  },
  value: { color: '#e0e0e0' },
  spacer: { flex: 1 },
  meterContainer: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '0 4px',
  },
};

// Draws one channel bar of the level meter at vertical offset `y`. The meter's full scale is 1.2
// (20% headroom above 1.0): green up to CLIP_LEVEL, red beyond it, a faint red line marking
// CLIP_LEVEL, and a 2px peak-hold tick (only drawn once the held peak exceeds 0.01).
function drawMeterBar(ctx, level, peak, y, width, height) {
  const clipX = (CLIP_LEVEL / 1.2) * width;
  const levelX = Math.min(level / 1.2, 1) * width;
  ctx.fillStyle = '#1a1a30';
  ctx.fillRect(0, y, width, height);
  if (levelX > 0) {
    const greenWidth = Math.min(levelX, clipX);
    if (greenWidth > 0) {
      ctx.fillStyle = '#4caf50';
      ctx.fillRect(0, y, greenWidth, height);
    }
    if (levelX > clipX) {
      ctx.fillStyle = '#f44336';
      ctx.fillRect(clipX, y, levelX - clipX, height);
    }
  }
  ctx.fillStyle = 'rgba(255, 68, 68, 0.4)';
  ctx.fillRect(clipX, y, 1, height);
  if (peak > 0.01) {
    const peakX = Math.min(peak / 1.2, 1) * width;
    ctx.fillStyle = peak >= CLIP_LEVEL ? '#f44336' : '#81c784';
    ctx.fillRect(Math.max(0, peakX - 1), y, 2, height);
  }
}

// Canvas level meter redrawn every animation frame. While playing it reads the live levels; when
// stopped it draws zero levels but keeps the last channel count. Peaks are held for 30 frames and
// then decay by 5% per frame.
function LevelMeter({ isPlaying }) {
  const canvasRef = useRef(null);
  const animationFrameRef = useRef(null);
  const leftPeakRef = useRef(0);
  const leftHoldFramesRef = useRef(0);
  const rightPeakRef = useRef(0);
  const rightHoldFramesRef = useRef(0);
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
    if (levels.left > leftPeakRef.current) {
      leftPeakRef.current = levels.left;
      leftHoldFramesRef.current = 0;
    } else {
      leftHoldFramesRef.current++;
      if (leftHoldFramesRef.current > 30) leftPeakRef.current *= 0.95;
    }
    drawMeterBar(ctx, levels.left, leftPeakRef.current, 0, METER_WIDTH, METER_BAR_HEIGHT);
    if (isStereo) {
      if (levels.right > rightPeakRef.current) {
        rightPeakRef.current = levels.right;
        rightHoldFramesRef.current = 0;
      } else {
        rightHoldFramesRef.current++;
        if (rightHoldFramesRef.current > 30) rightPeakRef.current *= 0.95;
      }
      drawMeterBar(
        ctx,
        levels.right,
        rightPeakRef.current,
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
      <span style={{ color: '#8888aa', fontSize: 10 }}>Level</span>
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
  const hasSelection =
    selectionStart !== null && selectionEnd !== null && selectionStart !== selectionEnd;
  const selectionLength = hasSelection ? Math.abs(selectionEnd - selectionStart) : 0;
  const [lastLog, setLastLog] = useState(null);
  const [flashMessage, setFlashMessage] = useState(null);
  // Remember the most recent log entry (an empty message keeps the previous one shown).
  useEffect(() => {
    if (!logMessage) return;
    setLastLog(logMessage);
  }, [logMessage]);
  // The "Copied to clipboard" flash replaces the log text for 2 seconds.
  useEffect(() => {
    if (!flashMessage) return;
    const timer = setTimeout(() => setFlashMessage(null), 2000);
    return () => clearTimeout(timer);
  }, [flashMessage]);
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
          cursor: lastLog ? 'pointer' : 'default',
          color: lastLog ? (lastLog.level === 'error' ? '#f44336' : '#4caf50') : '#555',
        }}
        title={lastLog ? 'Click to copy details' : null}
        onClick={() => {
          if (!lastLog) return;
          // NOTE: the writeText promise is not awaited/caught, so "Copied to clipboard" is shown
          // even when the write is rejected (and `navigator.clipboard` is undefined in insecure
          // contexts, which throws here). Kept as-is.
          navigator.clipboard.writeText(lastLog.detail);
          setFlashMessage('Copied to clipboard');
        }}
      >
        {flashMessage ? (
          flashMessage
        ) : lastLog ? (
          <>
            {lastLog.level === 'error' ? '✘ ' : '✔ '}
            {lastLog.text}
          </>
        ) : (
          'No log'
        )}
      </div>
      <div style={styles.divider} />
      <div style={styles.item}>
        {'Position: '}
        <span style={styles.value}>{formatTime(currentTime)}</span>
      </div>
      <div style={styles.divider} />
      <div style={styles.item}>
        {hasSelection ? (
          <>
            {'Selection:'}{' '}
            <span style={styles.value}>
              {formatTime(selectionStart)}
              {' - '}
              {formatTime(selectionEnd)}
              {' ('}
              {selectionLength.toFixed(3)}
              {'s)'}
            </span>
          </>
        ) : (
          'No selection'
        )}
      </div>
      <div style={styles.divider} />
      <div style={styles.item}>
        {'Zoom: '}
        <span style={styles.value}>
          {Math.round(zoom * 100)}
          {'%'}
        </span>
      </div>
      <div style={styles.divider} />
      <div style={styles.item}>
        {'Duration:'}{' '}
        <span style={styles.value}>{formatTime(audioBuffer ? audioBuffer.duration : 0)}</span>
      </div>
      <div style={styles.divider} />
      <div style={styles.item}>
        {'History:'}{' '}
        <span style={styles.value}>
          {historyLength > 0 ? `${historyIndex} / ${historyLength - 1}` : '--'}
        </span>
      </div>
      {clipboard && (
        <>
          <div style={styles.divider} />
          <div style={styles.item}>
            {'Clipboard:'}{' '}
            <span style={styles.value}>
              {clipboard.buffer.duration.toFixed(1)}
              {'s '}
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
