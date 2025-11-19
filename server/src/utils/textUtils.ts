import * as cheerio from 'cheerio';
import { normalizeText } from "../../../shared/dist/textProcessing.js";

// --- Konfiguracja ---

// Tagi, które ZAWSZE wymuszają podział, jeśli następuje zmiana struktury
const BLOCK_TAGS = new Set([
    'address', 'article', 'aside', 'blockquote', 
    'dd', 'div', 'dl', 'dt', 'fieldset', 'figcaption', 'figure', 
    'footer', 'form', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 
    'header', 'hr', 'li', 'main', 'nav', 'noscript', 
    'ol', 'p', 'pre', 'section', 'table', 'tfoot', 'ul', 'video',
    'br'
]);

// --- Typy ---

export interface TextBlock {
    text: string;
    path: string[];
    // Nowa flaga: czy ten blok jest częścią nagłówka?
    isHeader: boolean; 
}

export interface Sentence {
    id: number;
    text: string;
    start: number;
    end: number;
}

// --- Funkcje Eksportowane ---

export function normalizeArticleText(raw: string) {
    return normalizeText(raw);
}

export function limitSentences<T>(sentences: T[], maxCount?: number) {
    if (!maxCount || sentences.length <= maxCount) {
        return sentences;
    }
    return sentences.slice(0, maxCount);
}

/**
 * Parsuje HTML do listy bloków.
 * Wykrywa nagłówki JUŻ NA ETAPIE PARSOWANIA.
 */
export function parseHtmlToBlocks(html: string): TextBlock[] {
    const $ = cheerio.load(html);
    const blocks: TextBlock[] = [];

    // Rekurencyjna funkcja z kontekstem (czy jesteśmy w nagłówku?)
    function traverse(node: any, path: string[], insideHeader: boolean) {
        // 1. Obsługa tekstu
        if (node.type === 'text') {
            const text = $(node).text();
            const normalized = normalizeText(text);
            
            if (normalized.trim().length > 0) {
                blocks.push({
                    text: normalized,
                    path: [...path],
                    isHeader: insideHeader // Zapisujemy flagę bezpośrednio w bloku
                });
            }
            return;
        }

        // 2. Obsługa tagów
        if (node.type === 'tag') {
            const rawTagName = node.name || "";
            const tagName = rawTagName.toLowerCase();

            if (['script', 'style', 'meta', 'head', 'link', 'noscript'].includes(tagName)) return;
            if (tagName === 'br') return;

            // Sprawdzamy, czy wchodzimy w nagłówek (lub już w nim jesteśmy)
            const isCurrentTagHeader = /^h[1-6]$/.test(tagName);
            const nextInsideHeader = insideHeader || isCurrentTagHeader;

            $(node).contents().each((i, child) => {
                const uniqueTag = `${tagName}[${i}]`;
                traverse(child, [...path, uniqueTag], nextInsideHeader);
            });
        }
    }

    // Uruchomienie
    const body = $('body');
   const root = body.length > 0 ? body : $.root().children();

    
    root.contents().each((i, node) => traverse(node, [], false));

    return blocks;
}

