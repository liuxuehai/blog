/**
 * Copyright (c) 2011-2015 All Rights Reserved.
 */
package com.summer.blog.tags;

import java.io.IOException;

import javax.servlet.jsp.JspException;
import javax.servlet.jsp.JspWriter;


/**
 *
 *
 * @author 625289
 * @version $Id: LinkTag.java 2015年5月13日 下午2:50:16 $
 * @since 1.0.0
 */
public class LinkTag  extends HtmlTag{
	private String rel = "stylesheet";
	private String href;
	private String id;
	private String media;

	@Override
	public void doTag() throws JspException, IOException {
		StringBuilder sb = new StringBuilder();

		sb.append("<link");

		sb.append(buildAttr("rel", rel));
		sb.append(buildAttr("href", getSourcePrefix() + href + getSourceSuffix(href)));
		sb.append(buildAttr("id", id));
		sb.append(buildAttr("media", media));

		sb.append(" />");

		JspWriter out = getJspContext().getOut();
		out.print(sb.toString());
	}

	public void setRel(String rel) {
		this.rel = rel;
	}

	public void setHref(String href) {
		this.href = href;
	}

	public void setId(String id) {
		this.id = id;
	}

	public void setMedia(String media) {
		this.media = media;
	}
}
