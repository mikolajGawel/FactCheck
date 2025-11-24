# Sentence Segmentation, Highlighting and Offset Alignment

This document is the single source of truth for how **server-side sentence segmentation**, **frontend highlighting**, and their **shared offset model** work together in FactCheck.

It supersedes and consolidates:

- `server/docs/SENTENCE_SEGMENTATION.md`
- `docs/TEXT_ALIGNMENT.md`

---

## 1. End‑to‑End Data Flow

1. **Page capture (frontend)**
    - Content script builds a `HighlightContext` for either:
        - a detected article node, or
        - the whole document.
    - `createTextSnapshot(root, HIGHLIGHT_IGNORE_SELECTOR)` walks the DOM under `root` and produces:
        - `text: string` – normalized linear text
        - `pointers: TextPointer[]` – mapping from each character (and collapsed space) back to DOM `Text` nodes and offsets.
    - This `text` is conceptually the **canonical article text** on the frontend.

2. **Job submission (frontend → server)**
    - The extension sends the **HTML** (`context.html`) to the server, not the text.
    - The server re‑extracts text from that HTML and segments it into sentences.

3. **Sentence segmentation + classification (server)**
    - `parseHtmlToBlocks(html)` builds a list of `TextBlock`s from the HTML using Cheerio.
    - `segmentSentencesWithStructure(blocks, language)` turns those blocks into `Sentence[]` with `(start, end)` offsets in a concatenated text.
    - Sentences (except those marked `skipAI`) are sent to the LLM.
    - `buildSpansFromClassification(...)` converts classified sentences into highlight spans with:
        - `start`, `end` – character offsets in the same concatenated text used above.

4. **Response (server → frontend)**
    - The server returns an analyzer result with `spans: { start, end, type, confidence, rationale, ... }[]`.
    - In development, `metadata.extractedText` contains the reconstructed concatenated text used for offsets.

5. **Highlight rendering (frontend)**
    - The content script receives the result and calls `highlightText(result, context)`.
    - For each span, `createRangeFromPointers(context.pointers, start, end)` maps numeric offsets to a DOM `Range`.
    - `wrapRange(...)` wraps the range in one or more `<span data-factcheck-highlight>` elements and attaches tooltip behavior.

**Key invariant:**

> The linear text used by the server for offsets must be **identical** (character‑by‑character) to the text produced by `createTextSnapshot` on the same DOM/HTML, after both sides apply their own whitespace normalization.

---

## 2. Text Extraction and Normalization

### 2.1 Backend: `parseHtmlToBlocks` and `normalizeBlocks`

Location: `server/src/utils/textUtils.ts`

1. **HTML parsing**

    - `cheerio.load(html)` is used to create a server‑side DOM representation.

