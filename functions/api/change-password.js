// ==========================================
// 🏢 护照中心：修改密码接口 (对接 E2EE 前端沙盒)
// ==========================================

// 引入你现有的数据库查询方法
import { getUserByEmail } from '../repositories/user.repository.js';

// ✨ 新增：处理浏览器发起的 CORS 跨域预检请求
export async function onRequestOptions() {
    return new Response(null, {
        headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
        }
    });
}

export async function onRequestPost(context) {
    const { request, env } = context;
    const corsHeaders = { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" };

    try {
        const body = await request.json();
        const { email, oldPassword, newPassword } = body;

        if (!email || !oldPassword || !newPassword) {
            return new Response(JSON.stringify({ success: false, error: "缺少必要参数" }), { status: 400, headers: corsHeaders });
        }

        // 1. 呼叫仓储：获取用户信息
        const userRecord = await getUserByEmail(env, email);
        if (!userRecord) {
            return new Response(JSON.stringify({ success: false, error: "账号不存在" }), { status: 404, headers: corsHeaders });
        }

        // 2. 🔐 核心防线：验证老密码是否正确 (复用你 login 里的 SHA-256 逻辑)
        const encoder = new TextEncoder();
        const oldHashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(oldPassword));
        const oldPasswordHash = Array.from(new Uint8Array(oldHashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');

        if (oldPasswordHash !== userRecord.password_hash) {
            return new Response(JSON.stringify({ success: false, error: "旧密码验证失败，拒绝修改" }), { status: 403, headers: corsHeaders });
        }

        // 3. 生成新密码的 Hash
        const newHashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(newPassword));
        const newPasswordHash = Array.from(new Uint8Array(newHashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');

        // 4. 💾 写入数据库
        // 注意：这里需要根据你 user.repository.js 里的实际情况来保存
        // 假设你在 KV 里存的键名是 `user_${email}` 或者类似于你在 register 里的规则
        // 由于我没看到你具体的 repository 实现，这里用最标准的 KV 覆盖方法：
        userRecord.password_hash = newPasswordHash;
        
        // 因为你之前 login.js 里能拿到 userRecord.uid，说明 userRecord 里有 uid 字段
        await env.USERS_DB.put(`user:${userRecord.uid}`, JSON.stringify(userRecord));
        // （如果你在 repository 里面有写好的 updateUser() 方法，直接调用 updateUser(env, userRecord) 会更优雅）

        // 5. 成功返回
        return new Response(JSON.stringify({ success: true, message: "登录密码修改成功" }), {
            status: 200, headers: corsHeaders
        });

    } catch (error) {
        return new Response(JSON.stringify({ success: false, error: "服务器内部错误：" + error.message }), { 
            status: 500, headers: corsHeaders 
        });
    }
}
