/**
 * Count sentences in a text string
 */
export function countSentences(text: string): number {
	if (!text?.trim()) return 0;

	try {
		const re = /[^.!?]+[.!?]+|[^.!?]+$/g;
		let match: RegExpExecArray | null;
		let count = 0;

		while ((match = re.exec(text)) !== null) {
			if (match[0].trim()) count += 1;
		}
		return count;
	} catch {
		return 0;
	}
}

/**
 * Convert integer to upper-case Roman numeral
 * Used for "cz. II", "cz. III" style suffixes
 */
export function toRoman(num: number): string {
	if (num <= 0) return String(num);

	const romanNumerals: [number, string][] = [
		[1000, "M"],
		[900, "CM"],
		[500, "D"],
		[400, "CD"],
		[100, "C"],
		[90, "XC"],
		[50, "L"],
		[40, "XL"],
		[10, "X"],
		[9, "IX"],
		[5, "V"],
		[4, "IV"],
		[1, "I"]
	];

	let remaining = num;
	let result = "";

	for (const [value, symbol] of romanNumerals) {
		while (remaining >= value) {
			result += symbol;
			remaining -= value;
		}
	}

	return result;
}

/**
 * Generate a text snippet from longer text
 */
export function createSnippet(text: string, maxLength = 200): string {
	return text.slice(0, maxLength).trim().replace(/\s+/g, " ");
}