export function segmentSentencesWithStructure(blocks: TextBlock[], language = "en"): Sentence[] {
    if (!blocks || blocks.length === 0) return [];

    const sentences: Sentence[] = [];
    let currentBuffer = "";
    let sentenceStartIndex = 0;

    const commitSentence = (textToCommit: string) => {
        const cleaned = textToCommit.trim();
        if (cleaned) {
            sentences.push({
                id: sentences.length,
                text: cleaned,
                start: sentenceStartIndex,
                end: sentenceStartIndex + cleaned.length,
            });
            sentenceStartIndex += cleaned.length + 1; // +1 na spację
        }
        currentBuffer = "";
    };

    for (let i = 0; i < blocks.length; i++) {
        const currentBlock = blocks[i];
        const nextBlock = blocks[i + 1];

        // Doklejanie tekstu do bufora
        const prefix = (currentBuffer.length > 0 && !/\s$/.test(currentBuffer)) ? " " : "";
        currentBuffer += prefix + currentBlock.text;
        
        // --- LOGIKA DECYZYJNA ---

        // 1. Sprawdzamy interpunkcję wewnątrz (kropka, pytajnik, wykrzyknik)
        let hasSentenceBreakInside = false;
        if (/[.!?]/.test(currentBlock.text)) { 
             hasSentenceBreakInside = true;
        }

        // 2. Sprawdzamy, czy musimy wymusić podział STRUKTURALNY
        let forceStructuralBreak = false;

        if (!hasSentenceBreakInside && nextBlock) {
            // A. Jeśli bieżący blok to NAGŁÓWEK -> ZAWSZE KONIEC ZDANIA.
            if (currentBlock.isHeader) {
                forceStructuralBreak = true;
            }
            // B. Jeśli następny blok to NAGŁÓWEK -> ZAWSZE KONIEC ZDANIA (przed wejściem w tytuł).
            else if (nextBlock.isHeader) {
                forceStructuralBreak = true;
            }
            // C. Analiza ścieżek (dla div vs p itp.)
            else if (isStructuralBreakSignificant(currentBlock.path, nextBlock.path)) {
                forceStructuralBreak = true;
            }
        }

        // --- AKCJE ---

        if (hasSentenceBreakInside) {
            // Jeśli jest kropka, dzielimy standardowo
            const subSentences = standardSegment(currentBuffer, language);
            subSentences.forEach(s => {
                sentences.push({
                    id: sentences.length,
                    text: s.text,
                    start: sentenceStartIndex + s.start,
                    end: sentenceStartIndex + s.end
                });
            });
            sentenceStartIndex += currentBuffer.length;
            currentBuffer = "";
        } else if (forceStructuralBreak) {
            // Nie ma kropki, ale struktura wymusza podział (np. H1 bez kropki)
            commitSentence(currentBuffer);
        }
        // Jeśli nie ma kropki i nie ma zmiany struktury (np. span wewnątrz p), pętla leci dalej.
    }

    // Resztki w buforze
    if (currentBuffer.trim()) {
         const subSentences = standardSegment(currentBuffer, language);
         subSentences.forEach(s => {
             sentences.push({ 
                 id: sentences.length,
                 text: s.text, 
                 start: sentenceStartIndex + s.start, 
                 end: sentenceStartIndex + s.end 
            });
         });
    }

    return sentences;
}

// --- Funkcje Pomocnicze ---

function isStructuralBreakSignificant(pathA: string[], pathB: string[]): boolean {
    const getTagName = (tagStr: string) => {
        const match = tagStr.match(/^([a-zA-Z0-9]+)/);
        return match ? match[1].toLowerCase() : "";
    };

    const minLen = Math.min(pathA.length, pathB.length);
    let divergeIndex = 0;
    
    while (divergeIndex < minLen) {
        if (pathA[divergeIndex] !== pathB[divergeIndex]) break;
        divergeIndex++;
    }

    // Jeśli jedna ścieżka jest rodzicem drugiej (np. p -> b wewnątrz p), nie przerywamy
    if (divergeIndex === pathA.length || divergeIndex === pathB.length) {
        return false;
    }

    const tagA = getTagName(pathA[divergeIndex]);
    const tagB = getTagName(pathB[divergeIndex]);

    // Jeśli rozwidlenie następuje na tagach blokowych -> PRZERWIJ
    if (BLOCK_TAGS.has(tagA) || BLOCK_TAGS.has(tagB)) {
        return true;
    }

    return false;
}

function standardSegment(text: string, language: string) {
    const res: { text: string; start: number; end: number }[] = [];
    
    if (typeof Intl !== "undefined" && typeof (Intl as any).Segmenter === "function") {
        const segmenter = new (Intl as any).Segmenter(language, { granularity: "sentence" });
        for (const s of segmenter.segment(text)) {
             const t = s.segment.trim();
             if(t) res.push({ text: t, start: s.index, end: s.index + s.segment.length });
        }
    } else {
         const re = /[^.!?]+[.!?]+|[^.!?]+$/g;
         let m;
         while ((m = re.exec(text)) !== null) {
             const t = m[0].trim();
             if(t) res.push({ text: t, start: m.index, end: m.index + m[0].length });
         }
    }
    return res;
}