// ==========================================
// 🏢 护照中心：自助发证机 (重构为仓储模式)
// ==========================================

// 引入底层仓储
import { isEmailRegistered, createUser } from '../repositories/user.repository.js';

export async function onRequestPost(context) {
    const { request, env } = context;
    
    try {
        const body = await request.json();
        // 前端传来的 username 在这套极简架构下，直接被降级当做 nickname（昵称）使用
        const { username, password, email, code } = body; 

        if (!username || !password || !email || !code || username.length < 3 || password.length < 3) {
            return new Response("必填信息不完整或密码太短", { status: 400 });
        }

        // 1. 去 KV 核验邮箱验证码是否正确且未过期
        const savedCode = await env.USERS_DB.get(`code_${email}`);
        if (!savedCode || savedCode !== code) {
            return new Response("验证码错误或已失效(有效期5分钟)", { status: 400 });
        }

        // 2. 呼叫仓储：检查邮箱是否已被抢注
        const isRegistered = await isEmailRegistered(env, email);
        if (isRegistered) {
            return new Response("该邮箱已被注册", { status: 409 });
        }

        // 3. 安全升级：自动把明文变成哈希密文
        const encoder = new TextEncoder();
        const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(password));
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const passwordHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

        // 4. 呼叫仓储：正式创建账号，系统自动分配 UID 并处理底层双重写入
        await createUser(env, email, passwordHash, username);

        // 5. 注册成功后立刻销毁验证码，防止被重复利用
        await env.USERS_DB.delete(`code_${email}`);

        return new Response("注册成功！请返回登录。", { status: 200 });

    } catch (error) {
        return new Response("注册机异常：" + error.message, { status: 500 });
    }
}
