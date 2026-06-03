// ==========================================
// 🏢 护照中心：自助发证机 (重构为仓储模式)
// ==========================================

// 引入底层仓储
import { isEmailRegistered, createUser } from '../repositories/user.repository.js';

export async function onRequestPost(context) {
    const { request, env } = context;
    
    try {
        const body = await request.json();
        // ✨ 修改：前端不再传 username，彻底极简为仅需邮箱、密码和验证码
        const { email, password, code } = body; 

        // ✨ 修改：移除了对 username 的校验拦截
        if (!email || !password || !code || password.length < 3) {
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

        // ✨ 新增核心黑科技：提取邮箱 @ 前面的部分作为默认昵称
        // 例如：clark.kent@gmail.com -> 会被截取为 clark.kent
        const defaultNickname = email.split('@');

        // 4. ✨ 修改：呼叫仓储正式创建账号，系统自动分配 UID 并处理底层双重写入。传入提取好的默认昵称
        await createUser(env, email, passwordHash, defaultNickname);

        // 5. 注册成功后立刻销毁验证码，防止被重复利用
        await env.USERS_DB.delete(`code_${email}`);

        return new Response("注册成功！请返回登录。", { status: 200 });

    } catch (error) {
        return new Response("注册机异常：" + error.message, { status: 500 });
    }
}
