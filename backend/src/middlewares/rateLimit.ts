import { Request, Response, NextFunction } from 'express';

type Bucket = { count: number; resetAt: number };

interface RateLimitOptions {
  windowMs: number;
  max: number;
  message?: string;
}

/**
 * 轻量内存版限流：按客户端 IP 在滑动时间窗内限制请求数。
 * 用于登录爆破与 OCR 等昂贵接口的防滥用。单实例够用；
 * 多实例部署时应换成共享存储（Redis）版本。
 */
export function rateLimit(options: RateLimitOptions) {
  const { windowMs, max, message = '请求过于频繁，请稍后再试' } = options;
  const buckets = new Map<string, Bucket>();

  // 周期清理过期桶，避免内存无界增长；unref 不阻止进程退出。
  const sweepTimer = setInterval(() => {
    const now = Date.now();
    for (const [key, bucket] of buckets) {
      if (bucket.resetAt <= now) buckets.delete(key);
    }
  }, Math.max(windowMs, 60_000));
  sweepTimer.unref?.();

  return (req: Request, res: Response, next: NextFunction) => {
    const now = Date.now();
    const key = req.ip || req.socket.remoteAddress || 'unknown';
    let bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + windowMs };
      buckets.set(key, bucket);
    }
    bucket.count += 1;
    if (bucket.count > max) {
      res.set('Retry-After', String(Math.ceil((bucket.resetAt - now) / 1000)));
      return res.status(429).json({ message });
    }
    next();
  };
}
