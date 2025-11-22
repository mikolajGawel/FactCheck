export function escapeDangerousContent<T extends string | null | undefined>(value: T): T {
	if (value === null || value === undefined) {
		return value;
	}

	const str = String(value);
	if (!str) {
		return "" as T;
	}

	// Minimal, predictable HTML escaping suitable for insertion into text
	// contexts or for additional escaping on the client.
	const map: Record<string, string> = {
		"&": "&amp;",
		"<": "&lt;",
		">": "&gt;",
		'"': "&quot;",
		"'": "&#39;"
	};

	const escaped = str.replace(/[&<>"']/g, ch => map[ch] ?? ch);
	return escaped as T;
}

export default {
	escapeDangerousContent
};