2. **Traversal** (`traverse` inner function)

    - Visits all nodes under `body` (or root children if `body` is missing).
    - For **text nodes**:

        - Gets raw text via `$(node).text()`.
        - Normalizes using `normalizeText(text, { trim: false })`:
            - Replaces CRLF with `\n`.
            - Converts NBSP (`\u00a0`) to regular space.
            - Collapses runs of newlines+surrounding whitespace to a single space.
            - Collapses runs of spaces/tabs to a single space.
            - Does _not_ trim at ends (because block‑level trimming happens later).
        - If the normalized text is non‑empty, a `TextBlock` is pushed:
            - `text: string` – normalized text for this node.
            - `path: string[]` – DOM path segments like `div[0] > p[1] > span[0]`.
            - `isHeader: boolean` – `true` if inside any `<h1>`–`<h6>`.
            - `skipAI?: boolean` – see skip rules below.
            - `paragraphContext?: { id, depth }` – tracks membership and depth inside a paragraph.

    - For **element nodes**:

        - **Hard‑skipped tags (no text extracted):**

            - `IGNORED_TAGS` = `DEFAULT_NOISE_SELECTORS` ∪ `{ "script", "style", "meta", "head", "link", "noscript" }`
            - `DEFAULT_NOISE_SELECTORS` = `script, style, nav, aside, footer, header, figure, iframe, noscript, template, button, time, form`.
            - Additionally, `<br>` is explicitly skipped.

            - If tag is in this set, `traverse` returns immediately without visiting children.

        - **Attribute‑based skipping (no text extracted):**

            - If element has:
                - `hidden` attribute, or
                - `aria-hidden="true"`, or
                - `data-factcheck-ignore`
            - then it is **completely skipped** (no text from this subtree).

        - **Anchors outside paragraphs (`skipAI` handling):**

            - When encountering `<a>`:
                - It checks the last entries in the `path` to infer parent/grandparent tags.
                - If neither parent nor grandparent is a `<p>`, then:
                    - `nextSkipAI = true` for this subtree.
                    - The text is **still extracted** into blocks, but blocks are marked `skipAI: true`.
                    - This keeps offsets consistent with the frontend, but allows the classifier to ignore such sentences.

        - **Header detection:**

            - `isCurrentTagHeader = /^h[1-6]$/` on tag name.
            - `insideHeader` is propagated as `nextInsideHeader = insideHeader || isCurrentTagHeader`.

        - **Paragraph context:**
            - When encountering `<p>`:
                - New `paragraphContext = { id: "p-N", depth: 0 }` is created, where `N` is an incrementing counter.
            - For descendants of a `<p>`:
                - `paragraphContext.depth` is incremented by one per nesting level.
            - This is used to decide whether structural block boundaries should force sentence breaks.

3. **Block normalization** (`normalizeBlocks`)

    - Input: `rawBlocks: TextBlock[]` from traversal.
    - For each block:
        - Iterates over characters and collapses whitespace similar to frontend behavior:
            - Any run of whitespace/NBSP is turned into at most a single space.
            - Leading whitespace before any non‑whitespace in the _entire output_ is dropped.
    - Returns a new `TextBlock[]` with the same metadata but normalized `text`.

4. **Debug helper**: `reconstructTextFromBlocks(blocks)`
    - Repeats the character‑wise whitespace merge logic used later during sentence segmentation.
    - Returns a single concatenated string that matches the conceptual space where offsets live.

### 2.2 Frontend: `createTextSnapshot`

Location: `extension/src/content/textSnapshot.ts`

1. **Tree walker setup**

    - Creates a `TreeWalker` over `root` with `NodeFilter.SHOW_TEXT`:
        - Only visits `Text` nodes.
    - `acceptNode` logic:

        - If node is not a `Text`, skip.
        - If parent element is missing, skip (orphan text nodes are ignored).
        - If `ignoreSelector` is set and `parent.closest(ignoreSelector)` matches, **reject**:

            - `ignoreSelector` is `HIGHLIGHT_IGNORE_SELECTOR`, constructed from `DEFAULT_NOISE_SELECTORS` plus attribute selectors.
            - This matches exactly the backend’s hard‑skipped tags and attributes.

        - Otherwise, **accept** the text node.
        - **Anchors outside `<p>` are _not_ specially skipped**:
            - This mirrors backend behavior where such text is included but later marked `skipAI`.

2. **Whitespace normalization + pointer construction**

    - Internal state:

        - `textParts: string[]` – output characters and spaces.
        - `pointers: TextPointer[]` – mapping for each character/space.
        - `pendingSpace: PendingWhitespace | null` – tracks ranges of whitespace that may become a single space.
        - `hasOutput: boolean` – whether any non‑whitespace has been emitted yet.

    - For each visited `Text` node, and for each `char` at index `idx` in its `textContent`:

        - If `isWhitespace(char)`:

            - If `hasOutput` is `false`, the whitespace is ignored (no leading spaces).
            - Otherwise:
                - `pendingSpace` is either created or extended to represent the run of whitespace.
                - No text or pointer is emitted yet.

        - If `char` is **non‑whitespace**:
            - If `pendingSpace` exists:
                - Emit a single space (`" "`) into `textParts`.
                - Add a `TextPointer` that covers the full whitespace span:
                    - `startNode`, `startOffset` = the beginning of the whitespace run.
                    - `endNode`, `endOffset` = the end of the whitespace run.
                - Reset `pendingSpace = null`.
            - Emit `char` into `textParts`.
            - Emit a `TextPointer` whose start/end cover only this single character.
            - Set `hasOutput = true`.

    - Result:
        - `text = textParts.join("")` is the linear, normalized text.
        - `pointers` has **one entry per output character**, including collapsed spaces.

