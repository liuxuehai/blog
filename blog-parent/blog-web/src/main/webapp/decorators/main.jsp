<%@ page language="java" contentType="text/html; charset=utf-8" pageEncoding="utf-8"%>
<%@ page isELIgnored="false"%>
<%@ taglib prefix="c" uri="http://java.sun.com/jstl/core_rt"%>
<%@ taglib prefix="fmt" uri="http://java.sun.com/jstl/fmt_rt" %>
<%@ taglib prefix="html" uri="http://www.liuxuehai.com/tags/html"%>
<%@ taglib prefix="fn" uri="http://java.sun.com/jsp/jstl/functions"%>
<%@ taglib prefix="decorator" uri="http://www.opensymphony.com/sitemesh/decorator"%>

<!DOCTYPE html >
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title><decorator:title default="Summer" /></title>
<META HTTP-EQUIV="Pragma" CONTENT="no-cache"> 
<META HTTP-EQUIV="Cache-Control" CONTENT="no-cache"> 
<META HTTP-EQUIV="Expires" CONTENT="0"> 
<html:link rel="shortcut icon" href="static/images/favicon.ico"/>
<html:link href="static/foundation/5.4.0/css/foundation.min.css" />

<decorator:head />
</head>
<body>
	<div class="off-canvas-wrap" data-offcanvas>
		<div class="inner-wrap">
			<aside class="left-off-canvas-menu">
				<ul class="off-canvas-list">
					<li><a href="<%=request.getContextPath()%>">Home</a></li>
					<li><a href="<%=request.getContextPath()%>/shop">Shop</a></li>
					<li><a href="<%=request.getContextPath()%>/item">Item</a></li>
					<li><a href="<%=request.getContextPath()%>/spider">Spider</a></li>
					<li><a href="<%=request.getContextPath()%>/contact">Contact
							Us</a></li>
					<li><a href="<%=request.getContextPath()%>/about">About Us</a></li>
				</ul>

			</aside>
			<nav class="tab-bar show-for-small">
				<a class="left-off-canvas-toggle menu-icon "> <span>Summer</span>
				</a>
			</nav>
			<nav class="top-bar hide-for-small" data-topbar="">
				<ul class="title-area">
					<li class="name">
						<h1>
							<a href="<%=request.getContextPath()%>">Summer</a>
						</h1>
					</li>
				</ul>
				<section class="top-bar-section">
					<ul class="right">
						<li class="divider"></li>
						<li class=" not-click"><a
							href="<%=request.getContextPath()%>/shop" class="">Shop</a>
						<li class="divider"></li>
						<li class=" not-click"><a
							href="<%=request.getContextPath()%>/seller" class="">Seller </a>
						<li class="divider"></li>
						<li class=" not-click"><a
							href="<%=request.getContextPath()%>/item" class="">Item</a>
						<li class="divider"></li>
						<li class=" not-click"><a
							href="<%=request.getContextPath()%>/itemAttribute" class="">Item
								Attribute</a>
						<li class="divider"></li>
						<li class=" not-click"><a
							href="<%=request.getContextPath()%>/itemRate" class="">Item
								Rate</a>
						<li class="divider"></li>
						<li class=" not-click"><a
							href="<%=request.getContextPath()%>/itemTrade" class="">Item
								Trade</a>
						<li class="divider"></li>
						<li class=" not-click"><a
							href="<%=request.getContextPath()%>/spider" class="">Spider</a>
						<li class="divider"></li>
						<li class=" not-click"><a
							href="<%=request.getContextPath()%>/spiderLog" class="">Spider
								Log</a>
						<li class="divider"></li>
						<li class=" not-click"><a
							href="<%=request.getContextPath()%>/contact" class="">Contact
								Us</a>
						<li class="divider"></li>
						<li class=" not-click"><a
							href="<%=request.getContextPath()%>/about" class="">About Us</a>
						<li class="divider"></li>
					</ul>
				</section>
			</nav>

			<section class="main-section" style="min-height: 600px;">
				<div class="row">
					<decorator:body />
				</div>
			</section>

			<%@ include file="footer.jsp"%>
		</div>
	</div>
<html:script src="static/jquery/1.11.1/jquery.min.js"/>
<html:script src="static/foundation/5.4.0/js/foundation.min.js"/>
<html:script src="static/common/js/pagination.js"/>

<script>
  $(document).foundation();
</script>

<decorator:getProperty property="page.js" />
</body>
</html>