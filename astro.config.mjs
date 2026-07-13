// @ts-check

import starlight from '@astrojs/starlight';
import { defineConfig } from 'astro/config';

const site = process.env.SITE_URL ?? 'https://example.com';

// https://astro.build/config
export default defineConfig({
	site,
	integrations: [
		starlight({
			title: 'Knowledge',
			defaultLocale: 'zh-CN',
			customCss: ['./src/styles/starlight.css'],
			components: {
				PageTitle: './src/components/starlight/PageTitle.astro',
			},
			sidebar: [
				{
					label: 'Knowledge',
					items: [
						{ label: 'Overview', link: '/notes/' },
						{ label: 'AI', link: '/notes/ai/' },
						{
							label: 'Astro',
							items: [
								{ label: 'Overview', link: '/notes/astro/' },
								{ label: '为什么选择 Astro', link: '/notes/astro/why-astro/' },
								{
									label: 'Starlight Knowledge 模块',
									link: '/notes/astro/starlight-knowledge-module/',
								},
							],
						},
						{
							label: 'Cloudflare',
							items: [
								{ label: 'Overview', link: '/notes/cloudflare/' },
								{
									label: 'Astro 部署到 Pages',
									link: '/notes/cloudflare/astro-cloudflare-pages/',
								},
								{
									label: '安全响应头与缓存',
									link: '/notes/cloudflare/pages-headers-cache/',
								},
							],
						},
						{ label: 'Frontend', link: '/notes/frontend/' },
						{ label: 'Backend', link: '/notes/backend/' },
						{ label: 'Database', link: '/notes/database/' },
						{ label: 'DevOps', link: '/notes/devops/' },
						{ label: 'Linux', link: '/notes/linux/' },
					],
				},
			],
		}),
	],
});
