import { supabase } from './supabase';

export const MAX_BYTES = 20 * 1024 * 1024;
export const BUCKET = 'files';

/* 图片超过 1600px 用 canvas 压成 webp，其余原样。返回要上传的 Blob 与最终名字。 */
export async function prepare(file: File, compress: boolean): Promise<{ blob: Blob; name: string; mime: string }> {
  if (!compress || !file.type.startsWith('image/') || file.type === 'image/gif' || file.type === 'image/svg+xml') return { blob: file, name: file.name, mime: file.type };
  const bmp = await createImageBitmap(file).catch(() => null);
  if (!bmp) return { blob: file, name: file.name, mime: file.type };
  const max = 1600; const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
  if (scale === 1 && file.size < 600 * 1024) return { blob: file, name: file.name, mime: file.type };
  const cv = document.createElement('canvas'); cv.width = Math.round(bmp.width * scale); cv.height = Math.round(bmp.height * scale);
  cv.getContext('2d')!.drawImage(bmp, 0, 0, cv.width, cv.height);
  const blob = await new Promise<Blob | null>(res => cv.toBlob(res, 'image/webp', 0.82));
  if (!blob || blob.size >= file.size) return { blob: file, name: file.name, mime: file.type };
  return { blob, name: file.name.replace(/\.[^.]+$/, '') + '.webp', mime: 'image/webp' };
}

export function objectPath(wsId: string, fileId: string, name: string) { return `${wsId}/${fileId}-${name}`; }

export async function uploadBlob(path: string, blob: Blob, mime: string) {
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: mime, upsert: false });
  if (error) throw error;
}
export async function signedUrl(path: string, seconds = 3600) {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, seconds);
  if (error || !data) throw error || new Error('no url');
  return data.signedUrl;
}
export async function removeObject(path: string) { await supabase.storage.from(BUCKET).remove([path]); }
