package com.summer.blog.web;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Scope;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestMethod;

@Controller
@Scope("prototype")
public class IndexController {
	
	private Logger log = LoggerFactory.getLogger(getClass());

	@RequestMapping(value = { "/index.html",""}, method = RequestMethod.GET)
	public String index(Model model) {
		log.info("index ");
		return "index";
	}

}
