package com.summer.blog.web;

import org.apache.http.NameValuePair;
import org.apache.http.client.HttpClient;
import org.apache.http.cookie.Cookie;
import org.apache.http.impl.client.DefaultHttpClient;
import org.apache.http.message.BasicNameValuePair;

public class test2 {

	public static void main(String[] args) {
		// TODO Auto-generated method stub
		// HttpClientDemo demo = new HttpClientDemo();
		HttpClient client = new DefaultHttpClient();
		// 模拟登录页面
		PostMethod post = new PostMethod("http://www.casee.cn/mm/Index.ad");

		// demo.setHeaders(post);
		NameValuePair name = new BasicNameValuePair("account", "aaaa");
		NameValuePair pass = new BasicNameValuePair("password", "bbbb");
		post.setRequestBody(new NameValuePair[] { name, pass });
		int status = client.executeMethod(post);
		System.out.println(status);
		System.out.println(post.getResponseBodyAsString());
		post.releaseConnection();

		// 查看 cookie 信息
		Cookie[] cookies = client.getState().getCookies();
		if (cookies.length == 0) {
			System.out.println("None");
		} else {
			for (int i = 0; i < cookies.length; i++) {
				System.out.println(cookies[i].toString());
			}
			client.getState().addCookies(cookies);

		}
		// 访问所需的页面
		// http://www.baidu.com");如果访问别的网站能获取到脚本信息。
		GetMethod get = new GetMethod("http://www.casee.cn/mm/MySites.ad?_m=siteStatByData&startDate=2011-06-24&endDate=2011-06-26&issub=true&grouptype=ad&selectAd=All");
		get.getParams().setParameter(HttpMethodParams.SO_TIMEOUT, 3000);
		client.executeMethod(get);
		System.out.println(get.getResponseBodyAsString());
		get.releaseConnection();
	}
	
	$.ajax({ type: "post", 
		url: "/Wap/Seniorvote/support",
		 data: { 'vote_id': "58", 'user_id':"44871"
		
		}, 
		dataType: "json",  
		 success: function (data) 
		 { if(data.success==2)
		 	{ num += 1; $(".wtp_zc").html(num); 
		 	$(".zc_listnum").html(data.list_num);
		 	 $(".man_num").html(data.man_num); 
		 	} alert(data.msg); 
		 }, 
		 error:function(){
		  alert('ajax请求失败'); return false; 
		} 
	})

}
