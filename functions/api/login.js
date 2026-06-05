// ==========================================
// 🏢 护照中心：SSO 大厅经理 (重构为双核模式：支持跨域 API)
// ==========================================

import { getUserByEmail } from '../repositories/user.repository.js';

function base64UrlEncode(str) {
    return btoa(unescape(encodeURIComponent(str))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// ✨ 新增：处理浏览器发起的 CORS 跨域预检请求 (极其重要，否则前端 fetch 会被浏览器拦截)
export async function onRequestOptions() {
    return new Response(null, {
        headers: {
            "Access-Control-Allow-Origin": "*", // 允许任何云盘域名调用
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
        }
    });
}

export async function onRequestPost(context) {
    const { request, env } = context;
    
    // ✨ 统一定义跨域头，确保前端无论成功失败都能收到响应
    const corsHeaders = {
        "Access-Control-Allow-Origin": "*",
        "Content-Type": "application/json"
    };
    
    try {
        const body = await request.json();
        const { email, password } = body;

        if (!email || !password) {
            return new Response(JSON.stringify({ error: "请输入邮箱和密码" }), { status: 400, headers: corsHeaders });
        }

        // 1. 呼叫仓储：通过邮箱获取完整的用户档案
        const userRecord = await getUserByEmail(env, email);
        
        if (!userRecord) {
            return new Response(JSON.stringify({ error: "账号不存在" }), { status: 401, headers: corsHeaders });
        }

        // 2. 算哈希并比对
        const encoder = new TextEncoder();
        const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(password));
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const passwordHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

        if (passwordHash !== userRecord.password_hash) {
            return new Response(JSON.stringify({ error: "密码错误" }), { status: 401, headers: corsHeaders });
        }

        // 3. 构造 JWT 门票
        const header = { alg: "HS256", typ: "JWT" };
        const payload = { 
            uid: userRecord.uid,           
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

        // 4. 种下全局 Cookie (保留原有的 Cookie 逻辑以防传统项目需要)
        const domainAttr = env.ROOT_DOMAIN ? `Domain=.${env.ROOT_DOMAIN};` : "";
        const cookieStr = `jwt=${token}; ${domainAttr} HttpOnly; Secure; Path=/; Max-Age=${7 * 24 * 60 * 60}; SameSite=Lax`;
        
        // ✨ 核心修改：在返回的 JSON 中显式带上 token，供极客云盘前端手动提取！
        return new Response(JSON.stringify({ 
            success: true, 
            message: "登录成功", 
            nickname: userRecord.nickname,
            token: token // <--- 重点在这里！
        }), { 
            status: 200,
            headers: { 
                ...corsHeaders,
                "Set-Cookie": cookieStr 
            }
        });

    } catch (error) {
        return new Response(JSON.stringify({ error: "护照中心异常：" + error.message }), { 
            status: 500, 
            headers: { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" } 
        });
    }
}
