// ==========================================
// 🗄️ 档案室：用户数据仓储 (KV 实现版)
// ==========================================

/**
 * 通过邮箱查找用户 (处理双重映射)
 */
export async function getUserByEmail(env, email) {
    // 1. 找指路牌：用邮箱查 UID
    const uid = await env.USERS_DB.get(`email:${email}`);
    if (!uid) return null; // 连指路牌都没有，说明没注册

    // 2. 找本体：用 UID 查真实档案
    const userRecordStr = await env.USERS_DB.get(`user:${uid}`);
    if (!userRecordStr) return null; 

    return JSON.parse(userRecordStr);
}

/**
 * 检查邮箱是否已被注册
 */
export async function isEmailRegistered(env, email) {
    const uid = await env.USERS_DB.get(`email:${email}`);
    return uid !== null;
}

/**
 * 创建新用户 (生成 UID + 双重写入)
 */
export async function createUser(env, email, passwordHash, nickname) {
    // ✨ 核心：自动生成绝对唯一的底层 UID (例如: 123e4567-e89b-12d3-a456-426614174000)
    const uid = crypto.randomUUID();

    const newUserRecord = {
        uid: uid,
        email: email,
        password_hash: passwordHash,
        nickname: nickname, // 将前端传来的 username 作为社交面具
        role: "user",
        allowed_apps: ["excel.geek123.com"] // 默认授予的内部应用访问权限
    };

    // ✨ 黑科技：双重写入，建立关系映射
    // 写入本体档案 (Key 格式为 user:uid)
    await env.USERS_DB.put(`user:${uid}`, JSON.stringify(newUserRecord));
    
    // 写入指路牌映射 (Key 格式为 email:xxx，值为 UID)
    await env.USERS_DB.put(`email:${email}`, uid);

    return uid;
}