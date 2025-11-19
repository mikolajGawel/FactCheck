import { DEFAULT_NOISE_SELECTORS } from "../../../shared/src/textProcessing";

const EXTRA_IGNORED_SELECTORS = ["[data-factcheck-ignore]", "[hidden]", "[aria-hidden='true']"];
export const HIGHLIGHT_IGNORE_SELECTOR = Array.from(new Set([...DEFAULT_NOISE_SELECTORS, ...EXTRA_IGNORED_SELECTORS])).join(
	", "
);
