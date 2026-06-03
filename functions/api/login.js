// ==========================================
// 🏢 护照中心：连接 KV 数据库的 SSO 大厅经理
// ==========================================

function base64UrlEncode(str) {
    return btoa(unescape(encodeURIComponent(str))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function onRequestPost(context) {
    const { request, env } = context;
    
    try {
        const body = await request.json();
        const { username, password } = body;

        if (!username || !password) {
            return new Response("请输入账号和密码", { status: 400 });
        }

        // 1. 去 KV 数据库中查找该用户
        const userRecordStr = await env.USERS_DB.get(username);
        if (!userRecordStr) {
            return new Response("账号不存在", { status: 401 });
        }

        const userRecord = JSON.parse(userRecordStr);

        // 2. 安全升级：将用户输入的明文密码转换为 SHA-256 哈希值
        const encoder = new TextEncoder();
        const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(password));
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const passwordHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

        // 将算出的哈希值，与 KV 数据库里存的哈希密文进行比对
        if (passwordHash !== userRecord.password_hash) {
            return new Response("密码错误", { status: 401 });
        }

        // 3. 构造 JWT 门票 (保质期 7 天)
        const header = { alg: "HS256", typ: "JWT" };
        const payload = { 
            user: username,
            role: userRecord.role,
            allowed_apps: userRecord.allowed_apps, // 包含他能访问的子域名列表
            exp: Math.floor(Date.now() / 1000) + (7 * 24 * 60 * 60)
        };

        const headAndPayload = `${base64UrlEncode(JSON.stringify(header))}.${base64UrlEncode(JSON.stringify(payload))}`;

        // 4. 用环境变量里的 JWT_SECRET 盖章
        const key = await crypto.subtle.importKey(
            "raw", encoder.encode(env.JWT_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
        );
        const signatureBuffer = await crypto.subtle.sign("HMAC", key, encoder.encode(headAndPayload));
        const signature = btoa(String.fromCharCode(...new Uint8Array(signatureBuffer)))
            .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

        const token = `${headAndPayload}.${signature}`;

        // 5. ✨ 核心黑科技：提取主域名，签发全站通用的 Cookie
        const url = new URL(request.url);
        let domainAttr = "";
        
        // 如果你绑定了自定义域名(如 passport.myoffice.com)，则把 Cookie 种在根域名下
        // 注意：如果你直接用 pages.dev 测试，这里不需要 Domain 属性
        if (url.hostname.includes('.')) {
            const parts = url.hostname.split('.');
            if (parts.length >= 2 && !url.hostname.endsWith('pages.dev')) {
                const rootDomain = parts.slice(-2).join('.');
                domainAttr = `Domain=.${rootDomain};`; // 前面带点，表示所有子域名生效
            }
        }

        const cookieStr = `jwt=${token}; ${domainAttr} HttpOnly; Secure; Path=/; Max-Age=${7 * 24 * 60 * 60}; SameSite=Lax`;

        return new Response(JSON.stringify({ message: "登录成功", user: username }), { 
            status: 200,
            headers: { 
                "Content-Type": "application/json",
                "Set-Cookie": cookieStr 
            }
        });

    } catch (error) {
        return new Response("护照中心异常：" + error.message, { status: 500 });
    }
}
