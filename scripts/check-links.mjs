import { existsSync, readFileSync, readdirSync } from "node:fs";
import { extname, join, relative, resolve } from "node:path";

const distDir = resolve("dist");
const htmlFiles = [];

function collectHtmlFiles(directory) {
	for (const entry of readdirSync(directory, { withFileTypes: true })) {
		const path = join(directory, entry.name);
		if (entry.isDirectory()) {
			collectHtmlFiles(path);
		} else if (entry.name.endsWith(".html")) {
			htmlFiles.push(path);
		}
	}
}

function resolveTarget(pathname) {
	const decoded = decodeURIComponent(pathname);
	const target = join(distDir, decoded.replace(/^\/+/, ""));
	if (extname(target)) return target;
	return decoded.endsWith("/") ? join(target, "index.html") : `${target}.html`;
}

if (!existsSync(distDir)) {
	console.error("dist/ does not exist. Run pnpm run build first.");
	process.exit(1);
}

collectHtmlFiles(distDir);
const failures = [];

for (const file of htmlFiles) {
	const html = readFileSync(file, "utf8");
	const links = html.matchAll(/\b(?:href|src)=["']([^"'#]+)(?:#[^"']*)?["']/g);

	for (const [, value] of links) {
		if (
			value.startsWith("http://") ||
			value.startsWith("https://") ||
			value.startsWith("mailto:") ||
			value.startsWith("tel:") ||
			value.startsWith("data:") ||
			value.startsWith("javascript:") ||
			value.startsWith("//")
		) {
			continue;
		}

		const url = new URL(value, `https://local.test/${relative(distDir, file).replaceAll("\\", "/")}`);
		const target = resolveTarget(url.pathname);
		const fallback = join(distDir, url.pathname.replace(/^\/+/, ""), "index.html");

		if (!existsSync(target) && !existsSync(fallback)) {
			failures.push(`${relative(distDir, file)} -> ${value}`);
		}
	}
}

if (failures.length > 0) {
	console.error(`Found ${failures.length} broken internal link(s):`);
	for (const failure of failures) console.error(`- ${failure}`);
	process.exit(1);
}

console.log(`Checked ${htmlFiles.length} HTML files: no broken internal links.`);
