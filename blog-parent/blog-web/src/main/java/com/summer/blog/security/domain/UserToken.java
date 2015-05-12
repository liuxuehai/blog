package com.summer.blog.security.domain;

import org.apache.shiro.authc.AuthenticationToken;
/**
 * 
 *
 *
 * @author 625289
 * @version $Id: UserToken.java 2015年5月12日 下午3:33:25 $
 * @since 1.0.0
 */
public class UserToken implements AuthenticationToken {

	private static final long serialVersionUID = 4187280546437633947L;

	/**
	 * 用户名
	 */
	private String userName;

	/**
	 * 密码
	 */
	private String password;

	/**
	 * @param userName
	 * @param password
	 */
	public UserToken(String userName, String password) {
		this.userName = userName;
		this.password = password;
	}

	@Override
	public Object getPrincipal() {
		return this.userName;
	}

	@Override
	public Object getCredentials() {
		return this.password;
	}

	public String getUserName() {
		return userName;
	}

	public void setUserName(String userName) {
		this.userName = userName;
	}

	public String getPassword() {
		return password;
	}

	public void setPassword(String password) {
		this.password = password;
	}

	@Override
	public String toString() {
		return "UserToken [userName=" + userName + ", password=" + password + "]";
	}
}
