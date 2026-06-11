import bcrypt from 'bcrypt';
import { pinyin } from 'pinyin-pro';
import { AppDataSource } from '../config/database';
import { InventoryRecord, User, UserRole } from '../entities';
import { AppError } from '../utils/AppError';

export class UserService {
  private userRepository = AppDataSource.getRepository(User);
  private inventoryRecordRepository = AppDataSource.getRepository(InventoryRecord);

  private normalizeUsername(name: string) {
    const raw = pinyin(name, { toneType: 'none' });
    const cleaned = raw.replace(/\s+/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
    if (cleaned) {
      return cleaned;
    }
    return name.replace(/\s+/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  private async ensureUniqueUsername(baseUsername: string, userId?: string) {
    let candidate = baseUsername;
    let suffix = 1;
    while (true) {
      const existing = await this.userRepository.findOne({ where: { username: candidate } });
      if (!existing || (userId && existing.id === userId)) {
        return candidate;
      }
      candidate = `${baseUsername}${suffix}`;
      suffix += 1;
    }
  }

  async generateUserCode(): Promise<string> {
    const lastUser = await this.userRepository
      .createQueryBuilder('user')
      .where('user.code LIKE :code', { code: 'SE%' })
      .orderBy('user.code', 'DESC')
      .getOne();

    if (!lastUser || !lastUser.code) {
      return 'SE001';
    }

    const lastCodeNumber = parseInt(lastUser.code.substring(2), 10);
    const nextCodeNumber = lastCodeNumber + 1;
    return `SE${String(nextCodeNumber).padStart(3, '0')}`;
  }

  async getAllUsers() {
    const users = await this.userRepository.find({
      select: ['id', 'username', 'name', 'role', 'phone', 'isActive', 'createdAt', 'code', 'password'],
      order: { role: 'ASC', code: 'ASC' }
    });
    const enriched = await Promise.all(users.map(async (user) => {
      const isDefaultPassword = await bcrypt.compare('123456', user.password);
      const { password, ...rest } = user;
      return {
        ...rest,
        passwordStatus: isDefaultPassword ? 'default' : 'changed',
      };
    }));
    return enriched;
  }

  async createUser(data: Partial<User>) {
    const { password, name, role, phone } = data;

    if (!name) {
      throw new AppError('姓名为必填项', 400);
    }

    const rawPassword = password || '123456';
    const hashedPassword = await bcrypt.hash(rawPassword, 10);
    const code = await this.generateUserCode();
    const baseUsername = this.normalizeUsername(name) || code;
    const usernameToUse = await this.ensureUniqueUsername(baseUsername);

    const user = this.userRepository.create({
      username: usernameToUse,
      password: hashedPassword,
      name,
      role: role || UserRole.PIECE_RATE,
      phone,
      code,
    });

    await this.userRepository.save(user);

    return {
      id: user.id,
      username: user.username,
      name: user.name,
      role: user.role,
      code: user.code,
    };
  }

  async updateUser(id: string, data: Partial<User>) {
    const user = await this.userRepository.findOne({ where: { id } });
    if (!user) {
      throw new AppError('用户不存在', 404);
    }

    // 防止删除或禁用最后一个管理员 (可选增强)
    if (user.role === UserRole.ADMIN && data.role && data.role !== UserRole.ADMIN) {
      // 简单检查：如果是修改自己的角色，需要小心。
      // 这里暂不实现复杂的防自杀逻辑，但在前端应给予提示。
    }

    if (data.name) {
      user.name = data.name;
    }
    if (data.role) user.role = data.role;
    if (data.phone !== undefined) user.phone = data.phone;
    if (data.isActive !== undefined) user.isActive = data.isActive;
    
    await this.userRepository.save(user);

    return {
      id: user.id,
      username: user.username,
      name: user.name,
      role: user.role,
      isActive: user.isActive
    };
  }

  async resetPassword(id: string, newPassword = '123456') {
    const nextPassword = String(newPassword || '').trim();
    if (nextPassword.length < 6) {
      throw new AppError('新密码至少需要6位', 400);
    }

    const user = await this.userRepository.findOne({ where: { id } });
    if (!user) {
      throw new AppError('用户不存在', 404);
    }
    user.password = await bcrypt.hash(nextPassword, 10);
    await this.userRepository.save(user);
    return true;
  }

  async deleteUser(id: string, currentUserId?: string) {
    if (id === currentUserId) {
      throw new AppError('不能删除自己', 400);
    }

    const user = await this.userRepository.findOne({ where: { id } });
    if (!user) {
      throw new AppError('用户不存在', 404);
    }

    if (user.role === UserRole.ADMIN && user.isActive) {
      const activeAdminCount = await this.userRepository.count({
        where: { role: UserRole.ADMIN, isActive: true },
      });
      if (activeAdminCount <= 1) {
        throw new AppError('至少需要保留一个启用的管理员', 400);
      }
    }

    const linkedInventoryCount = await this.inventoryRecordRepository
      .createQueryBuilder('record')
      .where('record.submittedBy = :id OR record.reviewedBy = :id', { id })
      .getCount();

    if (linkedInventoryCount > 0) {
      throw new AppError('该用户存在入库记录，无法删除；可以在编辑中禁用账户', 400);
    }

    const result = await this.userRepository.delete(id);
    
    if (result.affected === 0) {
      throw new AppError('用户不存在', 404);
    }

    return true;
  }
}

export const userService = new UserService();
