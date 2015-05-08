package com.summer.blog.web;

import org.springframework.context.annotation.Scope;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestMethod;

@Controller
@Scope("prototype")
public class IndexController {

	@RequestMapping(value = { "/index.html","/index"}, method = RequestMethod.GET)
	public String index(Model model) {
		return "index";
	}

}
