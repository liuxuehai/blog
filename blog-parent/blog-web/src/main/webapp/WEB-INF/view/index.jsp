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

a:link {
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
.mod_feed {position: relative;
margin-bottom: 40px;
background: #fff;
width: 585px;
padding: 20px;
box-shadow: 0 0 4px #CCC;}
.feed_hd h3{ font: 24px microsoft yahei;
margin-bottom: 16px;color: #693C29;}
.feed_bd{width: 585px;
overflow: hidden;
position: relative;}
</style>


</head>
<body>

	<div class="n-header ">
		<h1>
			<a class="n_linkc" href="<%=request.getContextPath()%>"
				title="Summer">Summer</a>
		</h1>
	</div>
	
	<div class="row">
	   <div class="large-3 medium-4 columns">
	     <div class="avatar">
			<a href="<%=request.getContextPath()%>"> <img alt="Summer"
				src="http://tp3.sinaimg.cn/1951657750/180/5643174354/0">
			</a>
		</div>
	   </div>
	   <div class="large-9 medium-8 columns">
	       <div class="row">
	           <div class="mod_feed mod_feed_text">
	              <div  >
	                 <div class="feed_hd" >
	                    <h3 class="q_linkd q_txtd">
	                       <a href="http://qing.blog.sina.com.cn/1951657750/7453ef16330037hv.html">
	                                                                                   晒昔日的“散片”记录</a>
	                    </h3>
	                 </div>
	                 <div class="feed_bd">
	                    <div>你的相机里，</div>
	                 </div>
	                 <div class="feed_ft">
						<div class="feed_tag clearfix q_linkc">
							<div class="tags">
									<div class="con">
										<b class="q_ico q_ico_tag" title="标签">标签：</b>
										<a href="http://qing.blog.sina.com.cn/tag/%E6%95%A3%E7%89%87" title="散片" target="_blank">散片</a>
										<a href="http://qing.blog.sina.com.cn/tag/Qing%E8%AF%9D%E9%A2%98" title="Qing话题" target="_blank">Qing话题</a>
									</div>
							</div>
							<div class="feed_more">
							<a href="http://qing.blog.sina.com.cn/1951657750/7453ef16330037hv.html">查看全文</a>
							</div>
						</div>
						<div class="feed_act q_linkc clearfix">
                            <div class="time q_txtb">2013-03-13 16:37</div>
							<div class="pubFeedAttr">
							 <ul>
								<li class="reshare"><a href="/reblog/1951657750/7453ef16330037hv" target="_blank"><span class="icon" title="转载"></span><span class="count" id="reblogCount_7453ef16330037hv">11</span></a></li>
								<li class="cmt"><a href="http://qing.blog.sina.com.cn/1951657750/7453ef16330037hv.html#comments"><span class="icon" title="评论"></span><span class="count" id="cmsCount_7453ef16330037hv">175</span></a></li>
								<li class="edit"><a id="editBtn_7453ef16330037hv" style="display:none" href="/edit/7453ef16330037hv/3"><span class="icon" title="编辑"></span></a></li>
								<li class="del"><a id="delBtn_7453ef16330037hv" style="display:none" onclick="scope.deleteQing &amp;&amp; scope.deleteQing('7453ef16330037hv', '7453ef16330037hv');return false;" href="javascript:void(0)"><span class="icon" title="删除"></span></a></li>
							 </ul>
						   </div>									
						</div>
					</div>
	              </div>
	             
	           </div>
	       </div>
	   </div>
	</div>


	<content tag="js">
	 <script type="text/javascript">
		$(document).ready(function() {

			console.log("eeee");
		})
	</script> </content>
</body>
</html>