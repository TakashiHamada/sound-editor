// Waveform area: measures its container, stacks the time ruler, waveform canvas, horizontal
// scrollbar and (when a file is loaded) the selection bar, and handles wheel zoom anchored at the
// mouse position plus the "reveal time" auto-scroll used by seeking / edge setting.

import { useCallback, useEffect, useRef, useState } from 'react';
import { setRevealHandler } from '../../actions/selectionActions.js';
import { MAX_ZOOM, MIN_ZOOM } from '../../store/editorStore.js';
import { colors } from '../../theme.js';
import { RULER_HEIGHT, SCROLLBAR_HEIGHT, SELECTION_BAR_HEIGHT } from './layout.js';
import { SelectionBar } from './SelectionBar.jsx';
import { TimeRuler } from './TimeRuler.jsx';
import { WaveformCanvas } from './WaveformCanvas.jsx';

export function WaveformView({
  audioBuffer,
  zoom,
  scrollX,
  selectionStart,
  selectionEnd,
  currentTime,
  previewGain,
  onSelectionChange,
  onSeek,
  onZoomChange,
  onScrollXChange,
  onFilesDrop,
}) {
  const containerRef = useRef(null);
  const [width, setWidth] = useState(800);
  const [height, setHeight] = useState(300);
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width: newWidth, height: newHeight } = entry.contentRect;
        setWidth(Math.floor(newWidth));
        setHeight(Math.floor(newHeight));
      }
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  const canvasHeight = Math.max(
    0,
    height - RULER_HEIGHT - SCROLLBAR_HEIGHT - (audioBuffer ? SELECTION_BAR_HEIGHT : 0),
  );
  const totalWidth = width * zoom;
  const duration = audioBuffer ? audioBuffer.duration : 0;
  // Horizontal scrollbar geometry: the thumb covers the visible fraction of the timeline.
  const visibleFraction = zoom > 0 ? 1 / zoom : 1;
  const trackWidth = width;
  const thumbWidth = Math.max(20, Math.floor(trackWidth * visibleFraction));
  const maxScrollX = totalWidth - width;
  const scrollFraction = maxScrollX > 0 ? scrollX / maxScrollX : 0;
  const thumbLeft = Math.round(scrollFraction * (trackWidth - thumbWidth));
  // Distance the thumb can move. At zoom 1 the thumb fills the track (travel 0); use 1 so a drag
  // computes 0 instead of 0 / 0 = NaN (maxScrollX is 0 there, so the result is still 0).
  const thumbTravel = Math.max(1, trackWidth - thumbWidth);
  const scrollbarDragRef = useRef(null);
  // Mouse-down on the thumb starts dragging it; on the track it centers the thumb on the click
  // and then drags from there.
  const handleScrollbarMouseDown = useCallback(
    (event) => {
      event.preventDefault();
      const rect = event.currentTarget.getBoundingClientRect();
      const clickX = event.clientX - rect.left;
      if (clickX >= thumbLeft && clickX <= thumbLeft + thumbWidth)
        scrollbarDragRef.current = { startX: event.clientX, startThumbLeft: thumbLeft };
      else {
        const newThumbLeft = clickX - thumbWidth / 2;
        const fraction = Math.max(0, Math.min(1, newThumbLeft / thumbTravel));
        onScrollXChange(Math.round(fraction * maxScrollX));
        scrollbarDragRef.current = { startX: event.clientX, startThumbLeft: newThumbLeft };
      }
      const handleWindowMouseMove = (moveEvent) => {
        if (!scrollbarDragRef.current) return;
        const deltaX = moveEvent.clientX - scrollbarDragRef.current.startX;
        const draggedThumbLeft = scrollbarDragRef.current.startThumbLeft + deltaX;
        const fraction = Math.max(0, Math.min(1, draggedThumbLeft / thumbTravel));
        onScrollXChange(Math.round(fraction * maxScrollX));
      };
      const handleWindowMouseUp = () => {
        scrollbarDragRef.current = null;
        window.removeEventListener('mousemove', handleWindowMouseMove);
        window.removeEventListener('mouseup', handleWindowMouseUp);
      };
      window.addEventListener('mousemove', handleWindowMouseMove);
      window.addEventListener('mouseup', handleWindowMouseUp);
    },
    [thumbLeft, thumbWidth, thumbTravel, maxScrollX, onScrollXChange],
  );
  // Latest zoom, updated synchronously by the wheel handler so rapid wheel events compound.
  const zoomRef = useRef(zoom);
  const wheelFrameRef = useRef(null);
  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);
  // Re-registered after every render (no dependency array) so it always sees current values.
  useEffect(() => {
    setRevealHandler((time) => {
      if (!(duration > 0)) return;
      const x = (time / duration) * totalWidth;
      if (x < scrollX || x > scrollX + width - 2)
        onScrollXChange(
          Math.round(Math.max(0, Math.min(Math.max(0, totalWidth - width), x - width / 2))),
        );
    });
    return () => {
      setRevealHandler(null);
    };
  });
  // Clamp the scroll position when zooming out / resizing shrinks the scrollable range.
  useEffect(() => {
    const maxScroll = Math.max(0, totalWidth - width);
    if (scrollX > maxScroll) onScrollXChange(maxScroll);
  }, [scrollX, totalWidth, width, onScrollXChange]);

  // Wheel zoom keeps the time under the mouse pointer fixed. The handler lives in a ref so the
  // non-passive native listener (needed for preventDefault) is attached only once.
  const wheelHandlerRef = useRef(null);
  wheelHandlerRef.current = useCallback(
    (event) => {
      event.preventDefault();
      if (!audioBuffer) return;
      const wheelDelta = -event.deltaY;
      const zoomFactor = Math.exp(wheelDelta * 0.003);
      const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoomRef.current * zoomFactor));
      zoomRef.current = newZoom;
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const mouseX = event.clientX - rect.left;
      const oldTotalWidth = width * zoom;
      const anchorFraction = (scrollX + mouseX) / oldTotalWidth;
      const newTotalWidth = width * newZoom;
      const newScrollX = Math.max(0, anchorFraction * newTotalWidth - mouseX);
      if (wheelFrameRef.current !== null) cancelAnimationFrame(wheelFrameRef.current);
      wheelFrameRef.current = requestAnimationFrame(() => {
        onZoomChange(newZoom);
        onScrollXChange(Math.round(newScrollX));
        wheelFrameRef.current = null;
      });
    },
    [zoom, scrollX, width, audioBuffer, onZoomChange, onScrollXChange],
  );
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const handleWheel = (event) => wheelHandlerRef.current?.(event);
    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleWheel);
  }, []);

  return (
    <div
      ref={containerRef}
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        background: colors.waveformBg,
        border: `1px solid ${colors.border}`,
        borderRadius: 4,
        minHeight: 0,
      }}
    >
      <TimeRuler duration={duration} zoom={zoom} scrollX={scrollX} width={width} />
      <WaveformCanvas
        audioBuffer={audioBuffer}
        zoom={zoom}
        scrollX={scrollX}
        selectionStart={selectionStart}
        selectionEnd={selectionEnd}
        currentTime={currentTime}
        previewGain={previewGain}
        width={width}
        height={canvasHeight}
        onSelectionChange={onSelectionChange}
        onSeek={onSeek}
        onFilesDrop={onFilesDrop}
      />
      <div
        onMouseDown={handleScrollbarMouseDown}
        style={{
          width,
          height: SCROLLBAR_HEIGHT,
          background: colors.bgDark,
          borderTop: `1px solid ${colors.border}`,
          position: 'relative',
          cursor: 'pointer',
          flexShrink: 0,
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: 2,
            left: thumbLeft,
            width: thumbWidth,
            height: SCROLLBAR_HEIGHT - 4,
            background: colors.border,
            borderRadius: 4,
            border: `1px solid ${colors.borderLight}`,
            transition: scrollbarDragRef.current ? 'none' : 'left 0.05s ease-out',
          }}
        />
      </div>
      {audioBuffer && (
        <SelectionBar
          selectionStart={selectionStart}
          selectionEnd={selectionEnd}
          currentTime={currentTime}
        />
      )}
    </div>
  );
}
