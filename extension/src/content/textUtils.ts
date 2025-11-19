export function isWhitespace(char: string): boolean {
	return /[\s\u00a0]/.test(char);
}
