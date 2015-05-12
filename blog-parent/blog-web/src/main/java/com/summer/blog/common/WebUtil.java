/**
 * Copyright (c) 2011-2014 All Rights Reserved.
 */
package com.summer.blog.common;

import java.io.IOException;
import java.io.PrintWriter;

import javax.servlet.http.HttpServletResponse;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * 工具类
 *
 * @author xavier
 * @version $Id: WebUtil.java 2014年9月4日 下午9:01:52 $
 */
public final class WebUtil {

	private static final Logger log = LoggerFactory.getLogger(WebUtil.class);


	public static Object toResponse(HttpServletResponse response, String content) {
		response.setContentType("text/plain");
		response.setCharacterEncoding("UTF-8");
		PrintWriter writer = null;
		try {
			writer = response.getWriter();
			writer.write(content);
		} catch (IOException e1) {
			if (log.isDebugEnabled()) {
				log.debug("系统异常", e1);
			}
		} finally {
			if (null != writer) {
				writer.flush();
				writer.close();
			}
		}
		return null;
	}

}
