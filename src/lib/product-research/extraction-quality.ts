/**
 * Product URL extraction quality — empty, blocked, and JS/chrome shells
 * must not count as successful first-party evidence.
 */

/** Aligns with company stub homepage discipline: below this is not usable. */
export const PRODUCT_URL_MIN_USABLE_CHARS = 200;

export const PRODUCT_URL_UNREADABLE_MESSAGE =
  "We could not read usable product content from this page. The site likely renders its content with JavaScript, or blocked automated access. Paste the product description, or upload materials such as a whitepaper, use cases, datasheet, or product overview.";

export const PRODUCT_URL_UNREADABLE_SEARCH_FOCUS =
  "Official product page could not be retrieved (blocked, empty, JavaScript-rendered shell, or unavailable). Use web search to find official product documentation, datasheets, overview pages, and reputable third-party product sources.";

/**
 * True when extracted text is empty/near-empty or dominated by site navigation
 * chrome rather than product prose. Uses structural nav scaffolding signals
 * (back-to, menus, home page) — not generic marketing nouns like "solution".
 */
export function isLikelySiteChromeExtraction(text: string): boolean {
  const trimmed = text.replace(/\s+/g, " ").trim();
  if (trimmed.length < PRODUCT_URL_MIN_USABLE_CHARS) return true;

  const lower = trimmed.toLowerCase();
  const backTo = (lower.match(/\bback to\b/g) || []).length;
  const primaryNav = (lower.match(/\bprimary navigation\b/g) || []).length;
  const menuCue = (
    lower.match(/\b(?:products? menu|why .+? menu|back to .+? menu)\b/g) || []
  ).length;
  const homePage = (lower.match(/\bhome page\b/g) || []).length;
  const whyBrand = (lower.match(/\bwhy [a-z0-9][a-z0-9-]{1,40}\b/g) || [])
    .length;
  const structuralNav = backTo + primaryNav + menuCue + homePage + whyBrand;

  const sentenceEnds = (trimmed.match(/[.!?]/g) || []).length;
  const words = trimmed.split(/\s+/).filter(Boolean).length;
  const wordsPerSentence = words / Math.max(sentenceEnds, 1);

  // Menu-heavy shells: navigation scaffolding with little continuous prose
  // (few sentence endings relative to length / back-to cues).
  if (backTo >= 3 && wordsPerSentence >= 25) return true;
  if (structuralNav >= 8 && wordsPerSentence >= 20) return true;
  if (
    words >= 80 &&
    structuralNav >= 6 &&
    structuralNav / words >= 0.03 &&
    wordsPerSentence >= 18
  ) {
    return true;
  }

  return false;
}

/** True when a fetch returned usable product-page body text. */
export function isUsableProductUrlExtraction(text: string): boolean {
  return Boolean(text.trim()) && !isLikelySiteChromeExtraction(text);
}

export function formatProductUrlUnreadableError(input: {
  extractedCharCount: number;
  blockedOrEmpty: boolean;
}): string {
  if (input.blockedOrEmpty && input.extractedCharCount === 0) {
    return `${PRODUCT_URL_UNREADABLE_MESSAGE} (No extractable text was returned.)`;
  }
  return `${PRODUCT_URL_UNREADABLE_MESSAGE} (Extracted ${input.extractedCharCount} characters — mostly site navigation or an empty shell, not product detail.)`;
}
