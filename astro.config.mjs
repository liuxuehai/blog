// @ts-check

import starlight from '@astrojs/starlight';
import { defineConfig } from 'astro/config';

const site = process.env.SITE_URL ?? 'https://me.983768.xyz';
const githubUrl = 'https://github.com/liuxuehai/blog';

// https://astro.build/config
export default defineConfig({
	site,
	integrations: [
		starlight({
			title: 'Max / Knowledge',
			description: 'Max 的技术笔记与工程实践。',
			defaultLocale: 'root',
			locales: {
				root: { label: '简体中文', lang: 'zh-CN' },
				en: { label: 'English', lang: 'en' },
			},
			pagination: false,
			disable404Route: true,
			favicon: '/favicon.svg',
			social: [{ icon: 'github', label: 'GitHub', href: githubUrl }],
			editLink: {
				baseUrl: `${githubUrl}/edit/main/src/content/docs/`,
			},
			head: [
				{
					tag: 'meta',
					attrs: {
						property: 'og:image',
						content: `${site}/og-default.png`,
					},
				},
				{
					tag: 'meta',
					attrs: {
						name: 'twitter:card',
						content: 'summary_large_image',
					},
				},
				{
					tag: 'meta',
					attrs: {
						name: 'twitter:image',
						content: `${site}/og-default.png`,
					},
				},
			],
			customCss: ['./src/styles/starlight.css'],
			components: {
				PageTitle: './src/components/starlight/PageTitle.astro',
			},
			sidebar: [
				{
					label: 'Main site',
					items: [
						{ label: 'Home', link: '/' },
						{ label: 'Blog', link: '/blog/' },
						{ label: 'Projects', link: '/projects/' },
						{ label: 'About', link: '/about/' },
					],
				},
				{
					label: 'Knowledge',
					items: [{ autogenerate: { directory: 'notes', collapsed: true } }],
				},
			],
		}),
	],
});
