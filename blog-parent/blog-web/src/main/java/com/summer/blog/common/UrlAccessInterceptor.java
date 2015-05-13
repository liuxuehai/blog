/**
 * Copyright (c) 2011-2014 All Rights Reserved.
 */
package com.summer.blog.common;

import java.util.HashSet;
import java.util.Set;

import javax.annotation.Resource;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;

import org.apache.commons.lang3.StringUtils;
import org.springframework.web.servlet.handler.HandlerInterceptorAdapter;


/**
 *
 * @author 610273
 * @version $Id: UrlAccessInterceptor.java 2014年11月27日 下午6:37:38 $
 */
public class UrlAccessInterceptor extends HandlerInterceptorAdapter {
    
    private static final String INVALID_AUTH_PATH = "authc.htm";
    private static Set<String> catchSet = new HashSet<String>(){   
        private static final long serialVersionUID = 1L;
        {
            add("apply/submitapply.htm");
            add("withdraw/withdraw.htm");
            add("memberprod/complete.htm");
            add("passwordfind/loginIdReset.htm");
            add("passwordfind/emailCheck.htm");
            add("passwordfind/toCheckStrategy.htm");
            add("passwordfind/checkStrategy.htm");
            add("passwordfind/resetLoginPwd.htm");
            add("security/modifyQueryPwd.htm");
            add("security/modifyStrategy.htm");
            add("bank/add.htm");
            add("bank/update.htm");
            add("bank/updateStatus.htm");
            add("bank/delete.htm");
        }
    };
    
    
    /** 
     * @see org.springframework.web.servlet.handler.HandlerInterceptorAdapter#preHandle(javax.servlet.http.HttpServletRequest, javax.servlet.http.HttpServletResponse, java.lang.Object)
     */
    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) throws Exception {
        return super.preHandle(request, response, handler);
    }
    
}