3. **Alignment guarantee**

The combined effect of `createTextSnapshot` is:

-   NBSP and whitespace runs are normalized into a single space.
-   Whitespace at the very beginning is removed.
-   No text from elements matching `HIGHLIGHT_IGNORE_SELECTOR` is included.
-   Text inside `<a>` outside `<p>` is included (same as server).

This is intentionally designed to mirror the server’s behavior so that `context.text` can be conceptually equal to `reconstructTextFromBlocks(textBlocks)` for the same HTML.

### 2.2.1 Extension‑side HTML serialization (payload pruning)

When the extension prepares a job to send to the server it serializes the article/document DOM into an HTML string for the payload. To limit payload size (especially on pages with large images, embedded media, or complex forms) the extension performs a lightweight, deterministic pruning step before sending the HTML to the server:

-   A deep clone of the snapshot root element is created.
-   A small set of non‑text, media and form tags is removed from the clone (`form`, `img`, `image`, `video`, `picture`).
-   The sanitized clone's `outerHTML` is used as the `content` / `context.html` value posted to the server.

Rationale and safety guarantees:

-   These tags do not produce text nodes that contribute to the canonical text extracted by `createTextSnapshot` (the snapshot already ignores them via `HIGHLIGHT_IGNORE_SELECTOR`), so pruning them does not change `context.text` or the per-character `pointers` used by highlighting.
-   Removing them reduces payload size significantly in many real pages without affecting sentence offsets or highlight alignment, preserving the key invariant that frontend and backend canonical text are identical after both sides' normalization.
-   The pruning is performed only on the serialized HTML sent to the server; the live DOM used for mapping offsets (`pointers`) remains untouched.

Developer notes and caveats:

-   If you need the server to see any semantic data contained in attributes of those removed elements (for example `alt` text on images), consider extracting that data separately and including it in the job metadata rather than relying on raw HTML.
-   If you change the list of tags that are physically removed from the payload, ensure that the frontend text extraction rules (`HIGHLIGHT_IGNORE_SELECTOR` / `DEFAULT_NOISE_SELECTORS`) and the server's `IGNORED_TAGS` remain conceptually aligned — either by also updating the server or by documenting the asymmetry and its implications for offsets.
-   `buildCustomContext(content)` still uses the caller-provided `content` verbatim; callers are responsible for supplying already-sanitized HTML when appropriate.

### 2.3 Shared Skip Rules (Frontend/Backend)

The following content is **never** part of the canonical text on either side:

-   Tags: `script`, `style`, `nav`, `aside`, `footer`, `header`, `figure`, `iframe`, `noscript`, `template`, `button`, `time`, `form`, `meta`, `head`, `link`, `br`.
-   Elements with attributes: `hidden`, `aria-hidden="true"`, `data-factcheck-ignore`.

These are enforced by:

-   Backend: `IGNORED_TAGS` and attribute checks in `parseHtmlToBlocks`.
-   Frontend: `HIGHLIGHT_IGNORE_SELECTOR` passed to `createTextSnapshot`.

### 2.4 `skipAI` vs. Text Inclusion

Some text should be present in the canonical text for offsets, but excluded from AI analysis.

-   Example: navigation links (`<a>` outside `<p>`), menu items, etc.

**Backend behavior:**

-   For such content:
    -   Text is extracted into `TextBlock`s.
    -   `skipAI: true` is set on those blocks.
