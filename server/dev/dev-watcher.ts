import { spawn } from "child_process";
import { watch } from "chokidar";
import * as path from "path";

const port = Number(process.env.PORT ?? 3000);
const repoRoot = process.cwd();
const distServerEntry = path.resolve(repoRoot, "dist", "src", "server.js");
const restartDebounceMs = 200;
let restartTimer: NodeJS.Timeout | null = null;
const npmNodeExec = process.env.npm_node_execpath ?? process.execPath;
const npmCli = process.env.npm_execpath ?? null;
const npmCmdFallback = process.platform === "win32" ? "npm.cmd" : "npm";
let child: any;

function spawnServer() {
	console.log("Spawning server (compiled dist)...");
	const cmd = process.execPath; // node
	const args = [distServerEntry];
	const child = spawn(cmd, args, { stdio: "inherit" });
	child.on("exit", (code, signal) => {
		console.log(`Server process exited with ${code ?? signal}`);
	});

	return child;
}

function attachExitHandler() {
	if (!child) return;
	child.once("exit", code => {
		console.log("Child exit detected. Spawning a new instance.");
		child = spawnServer();
		attachExitHandler();
	});
}

async function runInitialBuild() {
	return new Promise<void>((resolve, reject) => {
		console.log("Running initial tsc build...");
		const proc = spawnNpm(["run", "build"]);
		proc.on("exit", code => {
			if (code === 0) resolve();
			else reject(new Error(`build failed: code ${code}`));
		});
	});
}

function spawnTscWatch() {
	console.log("Starting tsc --watch in background...");
	const proc = spawnNpm(["run", "build", "--", "--watch", "--preserveWatchOutput"], {
		stdio: ["ignore", "pipe", "pipe"]
	});
	monitorTscOutput(proc);
	proc.on("exit", code => {
		console.warn(`tsc --watch exited with ${code}. Will restart watcher in 1s`);
		setTimeout(spawnTscWatch, 1000);
	});
	return proc;
}

function spawnNpm(args: string[], options = {}) {
	const spawnOptions = { stdio: "inherit", ...options } as any;
	if (npmCli) {
		return spawn(npmNodeExec, [npmCli, ...args], spawnOptions);
	}
	const useShell = process.platform === "win32";
	return spawn(npmCmdFallback, args, { shell: useShell, ...spawnOptions });
}

function monitorTscOutput(proc) {
	let stdoutBuffer = "";
	let stderrBuffer = "";
	let initialReady = false;
	let pendingRestartFromBuild = false;

	const flushLines = (buffer: string, handler: (line: string) => void) => {
		const lines = buffer.split(/\r?\n/);
		const remainder = lines.pop() ?? "";
		for (const line of lines) {
			handler(line);
		}
		return remainder;
	};

	const handleLine = (line: string, stream: "stdout" | "stderr") => {
		const trimmed = line.trim();
		if (!trimmed) return;
		console.log(`[tsc:${stream}] ${trimmed}`);
		if (trimmed.includes("File change detected")) {
			pendingRestartFromBuild = true;
			return;
		}
		const match = trimmed.match(/Found (\d+) errors?/);
		if (match) {
			const errorCount = Number(match[1]);
			if (errorCount === 0) {
				if (!initialReady) {
					initialReady = true;
				} else if (pendingRestartFromBuild) {
					pendingRestartFromBuild = false;
					scheduleRestart("tsc-build");
					return;
				}
				pendingRestartFromBuild = false;
			} else {
				pendingRestartFromBuild = false;
			}
		}
	};

	proc.stdout?.on("data", chunk => {
		stdoutBuffer += chunk.toString();
		stdoutBuffer = flushLines(stdoutBuffer, line => handleLine(line, "stdout"));
	});
	proc.stdout?.on("close", () => {
		if (stdoutBuffer) {
			handleLine(stdoutBuffer, "stdout");
			stdoutBuffer = "";
		}
	});
	proc.stderr?.on("data", chunk => {
		stderrBuffer += chunk.toString();
		stderrBuffer = flushLines(stderrBuffer, line => handleLine(line, "stderr"));
	});
	proc.stderr?.on("close", () => {
		if (stderrBuffer) {
			handleLine(stderrBuffer, "stderr");
			stderrBuffer = "";
		}
	});
}

async function requestRestart() {
	const url = `http://localhost:${port}/__dev/restart`;
	console.log("Requesting restart from", url);
	try {
		const resp = await fetch(url, { method: "POST" });
		if (resp.ok) {
			console.log("Restart request accepted:", resp.status);
		} else if (resp.status === 202) {
			console.log("Restart scheduled:", resp.status);
		} else {
			console.warn("Restart responded with", resp.status);
		}
	} catch (err) {
		console.warn("Failed to request restart, server might be down. Will force restart. Error:", err);

		// Kill the child and respawn
		try {
			child.kill("SIGTERM");
		} catch (e) {
			console.warn("Failed to kill child process", e);
		}
	}
}

function scheduleRestart(reason: string) {
	if (restartTimer) clearTimeout(restartTimer);
	restartTimer = setTimeout(() => {
		restartTimer = null;
		console.log(`Triggering restart due to ${reason}`);
		requestRestart();
	}, restartDebounceMs);
}

// Watch environment files and package.json for restart triggers.
const envWatchPaths = [".env", ".env.defaults", "package.json", "tsconfig.json"];
const envWatcher = watch(envWatchPaths, { ignoreInitial: true });
envWatcher.on("all", (ev, p) => {
	console.log("Env/manifest change detected:", ev, p);
	scheduleRestart("env-change");
});

// Run initial build, then start background watch and server.
runInitialBuild()
	.then(() => {
		spawnTscWatch();
		child = spawnServer();
		attachExitHandler();
	})
	.catch(err => {
		console.error("Initial build failed:", err);
		// Attempt to start server anyway (if dist already present)
		child = spawnServer();
		attachExitHandler();
		spawnTscWatch();
	});
