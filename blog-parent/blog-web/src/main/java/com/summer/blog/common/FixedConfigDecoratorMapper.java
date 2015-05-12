package com.summer.blog.common;

import java.lang.reflect.Field;

import javax.servlet.ServletException;
import javax.servlet.http.HttpServletRequest;

import com.opensymphony.module.sitemesh.Decorator;
import com.opensymphony.module.sitemesh.Page;
import com.opensymphony.module.sitemesh.mapper.ConfigDecoratorMapper;
import com.opensymphony.module.sitemesh.mapper.ConfigLoader;

/**
 * 修复 sitemesh 部署在 weblogic 的路径匹配问题
 */
public class FixedConfigDecoratorMapper extends ConfigDecoratorMapper {

	public Decorator getDecorator(HttpServletRequest request, Page page) {

		String thisPath = request.getServletPath();

		if (thisPath == null) {
			String requestURI = request.getRequestURI();
			if (request.getPathInfo() != null) {
				thisPath = requestURI.substring(0, requestURI.indexOf(request.getPathInfo()));
			} else {
				thisPath = requestURI;
			}
		} else if ("".equals(thisPath)) {
			thisPath = request.getPathInfo();
		} else if (thisPath.endsWith(".jsp")) {
			// weblogic将输入的url转换成实际的JSP
			String contextPath = request.getContextPath();
			String requestURI = request.getRequestURI();
			thisPath = requestURI.substring(contextPath.length());
		}

		String name = null;
		try {
			ConfigLoader configLoader = (ConfigLoader) getValueByFieldName(this, "configLoader");
			name = configLoader.getMappedName(thisPath);
		} catch (ServletException e) {
			e.printStackTrace();
		} catch (Exception e) {
			e.printStackTrace();
		}

		Decorator result = getNamedDecorator(request, name);
		return ((result == null) ? super.getDecorator(request, page) : result);
	}

	public static Field getFieldByFieldName(Object obj, String fieldName) {
		for (Class<?> superClass = obj.getClass(); superClass != Object.class; superClass = superClass.getSuperclass()) {
			try {
				return superClass.getDeclaredField(fieldName);
			} catch (NoSuchFieldException e) {
			}
		}
		return null;
	}

	public static Object getValueByFieldName(Object obj, String fieldName) throws SecurityException, NoSuchFieldException, IllegalArgumentException,
			IllegalAccessException {
		Field field = getFieldByFieldName(obj, fieldName);
		Object value = null;
		if (field != null) {
			if (field.isAccessible()) {
				value = field.get(obj);
			} else {
				field.setAccessible(true);
				value = field.get(obj);
				field.setAccessible(false);
			}
		}
		return value;
	}

}
