import { createTextSnapshot } from "./textSnapshot";
import { HIGHLIGHT_IGNORE_SELECTOR } from "./constants";
import { ArticleSummary } from "../types/highlightTypes";

export function getArticleNodes(): HTMLElement[] {
    // 1. Standard <article> elements (most modern sites)
    const articles = document.querySelectorAll<HTMLElement>("article");
    if (articles.length > 0) return Array.from(articles);

    // 2. Common class used by many news sites
    const articleBodies = document.querySelectorAll<HTMLElement>(".articleBody, .article-body, [class*='articleBody']");
    if (articleBodies.length > 0) return Array.from(articleBodies);

    // 3. Gazeta.pl specific (fixed typo and added common variations)
    const gazetaSelectors = [
        ".bottom_section",     // note: double "t" → corrected from "botton_section"
        "._articleContent",    // newer Gazeta.pl articles
        ".article_content",
        "[data-starea-articletype]", // another Gazeta.pl marker
    ];
    for (const selector of gazetaSelectors) {
        const nodes = document.querySelectorAll<HTMLElement>(selector);
        if (nodes.length > 0) return Array.from(nodes);
    }

    // 4. Last resort: look for elements with a lot of <p> tags (heuristic)
    const candidates = document.querySelectorAll<HTMLElement>("div, section");
    const best = Array.from(candidates).find(el => {
        const paragraphs = el.querySelectorAll("p").length;
        const textLength = el.textContent?.length || 0;
        return paragraphs > 5 && textLength > 800; // reasonable article size
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

	const strong = articleNode.querySelector<HTMLElement>("strong, b");
	if (strong) {
		const value = strong.innerText.trim();
		if (value) {
			return value;
		}
	}

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
	
    	if (found) {
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
