// Main waveform canvas: draws per-channel min/max peaks (selection-tinted and preview-gain scaled),
// clip-level guide lines, the selection overlay with grip handles and the playhead. Handles
// click-to-seek, drag-to-select / drag-an-edge, edge hover cursor and file drag-and-drop.

import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useFileDrop } from '../../hooks/useFileDrop.js';
import { colors } from '../../theme.js';
import { DRAG_PX, SNAP_PX, nearSelectionEdge } from './selectionGeometry.js';
import { computePeaks } from './peaks.js';

export function WaveformCanvas({
  audioBuffer,
  zoom,
  scrollX,
  selectionStart,
  selectionEnd,
  currentTime,
  previewGain,
  width,
  height,
  onSelectionChange,
  onSeek,
  onFilesDrop,
}) {
  const canvasRef = useRef(null);
  const { isDragOver, dropHandlers } = useFileDrop(onFilesDrop);
  const isDraggingRef = useRef(false);
  const dragAnchorRef = useRef(null);
  const totalWidth = width * zoom;
  const duration = audioBuffer ? audioBuffer.duration : 0;
  const channelCount = audioBuffer ? audioBuffer.numberOfChannels : 1;
  const isStereo = channelCount >= 2;
  // Canvas x (px) -> time (s), unclamped.
  const pxToTime = useCallback(
    (x) => {
      if (!audioBuffer || width <= 0) return 0;
      const pxPerSecond = totalWidth / duration;
      return (scrollX / totalWidth) * duration + x / pxPerSecond;
    },
    [audioBuffer, width, totalWidth, duration, scrollX],
  );
  // Time (s) -> canvas x (px).
  const timeToPx = useCallback(
    (time) => (time - (scrollX / totalWidth) * duration) * (totalWidth / duration),
    [scrollX, totalWidth, duration],
  );
  const channelPeaks = useMemo(() => {
    if (!audioBuffer || width <= 0) return null;
    const peaksPerChannel = [];
    for (let channel = 0; channel < channelCount; channel++)
      peaksPerChannel.push(
        computePeaks(audioBuffer.getChannelData(channel), audioBuffer.length, zoom, scrollX, width),
      );
    return peaksPerChannel;
  }, [audioBuffer, channelCount, zoom, scrollX, width]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const pixelRatio = window.devicePixelRatio || 1;
    canvas.width = width * pixelRatio;
    canvas.height = height * pixelRatio;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(pixelRatio, pixelRatio);
    ctx.fillStyle = colors.waveformBg;
    ctx.fillRect(0, 0, width, height);
    if (!audioBuffer || !channelPeaks) {
      ctx.fillStyle = colors.textDim;
      ctx.font = '14px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('Drop audio file here or use Open File', width / 2, height / 2);
      return;
    }
    // Selection edges in canvas px (-1 without a selection). A zero-length selection is still
    // drawn as an edge line with grips.
    const showSelection = selectionStart != null && selectionEnd != null && duration > 0;
    const selectionLeftX = showSelection ? timeToPx(Math.min(selectionStart, selectionEnd)) : -1;
    const selectionRightX = showSelection ? timeToPx(Math.max(selectionStart, selectionEnd)) : -1;
    // Pixel columns [selectionFirstPx, selectionEndPx) are drawn in the selection colour.
    const selectionFirstPx = Math.floor(selectionLeftX);
    const selectionEndPx = Math.ceil(selectionRightX);
    // Stereo files get two stacked lanes (L on top, R below); everything else one lane.
    const laneCount = isStereo ? 2 : 1;
    const laneHeight = height / laneCount;
    // Full scale (amplitude 1.0) maps to 1/1.2 of the half-lane height, leaving headroom so that
    // preview gain above 0 dB stays visible; dashed guides mark amplitude 0.9.
    const headroom = 1.2;
    const guideLevel = 0.9;
    const amplitudeScale = laneHeight / 2 / headroom;
    const gain = previewGain ?? 1;
    for (let lane = 0; lane < laneCount; lane++) {
      const peaks = channelPeaks[lane];
      const laneTop = lane * laneHeight;
      const centerY = laneTop + laneHeight / 2;
      if (isStereo && lane === 1) {
        // Separator between the L and R lanes.
        ctx.strokeStyle = colors.border;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, laneTop);
        ctx.lineTo(width, laneTop);
        ctx.stroke();
      }
      // Zero-amplitude center line.
      ctx.strokeStyle = colors.centerLine;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, centerY);
      ctx.lineTo(width, centerY);
      ctx.stroke();
      const upperGuideY = centerY - guideLevel * amplitudeScale;
      const lowerGuideY = centerY + guideLevel * amplitudeScale;
      ctx.strokeStyle = colors.clipGuide;
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(0, upperGuideY);
      ctx.lineTo(width, upperGuideY);
      ctx.moveTo(0, lowerGuideY);
      ctx.lineTo(width, lowerGuideY);
      ctx.stroke();
      ctx.setLineDash([]);
      if (isStereo) {
        const channelLabel = lane === 0 ? 'L' : 'R';
        ctx.fillStyle = colors.borderLight;
        ctx.font = 'bold 12px monospace';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText(channelLabel, 6, laneTop + 4);
      }
      ctx.fillStyle = colors.waveform;
      let currentlySelected = false;
      for (let column = 0; column < peaks.length; column++) {
        const inSelection = column >= selectionFirstPx && column < selectionEndPx;
        if (inSelection !== currentlySelected) {
          ctx.fillStyle = inSelection ? colors.selection : colors.waveform;
          currentlySelected = inSelection;
        }
        let { min, max } = peaks[column];
        // Preview gain only affects the selected region.
        if (inSelection && gain !== 1) {
          min *= gain;
          max *= gain;
        }
        const barTop = centerY - max * amplitudeScale;
        const barHeight = centerY - min * amplitudeScale - barTop;
        if (barHeight < 0.5) ctx.fillRect(column, centerY, 1, 1);
        else ctx.fillRect(column, barTop, 1, barHeight);
      }
    }
    if (showSelection) {
      ctx.fillStyle = colors.selectionOverlay;
      ctx.fillRect(selectionLeftX, 0, selectionRightX - selectionLeftX, height);
      ctx.strokeStyle = colors.selection;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(selectionLeftX, 0);
      ctx.lineTo(selectionLeftX, height);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(selectionRightX, 0);
      ctx.lineTo(selectionRightX, height);
      ctx.stroke();
      // 8x7 px grip handles at the top and bottom of both edges.
      ctx.fillStyle = colors.selection;
      ctx.fillRect(selectionLeftX - 4, 0, 8, 7);
      ctx.fillRect(selectionRightX - 4, 0, 8, 7);
      ctx.fillRect(selectionLeftX - 4, height - 7, 8, 7);
      ctx.fillRect(selectionRightX - 4, height - 7, 8, 7);
    }
    if (duration > 0) {
      const playheadX = timeToPx(currentTime);
      if (playheadX >= 0 && playheadX <= width) {
        ctx.strokeStyle = colors.playhead;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(playheadX, 0);
        ctx.lineTo(playheadX, height);
        ctx.stroke();
      }
    }
  }, [
    audioBuffer,
    channelPeaks,
    width,
    height,
    isStereo,
    selectionStart,
    selectionEnd,
    currentTime,
    duration,
    timeToPx,
    previewGain,
  ]);

  // Shows a resize cursor while hovering (no button pressed) near a selection edge.
  const handleMouseMove = useCallback(
    (event) => {
      if (!audioBuffer || !(duration > 0) || event.buttons) return;
      const rect = event.currentTarget.getBoundingClientRect();
      event.currentTarget.style.cursor =
        nearSelectionEdge(event.clientX - rect.left, timeToPx, selectionStart, selectionEnd) !==
        null
          ? 'ew-resize'
          : 'crosshair';
    },
    [audioBuffer, duration, timeToPx, selectionStart, selectionEnd],
  );
  // Mouse-down near a selection edge grabs that edge (the opposite edge becomes the anchor);
  // elsewhere it clears the selection and seeks, and a drag beyond DRAG_PX then selects from
  // the seek position.
  const handleMouseDown = useCallback(
    (event) => {
      if (!audioBuffer || event.button !== 0 || !(duration > 0)) return;
      const rect = event.currentTarget.getBoundingClientRect();
      const downX = event.clientX - rect.left;
      // Canvas x -> time clamped to the clip, snapping to 0 / duration within SNAP_PX.
      const xToSnappedTime = (x) => {
        if (Math.abs(x - timeToPx(0)) <= SNAP_PX) return 0;
        if (Math.abs(x - timeToPx(duration)) <= SNAP_PX) return duration;
        return Math.max(0, Math.min(duration, pxToTime(x)));
      };
      let anchorTime = nearSelectionEdge(downX, timeToPx, selectionStart, selectionEnd);
      let isDragging = anchorTime !== null;
      if (anchorTime === null) {
        anchorTime = xToSnappedTime(downX);
        onSelectionChange(null, null);
        onSeek(anchorTime);
      }
      isDraggingRef.current = true;
      dragAnchorRef.current = anchorTime;
      const handleWindowMouseMove = (moveEvent) => {
        if (!isDraggingRef.current || dragAnchorRef.current == null) return;
        const x = moveEvent.clientX - rect.left;
        if (!isDragging) {
          if (Math.abs(x - downX) < DRAG_PX) return;
          isDragging = true;
        }
        onSelectionChange(dragAnchorRef.current, xToSnappedTime(x));
      };
      const handleWindowMouseUp = () => {
        isDraggingRef.current = false;
        dragAnchorRef.current = null;
        window.removeEventListener('mousemove', handleWindowMouseMove);
        window.removeEventListener('mouseup', handleWindowMouseUp);
      };
      window.addEventListener('mousemove', handleWindowMouseMove);
      window.addEventListener('mouseup', handleWindowMouseUp);
    },
    [
      audioBuffer,
      duration,
      timeToPx,
      selectionStart,
      selectionEnd,
      pxToTime,
      onSelectionChange,
      onSeek,
    ],
  );
  return (
    <canvas
      ref={canvasRef}
      style={{
        width: `${width}px`,
        height: `${height}px`,
        display: 'block',
        cursor: audioBuffer ? 'crosshair' : 'default',
        outline: isDragOver ? `2px dashed ${colors.accent}` : 'none',
        outlineOffset: '-2px',
      }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      {...dropHandlers}
    />
  );
}
