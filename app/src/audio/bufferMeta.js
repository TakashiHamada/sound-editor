// Carries the "original file" metadata (expando properties set on an AudioBuffer at load time)
// over to derived buffers, so export defaults keep describing the source file after edits.

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
