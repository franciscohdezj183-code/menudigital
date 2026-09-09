import QRCode from 'qrcode';

export const QR_OPTIONS = Object.freeze({
  errorCorrectionLevel: 'H',
  margin: 4,
  color: { dark: '#111111', light: '#FFFFFF' },
});

export const createQrSvg = publicUrl => QRCode.toString(publicUrl, { ...QR_OPTIONS, type: 'svg', width: 1024 });

const loadImage = (source, ImageConstructor) => new Promise((resolve, reject) => {
  const image = new ImageConstructor();
  image.crossOrigin = 'anonymous';
  image.onload = () => resolve(image);
  image.onerror = () => reject(new Error('IMAGE_UNAVAILABLE'));
  image.src = source;
});

function drawContained(context, image, x, y, size) {
  const width = image.naturalWidth || image.width || 1;
  const height = image.naturalHeight || image.height || 1;
  const scale = Math.min(size / width, size / height);
  const drawnWidth = width * scale;
  const drawnHeight = height * scale;
  context.drawImage(image, x + (size - drawnWidth) / 2, y + (size - drawnHeight) / 2, drawnWidth, drawnHeight);
}

export async function createQrPng(publicUrl, logoUrl, { size = 1024, documentRef = document, ImageConstructor = window.Image } = {}) {
  const canvas = documentRef.createElement('canvas');
  await QRCode.toCanvas(canvas, publicUrl, { ...QR_OPTIONS, width: size });
  let logoIncluded = false;
  if (logoUrl) {
    try {
      const logo = await loadImage(logoUrl, ImageConstructor);
      const context = canvas.getContext('2d');
      const backingSize = Math.round(size * .22);
      const logoSize = Math.round(size * .18);
      const centerX = size / 2;
      const centerY = size * .515;
      context.save();
      context.fillStyle = '#FFFFFF';
      context.beginPath();
      context.arc(centerX, centerY, backingSize / 2, 0, Math.PI * 2);
      context.fill();
      context.beginPath();
      context.arc(centerX, centerY, logoSize / 2, 0, Math.PI * 2);
      context.clip();
      drawContained(context, logo, centerX - logoSize / 2, centerY - logoSize / 2, logoSize);
      context.restore();
      logoIncluded = true;
    } catch { /* El QR continúa siendo válido sin logo. */ }
  }
  return { dataUrl: canvas.toDataURL('image/png'), logoIncluded };
}

export function downloadDataUrl(dataUrl, filename, documentRef = document) {
  const link = documentRef.createElement('a');
  link.href = dataUrl;
  link.download = filename;
  link.rel = 'noopener';
  link.click();
}
