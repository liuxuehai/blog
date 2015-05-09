package com.summer.blog.web;

import java.io.BufferedReader;
import java.io.IOException;
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
			httppost.addHeader(heand);
			// 添加参数
			httppost.setEntity(new UrlEncodedFormEntity(params, HTTP.UTF_8));
			// 设置编码
			HttpResponse response = new DefaultHttpClient().execute(httppost);
			// 发送Post,并返回一个HttpResponse对象
			// Header header = response.getFirstHeader("Content-Length");
			// String Length=header.getValue();
			// 上面两行可以得到指定的Header
			if (response.getStatusLine().getStatusCode() == 200) {// 如果状态码为200,就是正常返回
				String result = EntityUtils.toString(response.getEntity());
				// 得到返回的字符串
				System.out.println(result);
				// 打印输出
				// 如果是下载文件,可以用response.getEntity().getContent()返回InputStream
			}
		} catch (Exception e) {
			// TODO: handle exception
		}

	}

}
