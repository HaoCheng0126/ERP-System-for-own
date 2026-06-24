import { Response } from 'express';
import { AppDataSource } from '../config/database';
import { Company } from '../entities';
import { AuthRequest } from '../middlewares/auth';

const companyRepository = AppDataSource.getRepository(Company);

export const getCompany = async (req: AuthRequest, res: Response) => {
  try {
    const company = await companyRepository.findOne({ where: {} });
    
    if (!company) {
      return res.json({
        id: '',
        name: '',
        address: '',
        contactPerson: '',
        phone: '',
        statementTaxLabel: '',
        statementSettlementLabel: '',
        createdAt: '',
        updatedAt: '',
      });
    }

    res.json(company);
  } catch (error) {
    res.status(500).json({ message: '服务器错误' });
  }
};

export const updateCompany = async (req: AuthRequest, res: Response) => {
  try {
    let company = await companyRepository.findOne({ where: {} });
    const { id, createdAt, updatedAt, ...companyPayload } = req.body || {};
    
    if (!company) {
      company = companyRepository.create(companyPayload as Partial<Company>);
    } else {
      companyRepository.merge(company, companyPayload);
    }

    if (!company) {
      return res.status(500).json({ message: '无法创建或更新公司' });
    }
    await companyRepository.save(company);
    res.json({ message: '公司资料更新成功', company });
  } catch (error) {
    res.status(500).json({ message: '服务器错误' });
  }
};
