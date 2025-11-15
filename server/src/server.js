import { fileURLToPath } from "url";
import path from "path";
import { config } from "dotenv-defaults";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

config({
	path: path.join(__dirname, "../.env"),
	encoding: "utf8",
	defaults: path.join(__dirname, "../.env.defaults")
});

const { default: app } = await import("./app.js");
app.listen(process.env.PORT, () => {
	console.log(`Server listening on http://localhost:${process.env.PORT}`);
});
