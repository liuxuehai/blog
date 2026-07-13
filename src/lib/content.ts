import { getCollection, type CollectionEntry } from "astro:content";
import {
	BLOG_CATEGORIES,
	CATEGORY_BY_SLUG,
	CATEGORY_LABELS,
	CATEGORY_SLUGS,
	type BlogCategory,
	type NoteCategory,
} from "../data/taxonomy";

export type BlogPost = CollectionEntry<"blog">;
export type NoteEntry = CollectionEntry<"docs">;
export type ChangelogEntry = CollectionEntry<"changelog">;

export function getReadingTime(post: BlogPost) {
	const body = "body" in post ? post.body : "";
	const words = body.trim().split(/\s+/).filter(Boolean).length;
	return Math.max(1, Math.ceil(words / 220));
}

export function getPostUrl(post: BlogPost) {
	return `/blog/${post.id}/`;
}

export function getCategorySlug(category: BlogCategory) {
	return CATEGORY_SLUGS[category];
}

export function getCategoryLabel(category: BlogCategory) {
	return CATEGORY_LABELS[category];
}

export function getCategoryFromSlug(slug: string) {
	return CATEGORY_BY_SLUG[slug];
}

export function getTagSlug(tag: string) {
	return tag
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
}

function sortPostsByDate(posts: BlogPost[]) {
	return posts.sort((a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf());
}

export async function getPublishedPosts() {
	const posts = await getCollection("blog", ({ data }) => !data.draft);
	return sortPostsByDate(posts);
}

export async function getLatestPosts(limit = 4) {
	return (await getPublishedPosts()).slice(0, limit);
}

export async function getFeaturedPosts(limit = 3) {
	const posts = (await getPublishedPosts()).filter((post) => post.data.featured);
	return posts.slice(0, limit);
}

export async function getPostsByCategory(category: BlogCategory) {
	return (await getPublishedPosts()).filter((post) => post.data.category === category);
}

export async function getPostsByTag(tag: string) {
	const normalizedTag = tag.toLowerCase();
	return (await getPublishedPosts()).filter((post) =>
		post.data.tags.some((item) => item.toLowerCase() === normalizedTag),
	);
}

export async function getGroupedPostsByCategory() {
	const posts = await getPublishedPosts();
	return BLOG_CATEGORIES.reduce(
		(groups, category) => {
			const categoryPosts = posts.filter((post) => post.data.category === category);
			if (categoryPosts.length > 0) {
				groups[category] = categoryPosts;
			}
			return groups;
		},
		{} as Partial<Record<BlogCategory, BlogPost[]>>,
	);
}

export async function getAllTags() {
	const posts = await getPublishedPosts();
	return Array.from(new Set(posts.flatMap((post) => post.data.tags))).sort((a, b) =>
		a.localeCompare(b),
	);
}

export async function getTagFromSlug(slug: string) {
	const tags = await getAllTags();
	return tags.find((tag) => getTagSlug(tag) === slug);
}

export async function getRelatedPosts(post: BlogPost, limit = 3) {
	const posts = (await getPublishedPosts()).filter((item) => item.id !== post.id);
	const postTags = new Set(post.data.tags);

	return posts
		.map((item) => ({
			post: item,
			score:
				(item.data.category === post.data.category ? 2 : 0) +
				item.data.tags.filter((tag) => postTags.has(tag)).length,
		}))
		.filter((item) => item.score > 0)
		.sort((a, b) => b.score - a.score || b.post.data.pubDate.valueOf() - a.post.data.pubDate.valueOf())
		.slice(0, limit)
		.map((item) => item.post);
}

export async function getPublishedNotes() {
	return getCollection("docs", ({ data }) => !data.draft);
}

export async function getNotesByCategory(category: NoteCategory) {
	return (await getPublishedNotes()).filter((note) => note.data.category === category);
}

export async function getNoteCountsByCategory() {
	const notes = await getPublishedNotes();
	return notes.reduce(
		(counts, note) => {
			if (note.data.category) {
				counts[note.data.category] = (counts[note.data.category] ?? 0) + 1;
			}
			return counts;
		},
		{} as Partial<Record<NoteCategory, number>>,
	);
}

export async function getPublishedChangelog() {
	const entries = await getCollection("changelog", ({ data }) => !data.draft);
	return entries.sort((a, b) => b.data.date.valueOf() - a.data.date.valueOf());
}