-   During sentence segmentation:
    -   Sentences inherit `skipAI: true` **only if all overlapping block ranges are `skipAI === true`**.
    -   In addition to `skipAI`, the server now supports a stronger internal flag used for anchors outside paragraphs — `skipAIHard`.
        -   `skipAIHard` is set for anchor (`<a>`) subtrees whose parent/grandparent are not `<p>` (e.g. nav links, promos).
        -   The server still includes these characters in the canonical text (to preserve alignment), but it will **omit any sentence that overlaps a `skipAIHard` region**. If _any part_ of a sentence overlaps a `skipAIHard` block the server will not produce a `Sentence` object for that sentence.
        -   This differs from the normal `skipAI` rule where a sentence is marked `skipAI: true` only when _all_ overlapping ranges are `skipAI === true` (allowing partial sentences to still be analyzed). `skipAIHard` is stricter and causes whole-sentence omission.
- During LLM classification:
    -   `classifySentencesWithLLM` filters to `sentences.filter(s => !s.skipAI)`.
-   But the characters **still exist** in the concatenated text underlying `start`/`end`.

**Frontend behavior:**

-   No special handling: this text is part of `context.text` and thus part of `pointers`.
-   Such regions can still be highlighted if the server ever emits spans there (though currently it doesn’t because they are skipped for AI).
    -   Because `skipAIHard` prevents sentence objects from being emitted at segmentation time, the server will not send those sentences to the LLM and will therefore never return classification spans for them. Offsets still align and the frontend retains the underlying characters (so future changes could safely re-introduce highlighting if desired).

This design keeps offsets stable while still letting the AI ignore unimportant text.

---

## 3. Sentence Segmentation Logic (Server)

Location: `server/src/utils/textUtils.ts` and `server/docs/SENTENCE_SEGMENTATION.md`.

Sentence segmentation happens in two main stages:

1. `parseHtmlToBlocks(html)` – structure‑aware text blocks.
2. `segmentSentencesWithStructure(blocks, language)` – structural + punctuation‑aware segmentation.

### 3.1 Protected Dots and Numeric Patterns

Functions: `protectDots`, `restoreProtectedDots`, `standardSegment`.

-   Before segmentation, the text is passed through `protectDots`:
    -   Known abbreviations (e.g. `dr.`, `mgr.`, `prof.`, `tyś.`, etc.) have their final dot replaced with a placeholder (`§`).
    -   Numeric patterns like `8.20` become `8§20`.
-   This ensures `.` in such cases **does not** trigger a sentence break.
-   After segmentation, `restoreProtectedDots` replaces `§` with `.` again.

### 3.2 Punctuation‑Based Splitting

Function: `standardSegment(text, language)`.

-   If `Intl.Segmenter` is available:
    -   Uses `new Intl.Segmenter(language, { granularity: "sentence" })`.
    -   For each segment:
        -   `segment.segment` is trimmed.
        -   Leading internal whitespace is accounted for so `start`/`end` align with trimmed content.
-   Otherwise, uses a regex fallback:
    -   `[^.!?]+[.!?]+|[^.!?]+$` – splits at `.`, `!`, `?`.
-   Each segment is returned as `{ text, start, end }` in the **protected** text; indices are mapped to the original by `restoreProtectedDots`.

### 3.3 Structural Breaks (DOM Block Boundaries)

Functions: `isStructuralBreakSignificant`, `shouldSuppressStructuralBreakForParagraphChildren`.

-   `segmentSentencesWithStructure` walks `blocks` in order, appending their text to a `currentBuffer` string.
-   For consecutive blocks `currentBlock` and `nextBlock`:
    -   The DOM paths (`path: string[]`) are compared.
    -   The first index where they differ is examined.
    -   If the tag at that index is in `BLOCK_TAGS` for either block, that boundary is considered a **potential structural break** — _but_ there is an important refinement:
        -   If the diverging path leads to only inline children (for example a text node or inline wrapper like `<a>`/`<span>`) inside a block container, the server will treat the boundary as inline flow and will _not_ force a structural break. This prevents unnecessary sentence splits when the difference is purely inline structure (e.g., a label followed by an inline link inside the same `div`).
