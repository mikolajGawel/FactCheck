const PROTECTED_ABBREVIATIONS = [
    "dr", "inż", "mgr", "prof", "hab", "hab\.", "hab\\", "dot", "s", "ul", "al", "ks", "pl", "ppłk", "płk", "gen", "mjr", "por", "ppor", "kpt", "st", "plk", "św", "r", "tyś", "tys", "mln", "mld", "oprac", "prok"
];

export function protectDots(text) {
    let result = text || "";
    for (const abbr of PROTECTED_ABBREVIATIONS) {
        if (abbr === "r") {
            result = result.replace(/\br\.(?=\s+[A-ZĄĆĘŁŃÓŚŹŻ])/g, "r.");
            result = result.replace(/\br\.(?=\s+[^A-ZĄĆĘŁŃÓŚŹŻ])/g, "r§");
            continue;
        }
        const re = new RegExp(`\\b${abbr}\\.(?=\\s|$)`, "gi");
        result = result.replace(re, m => m.slice(0, -1) + "§");
    }
    result = result.replace(/(\d)\.(\d)/g, "$1§$2");
    return result;
}

export function restoreProtectedDots(text) {
    return (text || "").replace(/§/g, ".");
}

export function countSentences(text) {
    if (!text || !text.trim()) return 0;
    const protectedText = protectDots(text);

    if (typeof Intl !== "undefined" && typeof Intl.Segmenter === "function") {
        try {
            const seg = new Intl.Segmenter(navigator.language || "en", { granularity: "sentence" });
            let count = 0;
            for (const s of seg.segment(protectedText)) {
                const t = restoreProtectedDots(s.segment.trim());
                if (t) count += 1;
            }
            return count;
        } catch (e) {
            // fall through to regex
        }
    }

    const re = /[^.!?]+[.!?]+|[^.!?]+$/g;
    let m;
    let c = 0;
    while ((m = re.exec(protectedText)) !== null) {
        const t = restoreProtectedDots(m[0].trim());
        if (t) c += 1;
    }
    return c;
}
