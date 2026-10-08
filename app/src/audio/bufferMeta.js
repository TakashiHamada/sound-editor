// "Original file" metadata: expando properties set on an AudioBuffer at load time, carried over to
// derived buffers so export defaults keep describing the source file after edits.

export const ORIGINAL_META_KEYS = [
  '_originalBitDepth',
  '_originalSampleRate',
  '_originalChannels',
  '_originalFileSize',
];

// Copies each metadata key that `source` has and `target` lacks. Returns `target`.
export function copyOriginalMeta(source, target) {
  if (source && target && source !== target)
    for (const key of ORIGINAL_META_KEYS)
      if (source[key] !== undefined && target[key] === undefined) target[key] = source[key];
  return target;
}

// Format of the file `buffer` was loaded from: the WAV header values recorded at load time, or
// the decoded buffer's own rate / channel count. `bitDepth` is null when unknown (decoded audio).
export function originalFormat(buffer) {
  return {
    sampleRate: buffer._originalSampleRate ?? buffer.sampleRate,
    channels: buffer._originalChannels ?? buffer.numberOfChannels,
    bitDepth: buffer._originalBitDepth ?? null,
  };
}
