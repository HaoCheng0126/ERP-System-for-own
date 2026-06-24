import { Response } from 'express';
import { AppDataSource } from '../config/database';
import { SystemSetting } from '../entities';
import { AuthRequest } from '../middlewares/auth';
import { AppError } from '../utils/AppError';
import { getVisionConfig, pingVisionService } from '../services/visionService';

const repo = () => AppDataSource.getRepository(SystemSetting);

const setSetting = async (key: string, value: string) => {
  let row = await repo().findOne({ where: { key } });
  if (!row) {
    row = repo().create({ key, value });
  } else {
    row.value = value;
  }
  await repo().save(row);
};

// 注意：永远不把 API Key 返回给前端，只返回「是否已配置」+ 端点/模型。
export const getVisionSettings = async (_req: AuthRequest, res: Response) => {
  try {
    const config = await getVisionConfig();
    res.json({
      configured: Boolean(config.apiKey),
      hasKey: Boolean(config.apiKey),
      baseUrl: config.baseUrl,
      model: config.model,
      source: config.source,
    });
  } catch (error) {
    res.status(500).json({ message: '读取识别配置失败' });
  }
};

export const updateVisionSettings = async (req: AuthRequest, res: Response) => {
  try {
    const { apiKey, baseUrl, model } = req.body || {};
    if (typeof baseUrl === 'string') await setSetting('VISION_BASE_URL', baseUrl.trim());
    if (typeof model === 'string') await setSetting('VISION_MODEL', model.trim());
    // 仅当传入非空 apiKey 时才更新；留空表示「不修改已保存的密钥」。
    if (typeof apiKey === 'string' && apiKey.trim()) {
      await setSetting('VISION_API_KEY', apiKey.trim());
    }
    res.json({ message: '识别配置已保存' });
  } catch (error) {
    res.status(500).json({ message: '保存识别配置失败' });
  }
};

export const clearVisionApiKey = async (_req: AuthRequest, res: Response) => {
  try {
    await setSetting('VISION_API_KEY', '');
    res.json({ message: '已清除数据库中保存的 API Key' });
  } catch (error) {
    res.status(500).json({ message: '清除失败' });
  }
};

export const testVisionSettings = async (_req: AuthRequest, res: Response) => {
  try {
    const result = await pingVisionService();
    res.json(result);
  } catch (error: any) {
    if (error instanceof AppError) return res.status(error.statusCode).json({ ok: false, message: error.message });
    res.status(500).json({ ok: false, message: '测试失败，请稍后重试' });
  }
};
