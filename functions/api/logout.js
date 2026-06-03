// ==========================================
// 🏢 护照中心：统一注销窗口 (/api/logout)
// ==========================================

export async function onRequest(context) {
    const { request, env } = context;
    const url = new URL(request.url);

    // 1. 读取我们之前配置的全局环境变量
    const domainAttr = env.ROOT_DOMAIN ? `Domain=.${env.ROOT_DOMAIN};` : "";

    // 2. 核心黑科技：制造一个“毒药” Cookie
    // 让它的值为 deleted，并且把过期时间强制拨回 1970 年。
    // 浏览器一收到这个，就会立刻把用户电脑里的真实 JWT 护照彻底粉碎。
    const killCookie = `jwt=deleted; ${domainAttr} HttpOnly; Secure; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax`;

    // 3. 销毁护照后，把用户一脚踢回 SSO 大厅的首页（登录页）
    return new Response(null, {
        status: 302, // 302 重定向
        headers: {
            "Location": url.origin, // url.origin 就是 https://sso.你的域名.com
            "Set-Cookie": killCookie
        }
    });
}