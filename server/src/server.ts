import { fileURLToPath } from "url";
import path from "path";
import { config } from "dotenv-defaults";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

config({
	path: path.resolve(process.cwd(), ".env"),
	encoding: "utf8",
	defaults: path.resolve(process.cwd(), ".env.defaults")
});

const { default: app } = await import("./app.js");

const port = Number(process.env.PORT ?? 3000);
app.listen(port, () => {
	console.log(`Server listening on http://localhost:${port}`);
});
