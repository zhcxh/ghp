'use strict'

let 屏蔽爬虫UA = ['netcraft'];

// 前缀，如果自定义路由为example.com/gh/*，将PREFIX改为 '/gh/'，注意，少一个杠都会错！
const PREFIX = '/' // 路由前缀
// 分支文件使用jsDelivr镜像的开关，0为关闭，默认关闭
const Config = {
	jsdelivr: 0 // 配置是否使用jsDelivr镜像
}

const whiteList = [] // 白名单，路径中包含白名单字符的请求才会通过，例如 ['/username/']

/** @type {ResponseInit} */
const PREFLIGHT_INIT = {
	status: 204, // 响应状态码
	headers: new Headers({
		'access-control-allow-origin': '*', // 允许所有来源
		'access-control-allow-methods': 'GET,POST,PUT,PATCH,TRACE,DELETE,HEAD,OPTIONS', // 允许的HTTP方法
		'access-control-max-age': '1728000', // 预检请求的缓存时间
	}),
}

const exp1 = /^(?:https?:\/\/)?github\.com\/.+?\/.+?\/(?:releases|archive)\/.*$/i // 匹配GitHub的releases或archive路径
const exp2 = /^(?:https?:\/\/)?github\.com\/.+?\/.+?\/(?:blob|raw)\/.*$/i // 匹配GitHub的blob或raw路径
const exp3 = /^(?:https?:\/\/)?github\.com\/.+?\/.+?\/(?:info|git-).*$/i // 匹配GitHub的info或git-路径
const exp4 = /^(?:https?:\/\/)?raw\.(?:githubusercontent|github)\.com\/.+?\/.+?\/.+?\/.+$/i // 匹配raw.githubusercontent.com的路径
const exp5 = /^(?:https?:\/\/)?gist\.(?:githubusercontent|github)\.com\/.+?\/.+?\/.+$/i // 匹配Gist的路径
const exp6 = /^(?:https?:\/\/)?github\.com\/.+?\/.+?\/tags.*$/i // 匹配GitHub的tags路径

/**
 * 创建响应对象
 * @param {any} body - 响应体
 * @param {number} status - 状态码
 * @param {Object<string, string>} headers - 响应头
 */
function makeRes(body, status = 200, headers = {}) {
	headers['access-control-allow-origin'] = '*' // 设置跨域头
	return new Response(body, { status, headers }) // 返回新的响应
}

/**
 * 创建URL对象
 * @param {string} urlStr - URL字符串
 */
function newUrl(urlStr) {
	try {
		return new URL(urlStr) // 尝试创建URL对象
	} catch (err) {
		return null // 如果失败，返回null
	}
}

/**
 * 检查URL是否匹配白名单中的正则表达式
 * @param {string} u - 待检查的URL
 */
function checkUrl(u) {
	for (let i of [exp1, exp2, exp3, exp4, exp5, exp6]) {
		if (u.search(i) === 0) {
			return true // 如果匹配，返回true
		}
	}
	return false // 如果不匹配，返回false
}

/**
 * 处理HTTP请求
 * @param {Request} req - 请求对象
 * @param {string} pathname - 请求路径
 */
