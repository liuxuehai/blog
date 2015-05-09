package com.summer.blog.web;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.PrintWriter;
import java.net.URL;
import java.net.URLConnection;
import java.util.ArrayList;
import java.util.List;

import org.apache.http.Header;
import org.apache.http.HttpResponse;
import org.apache.http.NameValuePair;
import org.apache.http.client.entity.UrlEncodedFormEntity;
import org.apache.http.client.methods.HttpPost;
import org.apache.http.cookie.Cookie;
import org.apache.http.impl.client.DefaultHttpClient;
import org.apache.http.message.BasicHeader;
import org.apache.http.message.BasicNameValuePair;
import org.apache.http.protocol.HTTP;
import org.apache.http.util.EntityUtils;

public class test {
	public static String sendPost(String url, String param) {
		PrintWriter out = null;
		BufferedReader in = null;
		String result = "";
		try {
			URL realUrl = new URL(url);
			// 打开和URL之间的连接
			URLConnection conn = realUrl.openConnection();
			// 设置通用的请求属性
			conn.setRequestProperty("accept", "*/*");
			conn.setRequestProperty("connection", "Keep-Alive");
			conn.setRequestProperty("user-agent", "Mozilla/5.0 (Linux; Android 4.2.1; en-us; Nexus 5 Build/JOP40D) AppleWebKit/535.19 (KHTML, like Gecko) Chrome/18.0.1025.166 Mobile Safari/535.19");
			// 发送POST请求必须设置如下两行
			conn.setDoOutput(true);
			conn.setDoInput(true);
			// 获取URLConnection对象对应的输出流
			out = new PrintWriter(conn.getOutputStream());
			// 发送请求参数
			out.print(param);
			// flush输出流的缓冲
			out.flush();
			// 定义BufferedReader输入流来读取URL的响应
			in = new BufferedReader(new InputStreamReader(conn.getInputStream()));
			String line;
			while ((line = in.readLine()) != null) {
				result += line;
			}
		} catch (Exception e) {
			System.out.println("发送 POST 请求出现异常！" + e);
			e.printStackTrace();
		}
		// 使用finally块来关闭输出流、输入流
		finally {
			try {
				if (out != null) {
					out.close();
				}
				if (in != null) {
					in.close();
				}
			} catch (IOException ex) {
				ex.printStackTrace();
			}
		}
		return result;
	}

	@SuppressWarnings("deprecation")
	public static void main(String[] args) {
		// 发送 POST 请求
//		String sr = test.sendPost("http://scrm.weizaojiao.cn/Wap/Seniorvote/support", "vote_id=590&user_id=44871");
//		System.out.println(sr);

		// TODO Auto-generated method stub
		String url = "http://scrm.weizaojiao.cn/Wap/Seniorvote/support";
		try {
			// POST的URL
			HttpPost httppost = new HttpPost(url);
			// 建立HttpPost对象
			List<NameValuePair> params = new ArrayList<NameValuePair>();
			// 建立一个NameValuePair数组，用于存储欲传送的参数
			params.add(new BasicNameValuePair("vote_id", "58"));
			params.add(new BasicNameValuePair("user_id", "44871"));
			String cookie="pgv_pvi=7934013440; RK=bHtKG6J9Vf; pt2gguin=o0453923278; ptcz=4a10bb7f6dfc9c0174064bfb7c0942bddb13b1145b08cdeee023e24da9eba11f; o_cookie=453923278; pgv_pvid=1571263668; wxstaytime=1431089169_expired; webwx_data_ticket=AQYry355UZyHzT4SisuLXWvG";
			Header heand=new BasicHeader("Cookie",cookie);
			
			httppost.setHeader("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8");
			//httppost.setHeader("Accept-Encoding", "gzip, deflate, sdch");
			httppost.setHeader("Accept-Language", "zh-CN,zh;q=0.8");
			httppost.setHeader("Connection", "keep-alive");
			httppost.setHeader("Cookie", "_gscu_661903259=24940550xr53y878; o_cookie=453923278; pt2gguin=o0453923278; RK=vHsCX4JtQd; ptcz=117c2706f2dfa0ceac7401788104d04b269fe82d2ffd31b5101e0c7fc120c170; wxstaytime=1431139029; pgv_pvi=832198656; pgv_si=s4821107712; pgv_info=ssid=s1912661770; ts_last=weixin.qq.com/; ts_refer=www.baidu.com/link; pgv_pvid=3241251616; ts_uid=799176880; webwx_data_ticket=AQaexL5+QhbNoBZONxhtxVBa");
		    httppost.setHeader("Host", "scrm.weizaojiao.cn");
			httppost.setHeader("Referer", "http://scrm.weizaojiao.cn/wap/seniorvote/index/id/58/token/fsjvpw1430818657/uid/44871.html?from=timeline&isappinstalled=1");
			httppost.setHeader("User-Agent", "Mozilla/5.0 (Linux; Android 4.2.1; en-us; Nexus 5 Build/JOP40D) AppleWebKit/535.19 (KHTML, like Gecko) Chrome/18.0.1025.166 Mobile Safari/535.19");
			
			
			
			//httppost.addHeader(heand);
			// 添加参数
			httppost.setEntity(new UrlEncodedFormEntity(params, "UTF-8"));
			// 设置编码
			HttpResponse response = new DefaultHttpClient().execute(httppost);
			// 发送Post,并返回一个HttpResponse对象
			// Header header = response.getFirstHeader("Content-Length");
			// String Length=header.getValue();
			// 上面两行可以得到指定的Header
//			if (response.getStatusLine().getStatusCode() == 200) {// 如果状态码为200,就是正常返回
//				String result = EntityUtils.toString(response.getEntity());
//				// 得到返回的字符串
//				System.out.println(result);
//				// 打印输出
//				// 如果是下载文件,可以用response.getEntity().getContent()返回InputStream
//			}
			    InputStream inStream =     response.getEntity().getContent();  
	            BufferedReader reader = new BufferedReader(new InputStreamReader(inStream,"utf-8"));    
	            StringBuilder strber = new StringBuilder();    
	            String line = null;    
	            while ((line = reader.readLine()) != null)     
	                strber.append(line + "\n");    
	            inStream.close();    
	            if (response.getStatusLine().getStatusCode() == 200) {    
	            	System.out.println(strber);
	  
	            }    
		} catch (Exception e) {
			// TODO: handle exception
		}

	}
	
	
	
	/*$.ajax({ type: "post", 
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
	})*/

}
