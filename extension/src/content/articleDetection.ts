import { createTextSnapshot } from "./textSnapshot";
import { HIGHLIGHT_IGNORE_SELECTOR } from "./constants";
import { ArticleSummary } from "../types/highlightTypes";

export function getArticleNodes(): HTMLElement[] {
    // Pomocnicza funkcja: czy element wygląda na "kafel z linkiem" zamiast prawdziwego artykułu
  	function isLikelyTeaser(el: HTMLElement): boolean {
        // Case 1: The node itself is a link (very common: <article><a href="...">...</a></article>)
        if (el.tagName === 'A' || (el as any).hasAttribute('href')) {
            return true;
        }

        // Case 2: Contains exactly 1 link AND that link's text length is ≥ 90% of the whole element's text
        // → means the whole article "article" is just one big clickable card
        const links = el.querySelectorAll('a');
        if (links.length === 1) {
            const link = links[0] as HTMLAnchorElement;
            const linkTextLen = link.textContent?.length || 0;
            const totalTextLen = el.textContent?.length || 0;
            if (totalTextLen > 0 && linkTextLen / totalTextLen >= 0.9) {
                return true;
            }
        }

        // Case 3: Contains 2–4 links, but they are tiny compared to total text (e.g. "Read more", social buttons)
        // → still probably a teaser if text is short
        if (links.length >= 1 && links.length <= 8) {
            const totalTextLen = el.textContent?.length || 0;
            if (totalTextLen < 600) {  // short teaser
                return true;
            }
        }

        return false;
    };

    // Remove nodes that are contained inside other candidate nodes
    function filterOutNested(nodes: HTMLElement[]): HTMLElement[] {
        return nodes.filter(n => !nodes.some(other => other !== n && other.contains(n)));
    }

    // Site-specific heuristics
    function isTvn24Page(): boolean {
        try {
            return typeof location !== 'undefined' && !!location.hostname && location.hostname.includes('tvn24');
        } catch (e) {
            return false;
        }
    }

    // TVN24: prefer the document <main> as the article root when available
    if (isTvn24Page()) {
        const main = document.querySelector<HTMLElement>('main');
        if (main && !isLikelyTeaser(main)) {
            return [main];
        }
    }

    // 1. Standardowe <article>, ale tylko te, które nie są teaserami
    const articles = Array.from(document.querySelectorAll<HTMLElement>("article"))
        .filter(el => !isLikelyTeaser(el));

    const topArticles = filterOutNested(articles);
    if (topArticles.length > 0) return topArticles;

    // 2. Popularne klasy artykułów – też filtrujemy teasery
    const articleBodies = Array.from(document.querySelectorAll<HTMLElement>(".articleBody, .article-body, [class*='articleBody']"))
        .filter(el => !isLikelyTeaser(el));

    const topArticleBodies = filterOutNested(articleBodies);
    if (topArticleBodies.length > 0) return topArticleBodies;

    // 3. Gazeta.pl – selektory specyficzne
    const gazetaSelectors = [
        ".bottom_section",
        "._articleContent",
        ".article_content",
        "[data-starea-articletype]",
    ];

    for (const selector of gazetaSelectors) {
        const nodes = Array.from(document.querySelectorAll<HTMLElement>(selector))
            .filter(el => !isLikelyTeaser(el));
        const topNodes = filterOutNested(nodes);
        if (topNodes.length > 0) return topNodes;
    }

    // 4. Heurystyka awaryjna – duże bloki z wieloma <p>
    const candidates = document.querySelectorAll<HTMLElement>("div, section");
    const best = Array.from(candidates)
        .filter(el => !isLikelyTeaser(el)) // nadal odrzucamy oczywiste teasery
        .find(el => {
            const paragraphs = el.querySelectorAll("p").length;
            const textLength = el.textContent?.length || 0;
            return paragraphs > 5 && textLength > 800;
        });

    return best ? [best] : [];
}

export function findArticleTitle(articleNode: HTMLElement): string | null {
	for (let level = 1; level <= 6; level += 1) {
		const el = articleNode.querySelector<HTMLElement>(`h${level}`);
		if (el) {
			const value = el.innerText.trim();
			if (value) {
				return value;
			}
		}
	}

	const aria = articleNode.getAttribute("aria-label");
	if (aria) return aria.trim();

	const dataTitle = articleNode.getAttribute("data-title");
	if (dataTitle) return dataTitle.trim();

	return null;
}
const minimalSentencesCount = 4;
export function collectArticles(): ArticleSummary[] {
	const nodes = getArticleNodes();
	const out: ArticleSummary[] = [];
	// Track last good title so that when nearby article nodes lack
	// an explicit title we can reuse the previous one and append
	// a part suffix (Part II, Part III, ...).
	let lastGoodTitle: string | null = null;
	const titleCounts = new Map<string, number>();

	nodes.forEach((node, idx) => {
    	const found = findArticleTitle(node);
    	let title: string;
    	let isReused = false;

    	const snapshot = createTextSnapshot(node, HIGHLIGHT_IGNORE_SELECTOR);
    	const text = snapshot.text || "";
    	const sentences = countSentences(text);

    	// Early filter – don't even compute titles for tiny fragments
    	if (sentences < minimalSentencesCount) {
    	    return;
    	}
		// poznaj kontekst z ai is a common non-title in onet.pl articles
    	if (found && found.trim().toLocaleLowerCase() != "poznaj kontekst z ai".trim().toLocaleLowerCase()) {
    	    title = found;
    	    lastGoodTitle = found;
    	    const count = (titleCounts.get(found) ?? 0) + 1;
    	    titleCounts.set(found, count);
    	    if (count > 1) {
    	        title = `${found} — cz. ${toRoman(count)}`;
    	    }
    	} else if (lastGoodTitle) {
    	    const nextCount = (titleCounts.get(lastGoodTitle) ?? 0) + 1;
    	    titleCounts.set(lastGoodTitle, nextCount);
    	    title = `${lastGoodTitle} — cz. ${toRoman(nextCount)}`;
    	    isReused = true;
    	} else {
    	    title = `Artykuł ${idx + 1}`;
    	}

    	const snippet = text.slice(0, 200).trim().replace(/\s+/g, " ");
    	out.push({ id: idx, title, snippet });
		});
	return out;
}

// Convert integers to upper-case Roman numerals for nicer "Part II" style
function toRoman(num: number): string {
    if (num <= 0) return String(num);
    const romans: [number, string][] = [
        [1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'],
        [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'],
        [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']
    ];
    let n = num;
    let res = '';
    for (const [val, sym] of romans) {
        while (n >= val) {
            res += sym;
            n -= val;
        }
    }
    return res;
}

function countSentences(text: string): number {
	if (!text || !text.trim()) return 0;
	try {
		const re = /[^.!?]+[.!?]+|[^.!?]+$/g;
		let m: RegExpExecArray | null;
		let c = 0;
		while ((m = re.exec(text)) !== null) {
			if (m[0].trim()) c += 1;
		}
		return c;
	} catch (e) {
		return 0;
	}
}
