<%@ page language="java" contentType="text/html; charset=utf-8"
	pageEncoding="utf-8"%>
<%@ page isELIgnored="false"%>
<%@ taglib prefix="c" uri="http://java.sun.com/jstl/core_rt"%>
<%@ taglib prefix="fmt" uri="http://java.sun.com/jstl/fmt_rt"%>
<%@ taglib prefix="fn" uri="http://java.sun.com/jsp/jstl/functions"%>
<%@ taglib prefix="decorator"
	uri="http://www.opensymphony.com/sitemesh/decorator"%>

<!DOCTYPE html >
<html lang="zh-CN">
<head>
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
<title></title>

<style type="text/css">
.n-header {
	margin: 35px auto 0;
	height: 78px;
}

.n-header h1 {
	border-bottom: 1px solid #b18156;
	height: 77px;
}

a.n_linkc {
	color: #693C29;
}

.n-sub {
	width: 214px;
	position: absolute;
	top: 225px;
	left: 50%;
	margin-left: -500px;
}

.avatar {
	width: 142px;
	height: 142px;
	padding: 10px;
	background: #fff;
	box-shadow: 0 0 3px #ccc;
}

.n-content {
	width: 785px;
	padding-left: 215px;
	margin: 0 auto;
}
</style>


</head>
<body>

	<div class="n-header ">
		<h1>
			<a class="n_linkc" href="<%=request.getContextPath()%>"
				title="Summer">Summer</a>
		</h1>
	</div>
	<%-- <div class="n-sub">
		<div class="avatar">
			<a href="<%=request.getContextPath()%>"> <img alt="Summer"
				src="http://tp3.sinaimg.cn/1951657750/180/5643174354/0">
			</a>
		</div>
	</div>
	<div class="n-content">
		<div class="row">
			<div class="mod_feed mod_feed_text">
				<div class="feed_inner">
					<div class="feed_hd">
						<h3 class="q_linkd q_txtd">
							<a
								href="http://qing.blog.sina.com.cn/1951657750/7453ef16330037hv.html">晒昔日的“散片”记录</a>
						</h3>
						<div class="like">
							<a href="javascript:void(0)" onclick="return false" title="喜欢"><span
								class="icon" title="喜欢"><em>+1</em></span><span class="count"
								id="like_7453ef16330037hv" blogid="7453ef16330037hv">161</span></a>
						</div>
						<div class="q_ico feed_type">
							<a title="图片"
								href="http://qing.blog.sina.com.cn/1951657750/7453ef16330037hv.html"
								class="type"></a>
						</div>
					</div>
					<div class="feed_bd">

						<div class="feed_rich_content q_linkb">
							<div>
								<a
									href="http://qing.blog.sina.com.cn/1951657750/7453ef16330037hv.html"
									title="晒昔日的“散片”记录"><div class="img">
										<img alt="晒昔日的“散片”记录"
											src="http://ww2.sinaimg.cn/mw600/7453ef16jw1e2o86xsmt9j.jpg">
									</div></a>
							</div>
							<div></div>
							<div>你的相机里，</div>
							<div>总有一些无法归类的记忆。</div>
							<div>也许是一位只有一面之缘的陌生人，</div>
							<div>也许是旅途中一道无法言说的风景，</div>
							<div>也许是心底一丝无法抵触的悸动。</div>
							<div>拍摄的初衷不是有意为之，</div>
							<div>只是偶然，</div>
							<div>偶然中因拍摄冲动而产生的热情杰作而已。</div>
							<div></div>
							<div>
								<strong>征稿要求</strong>：1. 来自你的摄影原创
							</div>
							<div>&nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp;
								&nbsp; &nbsp; 2. 来自你心底那丝小清新式的文艺。</div>
							<div>&amp;n</div>
							<div></div>
							<div>
								<div>
									<a
										title="http://qing.weibo.com/blog/controllers/post.php?type=text&amp;tag=sanpian"
										href="http://t.cn/zY1k2zB" target="_blank"></a>
								</div>
								<div>
									<a title="http://qing.weibo.com/tag/%E6%95%A3%E7%89%87"
										href="http://t.cn/zY8Gscy" target="_blank"></a>
								</div>
							</div>
						</div>

					</div>
					<div class="feed_ft">
						<div class="feed_tag clearfix q_linkc">
							<div class="tags">
								<div class="con">
									<b class="q_ico q_ico_tag" title="标签">标签：</b> <a
										href="http://qing.blog.sina.com.cn/tag/%E6%95%A3%E7%89%87"
										title="散片" target="_blank">散片</a> <a
										href="http://qing.blog.sina.com.cn/tag/Qing%E8%AF%9D%E9%A2%98"
										title="Qing话题" target="_blank">Qing话题</a>
								</div>
							</div>
							<div class="feed_more">
								<a
									href="http://qing.blog.sina.com.cn/1951657750/7453ef16330037hv.html">查看全文</a>
							</div>
						</div>
						<div class="feed_act q_linkc clearfix">
							<div class="time q_txtb">2013-03-13 16:37</div>
							<div class="pubFeedAttr">
								<ul>
									<li class="reshare"><a
										href="/reblog/1951657750/7453ef16330037hv" target="_blank"><span
											class="icon" title="转载"></span><span class="count"
											id="reblogCount_7453ef16330037hv">11</span></a></li>
									<li class="cmt"><a
										href="http://qing.blog.sina.com.cn/1951657750/7453ef16330037hv.html#comments"><span
											class="icon" title="评论"></span><span class="count"
											id="cmsCount_7453ef16330037hv">175</span></a></li>
									<li class="edit"><a id="editBtn_7453ef16330037hv"
										style="display: none" href="/edit/7453ef16330037hv/3"><span
											class="icon" title="编辑"></span></a></li>
									<li class="del"><a id="delBtn_7453ef16330037hv"
										style="display: none"
										onclick="scope.deleteQing &amp;&amp; scope.deleteQing('7453ef16330037hv', '7453ef16330037hv');return false;"
										href="javascript:void(0)"><span class="icon" title="删除"></span></a></li>
								</ul>
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>

	</div> --%>
	
	
	<div class="row">
	   <div class="large-3 medium-4 columns"></div>
	   <div class="large-9 medium-8 columns"></div>
	</div>


	<content tag="js"> <script type="text/javascript">
		$(document).ready(function() {

			console.log("eeee");
		})
	</script> </content>
</body>
</html>