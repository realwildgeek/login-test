// ==========================================
// 🏢 护照中心：SSO 大厅经理 (重构为仓储模式)
// ==========================================

import { getUserByEmail } from '../repositories/user.repository.js';

function base64UrlEncode(str) {
    return btoa(unescape(encodeURIComponent(str))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function onRequestPost(context) {
    const { request, env } = context;
    
    try {
        const body = await request.json();
        // 前端登录框的 id 还是 username，但用户在这里其实输入的是邮箱
        const { username: loginEmail, password } = body;

        if (!loginEmail || !password) {
            return new Response("请输入邮箱和密码", { status: 400 });
        }

        // 1. 呼叫仓储：通过邮箱获取完整的用户档案（底层会自动查指路牌和本体）
        const userRecord = await getUserByEmail(env, loginEmail);
        
        if (!userRecord) {
            return new Response("账号不存在", { status: 401 });
        }

        // 2. 算哈希并比对
        const encoder = new TextEncoder();
        const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(password));
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const passwordHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

        if (passwordHash !== userRecord.password_hash) {
            return new Response("密码错误", { status: 401 });
        }

        // 3. 构造 JWT 门票，并把最核心的 UID 封印进去
        const header = { alg: "HS256", typ: "JWT" };
        const payload = { 
            uid: userRecord.uid,           // 以后所有系统只认这个绝不改变的 UID
            email: userRecord.email,
            nickname: userRecord.nickname, 
            role: userRecord.role,
            allowed_apps: userRecord.allowed_apps,
            exp: Math.floor(Date.now() / 1000) + (7 * 24 * 60 * 60)
        };

        const headAndPayload = `${base64UrlEncode(JSON.stringify(header))}.${base64UrlEncode(JSON.stringify(payload))}`;

        const key = await crypto.subtle.importKey(
            "raw", encoder.encode(env.JWT_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
        );
        const signatureBuffer = await crypto.subtle.sign("HMAC", key, encoder.encode(headAndPayload));
        const signature = btoa(String.fromCharCode(...new Uint8Array(signatureBuffer)))
            .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

        const token = `${headAndPayload}.${signature}`;

        // 4. 种下全局 Cookie
        const url = new URL(request.url);
        let domainAttr = "";
        if (url.hostname.includes('.')) {
            const parts = url.hostname.split('.');
            if (parts.length >= 2 && !url.hostname.endsWith('pages.dev')) {
                const rootDomain = parts.slice(-2).join('.');
                domainAttr = `Domain=.${rootDomain};`; 
            }
        }

        const cookieStr = `jwt=${token}; ${domainAttr} HttpOnly; Secure; Path=/; Max-Age=${7 * 24 * 60 * 60}; SameSite=Lax`;

        // 登录成功时，前端可以拿到这个人的匿名昵称用于展示
        return new Response(JSON.stringify({ message: "登录成功", nickname: userRecord.nickname }), { 
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
