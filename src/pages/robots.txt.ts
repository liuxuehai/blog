import { SITE_URL } from "../consts";

export function GET({ site }: { site?: URL }) {
	const baseUrl = site ?? new URL(SITE_URL);
	const sitemapUrl = new URL("sitemap-index.xml", baseUrl);

	return new Response(
		[
			"User-agent: *",
			"Allow: /",
			`Sitemap: ${sitemapUrl.href}`,
			"",
		].join("\n"),
		{
			headers: {
				"Content-Type": "text/plain; charset=utf-8",
			},
		},
	);
}
