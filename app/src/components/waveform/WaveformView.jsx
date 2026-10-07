// Waveform area: measures its container, stacks the time ruler, waveform canvas, horizontal
// scrollbar and (when a file is loaded) the selection bar, and handles wheel zoom anchored at the
// mouse position plus the "reveal time" auto-scroll used by seeking / edge setting.

import { useCallback, useEffect, useRef, useState } from 'react';
import { setRevealHandler } from '../../selection/selectionActions.js';
import { SELECTION_BAR_HEIGHT, SelectionBar } from './SelectionBar.jsx';
import { TimeRuler } from './TimeRuler.jsx';
import { WaveformCanvas } from './WaveformCanvas.jsx';

export const SCROLLBAR_HEIGHT = 14;
export const RULER_HEIGHT = 24;

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
  const containerRef = useRef(null),
    [width, setWidth] = useState(800),
    [height, setHeight] = useState(300);
  useEffect(() => {
    let container = containerRef.current;
    if (!container) return;
    let observer = new ResizeObserver((entries) => {
      for (let entry of entries) {
        let { width: newWidth, height: newHeight } = entry.contentRect;
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
    ),
    totalWidth = width * zoom,
    duration = audioBuffer ? audioBuffer.duration : 0,
    // Horizontal scrollbar geometry: the thumb covers the visible fraction of the timeline.
    visibleFraction = zoom > 0 ? 1 / zoom : 1,
    trackWidth = width,
    thumbWidth = Math.max(20, Math.floor(trackWidth * visibleFraction)),
    maxScrollX = totalWidth - width,
    scrollFraction = maxScrollX > 0 ? scrollX / maxScrollX : 0,
    thumbLeft = Math.round(scrollFraction * (trackWidth - thumbWidth)),
    scrollbarDragRef = useRef(null),
    // Mouse-down on the thumb starts dragging it; on the track it centers the thumb on the click
    // and then drags from there.
    handleScrollbarMouseDown = useCallback(
      (event) => {
        event.preventDefault();
        let rect = event.currentTarget.getBoundingClientRect(),
          clickX = event.clientX - rect.left;
        if (clickX >= thumbLeft && clickX <= thumbLeft + thumbWidth)
          scrollbarDragRef.current = { startX: event.clientX, startThumbLeft: thumbLeft };
        else {
          let newThumbLeft = clickX - thumbWidth / 2,
            fraction = Math.max(0, Math.min(1, newThumbLeft / (trackWidth - thumbWidth)));
          onScrollXChange(Math.round(fraction * maxScrollX));
          scrollbarDragRef.current = { startX: event.clientX, startThumbLeft: newThumbLeft };
        }
        // NOTE: when the thumb fills the whole track (zoom 1), `trackWidth - thumbWidth` is 0, so a
        // mouse move with no horizontal delta computes 0 / 0 = NaN and calls onScrollXChange(NaN)
        // (the store keeps NaN, blanking the waveform/ruler until scrollX is reset). Kept as-is.
        let handleWindowMouseMove = (moveEvent) => {
            if (!scrollbarDragRef.current) return;
            let deltaX = moveEvent.clientX - scrollbarDragRef.current.startX,
              draggedThumbLeft = scrollbarDragRef.current.startThumbLeft + deltaX,
              fraction = Math.max(0, Math.min(1, draggedThumbLeft / (trackWidth - thumbWidth)));
            onScrollXChange(Math.round(fraction * maxScrollX));
          },
          handleWindowMouseUp = () => {
            scrollbarDragRef.current = null;
            window.removeEventListener('mousemove', handleWindowMouseMove);
            window.removeEventListener('mouseup', handleWindowMouseUp);
          };
        window.addEventListener('mousemove', handleWindowMouseMove);
        window.addEventListener('mouseup', handleWindowMouseUp);
      },
      [thumbLeft, thumbWidth, trackWidth, maxScrollX, onScrollXChange],
    ),
    // Latest zoom, updated synchronously by the wheel handler so rapid wheel events compound.
    zoomRef = useRef(zoom),
    wheelFrameRef = useRef(null);
  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);
  // Re-registered after every render (no dependency array) so it always sees current values.
  useEffect(() => {
    setRevealHandler((time) => {
      if (!(duration > 0)) return;
      let x = (time / duration) * totalWidth;
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
  // NOTE: `onScrollXChange` is not in the dependency array (kept as in the original).
  useEffect(() => {
    let maxScroll = Math.max(0, totalWidth - width);
    if (scrollX > maxScroll) onScrollXChange(maxScroll);
  }, [scrollX, totalWidth, width]);

  // Wheel zoom keeps the time under the mouse pointer fixed. The handler lives in a ref so the
  // non-passive native listener (needed for preventDefault) is attached only once.
  const wheelHandlerRef = useRef(null);
  wheelHandlerRef.current = useCallback(
    (event) => {
      event.preventDefault();
      if (!audioBuffer) return;
      let wheelDelta = -event.deltaY,
        zoomFactor = Math.exp(wheelDelta * 0.003),
        newZoom = Math.max(1, Math.min(1000, zoomRef.current * zoomFactor));
      zoomRef.current = newZoom;
      let rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      let mouseX = event.clientX - rect.left,
        oldTotalWidth = width * zoom,
        anchorFraction = (scrollX + mouseX) / oldTotalWidth,
        newTotalWidth = width * newZoom,
        newScrollX = Math.max(0, anchorFraction * newTotalWidth - mouseX);
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
    let container = containerRef.current;
    if (!container) return;
    let handleWheel = (event) => wheelHandlerRef.current?.(event);
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
        background: '#0a0a18',
        border: '1px solid #2a2a4a',
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
        onScrollXChange={onScrollXChange}
        onFilesDrop={onFilesDrop}
      />
      <div
        onMouseDown={handleScrollbarMouseDown}
        style={{
          width: width,
          height: SCROLLBAR_HEIGHT,
          background: '#0f0f1a',
          borderTop: '1px solid #2a2a4a',
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
            background: '#2a2a4a',
            borderRadius: 4,
            border: '1px solid #3a3a5a',
            transition: scrollbarDragRef.current ? 'none' : 'left 0.05s ease-out',
          }}
        />
      </div>
      {audioBuffer && (
        <SelectionBar
          audioBuffer={audioBuffer}
          selectionStart={selectionStart}
          selectionEnd={selectionEnd}
          currentTime={currentTime}
        />
      )}
    </div>
  );
}
