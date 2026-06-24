export type PdfOrientation = 'portrait' | 'landscape';
export type PdfShareResult = 'shared' | 'downloaded' | 'cancelled';

type PdfOptions = {
  filename: string;
  orientation: PdfOrientation;
  marginMm?: number;
};

type ShareOptions = {
  title: string;
  text?: string;
};

const A4_WIDTH_PX: Record<PdfOrientation, number> = {
  portrait: 794,
  landscape: 1123,
};

export const toSafePdfFileName = (name: string) => {
  const cleaned = name
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  return `${cleaned || '导出文件'}.pdf`;
};

const forceVisibleTree = (node: HTMLElement) => {
  node.style.display = 'block';
  node.style.visibility = 'visible';
  node.style.opacity = '1';
  node.style.maxWidth = 'none';
  node.style.overflow = 'visible';
  node.style.boxSizing = 'border-box';

  node
    .querySelectorAll<HTMLElement>(
      '.salary-slip-print-sheet, .delivery-print-card, .delivery-print-shell, .delivery-print-table-shell, .purchase-print-card, .purchase-print-shell, .purchase-print-table-shell, .statement-print-sheet, .inventory-print-sheet',
    )
    .forEach((child) => {
      child.style.width = '100%';
      child.style.maxWidth = 'none';
      child.style.overflow = 'visible';
      child.style.boxSizing = 'border-box';
    });

  node
    .querySelectorAll<HTMLElement>(
      '.salary-slip-print-table, .delivery-print-table, .purchase-print-table, .statement-print-table, .inventory-print-table',
    )
    .forEach((table) => {
      table.style.width = '100%';
      table.style.minWidth = '0';
      table.style.tableLayout = 'fixed';
      table.style.borderCollapse = 'collapse';
      table.style.boxSizing = 'border-box';
    });

  node
    .querySelectorAll<HTMLElement>('.delivery-print-table, .purchase-print-table, .statement-print-table, .inventory-print-table')
    .forEach((table) => {
      table.style.fontSize = '11px';
    });

  node.querySelectorAll<HTMLElement>('thead').forEach((thead) => {
    thead.style.display = 'table-header-group';
  });

  node.querySelectorAll<HTMLElement>('tr, td, th').forEach((cell) => {
    cell.style.pageBreakInside = 'avoid';
    cell.style.breakInside = 'avoid';
    cell.style.boxSizing = 'border-box';
    cell.style.overflowWrap = 'anywhere';
    cell.style.wordBreak = 'break-word';
  });

  node.querySelectorAll<HTMLElement>('*').forEach((child) => {
    child.style.visibility = 'visible';
    child.style.opacity = '1';
  });
};

export const createPdfFileFromElement = async (element: HTMLElement, options: PdfOptions) => {
  const pageWidth = A4_WIDTH_PX[options.orientation];
  const container = document.createElement('div');
  const clone = element.cloneNode(true) as HTMLElement;

  container.className = 'pdf-export-root';
  container.style.position = 'fixed';
  container.style.left = '-10000px';
  container.style.top = '0';
  container.style.width = `${pageWidth}px`;
  container.style.background = '#ffffff';
  container.style.color = '#111827';
  container.style.zIndex = '-1';

  forceVisibleTree(clone);
  clone.style.width = '100%';
  clone.style.background = '#ffffff';
  container.appendChild(clone);
  document.body.appendChild(container);

  try {
    const { default: html2pdf } = await import('html2pdf.js');
    const blob = await html2pdf()
      .set({
        margin: options.marginMm ?? 12,
        filename: options.filename,
        image: { type: 'jpeg', quality: 0.98 },
        pagebreak: { mode: ['css', 'legacy'] },
        html2canvas: {
          scale: 2,
          useCORS: true,
          backgroundColor: '#ffffff',
          windowWidth: pageWidth,
          scrollX: 0,
          scrollY: 0,
        },
        jsPDF: {
          unit: 'mm',
          format: 'a4',
          orientation: options.orientation,
        },
      } as any)
      .from(clone)
      .outputPdf('blob');

    return new File([blob], options.filename, { type: 'application/pdf' });
  } finally {
    container.remove();
  }
};

export const downloadPdfFile = (file: File) => {
  const url = URL.createObjectURL(file);
  const link = document.createElement('a');

  link.href = url;
  link.download = file.name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};

const getShareApi = () =>
  navigator as Navigator & {
    canShare?: (data: ShareData) => boolean;
    share?: (data: ShareData) => Promise<void>;
  };

// 是否在微信内置浏览器里（微信 WebView 屏蔽了 Web 分享 API，且常常拦截文件下载）
export const isWeChatBrowser = () =>
  typeof navigator !== 'undefined' && /micromessenger/i.test(navigator.userAgent || '');

// Web 分享 API 只在 HTTPS（或 localhost）安全环境下可用
const isSecureShareContext = () =>
  typeof window !== 'undefined' &&
  (window.isSecureContext || window.location.protocol === 'https:' || window.location.hostname === 'localhost');

