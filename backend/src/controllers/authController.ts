import { Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { pinyin } from 'pinyin-pro';
import { AppDataSource } from '../config/database';
import { User, UserRole } from '../entities';
import { AuthRequest } from '../middlewares/auth';
import {
  FeishuAuthError,
  fetchFeishuUserInfoByCode,
  getFeishuAuthorizeUrl,
  isFeishuAuthEnabled,
} from '../services/feishuAuthService';

const userRepository = AppDataSource.getRepository(User);

const normalizeUsername = (name: string) => {
  const raw = pinyin(name, { toneType: 'none' });
  const cleaned = raw.replace(/\s+/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
  if (cleaned) {
    return cleaned;
  }
  return name.replace(/\s+/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
};

const ensureUniqueUsername = async (baseUsername: string, userId: string) => {
  let candidate = baseUsername || `user${userId.slice(0, 6)}`;
  let suffix = 1;
  while (true) {
    const existing = await userRepository.findOne({ where: { username: candidate } });
    if (!existing || existing.id === userId) {
      return candidate;
    }
    candidate = `${baseUsername}${suffix}`;
    suffix += 1;
  }
};

const createAuthPayload = (user: User) => {
  const token = jwt.sign(
    { id: user.id, username: user.username, role: user.role },
    process.env.JWT_SECRET as string,
    { expiresIn: (process.env.JWT_EXPIRES_IN || '7d') as jwt.SignOptions['expiresIn'] }
  );

  return {
    message: '登录成功',
    token,
    user: {
      id: user.id,
      username: user.username,
      code: user.code,
      name: user.name,
      role: user.role,
      phone: user.phone,
    },
  };
};

const normalizePhone = (value?: string | null) => {
  const digits = String(value || '').replace(/\D/g, '');
  if (!digits) {
    return '';
  }

  return digits.length > 11 ? digits.slice(-11) : digits;
};

export const register = async (req: AuthRequest, res: Response) => {
  try {
    const { username, password, name, role = UserRole.PIECE_RATE, phone } = req.body;

    const existingUser = await userRepository.findOne({ where: { username } });
    if (existingUser) {
      return res.status(400).json({ message: '用户名已存在' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = userRepository.create({
      username,
      password: hashedPassword,
      name,
      role,
      phone,
    });

    await userRepository.save(user);

    res.status(201).json({ message: '用户创建成功', userId: user.id });
  } catch (error) {
    res.status(500).json({ message: '服务器错误' });
  }
};

export const login = async (req: AuthRequest, res: Response) => {
  try {
    const { account, username, phone, password } = req.body;
    const identifier = account || username || phone;

    if (!identifier || !password) {
      return res.status(400).json({ message: '账号和密码为必填项' });
    }

    const user = await userRepository
      .createQueryBuilder('user')
      .where('user.code = :identifier', { identifier })
      .orWhere('user.phone = :identifier', { identifier })
      .orWhere('user.username = :identifier', { identifier })
      .getOne();
    if (!user) {
      return res.status(401).json({ message: '账号或密码错误' });
    }

    if (!user.isActive) {
      return res.status(403).json({ message: '账户已被禁用' });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ message: '账号或密码错误' });
    }

    res.json(createAuthPayload(user));
  } catch (error) {
    res.status(500).json({ message: '服务器错误' });
  }
};

export const getFeishuStatus = async (_req: AuthRequest, res: Response) => {
  res.json({
    enabled: isFeishuAuthEnabled(),
  });
};

export const redirectToFeishuAuthorize = async (req: AuthRequest, res: Response) => {
  try {
    const state = typeof req.query.state === 'string' ? req.query.state : undefined;
    const authorizeUrl = getFeishuAuthorizeUrl(state);
    res.redirect(authorizeUrl);
  } catch (error) {
    if (error instanceof FeishuAuthError) {
      return res.status(error.status).json({ message: error.message });
    }
    return res.status(500).json({ message: '飞书登录初始化失败' });
  }
};

export const loginWithFeishu = async (req: AuthRequest, res: Response) => {
  try {
    const code = typeof req.body?.code === 'string' ? req.body.code : '';
    if (!code.trim()) {
      return res.status(400).json({ message: '缺少飞书登录 code' });
    }

    const userInfo = await fetchFeishuUserInfoByCode(code);
    const feishuPhone = normalizePhone(userInfo.mobile);
    if (!feishuPhone) {
      return res.status(403).json({ message: '飞书账号未返回有效手机号，请检查用户资料' });
    }

    const activeUsers = await userRepository.find({
      where: { isActive: true },
    });

    const matchedUsers = activeUsers.filter((user) => normalizePhone(user.phone) === feishuPhone);
    if (matchedUsers.length === 0) {
      return res.status(403).json({ message: '未找到与飞书手机号匹配的系统账号，请联系管理员创建账号' });
    }

    if (matchedUsers.length > 1) {
      return res.status(409).json({ message: '检测到多个系统账号使用同一手机号，请联系管理员修正后再登录' });
    }

    const user = matchedUsers[0];
    if (!user.isActive) {
      return res.status(403).json({ message: '账户已被禁用' });
    }

    return res.json(createAuthPayload(user));
  } catch (error) {
    if (error instanceof FeishuAuthError) {
      const status = error.status === 400 ? 401 : error.status;
      return res.status(status).json({ message: error.message });
    }

    return res.status(500).json({ message: '飞书登录失败' });
  }
};

export const getCurrentUser = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: '未认证' });
    }

    const user = await userRepository.findOne({ where: { id: req.user.id } });
    if (!user) {
      return res.status(404).json({ message: '用户不存在' });
    }

    res.json({
      id: user.id,
      username: user.username,
      code: user.code,
      name: user.name,
      role: user.role,
      phone: user.phone,
      isActive: user.isActive,
      createdAt: user.createdAt,
    });
  } catch (error) {
    res.status(500).json({ message: '服务器错误' });
  }
};

export const changePassword = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: '未认证' });
    }

    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: '原密码和新密码为必填项' });
    }
    if (String(newPassword).length < 6) {
      return res.status(400).json({ message: '新密码至少需要6位' });
    }

    const user = await userRepository.findOne({ where: { id: req.user.id } });
    if (!user) {
      return res.status(404).json({ message: '用户不存在' });
    }

    const isPasswordValid = await bcrypt.compare(currentPassword, user.password);
    if (!isPasswordValid) {
      return res.status(400).json({ message: '原密码不正确' });
    }

    user.password = await bcrypt.hash(newPassword, 10);
    await userRepository.save(user);

    res.json({ message: '密码修改成功' });
  } catch (error) {
    res.status(500).json({ message: '服务器错误' });
  }
};

export const updateProfile = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: '未认证' });
    }

    const { name, phone } = req.body;
    if (!name || !String(name).trim()) {
      return res.status(400).json({ message: '姓名为必填项' });
    }

    const user = await userRepository.findOne({ where: { id: req.user.id } });
    if (!user) {
      return res.status(404).json({ message: '用户不存在' });
    }

    const nextName = String(name).trim();
    const baseUsername = normalizeUsername(nextName) || user.username || user.code || '';
    const nextUsername = await ensureUniqueUsername(baseUsername, user.id);

    user.name = nextName;
    user.phone = phone;
    user.username = nextUsername;

    await userRepository.save(user);

    res.json({
      message: '资料更新成功',
      user: {
        id: user.id,
        username: user.username,
        code: user.code,
        name: user.name,
        role: user.role,
        phone: user.phone,
      },
    });
  } catch (error) {
    res.status(500).json({ message: '服务器错误' });
  }
};
