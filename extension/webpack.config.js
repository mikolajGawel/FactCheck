import path from "path";
import { fileURLToPath } from "url";
import CopyWebpackPlugin from "copy-webpack-plugin";
import Dotenv from "dotenv-webpack";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const outputPath = path.resolve(__dirname, "dist");

export default (env, argv) => {
	const isDev = argv.mode === "development";

	return {
		mode: isDev ? "development" : "production",
		entry: {
			content: "./src/content/content.js",
			background: "./src/background/background.js",
			popup: "./src/popup/popup.js"
		},
		output: {
			filename: "[name].js",
			path: outputPath,
			clean: true
		},
		devtool: isDev ? "cheap-module-source-map" : false,
		plugins: [
			new CopyWebpackPlugin({
				patterns: [
					{
						from: path.resolve(__dirname, "public"),
						to: outputPath,
						globOptions: {
							ignore: ["**/*.js"]
						}
					},
					{
						from: path.resolve(__dirname, "src/popup"),
						to: outputPath,
						globOptions: {
							ignore: ["**/*.js"]
						}
					}
				]
			}),
			new Dotenv({
				safe: true,
				defaults: true
			})
		]
	};
};
