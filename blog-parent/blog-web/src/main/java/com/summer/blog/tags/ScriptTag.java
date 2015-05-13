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
 * @version $Id: ScriptTag.java 2015年5月13日 下午2:50:04 $
 * @since 1.0.0
 */
public class ScriptTag  extends HtmlTag  {
	private String type;
	private String src;
	private String id;
	private String defer;
	private String charset;
	private String async;

	@Override
	public void doTag() throws JspException, IOException {
		StringBuilder sb = new StringBuilder();

		sb.append("<script");

		sb.append(buildAttr("type", type));
		sb.append(buildAttr("src", getSourcePrefix() + src + getSourceSuffix(src)));
		sb.append(buildAttr("id", id));
		sb.append(buildAttr("defer", defer));
		sb.append(buildAttr("charset", charset));
		sb.append(buildAttr("async", async));

		sb.append("></script>");

		JspWriter out = getJspContext().getOut();
		out.print(sb.toString());
	}

	public void setType(String type) {
		this.type = type;
	}

	public void setSrc(String src) {
		this.src = src;
	}

	public void setId(String id) {
		this.id = id;
	}

	public void setDefer(String defer) {
		this.defer = defer;
	}

	public void setCharset(String charset) {
		this.charset = charset;
	}

	public void setAsync(String async) {
		this.async = async;
	}
}
