//name : 插件名
(function(){
  　　$.fn.pagination = function(options){
  　　　　// 自定义参数对象(插件自带) for example
  　　　　var defaults = {
  　　　　　　value1 : 'page',
  　　　　　　value2 : 'total',
	    fun:function(){}
  　　　　};
 　　    var opts = $.extend(defaults,options);    // 此处options为用户设置的参数对象(用户传参)
        // 实现插件的代码 bla bla bla
 　　    if(opts.total<=0){
 　　   	 return;
 　　    }
 　　    
 　　    var _this=this,page=opts.page,total=opts.total;
 　　       if(page==0||page==1){
 　　       	page=1;
 　　       	 _this.append("<li class='arrow unavailable' aria-disabled='true'><a href='javascript:void(0);'>&laquo;Previous</a></li>");
 　　       }else{
 　　      	 _this.append("<li class='arrow ' aria-disabled='true'><a class='pagination' href='javascript:void(0);' data-url='"+context+(page-1)+"'>&laquo;Previous</a></li>");
 　　       }
 　　       if(total<15){
 　　      	 for(var i=1;i<=total;i++){
 　　          	 if(page==i){
 　　          		 _this.append("<li class='current'><a class='pagination' href='javascript:void(0);' data-url='"+context+i+"'>"+i+"</a></li>");
 　　          	 }else{
 　　          		 _this.append("<li ><a class='pagination' href='javascript:void(0);' data-url='"+context+i+"'>"+i+"</a></li>");
 　　          	 }
 　　           }
 　　       }else{
 　　      	  if(page<5){
 　　      		 for(var i=1;i<6;i++){
 　　              	 if(page==i){
 　　              		 _this.append("<li class='current'><a class='pagination' href='javascript:void(0);' data-url='"+context+i+"'>"+i+"</a></li>");
 　　              	 }else{
 　　              		 _this.append("<li ><a class='pagination' href='javascript:void(0);' data-url='"+context+i+"'>"+i+"</a></li>");
 　　              	 }
 　　               }
 　　      		 _this.append("<li class='unavailable' aria-disabled='true'><a href='javascript:void(0);'>&hellip;</a></li>");
 　　      		 
 　　      		 for(var i=total-2;i<=total;i++){
 　　      			 _this.append("<li ><a class='pagination' href='javascript:void(0);' data-url='"+context+i+"'>"+i+"</a></li>");
 　　               }
 　　      	 }else if(page>(total-4)){
 　　      		 for(var i=1;i<4;i++){
 　　      			 _this.append("<li ><a class='pagination' href='javascript:void(0);' data-url='"+context+i+"'>"+i+"</a></li>");
 　　               }
 　　      		 _this.append("<li class='unavailable' aria-disabled='true'><a href='javascript:void(0);'>&hellip;</a></li>");
 　　      		 
 　　      		 for(var i=total-4;i<=total;i++){
 　　              	 if(page==i){
 　　              		 _this.append("<li class='current'><a class='pagination' href='javascript:void(0);' data-url='"+context+i+"'>"+i+"</a></li>");
 　　              	 }else{
 　　              		 _this.append("<li ><a class='pagination' href='javascript:void(0);' data-url='"+context+i+"'>"+i+"</a></li>");
 　　              	 }
 　　               }
 　　      	 } else{
 　　      		 for(var i=1;i<4;i++){
 　　      			 _this.append("<li ><a class='pagination' href='javascript:void(0);' data-url='"+context+i+"'>"+i+"</a></li>");
 　　               }
 　　      		 _this.append("<li class='unavailable' aria-disabled='true'><a href='javascript:void(0);'>&hellip;</a></li>");
 　　      		 
 　　      		 for(var i=(page-2<4?4:page-2);i<=page+2&&i<=total-3;i++){
 　　              	 if(page==i){
 　　              		 _this.append("<li class='current'><a class='pagination' href='javascript:void(0);' data-url='"+context+i+"'>"+i+"</a></li>");
 　　              	 }else{
 　　              		 _this.append("<li ><a class='pagination' href='javascript:void(0);' data-url='"+context+i+"'>"+i+"</a></li>");
 　　              	 }
 　　               }
 　　  			 _this.append("<li class='unavailable' aria-disabled='true'><a href='javascript:void(0);'>&hellip;</a></li>");
 　　  			 for(var i=total-2;i<=total;i++){
 　　  				 _this.append("<li ><a class='pagination' href='javascript:void(0);' data-url='"+context+i+"'>"+i+"</a></li>");
 　　               }
 　　      	 }
 　　       }
 　　       
 　　       if(page==total){
 　　      	 _this.append("<li class='arrow unavailable' aria-disabled='true'><a href='javascript:void(0);'>Next &raquo;</a></li>");
 　　       }else{
 　　      	 _this.append("<li class='arrow ' aria-disabled='true'><a class='pagination' href='javascript:void(0);' data-url='"+context+(page+1)+"'>Next &raquo;</a></li>");
 　　       }
 　　       
 　　       opts.fun(_this);
 　　      
     };
})(jQuery);