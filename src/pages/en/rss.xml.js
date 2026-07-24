import rss from '@astrojs/rss';
import { SITE_AUTHOR, SITE_TITLE } from '../../consts';
import { getPostUrl, getPublishedPosts } from '../../lib/content';

export async function GET(context) {
	const posts = await getPublishedPosts();
	return rss({
		title: `${SITE_TITLE} (English)`,
		description: 'English RSS feed for Max\'s blog',
		site: context.site,
		items: posts.map((post) => {
			// Use English title/description if available, else fallback to Chinese
			const title = post.data.titleEn ?? post.data.title;
			const description = post.data.descriptionEn ?? post.data.description;

			return {
				title,
				description,
				pubDate: post.data.pubDate,
				link: `/en${getPostUrl(post)}`,
				author: SITE_AUTHOR,
				categories: post.data.tags,
			};
		}),
	});
}
