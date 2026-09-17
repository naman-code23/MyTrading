import { uid } from './utils.js';

export function formatBytes(bytes = 0) {
  const value = Number(bytes || 0);
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(2)} MB`;
}

export async function prepareImageForUpload(file) {
  if (!file) throw new Error('Choose an image file first.');
  const originalName = String(file.name || uid('winner-image'));
  const extension = originalName.match(/\.([^.]+)$/)?.[1]?.toLowerCase() || 'img';
  const baseName = originalName
    .replace(/\.[^.]+$/, '')
    .replace(/[^a-zA-Z0-9-_]+/g, '-')
    .replace(/^-+|-+$/g, '') || uid('winner-image');
  const fileName = `${baseName}.${extension}`;

  return {
    blob: file,
    previewUrl: URL.createObjectURL(file),
    fileName,
    contentType: file.type,
    width: null,
    height: null,
    originalWidth: null,
    originalHeight: null,
    sizeBytes: file.size,
    originalSizeBytes: file.size,
  };
}

export function revokePreparedPreview(prepared) {
  if (prepared?.previewUrl) {
    URL.revokeObjectURL(prepared.previewUrl);
  }
}
