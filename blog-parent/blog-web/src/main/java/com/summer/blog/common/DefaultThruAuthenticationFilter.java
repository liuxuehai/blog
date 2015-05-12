/**
 * Copyright (c) 2011-2014 All Rights Reserved.
 */
package com.summer.blog.common;

import java.io.IOException;
import java.net.URLEncoder;
import java.util.Map;

import javax.servlet.ServletRequest;
import javax.servlet.ServletResponse;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;

import org.apache.commons.lang3.StringUtils;
import org.apache.shiro.subject.Subject;
import org.apache.shiro.web.filter.authc.AuthenticationFilter;
import org.apache.shiro.web.util.WebUtils;


/**
 * shiro 认证过滤<br>
 *
 * @author xavier
 * @version $Id: DefaultThruAuthenticationFilter.java 2014年11月29日 下午7:06:15 $
 */
public class DefaultThruAuthenticationFilter extends AuthenticationFilter {

	@Override
	protected boolean isAccessAllowed(ServletRequest request, ServletResponse response, Object mappedValue) {
		Subject subject = getSubject(request, response);
		boolean isAuthenticated = subject.isAuthenticated();
		if (!isAuthenticated) {
			return false;
		}

		return true;
	}

	@Override
	protected boolean onAccessDenied(ServletRequest request, ServletResponse response) throws Exception {

		if (isLoginRequest(request, response)) {
			return true;
		}

		if (isJsonRequest(request)) {
			HttpServletResponse httpServletResponse = (HttpServletResponse) response;
			String content = String.format("{\"code\":\"%d\",\"error\":\"会话已经过期\"}", HttpServletResponse.SC_FORBIDDEN);
			WebUtil.toResponse(httpServletResponse, content);
		} else {
			saveRequestAndRedirectToLogin(request, response);
		}
		return false;
	}

	@Override
	protected void redirectToLogin(ServletRequest request, ServletResponse response) throws IOException {
		Map<?, ?> params = request.getParameterMap();
		String[] keys = params.keySet().toArray(new String[0]);
		StringBuilder query = new StringBuilder();
		for (String key : keys) {
			Object value = request.getParameter(key);
			if (null == value) {
				value = "";
			}
			query.append(key).append("=").append(value).append("&");
		}
		if (query.length() >= 1) {
			query = query.deleteCharAt(query.lastIndexOf("&"));
			query.insert(0, "?");
		}

		String uri = ((HttpServletRequest) request).getServletPath().toString() + query.toString();
		String loginUrl = getLoginUrl() + "?" + Constants.GOTO_KEY + "=" + URLEncoder.encode(uri, "UTF-8");
		WebUtils.issueRedirect(request, response, loginUrl);
	}

	/**
	 * 是否是Json请求
	 * 
	 * @param request
	 *            Http请求
	 * @return 是则返回<code>TRUE</code>
	 */
	public final boolean isJsonRequest(ServletRequest request) {
		HttpServletRequest req = (HttpServletRequest) request;
		String requestedWith = req.getHeader("X-Requested-With");
		if (StringUtils.equalsIgnoreCase(requestedWith, "XMLHttpRequest")) {
			return true;
		}

		String requestUri = req.getRequestURI();
		if (StringUtils.endsWithIgnoreCase(requestUri, ".json") || StringUtils.endsWithIgnoreCase(requestUri, ".jsonp")) {
			return true;
		}

		return false;
	}

}
