/**
 * Copyright (c) 2011-2015 All Rights Reserved.
 */
package com.summer.blog.tags;

import javax.servlet.http.HttpServletRequest;
import javax.servlet.jsp.PageContext;
import javax.servlet.jsp.tagext.SimpleTagSupport;

/**
 *
 *
 * @author 625289
 * @version $Id: HtmlTag.java 2015年5月13日 下午2:52:18 $
 * @since 1.0.0
 */
public abstract class HtmlTag extends SimpleTagSupport{
	private static String APP_VERSION = "0.0.23";

	/**
	 * 获取静态资源前缀
	 */
	public String getSourcePrefix() {
		PageContext pageContext = (PageContext) getJspContext();
		HttpServletRequest request = (HttpServletRequest) pageContext.getRequest();
		return request.getContextPath() + "/";
	}

	/**
	 * 获取静态资源后缀
	 */
	public String getSourceSuffix(String src) {
		StringBuilder sb = new StringBuilder();
		sb.append(src.contains("?") ? "&" : "?");
		sb.append("v=");
		sb.append(APP_VERSION);
		return sb.toString();
	}

	/**
	 * 构建属性键值串
	 * 
	 * @param attrName
	 *            属性名
	 * @param attrValue
	 *            属性值
	 * @return attrName="attrValue"
	 */
	public String buildAttr(String attrName, String attrValue) {
		if (attrValue == null) {
			return "";
		}

		return " " + attrName + "=\"" + attrValue + "\"";
	}
}
