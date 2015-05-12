package com.summer.blog.security;

import org.apache.shiro.authc.AuthenticationException;
import org.apache.shiro.authc.AuthenticationInfo;
import org.apache.shiro.authc.AuthenticationToken;
import org.apache.shiro.authc.SimpleAuthenticationInfo;
import org.apache.shiro.realm.AuthenticatingRealm;
import org.springframework.stereotype.Component;

import com.summer.blog.security.domain.UserToken;

/**
 * 
 *
 *
 * @author 625289
 * @version $Id: DefaultUserRealm.java 2015年5月12日 下午3:34:08 $
 * @since 1.0.0
 */
@Component("userRealm")
public class DefaultUserRealm extends AuthenticatingRealm {

	@Override
	protected AuthenticationInfo doGetAuthenticationInfo(AuthenticationToken token) throws AuthenticationException {
		UserToken userToken = (UserToken) token;

		String username = userToken.getUserName();

		return new SimpleAuthenticationInfo(username, userToken.getPassword(), getName());
	}

	@SuppressWarnings("rawtypes")
	@Override
	public Class getAuthenticationTokenClass() {
		return UserToken.class;
	}

}