-   Headers:
    -   Any block marked `isHeader` forces a structural break between header and non‑header blocks.

### 3.4 Paragraph‑Child Suppression Rule

Function: `shouldSuppressStructuralBreakForParagraphChildren`.

Goal: avoid splitting sentences just because the HTML nests inline or shallow blockish elements under the same `<p>`.

-   Each block carries `paragraphContext?: { id, depth }`:
    -   `id`: stable id for a paragraph (`p-0`, `p-1`, ...).
    -   `depth`: distance from the `<p>` element (0 = direct content, 1 = child, etc.).
-   When a structural break is detected between blocks `A` and `B`, it is **suppressed** if:
    -   Both have `paragraphContext`.
    -   `ctxA.id === ctxB.id` (same paragraph).
    -   `ctxA.depth <= maxDepthFromParagraph` and `ctxB.depth <= maxDepthFromParagraph` (default `2`).

This makes spans inside `<span>`, `<strong>`, small inline wrappers, or shallow nested blocks **stay in the same sentence** when appropriate.

### 3.5 Partial‑Sentence Carryover

When a block contains one or more sentences but ends with an **incomplete** sentence fragment (no terminal punctuation):

-   `standardSegment(currentBuffer)` is run.
-   If the last returned segment does **not** end in `.`, `!`, or `?` **and** there is no unsuppressed structural break to the next block:
    -   That last fragment is kept in the `currentBuffer`.
    -   Only the fully finished sentences before it are committed.
    -   `sentenceStartIndex` is advanced accordingly.
-   The next block text is appended and segmentation continues, allowing sentences to span across DOM boundaries.

### 3.6 End‑of‑Input Handling

-   After all blocks are processed, any remaining `currentBuffer` is segmented with `standardSegment`.
-   All resulting segments are turned into `Sentence` objects.

### 3.7 `skipAI` Propagation to Sentences

-   While building `currentBuffer`, the function keeps a parallel array `bufferBlockRanges`:
    -   Each entry: `{ start, end, skipAI?: boolean }` in buffer coordinates.
-   For each sub‑sentence `{ text, start, end }` in the buffer:
    -   It finds overlapping block ranges.
    -   `skipAI` for the sentence is `true` **only if all overlapping ranges have `skipAI === true`.**
-   This allows mixed sentences (partially from `skipAI` blocks) to still be analyzed.

### 3.8 Sentence Ranges and Whitespace

-   Before pushing a sentence, its `text` is trimmed.
-   The reported `start` and `end` indices:
    -   Refer to positions in the **concatenated, normalized text**, _excluding_ leading/trailing whitespace of the sentence itself.
    -   The single space between two sentences lies **between** their ranges, not inside either.

This is important for highlighting: a span built from those ranges will not include the following whitespace, yielding a visually pleasing small gap between highlighted sentences.

---

## 4. Highlighting Logic (Frontend)

Location: `extension/src/content/highlighting/factHighlight.ts`.

### 4.1 Inputs

`highlightText(result: HighlightResult | null | undefined, context?: HighlightContext)` expects:

-   `result.spans: HighlightSpan[]` from the server:
    -   `start`, `end`: character offsets in the canonical text.
    -   `type?: string`: e.g. `"fact" | "opinion" | "uncertain"`.
    -   `confidence?: number`, `rationale?: string`.
-   `context: HighlightContext` from `articleScraper/context`:
    -   `root: HTMLElement` – root node for the snapshot.
    -   `text: string` – canonical text (same space as server offsets).
    -   `pointers: TextPointer[]` – mapping from text indices to DOM text ranges.

If `result` is null/empty or `context.pointers` is empty, all existing highlights are removed.

### 4.2 Dark/Light Mode and Colors

