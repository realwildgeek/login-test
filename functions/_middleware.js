// ==========================================
// 🛡️ 全局安保门卫：拦截请求，核验 JWT 护照
// ==========================================

// 辅助函数：从请求头中提取指定的 Cookie
function getCookie(request, name) {
    const cookieString = request.headers.get('Cookie');
    if (!cookieString) return null;
    const cookies = cookieString.split(';');
    for (let cookie of cookies) {
        const [cookieName, cookieValue] = cookie.trim().split('=');
        if (cookieName === name) return cookieValue;
    }
    return null;
}

// 辅助函数：Base64 解码
function base64UrlDecode(str) {
    str = str.replace(/-/g, '+').replace(/_/g, '/');
    while (str.length % 4) { str += '='; }
    return atob(str);
}

// 核心逻辑：利用 Web Crypto API 校验 JWT 签名
async function verifyJWT(token, secret) {
    try {
        const [headerB64, payloadB64, signatureB64] = token.split('.');
        const encoder = new TextEncoder();
        
        // 重新生成密钥
        const key = await crypto.subtle.importKey(
            "raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]
        );
        
        const data = encoder.encode(`${headerB64}.${payloadB64}`);
        const signature = new Uint8Array(
            atob(signatureB64.replace(/-/g, '+').replace(/_/g, '/'))
            .split('').map(c => c.charCodeAt(0))
        );

        // 验证签名是否被篡改
        const isValid = await crypto.subtle.verify("HMAC", key, signature, data);
        if (!isValid) return null;

        // 解析并返回护照里的内容 (包含 UID 和过期时间)
        return JSON.parse(decodeURIComponent(escape(base64UrlDecode(payloadB64))));
    } catch (e) {
        return null;
    }
}

// 门卫主程序
export async function onRequest(context) {
    const { request, env, next } = context;
    const url = new URL(request.url);

    // 1. 设置“免检通道” (白名单)
    // 登录页本身、以及所有 /api/ 开头的接口不能拦截，否则死循环
    const publicPaths = ['/', '/index.html'];
    if (publicPaths.includes(url.pathname) || url.pathname.startsWith('/api/')) {
        return next(); // 直接放行
    }

    // 2. 查验有没有带 JWT 护照
    const token = getCookie(request, 'jwt');
    if (!token) {
        // 没带护照？直接踢回登录页，并用 returnUrl 记住他原本想去哪里
        return Response.redirect(`${url.origin}/?returnUrl=${encodeURIComponent(url.pathname)}`, 302);
    }

    // 3. 查验护照真伪和是否过期
    const payload = await verifyJWT(token, env.JWT_SECRET);
    if (!payload || payload.exp < Math.floor(Date.now() / 1000)) {
        // 护照是伪造的，或者已经过期（默认7天），踢回登录页
        return Response.redirect(`${url.origin}/?returnUrl=${encodeURIComponent(url.pathname)}`, 302);
    }

    // 4. 护照真实有效，放行！
    // (高级玩法：你可以在这里把解析出来的 payload.uid 塞进请求头，传给后面的业务系统)
    return next();
}