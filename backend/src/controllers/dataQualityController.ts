import { Response } from 'express';
import { AuthRequest } from '../middlewares/auth';
import { dataQualityService } from '../services/dataQualityService';

export const getDataQualityAudit = async (_req: AuthRequest, res: Response) => {
  try {
    const issues = await dataQualityService.audit();
    res.json({
      issueCount: issues.length,
      blockingCount: issues.filter((issue) => issue.severity === 'error').length,
      warningCount: issues.filter((issue) => issue.severity === 'warning').length,
      issues,
    });
  } catch (error) {
    res.status(500).json({ message: '数据质量审计失败' });
  }
};
