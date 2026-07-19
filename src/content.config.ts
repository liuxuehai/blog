import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders'; // Reload
import { docsSchema } from '@astrojs/starlight/schema';
import { BLOG_CATEGORIES, NOTE_CATEGORIES } from './data/taxonomy';

const blog = defineCollection({
	// Load Markdown and MDX files in the `src/content/blog/` directory.
	loader: glob({ base: './src/content/blog', pattern: '**/*.{md,mdx}' }),
	// Type-check frontmatter using a schema
	schema: ({ image }) =>
		z.object({
			title: z.string(),
			titleEn: z.string().optional(),
			description: z.string(),
			descriptionEn: z.string().optional(),
			pubDate: z.coerce.date(),
			updatedDate: z.coerce.date().optional(),
			category: z.enum(BLOG_CATEGORIES),
			tags: z.array(z.string()).default([]),
			cover: image().optional(),
			heroImage: image().optional(),
			draft: z.boolean().default(false),
			featured: z.boolean().default(false),
			series: z.string().optional(),
			seriesOrder: z.number().int().positive().optional(),
			toc: z.boolean().default(true),
		}),
});

const docs = defineCollection({
	loader: glob({ base: './src/content/docs', pattern: '**/*.{md,mdx}' }),
	schema: docsSchema({
		extend: z.object({
			category: z.enum(NOTE_CATEGORIES).optional(),
			tags: z.array(z.string()).default([]),
			order: z.number().int().optional(),
			updatedDate: z.coerce.date().optional(),
			difficulty: z.enum(['beginner', 'intermediate', 'advanced']).optional(),
			status: z.enum(['learning', 'stable']).optional(),
			lastReviewed: z.coerce.date().optional(),
			draft: z.boolean().default(false),
		}),
	}),
});

const changelog = defineCollection({
	loader: glob({ base: './src/content/changelog', pattern: '**/*.{md,mdx}' }),
	schema: z.object({
		title: z.string(),
		description: z.string(),
		date: z.coerce.date(),
		version: z.string().optional(),
		tags: z.array(z.string()).default([]),
		draft: z.boolean().default(false),
	}),
});

export const collections = { blog, docs, changelog };
