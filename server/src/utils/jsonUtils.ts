export function extractJsonObject(raw: string) {
	if (!raw) {
		throw new Error("Model nie zwrócił żadnych danych JSON");
	}

	let candidate = raw.trim();
	if (candidate.startsWith("```")) {
		candidate = candidate
			.replace(/^```[a-zA-Z]*\n?/, "")
			.replace(/```$/, "")
			.trim();
	}

	const startIndex = candidate.indexOf("{");
	const endIndex = candidate.lastIndexOf("}");

	if (startIndex === -1 || endIndex === -1 || endIndex <= startIndex) {
		throw new Error("Nie udało się odnaleźć poprawnego JSON w odpowiedzi modelu");
	}

	const jsonSlice = candidate.slice(startIndex, endIndex + 1);
	return JSON.parse(jsonSlice);
} 

export function stringifyForPrompt(payload) {
	return JSON.stringify(payload, null, 2);
}
