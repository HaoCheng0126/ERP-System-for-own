// 上传前在浏览器端把图片等比缩小并转 JPEG data URL，减小体积、加快识别、降低成本。
export const fileToDownscaledDataUrl = (file: File, maxDim = 1600, quality = 0.82): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('读取图片失败'));
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => reject(new Error('图片解析失败'));
      image.onload = () => {
        const longest = Math.max(image.width, image.height) || 1;
        const scale = Math.min(1, maxDim / longest);
        const width = Math.max(1, Math.round(image.width * scale));
        const height = Math.max(1, Math.round(image.height * scale));

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('当前浏览器无法处理图片'));
          return;
        }
        ctx.drawImage(image, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      image.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