function httpHandler(req, pathname) {
	const reqHdrRaw = req.headers

	// 处理预检请求
	if (req.method === 'OPTIONS' &&
		reqHdrRaw.has('access-control-request-headers')
	) {
		return new Response(null, PREFLIGHT_INIT) // 返回预检响应
	}

	const reqHdrNew = new Headers(reqHdrRaw)

	let urlStr = pathname
	let flag = !Boolean(whiteList.length) // 如果白名单为空，默认允许
	for (let i of whiteList) {
		if (urlStr.includes(i)) {
			flag = true // 如果路径包含白名单中的任意项，允许请求
			break
		}
	}
	if (!flag) {
		return new Response("blocked", { status: 403 }) // 不在白名单中，返回403
	}
	if (urlStr.search(/^https?:\/\//) !== 0) {
		urlStr = 'https://' + urlStr // 确保URL以https开头
	}
	const urlObj = newUrl(urlStr)

	/** @type {RequestInit} */
	const reqInit = {
		method: req.method, // 请求方法
		headers: reqHdrNew, // 请求头
		redirect: 'manual', // 手动处理重定向
		body: req.body // 请求体
	}
	return proxy(urlObj, reqInit) // 代理请求
}

/**
 *
 * @param {URL} urlObj - 目标URL对象
 * @param {RequestInit} reqInit - 请求初始化对象
 */
async function proxy(urlObj, reqInit) {
	const res = await fetch(urlObj.href, reqInit) // 发送请求并获取响应
	const resHdrOld = res.headers
	const resHdrNew = new Headers(resHdrOld)

	const status = res.status

	if (resHdrNew.has('location')) { // 如果响应包含重定向
		let _location = resHdrNew.get('location')
		if (checkUrl(_location))
			resHdrNew.set('location', PREFIX + _location) // 修改重定向URL
		else {
			reqInit.redirect = 'follow' // 允许自动跟随重定向
			return proxy(newUrl(_location), reqInit) // 递归处理新的重定向
		}
	}
	resHdrNew.set('access-control-expose-headers', '*') // 设置跨域暴露头
	resHdrNew.set('access-control-allow-origin', '*') // 允许所有来源

	resHdrNew.delete('content-security-policy') // 删除安全策略头
	resHdrNew.delete('content-security-policy-report-only') // 删除报告模式的安全策略头
	resHdrNew.delete('clear-site-data') // 删除清除站点数据的头

	return new Response(res.body, {
		status,
		headers: resHdrNew,
	}) // 返回新的响应
}

/**
 * 主要的请求处理函数
 * @param {Request} request - 原始请求对象
 */
export default {
	async fetch(request, env, ctx) {
		const url = new URL(request.url)
		const urlStr = request.url
		const urlObj = new URL(urlStr)

		if (env.UA) 屏蔽爬虫UA = 屏蔽爬虫UA.concat(await ADD(env.UA));
		const userAgentHeader = request.headers.get('User-Agent');
		const userAgent = userAgentHeader ? userAgentHeader.toLowerCase() : "null";
		if (屏蔽爬虫UA.some(fxxk => userAgent.includes(fxxk)) && 屏蔽爬虫UA.length > 0) {
			// 首页改成一个nginx伪装页
			return new Response(await nginx(), {
				headers: {
					'Content-Type': 'text/html; charset=UTF-8',
				},
			});
		}
		let path = urlObj.searchParams.get('q')
		if (path) {
			return Response.redirect('https://' + urlObj.host + PREFIX + path, 301) // 重定向到带前缀的路径
		} else if (url.pathname.toLowerCase() == '/favicon.ico') {
			const 浅色图标 = 'https://github.githubassets.com/favicons/favicon.png';
			const 深色图标 = 'https://github.githubassets.com/favicons/favicon-dark.png';

			// 检测浏览器主题模式
			const 主题模式 = request.headers.get('sec-ch-prefers-color-scheme');
			const 使用浅色图标 = 主题模式 === 'light';  // 反转判断逻辑

			// 返回对应主题的图标，默认深色
			return fetch(使用浅色图标 ? 浅色图标 : 深色图标);
		}
		// cfworker 会把路径中的 `//` 合并成 `/`
		path = urlObj.href.substr(urlObj.origin.length + PREFIX.length).replace(/^https?:\/+/, 'https://')
		if (path.search(exp1) === 0 || path.search(exp5) === 0 || path.search(exp6) === 0 || path.search(exp3) === 0 || path.search(exp4) === 0) {
			return httpHandler(request, path) // 处理符合正则的请求
		} else if (path.search(exp2) === 0) {
			if (Config.jsdelivr) {
				const newUrl = path.replace('/blob/', '@').replace(/^(?:https?:\/\/)?github\.com/, 'https://cdn.jsdelivr.net/gh') // 使用jsDelivr镜像
				return Response.redirect(newUrl, 302) // 重定向到jsDelivr
			} else {
				path = path.replace('/blob/', '/raw/') // 修改路径为raw
				return httpHandler(request, path) // 处理修改后的请求
			}
		} else if (path.search(exp4) === 0) {
			const newUrl = path.replace(/(?<=com\/.+?\/.+?)\/(.+?\/)/, '@$1').replace(/^(?:https?:\/\/)?raw\.(?:githubusercontent|github)\.com/, 'https://cdn.jsdelivr.net/gh') // 修改为jsDelivr镜像URL
			return Response.redirect(newUrl, 302) // 重定向到新的URL
		} else {
			if (env.URL302) {
				return Response.redirect(env.URL302, 302);
			} else if (env.URL) {
				if (env.URL.toLowerCase() == 'nginx') {
					//首页改成一个nginx伪装页
					return new Response(await nginx(), {
						headers: {
							'Content-Type': 'text/html; charset=UTF-8',
						},
					});
				} else return fetch(new Request(env.URL, request));
			} else {
				return new Response(await githubInterface(), {
					headers: {
						'Content-Type': 'text/html; charset=UTF-8',
					},
				});
			}
		}
	}
}

async function githubInterface() {
	const html = `
		<!DOCTYPE html>
		<html lang="zh-CN">
		<head>
			<title>GitHub 文件加速</title>
			<meta charset="UTF-8">
			<meta name="viewport" content="width=device-width, initial-scale=1.0">
			<style>
				:root {
					--primary-color: #1a1e21;
					--primary-hover: #0d1117;
					--text-color: #f0f6fc;
					--bg-gradient: linear-gradient(135deg, #1a1e21 0%, #0d1117 100%);
					--shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
				}

				* {
					box-sizing: border-box;
					margin: 0;
					padding: 0;
				}

				body {
					font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
					min-height: 100vh;
					background: var(--bg-gradient);
					color: var(--text-color);
					display: flex;
					justify-content: center;
					align-items: center;
					padding: 20px;
				}

				.container {
					width: 100%;
					max-width: 800px;
					padding: 40px 20px;
					text-align: center;
				}

				.logo {
					margin-bottom: 2rem;
					transform: scale(1);
					transition: transform 0.3s ease;
				}

				.logo:hover {
					transform: scale(1.1);
				}

				.title {
					font-size: 2.5rem;
					font-weight: 600;
					margin-bottom: 1rem;
					background: linear-gradient(45deg, #cdd5dd, #e2e8f0); /* 修改为更亮的颜色 */
					-webkit-background-clip: text;
					-webkit-text-fill-color: transparent;
				}

				.tips a {
					color: #9ba1a6;
					text-decoration: none;
					border-bottom: 1px dashed #9ba1a6;
					transition: all 0.2s ease;
				}

				.tips a:hover {
					color: #fff;
					border-bottom-color: #fff;
				}

				.search-container {
					position: relative;
					max-width: 600px;
					margin: 2rem auto;
				}

				.search-input {
					width: 100%;
					height: 56px;
					padding: 0 60px 0 24px;
					font-size: 1rem;
					color: #1f2937;
					background: rgba(255, 255, 255, 0.9);
					border: 2px solid transparent;
					border-radius: 12px;
					box-shadow: var(--shadow);
					transition: all 0.3s ease;
				}

				.search-input:focus {
					border-color: var(--primary-color);
					background: white;
					outline: none;
					box-shadow: 0 0 0 3px rgba(0, 102, 255, 0.2);
				}

				.search-button {
					position: absolute;
					right: 8px;
					top: 50%;
					transform: translateY(-50%);
					width: 44px;
					height: 44px;
					border: none;
					border-radius: 8px;
					background: var(--primary-color);
					color: white;
					cursor: pointer;
					transition: all 0.2s ease;
				}

				.search-button:hover {
					background: var(--primary-hover);
					transform: translateY(-50%) scale(1.05);
				}

				.tips {
					margin-top: 2rem;
					color: rgba(255, 255, 255, 0.8);
					line-height: 1.6;
					text-align: left;		   /* 添加左对齐 */
					padding-left: 1.8rem;	   /* 与示例标题对齐 */
				}

				// 更新CSS样式部分
				.example-title {
					color: #9ba1a6;
					margin-bottom: 1.5rem;
					font-size: 1rem;
					font-weight: 700;
					position: relative;
					padding-bottom: 0.8rem;
					border-bottom: 1px solid rgba(255, 255, 255, 0.1);
				}

				.example p {
					margin: 0.8rem 0;
					font-family: monospace;
					font-size: 0.95rem;
					color: rgba(255, 255, 255, 0.8);
					padding-left: 1.5rem;
					line-height: 1;
				}

				.example {
					margin-top: 2rem;
					padding: 1.8rem;
					background: rgba(255, 255, 255, 0.05);
					border-radius: 12px;
					text-align: left;
					border: 1px solid rgba(255, 255, 255, 0.1);
				}

				@media (max-width: 640px) {
					.container {
						padding: 20px;
					}

					.title {
						font-size: 2rem;
					}

					.search-input {
						height: 50px;
						font-size: 0.9rem;
					}

					.search-button {
						width: 38px;
						height: 38px;
					}

					.example {
						padding: 1rem;
						font-size: 0.8rem;
					}
				}
			</style>
		</head>
		<body>
			<div class="container">
				<div class="logo">
					<a href="https://github.com/cmliu/CF-Workers-GitHub" target="_blank">
						<svg xmlns="http://www.w3.org/2000/svg" width="120" height="90" viewBox="0 0 98 96" fill="#ffffff">
							<path fill-rule="evenodd" clip-rule="evenodd" d="M48.854 0C21.839 0 0 22 0 49.217c0 21.756 13.993 40.172 33.405 46.69 2.427.49 3.316-1.059 3.316-2.362 0-1.141-.08-5.052-.08-9.127-13.59 2.934-16.42-5.867-16.42-5.867-2.184-5.704-5.42-7.17-5.42-7.17-4.448-3.015.324-3.015.324-3.015 4.934.326 7.523 5.052 7.523 5.052 4.367 7.496 11.404 5.378 14.235 4.074.404-3.178 1.699-5.378 3.074-6.6-10.839-1.141-22.243-5.378-22.243-24.283 0-5.378 1.94-9.778 5.014-13.2-.485-1.222-2.184-6.275.486-13.038 0 0 4.125-1.304 13.426 5.052a46.97 46.97 0 0 1 12.214-1.63c4.125 0 8.33.571 12.213 1.63 9.302-6.356 13.427-5.052 13.427-5.052 2.67 6.763.97 11.816.485 13.038 3.155 3.422 5.015 7.822 5.015 13.2 0 18.905-11.404 23.06-22.324 24.283 1.78 1.548 3.316 4.481 3.316 9.126 0 6.6-.08 11.897-.08 13.526 0 1.304.89 2.853 3.316 2.364 19.412-6.52 33.405-24.935 33.405-46.691C97.707 22 75.788 0 48.854 0z"/>
						</svg>
					</a>
				</div>
				
				<h1 class="title">GitHub 文件加速</h1>

				<form onsubmit="toSubmit(event)" class="search-container">
					<input 
						type="text" 
						class="search-input"
						name="q" 
						placeholder="请输入 GitHub 文件链接"
						pattern="^((https|http):\/\/)?(github\.com\/.+?\/.+?\/(?:releases|archive|blob|raw|suites)|((?:raw|gist)\.(?:githubusercontent|github)\.com))\/.+$" 
						required
					>
					<button type="submit" class="search-button">
						<svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
							<path d="M13 5l7 7-7 7M5 5l7 7-7 7" stroke-linecap="round" stroke-linejoin="round"/>
						</svg>
					</button>
				</form>

				<div class="tips">
					<p>✨ 支持带协议头(https://)或不带的GitHub链接，更多用法见<a href="https://hunsh.net/archives/23/">文档说明</a></p>
					<p>🚀 release、archive使用cf加速，文件会跳转至JsDelivr</p>
					<p>⚠️ 注意：暂不支持文件夹下载</p>
				</div>

				<div class="example">
					<div class="example-title">📃 合法输入示例：</div>
					<p>📄 分支源码：https://github.com/hunshcn/project/archive/master.zip</p>
					<p>📁 release源码：https://github.com/hunshcn/project/archive/v0.1.0.tar.gz</p>
					<p>📂 release文件：https://github.com/hunshcn/project/releases/download/v0.1.0/example.zip</p>
					<p>💾 commit文件：https://github.com/hunshcn/project/blob/123/filename</p>
					<p>🖨️ gist：https://gist.githubusercontent.com/cielpy/123/raw/cmd.py</p>
				</div>
			</div>

			<script>
				function toSubmit(e) {
					e.preventDefault();
					const input = document.getElementsByName('q')[0];
					const baseUrl = location.href.substr(0, location.href.lastIndexOf('/') + 1);
					window.open(baseUrl + input.value);
				}
			</script>
		</body>
		</html>
	`;
	return html;
}

async function ADD(envadd) {
	var addtext = envadd.replace(/[	 |"'\r\n]+/g, ',').replace(/,+/g, ',');	// 将空格、双引号、单引号和换行符替换为逗号
	if (addtext.charAt(0) == ',') addtext = addtext.slice(1);
	if (addtext.charAt(addtext.length - 1) == ',') addtext = addtext.slice(0, addtext.length - 1);
	const add = addtext.split(',');
	return add;
}

async function nginx() {
	const text = `
	<!DOCTYPE html>
	<html>
	<head>
	<title>Welcome to nginx!</title>
	<style>
		body {
			width: 35em;
			margin: 0 auto;
			font-family: Tahoma, Verdana, Arial, sans-serif;
		}
	</style>
	</head>
	<body>
	<h1>Welcome to nginx!</h1>
	<p>If you see this page, the nginx web server is successfully installed and
	working. Further configuration is required.</p>
	
	<p>For online documentation and support please refer to
	<a href="http://nginx.org/">nginx.org</a>.<br/>
	Commercial support is available at
	<a href="http://nginx.com/">nginx.com</a>.</p>
	
	<p><em>Thank you for using nginx.</em></p>
	</body>
	</html>
	`
	return text;
}