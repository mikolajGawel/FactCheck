import { DEFAULT_NOISE_SELECTORS } from "./textProcessing";

/**
 * Elements to ignore during text extraction and highlighting.
 *
 * MUST match backend's IGNORED_TAGS in server/src/utils/textUtils.ts
 * to ensure offset alignment between frontend and backend.
 *
 * DEFAULT_NOISE_SELECTORS: script, style, nav, aside, footer, header,
 * figure, iframe, noscript, template, button, time, form
 *
 * Additional frontend-specific: [data-factcheck-ignore], [hidden], [aria-hidden='true']
 */
const EXTRA_IGNORED_SELECTORS = ["[data-factcheck-ignore]", "[hidden]", "[aria-hidden='true']"];
export const HIGHLIGHT_IGNORE_SELECTOR = Array.from(new Set([...DEFAULT_NOISE_SELECTORS, ...EXTRA_IGNORED_SELECTORS])).join(
	", "
);
