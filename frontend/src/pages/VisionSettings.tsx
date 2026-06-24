import React, { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Eye, EyeOff, Loader2, Save, ScanLine, XCircle } from 'lucide-react';
import api from '../utils/api';

interface VisionSettingsData {
  configured: boolean;
  hasKey: boolean;
  baseUrl: string;
  model: string;
  source: 'db' | 'env' | 'none';
}

const SOURCE_LABEL: Record<VisionSettingsData['source'], string> = {
  db: '已配置（界面）',
  env: '已配置（.env）',
  none: '未配置',
};

const inputClass =
  'mt-1 block w-full rounded-lg border border-line px-3 py-2 text-sm text-ink shadow-sm transition-colors focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500';

const VisionSettings: React.FC = () => {
  const queryClient = useQueryClient();
  const [baseUrl, setBaseUrl] = useState('');
  const [model, setModel] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  const { data, isLoading } = useQuery<VisionSettingsData>({
    queryKey: ['visionSettings'],
    queryFn: async () => (await api.get('/settings/vision')).data,
  });

  useEffect(() => {
    if (data) {
      setBaseUrl(data.baseUrl || '');
      setModel(data.model || '');
    }
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload: Record<string, string> = { baseUrl, model };
      if (apiKey.trim()) payload.apiKey = apiKey.trim();
      return (await api.put('/settings/vision', payload)).data;
    },
    onSuccess: () => {
      setApiKey('');
      setSaveMsg('已保存');
      setTestResult(null);
      queryClient.invalidateQueries({ queryKey: ['visionSettings'] });
      window.setTimeout(() => setSaveMsg(''), 2500);
    },
    onError: (error: any) => setSaveMsg(error?.response?.data?.message || '保存失败'),
  });

  const testMutation = useMutation({
    mutationFn: async () => (await api.post('/settings/vision/test')).data,
    onSuccess: (result: { ok: boolean; message: string }) => setTestResult(result),
    onError: (error: any) =>
      setTestResult({ ok: false, message: error?.response?.data?.message || '测试失败' }),
  });

  const clearMutation = useMutation({
    mutationFn: async () => (await api.delete('/settings/vision/key')).data,
    onSuccess: () => {
      setApiKey('');
      setTestResult(null);
      queryClient.invalidateQueries({ queryKey: ['visionSettings'] });
    },
  });

  const statusTone =
    data?.source === 'none' ? 'bg-slate-100 text-slate-500' : 'bg-emerald-50 text-emerald-700';

  return (
    <div className="-mx-4 bg-white md:-mx-6">
      <div className="p-6">
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
              <ScanLine className="h-5 w-5" />
            </span>
            <div>
              <h3 className="text-base font-semibold text-ink">送货单图像识别</h3>
              <p className="mt-0.5 text-sm text-ink-tertiary">
                配置一个 OpenAI 兼容的视觉接口，创建送货单时即可拍照自动识别回填。
              </p>
            </div>
          </div>
          <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${statusTone}`}>
            {isLoading ? '加载中...' : SOURCE_LABEL[data?.source || 'none']}
          </span>
        </div>

        <div className="grid grid-cols-1 gap-x-6 gap-y-4 lg:grid-cols-2">
          <div>
            <label className="block text-sm font-medium text-ink-secondary">接口地址 (Base URL)</label>
            <input
              type="text"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="https://generativelanguage.googleapis.com/v1beta/openai"
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-ink-secondary">模型名称</label>
            <input
              type="text"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="gemini-2.0-flash"
              className={inputClass}
            />
          </div>
          <div className="lg:col-span-2">
            <label className="block text-sm font-medium text-ink-secondary">API Key</label>
            <div className="relative mt-1">
              <input
                type={showKey ? 'text' : 'password'}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                autoComplete="off"
                placeholder={data?.hasKey ? '已配置，留空表示不修改' : '粘贴 API Key（密钥仅保存在服务端，不会回显）'}
                className={`${inputClass} mt-0 pr-10`}
              />
              <button
                type="button"
                onClick={() => setShowKey((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-ink-tertiary hover:text-ink"
                aria-label={showKey ? '隐藏' : '显示'}
              >
                {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <p className="mt-1 text-xs text-ink-tertiary">
              推荐 Google Gemini 免费层（AI Studio 申请免费 key，无需信用卡）；亦可用通义千问 Qwen-VL 等。
            </p>
          </div>
        </div>

        {testResult && (
          <div
            className={`mt-4 inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-sm ${
              testResult.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-600'
            }`}
          >
            {testResult.ok ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
            {testResult.message}
          </div>
        )}

        <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3 text-sm">
            {saveMsg && (
              <span className="inline-flex items-center gap-1.5 text-emerald-600">
                <CheckCircle2 className="h-4 w-4" />
                {saveMsg}
              </span>
            )}
            {data?.source === 'db' && data?.hasKey && (
              <button
                type="button"
                onClick={() => clearMutation.mutate()}
                disabled={clearMutation.isPending}
                className="text-ink-tertiary transition-colors hover:text-rose-600"
              >
                清除已保存的密钥
              </button>
            )}
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => testMutation.mutate()}
              disabled={testMutation.isPending || !data?.hasKey}
              title={!data?.hasKey ? '请先保存 API Key 再测试' : '测试已保存的配置'}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-line bg-white px-4 py-2 text-sm font-medium text-ink-secondary shadow-sm transition-colors hover:border-brand-200 hover:bg-brand-50 hover:text-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {testMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanLine className="h-4 w-4" />}
              测试连接
            </button>
            <button
              type="button"
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-brand-700 disabled:opacity-60"
            >
              <Save className="h-4 w-4" />
              {saveMutation.isPending ? '保存中...' : '保存'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default VisionSettings;
