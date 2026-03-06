// Detect text direction based on first strong directional character
const RTL_REGEX =
  /[\u0590-\u05FF\u0600-\u06FF\u0700-\u074F\u0780-\u07BF\uFB50-\uFDFF\uFE70-\uFEFF]/;

export function detectDirection(text: string): 'rtl' | 'ltr' {
  // Find first strong directional character
  for (const char of text) {
    if (RTL_REGEX.test(char)) return 'rtl';
    if (/[a-zA-Z]/.test(char)) return 'ltr';
  }
  return 'ltr'; // default
}
