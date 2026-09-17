import { uid } from './utils.js';

const MAX_UPLOAD_BYTES = 1 * 1024 * 1024;

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
  const maxBytes = Number(options.maxBytes || MAX_UPLOAD_BYTES);
  if (Number(file.size || 0) > maxBytes) throw new Error('Screenshot must be 1 MB or smaller.');

  const source = await loadImageSource(file);
  try {
    const sourceWidth = Number(source.width || 0);
    const sourceHeight = Number(source.height || 0);
    if (!(sourceWidth > 0 && sourceHeight > 0)) throw new Error('Could not read image dimensions.');

    const originalName = String(file.name || uid('winner-image'));
    const extension = originalName.match(/\.([^.]+)$/)?.[1]?.toLowerCase() || 'img';
    const baseName = originalName
      .replace(/\.[^.]+$/, '')
      .replace(/[^a-zA-Z0-9-_]+/g, '-')
      .replace(/^-+|-+$/g, '') || uid('winner-image');
    const fileName = `${baseName}.${extension}`;

    const previewUrl = URL.createObjectURL(file);
    return {
      blob: file,
      previewUrl,
      fileName,
      contentType: file.type,
      width: sourceWidth,
      height: sourceHeight,
      originalWidth: sourceWidth,
      originalHeight: sourceHeight,
      sizeBytes: file.size,
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
