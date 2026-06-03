// ==========================================
// 🏢 护照中心：自助发证机 (自动哈希并存入 KV)
// ==========================================

export async function onRequestPost(context) {
    const { request, env } = context;
    
    try {
        const body = await request.json();
        const { username, password } = body;

        if (!username || !password || username.length < 3 || password.length < 3) {
            return new Response("账号和密码必须至少3个字符", { status: 400 });
        }

        // 1. 检查 KV 数据库，防止账号被抢注
        const existingUser = await env.USERS_DB.get(username);
        if (existingUser) {
            return new Response("该账号已被注册，请换一个", { status: 409 });
        }

        // 2. ✨ 核心黑科技：在后端自动把明文变成哈希密文
        const encoder = new TextEncoder();
        const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(password));
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const passwordHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

        // 3. 组装该用户的数据档案，赋予基础权限
        const newUserRecord = {
            password_hash: passwordHash,
            role: "user",             // 默认只是普通用户，不是老板
            allowed_apps: ["excel.geek123.com"] // 默认只给 Excel 大楼的签证
        };

        // 4. 将哈希档案存入 KV 数据库
        await env.USERS_DB.put(username, JSON.stringify(newUserRecord));

        return new Response("注册成功！请返回登录。", { status: 200 });

    } catch (error) {
        return new Response("注册机异常：" + error.message, { status: 500 });
    }
}