-   `TYPE_COLORS` defines per‑type colors for light/dark:
    -   `fact`, `opinion`, `uncertain`.
-   `detectPageDarkMode()` heuristically determines whether the page background is dark using:
    -   Root/body background colors.
    -   Sampling the element at viewport center.
    -   Fallback to `matchMedia('(prefers-color-scheme: dark)')`.
-   A `MutationObserver` plus `matchMedia` listener detect theme/background changes:
    -   When a change is detected, `updateHighlights(isDark)` adjusts background colors on all existing highlight spans.

### 4.3 Clear / Remove Highlights

`removeHighlights()`:

-   Finds all `span[data-factcheck-highlight]` elements.
-   For each span:
    -   Moves its children back into the parent (unwrapping in DOM).
    -   Removes the span.
-   Hides tooltip and stops background/theme listeners.

### 4.4 Main Highlight Flow

1. **Preparation**

    - Reset dark‑mode cache.
    - If there are no spans or no pointers, call `removeHighlights()` and return.
    - Otherwise, clear any existing highlights and ensure the tooltip container exists.

2. **Sort spans**

    - Copy `result.spans`, filter by `isValidSpan` (finite, `end > start`).
    - Sort descending by `start`, then `end`.
    - Sorting in reverse order simplifies DOM wrapping because later spans are applied first and don’t shift earlier positions.

3. **For each span**

    - `createRangeFromPointers(context.pointers, span.start, span.end)`:
        - Clamps `start` and `end` to valid indices.
        - Picks `startEntry = pointers[clampedStart]`, `endEntry = pointers[clampedEnd - 1]`.
        - Uses their `startNode`, `startOffset`, `endNode`, `endOffset` to construct a DOM `Range`.
        - Guards against disconnected nodes and degenerate/empty ranges.
    - If a valid `Range` is obtained:
        - `wrapRange(range, span)` returns an array of `HTMLElement` wrappers (one or more spans) actually inserted into the DOM.
        - For each wrapper, `attachTooltip(wrapper, span)` activates hover UI.

4. **Start background listener**
    - `startBackgroundChangeListener()` begins observation so highlight colors track theme changes.

### 4.5 Mapping Offsets to DOM Ranges

**Function:** `createRangeFromPointers(pointers, start, end)`

-   `pointers` is an ordered array where each element corresponds to **one character** of `context.text`:
    -   For a normal character: a single node with `startOffset = i`, `endOffset = i+1`.
    -   For a collapsed space: a span across one or more text nodes and offsets covering the original whitespace run.

1. Clamp indices:
    - `clampedStart = clamp(floor(start), 0, pointers.length - 1)`.
    - `clampedEnd = clamp(ceil(end), clampedStart + 1, pointers.length)`.

2. Determine range endpoints:
    - `startEntry = pointers[clampedStart]`.
    - `endEntry = pointers[clampedEnd - 1]`.
    - Use their `startNode/startOffset` and `endNode/endOffset`.

3. Validate offsets:
    - Clamp offsets to each node’s `textContent.length` to avoid DOM exceptions.
    - Return `null` for degenerate or collapsed ranges.

4. Create `Range`:
    - `range.setStart(startEntry.startNode, safeStartOffset)`.
    - `range.setEnd(endEntry.endNode, safeEndOffset)`.
    - Check `range.collapsed` and return `null` if empty.

This effectively maps numeric character indices in the canonical text back into a DOM selection.

### 4.6 Wrapping Strategy: Within vs Across Blocks

Highlight spans can cross multiple block‑level elements (e.g. paragraphs, list items). The code distinguishes two cases.

1. **Detect block elements inside `Range`**

    - `findBlockElementsInRange(range, BLOCK_TAGS)` walks the DOM subtree of `range.commonAncestorContainer` and collects elements whose tag is in `BLOCK_TAGS` and where `range.intersectsNode(element)`.

