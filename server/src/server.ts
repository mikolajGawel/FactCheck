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
const server = app.listen(port, () => {
	console.log(`Server listening on http://localhost:${port}`);
});

// Graceful shutdown on termination signals — useful in development while the
// watcher restarts the process.
function gracefulCloseAndExit(code = 0) {
	try {
		console.log('Closing server...');
		server.close(() => {
			console.log('Server closed');
			process.exit(code);
		});
	} catch (err) {
		console.error('Error during graceful shutdown', err);
		process.exit(code);
	}
}

process.on('SIGTERM', () => gracefulCloseAndExit(0));
process.on('SIGINT', () => gracefulCloseAndExit(0));
