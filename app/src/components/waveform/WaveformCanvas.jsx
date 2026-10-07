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
  // Accepted for prop-compatibility with WaveformView; not used here.
  onScrollXChange,
  onFilesDrop,
}) {
  const canvasRef = useRef(null),
    [isDragOver, setIsDragOver] = useState(false),
    isDraggingRef = useRef(false),
    dragAnchorRef = useRef(null),
    totalWidth = width * zoom,
    duration = audioBuffer ? audioBuffer.duration : 0,
    channelCount = audioBuffer ? audioBuffer.numberOfChannels : 1,
    isStereo = channelCount >= 2,
    // Canvas x (px) -> time (s), unclamped.
    pxToTime = useCallback(
      (x) => {
        if (!audioBuffer || width <= 0) return 0;
        let pxPerSecond = totalWidth / duration;
        return (scrollX / totalWidth) * duration + x / pxPerSecond;
      },
      [audioBuffer, width, totalWidth, duration, scrollX],
    ),
    channelPeaks = useMemo(() => {
      if (!audioBuffer || width <= 0) return null;
      let peaksPerChannel = [];
      for (let channel = 0; channel < channelCount; channel++)
        peaksPerChannel.push(
          computePeaks(
            audioBuffer.getChannelData(channel),
            audioBuffer.length,
            zoom,
            scrollX,
            width,
          ),
        );
      return peaksPerChannel;
    }, [audioBuffer, channelCount, zoom, scrollX, width]);

  useEffect(() => {
    let canvas = canvasRef.current;
    if (!canvas) return;
    let pixelRatio = window.devicePixelRatio || 1;
    canvas.width = width * pixelRatio;
    canvas.height = height * pixelRatio;
    let ctx = canvas.getContext('2d');
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
    let laneCount = isStereo ? 2 : 1,
      laneHeight = height / laneCount;
    for (let lane = 0; lane < laneCount; lane++) {
      let peaks = channelPeaks[lane],
        laneTop = lane * laneHeight,
        centerY = laneTop + laneHeight / 2;
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
      let headroom = 1.2,
        guideLevel = 0.9,
        guideScale = laneHeight / 2 / headroom,
        upperGuideY = centerY - guideLevel * guideScale,
        lowerGuideY = centerY + guideLevel * guideScale;
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
        let channelLabel = lane === 0 ? 'L' : 'R';
        ctx.fillStyle = '#3a3a5a';
        ctx.font = 'bold 12px monospace';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText(channelLabel, 6, laneTop + 4);
      }
      // Pixel column range [selectionFirstPx, selectionEndPx) drawn in the selection color.
      let selectionFirstPx = -1,
        selectionEndPx = -1;
      if (selectionStart != null && selectionEnd != null && duration > 0) {
        let pxPerSecond = totalWidth / duration,
          viewStart = (scrollX / totalWidth) * duration;
        selectionFirstPx = Math.floor(
          (Math.min(selectionStart, selectionEnd) - viewStart) * pxPerSecond,
        );
        selectionEndPx = Math.ceil(
          (Math.max(selectionStart, selectionEnd) - viewStart) * pxPerSecond,
        );
      }
      let amplitudeScale = laneHeight / 2 / headroom,
        gain = previewGain ?? 1;
      ctx.fillStyle = '#4fc3f7';
      let currentlySelected = false;
      for (let column = 0; column < peaks.length; column++) {
        let inSelection = column >= selectionFirstPx && column < selectionEndPx;
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
        let barTop = centerY - max * amplitudeScale,
          barHeight = centerY - min * amplitudeScale - barTop;
        if (barHeight < 0.5) ctx.fillRect(column, centerY, 1, 1);
        else ctx.fillRect(column, barTop, 1, barHeight);
      }
    }
    if (selectionStart != null && selectionEnd != null && duration > 0) {
      let pxPerSecond = totalWidth / duration,
        viewStart = (scrollX / totalWidth) * duration,
        selectionLeftX = (Math.min(selectionStart, selectionEnd) - viewStart) * pxPerSecond,
        selectionRightX = (Math.max(selectionStart, selectionEnd) - viewStart) * pxPerSecond;
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
      let pxPerSecond = totalWidth / duration,
        playheadX = (currentTime - (scrollX / totalWidth) * duration) * pxPerSecond;
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
    ),
    // Shows a resize cursor while hovering (no button pressed) near a selection edge.
    handleMouseMove = useCallback(
      (event) => {
        if (!audioBuffer || !(duration > 0) || event.buttons) return;
        let rect = event.currentTarget.getBoundingClientRect();
        event.currentTarget.style.cursor =
          nearSelectionEdge(event.clientX - rect.left, timeToPx, selectionStart, selectionEnd) !==
          null
            ? 'ew-resize'
            : 'crosshair';
      },
      [audioBuffer, duration, timeToPx, selectionStart, selectionEnd],
    ),
    // Mouse-down near a selection edge grabs that edge (the opposite edge becomes the anchor);
    // elsewhere it clears the selection and seeks, and a drag beyond DRAG_PX then selects from
    // the seek position.
    handleMouseDown = useCallback(
      (event) => {
        if (!audioBuffer || event.button !== 0 || !(duration > 0)) return;
        let rect = event.currentTarget.getBoundingClientRect(),
          downX = event.clientX - rect.left,
          // Canvas x -> time clamped to the clip, snapping to 0 / duration within SNAP_PX.
          xToSnappedTime = (x) =>
            Math.abs(x - timeToPx(0)) <= SNAP_PX
              ? 0
              : Math.abs(x - timeToPx(duration)) <= SNAP_PX
                ? duration
                : Math.max(0, Math.min(duration, pxToTime(x))),
          anchorTime = nearSelectionEdge(downX, timeToPx, selectionStart, selectionEnd),
          isDragging = anchorTime !== null;
        if (anchorTime === null) {
          anchorTime = xToSnappedTime(downX);
          onSelectionChange(null, null);
          onSeek(anchorTime);
        }
        isDraggingRef.current = true;
        dragAnchorRef.current = anchorTime;
        let handleWindowMouseMove = (moveEvent) => {
            if (!isDraggingRef.current || dragAnchorRef.current == null) return;
            let x = moveEvent.clientX - rect.left;
            if (!isDragging) {
              if (Math.abs(x - downX) < DRAG_PX) return;
              isDragging = true;
            }
            onSelectionChange(dragAnchorRef.current, xToSnappedTime(x));
          },
          handleWindowMouseUp = () => {
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
    ),
    handleDragOver = useCallback((event) => {
      event.preventDefault();
      event.stopPropagation();
      setIsDragOver(true);
    }, []),
    handleDragLeave = useCallback((event) => {
      event.preventDefault();
      event.stopPropagation();
      setIsDragOver(false);
    }, []),
    handleDrop = useCallback(
      (event) => {
        event.preventDefault();
        event.stopPropagation();
        setIsDragOver(false);
        let files = event.dataTransfer.files;
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
