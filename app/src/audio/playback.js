// Single-voice playback engine. Plays one AudioBuffer at a time through per-channel analysers
// (used by the level meters), reports the playhead position every animation frame and notifies
// when playback ends.

import { getAudioContext } from './audioContext.js';

// Graph: source -> [splitter -> left/right analysers -> merger] (stereo) or analyser (mono)
//        -> output gain -> destination.
let sourceNode = null;
let leftAnalyser = null; // the only analyser for mono buffers
let rightAnalyser = null;
let splitter = null;
let merger = null;
let outputGain = null;
let channelCount = 1;
let startContextTime = 0; // AudioContext.currentTime when playback started
let startOffset = 0; // buffer position (s) playback started from
let onTimeUpdate = null;
let onPlaybackEnded = null;
let animationFrameId = null;

// rAF loop: reports the current buffer position while a source is playing.
function tick() {
  if (sourceNode && onTimeUpdate) {
    const elapsed = getAudioContext().currentTime - startContextTime;
    onTimeUpdate(startOffset + elapsed);
  }
  animationFrameId = requestAnimationFrame(tick);
}

// Starts playing `buffer` from `offset` seconds, optionally for `duration` seconds.
// Any current playback is stopped first.
export function startPlayback(buffer, offset = 0, duration, onTime, onEnded) {
  offset = Math.max(0, Math.min(Number(offset) || 0, buffer.duration));
  if (duration !== undefined) duration = Math.min(duration, buffer.duration - offset);
  stopPlayback();
  const context = getAudioContext();
  if (context.state === 'suspended') context.resume();
  sourceNode = context.createBufferSource();
  sourceNode.buffer = buffer;
  channelCount = buffer.numberOfChannels;
  const isStereo = buffer.numberOfChannels >= 2;
  outputGain = context.createGain();
  outputGain.gain.value = 1;
  outputGain.connect(context.destination);
  leftAnalyser = context.createAnalyser();
  leftAnalyser.fftSize = 2048;
  if (isStereo) {
    rightAnalyser = context.createAnalyser();
    rightAnalyser.fftSize = 2048;
    splitter = context.createChannelSplitter(2);
    merger = context.createChannelMerger(2);
    sourceNode.connect(splitter);
    splitter.connect(leftAnalyser, 0);
    splitter.connect(rightAnalyser, 1);
    leftAnalyser.connect(merger, 0, 0);
    rightAnalyser.connect(merger, 0, 1);
    merger.connect(outputGain);
  } else {
    sourceNode.connect(leftAnalyser);
    leftAnalyser.connect(outputGain);
  }
  startContextTime = context.currentTime;
  startOffset = offset;
  onTimeUpdate = onTime || null;
  onPlaybackEnded = onEnded || null;
  sourceNode.onended = () => {
    if (onPlaybackEnded) onPlaybackEnded();
    cancelTick();
  };
  if (duration !== undefined && duration > 0) sourceNode.start(0, offset, duration);
  else sourceNode.start(0, offset);
  animationFrameId = requestAnimationFrame(tick);
}

function cancelTick() {
  if (animationFrameId !== null) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }
}

// Stops playback (without firing the onEnded callback) and tears down the audio graph.
export function stopPlayback() {
  if (sourceNode) {
    try {
      sourceNode.onended = null;
      sourceNode.stop();
      sourceNode.disconnect();
    } catch {
      // Already stopped / disconnected.
    }
    sourceNode = null;
  }
  if (splitter) {
    splitter.disconnect();
    splitter = null;
  }
  if (merger) {
    merger.disconnect();
    merger = null;
  }
  if (leftAnalyser) {
    leftAnalyser.disconnect();
    leftAnalyser = null;
  }
  if (rightAnalyser) {
    rightAnalyser.disconnect();
    rightAnalyser = null;
  }
  if (outputGain) {
    outputGain.disconnect();
    outputGain = null;
  }
  channelCount = 1;
  cancelTick();
  onTimeUpdate = null;
  onPlaybackEnded = null;
}

// Peak absolute sample value in the analyser's current time-domain window.
function peakOf(analyser) {
  const samples = new Float32Array(analyser.fftSize);
  analyser.getFloatTimeDomainData(samples);
  let peak = 0;
  for (let i = 0; i < samples.length; i++) {
    const magnitude = Math.abs(samples[i]);
    if (magnitude > peak) peak = magnitude;
  }
  return peak;
}

// Current peak levels for the meters. Mono playback reports the same level for both sides.
export function getLevels() {
  if (!leftAnalyser) return { left: 0, right: 0, channels: channelCount };
  const left = peakOf(leftAnalyser);
  return { left, right: rightAnalyser ? peakOf(rightAnalyser) : left, channels: channelCount };
}
