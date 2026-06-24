import { AppError } from '../utils/AppError';
import { AppDataSource } from '../config/database';
import { SystemSetting } from '../entities/SystemSetting';
import { In } from '../lib/typeorm';

export interface RecognizedDeliveryItem {
  productName: string;
  specification: string | null;
  quantity: number | null;
  unitPrice: number | null;
}

export interface RecognizedDelivery {
  customerName: string | null;
  deliveryDate: string | null;
  items: RecognizedDeliveryItem[];
}

// 可插拔：任何 OpenAI 兼容的视觉接口都能用（默认 Google Gemini 免费层，亦可换 Qwen-VL / OpenAI）。
// 密钥只从环境变量读取，绝不硬编码。
const DEFAULT_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/openai';
const DEFAULT_MODEL = 'gemini-2.0-flash';

export interface VisionConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
  source: 'db' | 'env' | 'none';
}

// 配置优先级：数据库（界面设置）> 环境变量 > 默认值。
export async function getVisionConfig(): Promise<VisionConfig> {
  let db: Record<string, string | null | undefined> = {};
  try {
    const rows = await AppDataSource.getRepository(SystemSetting).find({
      where: { key: In(['VISION_API_KEY', 'VISION_BASE_URL', 'VISION_MODEL']) },
    });
    db = Object.fromEntries(rows.map((row) => [row.key, row.value]));
  } catch {
    db = {};
  }
  const apiKey = db.VISION_API_KEY || process.env.VISION_API_KEY || '';
  return {
    apiKey,
    baseUrl: (db.VISION_BASE_URL || process.env.VISION_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, ''),
    model: db.VISION_MODEL || process.env.VISION_MODEL || DEFAULT_MODEL,
    source: db.VISION_API_KEY ? 'db' : process.env.VISION_API_KEY ? 'env' : 'none',
  };
}

const SYSTEM_PROMPT = [
  '你是专业的送货单识别助手。请从图片中提取以下字段并严格只返回一个 JSON 对象：',
  '{',
  '  "customerName": 客户名称(字符串或null),',
  '  "deliveryDate": 送货日期(格式 YYYY-MM-DD，无法判断用null),',
  '  "items": [ { "productName": 品名, "specification": 规格或null, "quantity": 数量(数字或null), "unitPrice": 单价(数字或null) } ]',
  '}',
  '只输出 JSON，不要任何解释、不要 markdown 代码块。数量、单价必须是纯数字。',
].join('\n');

const extractJson = (text: string): string => {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced ? fenced[1] : text;
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  return start >= 0 && end >= start ? body.slice(start, end + 1) : body;
};

const toNumberOrNull = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export async function recognizeDeliveryNote(imageDataUrl: string): Promise<RecognizedDelivery> {
  const { apiKey, baseUrl, model } = await getVisionConfig();
  if (!apiKey) {
    throw new AppError('未配置识别服务，请在「系统设置 → 识别配置」中填写 API Key（或在后端 .env 配置）', 503);
  }

  let response: Response;
  try {
    response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        temperature: 0,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          {
            role: 'user',
            content: [
              { type: 'text', text: '请识别这张送货单并按要求返回 JSON。' },
              { type: 'image_url', image_url: { url: imageDataUrl } },
            ],
          },
        ],
      }),
    });
  } catch (error) {
    throw new AppError(`识别服务网络错误：${error instanceof Error ? error.message : String(error)}`, 502);
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new AppError(`识别服务调用失败（${response.status}）：${detail.slice(0, 300)}`, 502);
  }

  const data = (await response.json()) as { choices?: { message?: { content?: string } }[] };
  const content = data?.choices?.[0]?.message?.content;
  if (!content || typeof content !== 'string') {
    throw new AppError('识别服务返回为空，请重试', 502);
  }

  let parsed: {
    customerName?: unknown;
    deliveryDate?: unknown;
    items?: { productName?: unknown; specification?: unknown; quantity?: unknown; unitPrice?: unknown }[];
  };
  try {
    parsed = JSON.parse(extractJson(content));
  } catch {
    throw new AppError('识别结果解析失败，请换一张更清晰的图片重试', 422);
  }

  const rawItems = Array.isArray(parsed.items) ? parsed.items : [];
  const items: RecognizedDeliveryItem[] = rawItems
    .map((item) => ({
      productName: String(item?.productName ?? '').trim(),
      specification:
        item?.specification !== null && item?.specification !== undefined && String(item.specification).trim()
          ? String(item.specification).trim()
          : null,
      quantity: toNumberOrNull(item?.quantity),
      unitPrice: toNumberOrNull(item?.unitPrice),
    }))
    .filter((item) => item.productName);

  return {
    customerName: parsed.customerName ? String(parsed.customerName).trim() : null,
    deliveryDate: parsed.deliveryDate ? String(parsed.deliveryDate).trim() : null,
    items,
  };
}

// 测试识别服务连通性：用一次极简文本调用验证 key / 端点 / 模型是否可用。
export async function pingVisionService(): Promise<{ ok: boolean; message: string }> {
  const { apiKey, baseUrl, model } = await getVisionConfig();
  if (!apiKey) {
    throw new AppError('尚未配置 API Key，请先填写并保存', 400);
  }

  let response: Response;
  try {
    response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        max_tokens: 16,
        messages: [{ role: 'user', content: '请只回复两个字：正常' }],
      }),
    });
  } catch (error) {
    throw new AppError(`连接失败：${error instanceof Error ? error.message : String(error)}`, 502);
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new AppError(`连接失败（${response.status}）：${detail.slice(0, 200)}`, 502);
  }

  return { ok: true, message: `连接成功，模型 ${model} 可用` };
}
