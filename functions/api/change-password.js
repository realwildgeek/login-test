// SSO 后端 (lt.838808.xyz) 的 /api/change-password 接口伪代码

app.post('/api/change-password', async (req, res) => {
    const { email, oldPassword, newPassword } = await req.json();

    // 1. 查找用户
    const user = await Database.getUserByEmail(email);
    if (!user) {
        return res.json({ success: false, error: "用户不存在" });
    }

    // 2. 🔐 核心防线：验证老密码是否正确
    // 绝对不能相信前端，必须在后端亲自用 bcrypt 验证一下老密码
    const isOldPwdValid = await bcrypt.compare(oldPassword, user.passwordHash);
    if (!isOldPwdValid) {
        return res.json({ success: false, error: "旧密码验证失败，拒绝修改" });
    }

    // 3. 生成新密码的 Hash
    const newPasswordHash = await bcrypt.hash(newPassword, 10);

    // 4. 更新数据库
    await Database.updateUserPassword(email, newPasswordHash);

    // 5. 返回成功
    return res.json({ success: true, message: "登录密码修改成功" });
});