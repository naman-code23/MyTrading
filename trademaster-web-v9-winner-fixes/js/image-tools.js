import { uid } from './utils.js';

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), type, quality);
  });
}

async function loadImageSource(file) {
  if ('createImageBitmap' in window) {
    return await createImageBitmap(file);
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error('Could not decode image file.'));
      element.src = objectUrl;
    });
    return image;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function cleanupImageSource(source) {
  if (source && typeof source.close === 'function') source.close();
}

export function formatBytes(bytes = 0) {
  const value = Number(bytes || 0);
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(2)} MB`;
}

export async function prepareImageForUpload(file, options = {}) {
  if (!file) throw new Error('Choose an image file first.');
  if (!String(file.type || '').startsWith('image/')) throw new Error('Only image files are supported.');

  const maxDimension = Number(options.maxDimension || 1600);
  const quality = Number(options.quality || 0.82);
  const preferredType = options.preferredType || 'image/webp';
  const fallbackType = options.fallbackType || 'image/jpeg';

  const source = await loadImageSource(file);
  try {
    const sourceWidth = Number(source.width || 0);
    const sourceHeight = Number(source.height || 0);
    if (!(sourceWidth > 0 && sourceHeight > 0)) throw new Error('Could not read image dimensions.');

    const scale = Math.min(1, maxDimension / Math.max(sourceWidth, sourceHeight));
    const width = Math.max(1, Math.round(sourceWidth * scale));
    const height = Math.max(1, Math.round(sourceHeight * scale));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Could not create image canvas.');

    ctx.fillStyle = '#0b1220';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(source, 0, 0, width, height);

    let blob = await canvasToBlob(canvas, preferredType, quality);
    let contentType = preferredType;
    let extension = preferredType.includes('webp') ? 'webp' : 'jpg';

    if (!blob) {
      blob = await canvasToBlob(canvas, fallbackType, quality);
      contentType = fallbackType;
      extension = 'jpg';
    }
    if (!blob) throw new Error('Could not encode the compressed screenshot.');

    const baseName = String(file.name || uid('winner-image'))
      .replace(/\.[^.]+$/, '')
      .replace(/[^a-zA-Z0-9-_]+/g, '-')
      .replace(/^-+|-+$/g, '') || uid('winner-image');
    const fileName = `${baseName}.${extension}`;

    const previewUrl = URL.createObjectURL(blob);
    return {
      blob,
      previewUrl,
      fileName,
      contentType,
      width,
      height,
      originalWidth: sourceWidth,
      originalHeight: sourceHeight,
      sizeBytes: blob.size,
      originalSizeBytes: file.size,
    };
  } finally {
    cleanupImageSource(source);
  }
}

export function revokePreparedPreview(prepared) {
  if (prepared?.previewUrl) {
    URL.revokeObjectURL(prepared.previewUrl);
  }
}
