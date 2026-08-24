import { existsSync, readFileSync, readdirSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";

const sourceRoot = resolve("src/content/docs/notes/source");
const strict = process.argv.includes("--strict");
const answerHeading = /^## 先给答案(?::|：).*$/gm;
const mapHeading = /^## 本册问题地图\s*$/gm;

if (!existsSync(sourceRoot)) {
	console.error(`Source-reading directory does not exist: ${sourceRoot}`);
	process.exit(1);
}

function collectMarkdownFiles(directory, files = []) {
	for (const entry of readdirSync(directory, { withFileTypes: true })) {
		const path = join(directory, entry.name);
		if (entry.isDirectory()) collectMarkdownFiles(path, files);
		else if (entry.isFile() && entry.name.endsWith(".md")) files.push(path);
	}
	return files;
}

function countMatches(content, pattern) {
	return [...content.matchAll(pattern)].length;
}

function readFrontmatter(content) {
	const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
	if (!match) return null;

	const values = new Map();
	for (const line of match[1].split(/\r?\n/)) {
		const field = line.match(/^([A-Za-z][A-Za-z0-9]*):\s*(.*?)\s*$/);
		if (field) values.set(field[1], field[2]);
	}
	return values;
}

function displayPath(path) {
	return relative(sourceRoot, path).replaceAll("\\", "/");
}

const markdownFiles = collectMarkdownFiles(sourceRoot);
const indexFiles = markdownFiles.filter((file) => basename(file) === "index.md");
const books = [];

for (const indexFile of indexFiles) {
	const directory = dirname(indexFile);
	const bodyFiles = markdownFiles
		.filter((file) => dirname(file) === directory && basename(file) !== "index.md")
		.sort();
	if (bodyFiles.length === 0) continue;

	books.push({
		name: displayPath(directory),
		indexFile,
		bodyFiles,
	});
}

books.sort((left, right) => left.name.localeCompare(right.name));

const structuralFailures = [];
const missingMaps = [];
const missingRepresentativeAnswers = [];
const incompleteBooks = [];
let bodyCount = 0;
let answeredCount = 0;

for (const book of books) {
	const indexContent = readFileSync(book.indexFile, "utf8");
	const mapCount = countMatches(indexContent, mapHeading);
	if (mapCount === 0) missingMaps.push(book.name);
	if (mapCount > 1) {
		structuralFailures.push(`${displayPath(book.indexFile)} has ${mapCount} problem maps`);
	}

	const missingPages = [];
	let bookAnsweredCount = 0;
	for (const bodyFile of book.bodyFiles) {
		bodyCount += 1;
		const content = readFileSync(bodyFile, "utf8");
		const answerCount = countMatches(content, answerHeading);

		if (answerCount === 0) {
			missingPages.push(basename(bodyFile));
			continue;
		}

		answeredCount += 1;
		bookAnsweredCount += 1;
		if (answerCount > 1) {
			structuralFailures.push(`${displayPath(bodyFile)} has ${answerCount} answer sections`);
		}

		const frontmatter = readFrontmatter(content);
		if (!frontmatter) {
			structuralFailures.push(`${displayPath(bodyFile)} has no frontmatter`);
			continue;
		}

		const updatedDate = frontmatter.get("updatedDate");
		const lastReviewed = frontmatter.get("lastReviewed");
		if (!updatedDate || !lastReviewed) {
			structuralFailures.push(`${displayPath(bodyFile)} is missing updatedDate or lastReviewed`);
		} else if (updatedDate !== lastReviewed) {
			structuralFailures.push(
				`${displayPath(bodyFile)} has mismatched review dates (${updatedDate} vs ${lastReviewed})`,
			);
		}
	}

	if (missingPages.length > 0) {
		incompleteBooks.push({ name: book.name, missingPages });
	}
	if (bookAnsweredCount === 0) missingRepresentativeAnswers.push(book.name);
}

const completeBooks = books.length - incompleteBooks.length;
const missingCount = bodyCount - answeredCount;
const minimumFailures = new Set([...missingMaps, ...missingRepresentativeAnswers]);
const minimumBooks = books.length - minimumFailures.size;

console.log(`Source-reading repositories: ${books.length}`);
console.log(`Minimum line: ${minimumBooks}/${books.length}`);
console.log(`Full completion: ${completeBooks}/${books.length}`);
console.log(`Body pages: ${answeredCount}/${bodyCount} answered, ${missingCount} missing`);

if (missingMaps.length > 0) {
	console.log("\nMissing problem maps:");
	for (const book of missingMaps) console.log(`- ${book}/index.md`);
}

if (missingRepresentativeAnswers.length > 0) {
	console.log("\nMissing representative answer sections:");
	for (const bookName of missingRepresentativeAnswers) console.log(`- ${bookName}`);
}

if (incompleteBooks.length > 0) {
	console.log("\nMissing answer sections by repository:");
	for (const book of incompleteBooks) {
		console.log(`- ${book.name} (${book.missingPages.length}): ${book.missingPages.join(", ")}`);
	}
}

if (structuralFailures.length > 0) {
	console.error("\nStructural failures:");
	for (const failure of structuralFailures) console.error(`- ${failure}`);
	process.exit(1);
}

if (minimumFailures.size > 0) {
	console.error("\nThe declared minimum line is not satisfied.");
	process.exit(1);
}

if (strict && missingCount > 0) {
	console.error(`\nStrict check failed: ${missingCount} body page(s) still need an answer section.`);
	process.exit(1);
}

console.log(strict ? "\nStrict source-reading check passed." : "\nSource-reading structure check passed.");
