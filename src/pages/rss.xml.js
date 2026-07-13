import rss from '@astrojs/rss';
import { SITE_AUTHOR, SITE_DESCRIPTION, SITE_TITLE } from '../consts';
import { getCategoryLabel, getPostUrl, getPublishedPosts } from '../lib/content';

export async function GET(context) {
	const posts = await getPublishedPosts();
	return rss({
		title: SITE_TITLE,
		description: SITE_DESCRIPTION,
		site: context.site,
		items: posts.map((post) => {
			const categories = Array.from(
				new Set([getCategoryLabel(post.data.category), ...post.data.tags]),
			);

			return {
				title: post.data.title,
				description: post.data.description,
				pubDate: post.data.pubDate,
				link: getPostUrl(post),
				author: SITE_AUTHOR,
				categories,
			};
		}),
	});
}
