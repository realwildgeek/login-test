// ==========================================
// 📨 护照中心：验证码发信机 (带 5 分钟自动销毁)
// ==========================================

export async function onRequestPost(context) {
    const { request, env } = context;
    
    try {
        const body = await request.json();
        const { email } = body;

        // 基础邮箱格式校验
        if (!email || !email.includes('@')) {
            return new Response("邮箱格式错误", { status: 400 });
        }

        // 1. 生成 6 位随机验证码
        const code = Math.floor(100000 + Math.random() * 900000).toString();

        // 2. ✨ 黑科技：存入 KV，并设置 300 秒 (5分钟) 后底层引擎自动抹除
        // 键名带上 code_ 前缀，防止和普通账号冲突
        await env.USERS_DB.put(`code_${email}`, code, { expirationTtl: 300 });

        // 3. 呼叫 Resend 外卖小哥送信
        const resendResponse = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${env.RESEND_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                from: 'onboarding@resend.dev', // 沙盒阶段发件人必须是这个
                to: email,                     // 沙盒阶段只能填你自己的邮箱！
                subject: '【私人云盘】您的护照注册验证码',
                html: `
                    <div style="font-family: sans-serif; padding: 20px;">
                        <h2>欢迎申请系统护照</h2>
                        <p>您的动态验证码是：</p>
                        <h1 style="color: #3b82f6; letter-spacing: 5px;">${code}</h1>
                        <p style="color: #6b7280; font-size: 12px;">该验证码将在 5 分钟后灰飞烟灭，请勿泄露。</p>
                    </div>
                `
            })
        });

        if (!resendResponse.ok) {
            const errorText = await resendResponse.text();
            throw new Error(`Resend 拒载: ${errorText}`);
        }

        return new Response("验证码已发送，请查收邮件", { status: 200 });

    } catch (error) {
        return new Response("发信机故障：" + error.message, { status: 500 });
    }
}