2. **Case A: Range spans multiple blocks**

    - If `blockElements.length > 0`:
        - `wrapRangeAcrossBlocks(range, span, color, BLOCK_TAGS)` is used.
        - It collects all text nodes intersecting the range (`collectTextNodesInRange`).
        - Groups them by their nearest ancestor block (`groupTextNodesByBlock`).
        - For each group (from last to first):
            - Builds a smaller `Range` covering that group (`wrapTextNodeGroup`).
            - Wraps it using `wrapRangeWithinBlock`.
        - Returns all created wrappers.

3. **Case B: Range is within a single block**

    - `wrapRangeWithinBlock(range, span, color)` is used:
        - Primary attempt: `range.surroundContents(wrapper)` to wrap the range in a single span.
        - On failure (e.g. non‑sibling nodes, partial tags):
            - Extracts the contents into a fragment, appends to the wrapper, then inserts wrapper back at `range`.
        - On further failure, falls back to manually wrapping text node portions via `collectTextNodesInRange` and `wrapTextNodePortion`.

4. **Wrapper creation**
    - `createHighlightSpan(color, span)`:
        - Creates a `<span>` element.
        - Sets `data-factcheck-highlight="true"`.
        - Sets `data.type`, `data.confidence`, `data.rationale` if available.
        - Applies `backgroundColor` and `cursor: pointer`.

This approach ensures highlights can span complex DOM structures while remaining visually contiguous.

---

## 5. How Segmentation and Highlighting Work Together

This section ties together the text, offsets, sentences, and DOM mapping.

### 5.1 Canonical Text Space

There is an implicit **canonical text space** shared between server and frontend, defined as:

-   The result of **server** reconstruction: `reconstructTextFromBlocks(parseHtmlToBlocks(html))`.
-   The result of **frontend** snapshot: `createTextSnapshot(root, HIGHLIGHT_IGNORE_SELECTOR).text`.

By construction, these should be **identical strings** for the same article HTML.

All offsets used by the server (`Sentence.start/end`, span `start/end`) and by the frontend (`TextPointer` index) live in this same space.

### 5.2 Sentence → Span → DOM

1. **Sentence segmentation**

    - Server produces `Sentence[]` with `start`/`end` in canonical text.

2. **Classification**

    - Only sentences with `skipAI !== true` are sent to the LLM.
    - LLM returns classification objects `{ sentenceId, type, confidence, rationale }[]`.
    - `buildSpansFromClassification` maps each classification to its sentence:
        - Span `start = sentence.start`, `end = sentence.end`.
        - Span `type = classification.type`, etc.

3. **Highlighting**
    - Frontend receives `spans[]` and `HighlightContext` with `text`, `pointers` for the same article.
    - For each span:
        - Use `start/end` to index into `pointers` and build DOM `Range`.
        - Wrap the range in highlight spans.

Because `pointers[i]` is defined for every character in `context.text`, and because `context.text` matches the server’s text space, a sentence `[start, end)` becomes an exact DOM range.

### 5.3 Whitespace and Sentence Gaps

The design intentionally excludes leading/trailing spaces from sentence spans:

-   In `segmentSentencesWithStructure`, every sentence text is trimmed.
-   `start` and `end` correspond to the trimmed content, not the full buffer substring.
-   The single space between sentences is therefore **outside** both spans.

This means:

-   Highlights do not include trailing spaces.
-   Visually, highlighted sentences have a small gap between them, improving readability.

### 5.4 `skipAI` and Highlight Coverage

-   Sentences whose `skipAI === true` are never sent to the LLM.
-   Consequently, there will be **no spans** for those sentences.
-   However, the underlying text is still part of the canonical text and has `TextPointer` coverage.

If, in the future, we decide to highlight such regions (e.g. navigation disclaimers), we can safely do so because:

-   Offsets still line up.
-   `createRangeFromPointers` can map them to DOM.

### 5.5 Alignment Validation (Development Mode)

To guard against future regressions in extraction/normalization logic, there is an explicit alignment check.

**Server:**

