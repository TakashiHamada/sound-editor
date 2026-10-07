// Lazily-created, app-wide AudioContext shared by decoding, playback and buffer operations.

let sharedContext = null;

export function getAudioContext() {
  sharedContext ||= new AudioContext();
  return sharedContext;
}