// 无法直接「分享到微信」时，按当前环境给出针对性的引导文案
export const getShareFallbackMessage = () => {
  if (isWeChatBrowser()) {
    return '微信内置浏览器不支持直接保存或分享文件。请点右上角「···」→「在浏览器打开」，再用系统分享发送到微信。';
  }
  if (!isSecureShareContext()) {
    return '当前非 HTTPS 安全环境，浏览器无法调起微信分享；已保存 PDF，可手动发送。建议用 https 访问以启用一键分享。';
  }
  return '当前设备/浏览器未提供微信分享（通常是电脑端），已保存 PDF，请手动拖入微信发送。';
};

export const sharePdfFile = async (file: File, options: ShareOptions): Promise<PdfShareResult> => {
  const shareApi = getShareApi();
  const shareData: ShareData = {
    title: options.title,
    text: options.text,
    files: [file],
  };

  // 微信内置浏览器会屏蔽 Web 分享 API，直接走降级、避免一次注定失败的调用
  if (!isWeChatBrowser() && shareApi.share && (!shareApi.canShare || shareApi.canShare(shareData))) {
    try {
      await shareApi.share(shareData);
      return 'shared';
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return 'cancelled';
      }
    }
  }

  downloadPdfFile(file);
  return 'downloaded';
};

// 把打印元素渲染成一张图片（JPEG）。手机分享到微信用图片体验最好（直接进聊天 / 可存相册）。
export const createImageFileFromElement = async (
  element: HTMLElement,
  options: { filename: string; orientation: PdfOrientation },
) => {
  const pageWidth = A4_WIDTH_PX[options.orientation];
  const container = document.createElement('div');
  const clone = element.cloneNode(true) as HTMLElement;

  container.className = 'pdf-export-root';
  container.style.position = 'fixed';
  container.style.left = '-10000px';
  container.style.top = '0';
  container.style.width = `${pageWidth}px`;
  container.style.background = '#ffffff';
  container.style.color = '#111827';
  container.style.zIndex = '-1';

  forceVisibleTree(clone);
  clone.style.width = '100%';
  clone.style.background = '#ffffff';
  container.appendChild(clone);
  document.body.appendChild(container);

  try {
    const { default: html2pdf } = await import('html2pdf.js');
    const canvas: HTMLCanvasElement = await html2pdf()
      .set({
        html2canvas: {
          scale: 2,
          useCORS: true,
          backgroundColor: '#ffffff',
          windowWidth: pageWidth,
          scrollX: 0,
          scrollY: 0,
        },
      } as any)
      .from(clone)
      .toCanvas()
      .get('canvas');

    const blob: Blob = await new Promise((resolve, reject) => {
      canvas.toBlob(
        (result) => (result ? resolve(result) : reject(new Error('图片生成失败'))),
        'image/jpeg',
        0.95,
      );
    });

    const imageName = options.filename.replace(/\.pdf$/i, '') + '.jpg';
    return new File([blob], imageName, { type: 'image/jpeg' });
  } finally {
    container.remove();
  }
};

// 当前环境能否直接分享文件（手机 + 安全环境 + 非微信内置浏览器）
export const canShareFiles = () => {
  const api = getShareApi();
  if (isWeChatBrowser()) return false;
  if (typeof api.share !== 'function' || typeof api.canShare !== 'function') return false;
  try {
    const probe = new File(['x'], 'probe.jpg', { type: 'image/jpeg' });
    return api.canShare({ files: [probe] });
  } catch {
    return false;
  }
};

export type ExportResult = 'shared' | 'saved' | 'cancelled' | 'fallback-download';

// 统一导出：手机 → 图片走系统分享面板（微信/存图）；电脑 → PDF（保存=下载，分享=系统分享）。
export const exportPrintable = async (
  element: HTMLElement,
  options: { filename: string; orientation: PdfOrientation; marginMm?: number; title: string; text?: string },
  action: 'save' | 'share',
): Promise<ExportResult> => {
  if (canShareFiles()) {
    const image = await createImageFileFromElement(element, {
      filename: options.filename,
      orientation: options.orientation,
    });
    const result = await sharePdfFile(image, { title: options.title, text: options.text });
    if (result === 'shared') return 'shared';
    if (result === 'cancelled') return 'cancelled';
    downloadPdfFile(image);
    return 'fallback-download';
  }

  const pdf = await createPdfFileFromElement(element, {
    filename: options.filename,
    orientation: options.orientation,
    marginMm: options.marginMm,
  });
  if (action === 'save') {
    downloadPdfFile(pdf);
    return 'saved';
  }
  const result = await sharePdfFile(pdf, { title: options.title, text: options.text });
  if (result === 'shared') return 'shared';
  if (result === 'cancelled') return 'cancelled';
  return 'fallback-download';
};
