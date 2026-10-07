// Main waveform canvas: draws per-channel min/max peaks (selection-tinted and preview-gain scaled),
// clip-level guide lines, the selection overlay with grip handles and the playhead. Handles
// click-to-seek, drag-to-select / drag-an-edge, edge hover cursor and file drag-and-drop.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DRAG_PX, SNAP_PX, nearSelectionEdge } from '../../selection/selectionActions.js';
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
  const [isDragOver, setIsDragOver] = useState(false);
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
    ctx.fillStyle = '#0a0a18';
    ctx.fillRect(0, 0, width, height);
    if (!audioBuffer || !channelPeaks) {
      ctx.fillStyle = '#8888aa';
      ctx.font = '14px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('Drop audio file here or use Open File', width / 2, height / 2);
      return;
    }
    // Stereo files get two stacked lanes (L on top, R below); everything else one lane.
    const laneCount = isStereo ? 2 : 1;
    const laneHeight = height / laneCount;
    for (let lane = 0; lane < laneCount; lane++) {
      const peaks = channelPeaks[lane];
      const laneTop = lane * laneHeight;
      const centerY = laneTop + laneHeight / 2;
      if (isStereo && lane === 1) {
        // Separator between the L and R lanes.
        ctx.strokeStyle = '#2a2a4a';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, laneTop);
        ctx.lineTo(width, laneTop);
        ctx.stroke();
      }
      // Zero-amplitude center line.
      ctx.strokeStyle = '#1a1a30';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, centerY);
      ctx.lineTo(width, centerY);
      ctx.stroke();
      // Full scale (amplitude 1.0) maps to 1/1.2 of the half-lane height, leaving headroom so that
      // preview gain above 0 dB stays visible; dashed guides mark amplitude 0.9.
      const headroom = 1.2;
      const guideLevel = 0.9;
      const guideScale = laneHeight / 2 / headroom;
      const upperGuideY = centerY - guideLevel * guideScale;
      const lowerGuideY = centerY + guideLevel * guideScale;
      ctx.strokeStyle = 'rgba(255, 68, 68, 0.25)';
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
        ctx.fillStyle = '#3a3a5a';
        ctx.font = 'bold 12px monospace';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText(channelLabel, 6, laneTop + 4);
      }
      // Pixel column range [selectionFirstPx, selectionEndPx) drawn in the selection color.
      let selectionFirstPx = -1;
      let selectionEndPx = -1;
      if (selectionStart != null && selectionEnd != null && duration > 0) {
        const pxPerSecond = totalWidth / duration;
        const viewStart = (scrollX / totalWidth) * duration;
        selectionFirstPx = Math.floor(
          (Math.min(selectionStart, selectionEnd) - viewStart) * pxPerSecond,
        );
        selectionEndPx = Math.ceil(
          (Math.max(selectionStart, selectionEnd) - viewStart) * pxPerSecond,
        );
      }
      const amplitudeScale = laneHeight / 2 / headroom;
      const gain = previewGain ?? 1;
      ctx.fillStyle = '#4fc3f7';
      let currentlySelected = false;
      for (let column = 0; column < peaks.length; column++) {
        const inSelection = column >= selectionFirstPx && column < selectionEndPx;
        if (inSelection !== currentlySelected) {
          ctx.fillStyle = inSelection ? '#ffd54f' : '#4fc3f7';
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
    if (selectionStart != null && selectionEnd != null && duration > 0) {
      const pxPerSecond = totalWidth / duration;
      const viewStart = (scrollX / totalWidth) * duration;
      const selectionLeftX = (Math.min(selectionStart, selectionEnd) - viewStart) * pxPerSecond;
      const selectionRightX = (Math.max(selectionStart, selectionEnd) - viewStart) * pxPerSecond;
      ctx.fillStyle = 'rgba(255, 213, 79, 0.08)';
      ctx.fillRect(selectionLeftX, 0, selectionRightX - selectionLeftX, height);
      ctx.strokeStyle = '#ffd54f';
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
      ctx.fillStyle = '#ffd54f';
      ctx.fillRect(selectionLeftX - 4, 0, 8, 7);
      ctx.fillRect(selectionRightX - 4, 0, 8, 7);
      ctx.fillRect(selectionLeftX - 4, height - 7, 8, 7);
      ctx.fillRect(selectionRightX - 4, height - 7, 8, 7);
    }
    if (duration > 0) {
      const pxPerSecond = totalWidth / duration;
      const playheadX = (currentTime - (scrollX / totalWidth) * duration) * pxPerSecond;
      if (playheadX >= 0 && playheadX <= width) {
        ctx.strokeStyle = '#ff5722';
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
    zoom,
    scrollX,
    totalWidth,
    duration,
    previewGain,
  ]);

  // Time (s) -> canvas x (px).
  const timeToPx = useCallback(
    (time) => (time - (scrollX / totalWidth) * duration) * (totalWidth / duration),
    [scrollX, totalWidth, duration],
  );
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
      const xToSnappedTime = (x) =>
        Math.abs(x - timeToPx(0)) <= SNAP_PX
          ? 0
          : Math.abs(x - timeToPx(duration)) <= SNAP_PX
            ? duration
            : Math.max(0, Math.min(duration, pxToTime(x)));
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
  const handleDragOver = useCallback((event) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragOver(true);
  }, []);
  const handleDragLeave = useCallback((event) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragOver(false);
  }, []);
  const handleDrop = useCallback(
    (event) => {
      event.preventDefault();
      event.stopPropagation();
      setIsDragOver(false);
      const files = event.dataTransfer.files;
      if (files && files.length > 0) onFilesDrop(Array.from(files));
    },
    [onFilesDrop],
  );
  return (
    <canvas
      ref={canvasRef}
      style={{
        width: `${width}px`,
        height: `${height}px`,
        display: 'block',
        cursor: audioBuffer ? 'crosshair' : 'default',
        outline: isDragOver ? '2px dashed #4fc3f7' : 'none',
        outlineOffset: '-2px',
      }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    />
  );
}
