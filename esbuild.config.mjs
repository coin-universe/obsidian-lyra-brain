import esbuild from "esbuild";
import { existsSync, mkdirSync } from "fs";

const watch = process.argv.includes("--watch");

const ctx = await esbuild.context({
	entryPoints: ["main.ts"],
	bundle: true,
	external: ["obsidian", "electron"],
	format: "cjs",
	target: "es2018",
	logLevel: "info",
	sourcemap: "inline",
	treeShaking: true,
	outfile: "main.js",
});

if (watch) {
	await ctx.watch();
} else {
	await ctx.rebuild();
	process.exit(0);
}