-   In `server/src/services/analyzer.ts`:
    -   After `parseHtmlToBlocks`, `reconstructTextFromBlocks(textBlocks)` is called.
    -   The resulting `extractedText` is attached to `analyzerResult.metadata` when `NODE_ENV === "development"`.

**Frontend:**

-   In `extension/src/content/textSnapshot.ts`:
    -   `validateTextAlignment(frontendText, backendText)` compares:
        -   Lengths.
        -   Character-by-character equality.
        -   Logs first difference with local context when mismatched.
-   In `extension/src/content/services/jobRunner.ts`:
    -   When a job completes and `status.result.metadata.extractedText` exists:
        -   `validateTextAlignment(resolvedContext.text, status.result.metadata.extractedText)` is run.
        -   On mismatch, a warning is logged, and developers know highlights may be off.

This validation is development‑only and has no effect in production.

---

## 6. Practical Examples

### 6.1 Simple Paragraph with Link

HTML:

```html
<p>This is a <a href="#">link inside</a> a paragraph.</p>
```

Canonical text on both sides:

```text
"This is a link inside a paragraph."
```

-   `<a>` is inside `<p>`, so it is **not** marked `skipAI`.
-   One sentence with `start = 0`, `end = text.length`.
-   Frontend highlights the entire sentence as a single contiguous region across text and link.

### 6.2 Navigation Link Outside Paragraph

HTML:

```html
<article>
	<p>Intro sentence.</p>
	<a href="#">Standalone navigation link</a>
	<p>Main content continues.</p>
</article>
```

Canonical text:

```text
"Intro sentence. Standalone navigation link Main content continues."
```

-   The `<a>` outside `<p>` is **included** in text.
-   Blocks for that anchor are marked `skipAI`.
-   Sentence segmentation might yield:
    1. `"Intro sentence."` (skipAI = false)
    2. `"Standalone navigation link"` (skipAI = true)
    3. `"Main content continues."` (skipAI = false)
-   Only sentences 1 and 3 are sent to the LLM and potentially highlighted.
-   Offsets still account for sentence 2’s characters, so spans 1 and 3 map correctly.

### 6.3 Nested Inline Formatting

HTML:

```html
<p>This is <strong>sentence One.</strong> Now sentence 2 <em>continues here.</em></p>
```

-   `parseHtmlToBlocks` produces multiple blocks, but `paragraphContext` marks them as children of the same `<p>` with depth ≤ 2.
-   Structural breaks between those blocks are suppressed.
-   Sentence segmentation sees contiguous text:

```text
"This is sentence One. Now sentence 2 continues here."
```

-   Two sentences are created at the `.` punctuation boundary.
-   Highlights cover the full logical sentences across `<strong>` and `<em>` boundaries.

---

## 7. Extending or Modifying the System

When changing sentence segmentation or highlighting, keep these rules in mind:

1. **Preserve the canonical text invariant**

    - Any change to text extraction or normalization on the server **must** be mirrored on the frontend (or vice versa).
    - Use `reconstructTextFromBlocks` and `validateTextAlignment` in development to catch differences.

2. **Avoid adding new hard‑skipped tags asymmetrically**

    - If you add/remove tags from `DEFAULT_NOISE_SELECTORS` / `IGNORED_TAGS`, also update `HIGHLIGHT_IGNORE_SELECTOR`.

3. **Treat `skipAI` as an analysis concern, not an extraction concern**

    - Prefer marking content as `skipAI` over removing it from the canonical text, unless you are certain those characters should not participate in offsets at all.

4. **Be careful with whitespace rules**

    - Small changes to trimming or collapsing rules can shift indices.
    - Always re‑run alignment validation after such changes.

5. **Test with structurally complex HTML**

    - Nested blocks inside paragraphs, multiple headers, lists, tables, etc.
    - Verify that sentences remain intuitive and highlights align as expected.

By following these guidelines and referring back to this document, you can safely evolve the sentence segmentation and highlighting systems without breaking offset alignment or user experience.
