/**
 * Check if a character is CJK (Chinese, Japanese, Korean)
 */
const isCJKChar = (char: string): boolean => {
  const code = char.codePointAt(0);
  if (!code) return false;

  return (
    // CJK Unified Ideographs
    (code >= 0x4e00 && code <= 0x9fff) ||
    // CJK Unified Ideographs Extension A
    (code >= 0x3400 && code <= 0x4dbf) ||
    // CJK Compatibility Ideographs
    (code >= 0xf900 && code <= 0xfaff) ||
    // Hiragana
    (code >= 0x3040 && code <= 0x309f) ||
    // Katakana
    (code >= 0x30a0 && code <= 0x30ff) ||
    // Hangul Syllables
    (code >= 0xac00 && code <= 0xd7af) ||
    // Hangul Jamo
    (code >= 0x1100 && code <= 0x11ff) ||
    // CJK Unified Ideographs Extension B-F
    (code >= 0x20000 && code <= 0x2ebef)
  );
};

/**
 * Calculate weighted length of text where CJK characters count more
 * @param text - The text to measure
 * @param cjkWeight - Weight for CJK characters (default: 2)
 * @returns Weighted length
 */
export const calculateWeightedLength = (text: string, cjkWeight = 2): number => {
  let length = 0;
  for (const char of text) {
    length += isCJKChar(char) ? cjkWeight : 1;
  }
  return length;
};

/**
 * Truncate text to a maximum weighted length, handling CJK characters
 * @param text - The text to truncate
 * @param maxWeightedLength - Maximum weighted length allowed
 * @param cjkWeight - Weight for CJK characters (default: 2)
 * @returns Truncated text
 */
export const truncateByWeightedLength = (
  text: string,
  maxWeightedLength: number,
  cjkWeight = 2,
): string => {
  let currentWeight = 0;
  let result = '';

  for (const char of text) {
    const charWeight = isCJKChar(char) ? cjkWeight : 1;
    if (currentWeight + charWeight > maxWeightedLength) {
      break;
    }
    currentWeight += charWeight;
    result += char;
  }

  return result;
};
