// ==========================================
// 🏢 护照中心：自助发证机 (自动哈希并存入 KV)
// ==========================================

export async function onRequestPost(context) {
    const { request, env } = context;
    
    try {
        const body = await request.json();
        // ✨ 新增：提取前端传来的 email 和 code
        const { username, password, email, code } = body; 

        // ✨ 修改：增加对邮箱和验证码的非空拦截
        if (!username || !password || !email || !code || username.length < 3 || password.length < 3) {
            return new Response("必填信息不完整或账号密码太短", { status: 400 });
        }

        // 1. 检查 KV 数据库，防止账号被抢注
        const existingUser = await env.USERS_DB.get(username);
        if (existingUser) {
            return new Response("该账号已被注册，请换一个", { status: 409 });
        }

        // ✨ 新增：去 KV 核验邮箱验证码是否正确且未过期
        const savedCode = await env.USERS_DB.get(`code_${email}`);
        if (!savedCode || savedCode !== code) {
            return new Response("验证码错误或已失效(有效期5分钟)", { status: 400 });
        }

        // 2. ✨ 核心黑科技：在后端自动把明文变成哈希密文
        const encoder = new TextEncoder();
        const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(password));
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const passwordHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

        // 3. 组装该用户的数据档案，赋予基础权限
        const newUserRecord = {
            email: email,             // ✨ 新增：将邮箱也存入档案
            password_hash: passwordHash,
            role: "user",             // 默认只是普通用户，不是老板
            allowed_apps: ["*"] // 默认只给 Excel 大楼的签证
        };

        // 4. 将哈希档案存入 KV 数据库
        await env.USERS_DB.put(username, JSON.stringify(newUserRecord));

        // ✨ 新增：注册成功后立刻销毁验证码，防止被重复利用
        await env.USERS_DB.delete(`code_${email}`);

        return new Response("注册成功！请返回登录。", { status: 200 });

    } catch (error) {
        return new Response("注册机异常：" + error.message, { status: 500 });
    }
}
