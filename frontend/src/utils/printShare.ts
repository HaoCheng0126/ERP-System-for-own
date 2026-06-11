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

export const sharePdfFile = async (file: File, options: ShareOptions): Promise<PdfShareResult> => {
  const shareApi = getShareApi();
  const shareData: ShareData = {
    title: options.title,
    text: options.text,
    files: [file],
  };

  if (shareApi.share && (!shareApi.canShare || shareApi.canShare(shareData))) {
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
