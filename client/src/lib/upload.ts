import { api } from '@/lib/api';

export type MediaKind = 'avatar' | 'service' | 'face' | 'invoice' | 'site' | 'promo';
export type UploadedMedia = { id: number; url: string; mime: string; size: number; kind: MediaKind };

const MAX_SIDE: Record<MediaKind, number> = { avatar: 900, service: 1600, face: 1000, invoice: 2000, site: 2200, promo: 1600 };

function readAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Não foi possível ler o arquivo.'));
    reader.readAsDataURL(blob);
  });
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Imagem inválida ou formato não suportado (use JPG, PNG ou WEBP).')); };
    img.src = url;
  });
}

/** Reduz a foto no próprio aparelho antes de enviar (envio rápido e leve). */
async function compressImage(file: File, maxSide: number): Promise<Blob> {
  if (file.type === 'image/gif') return file;
  const img = await loadImage(file);
  const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
  const width = Math.max(1, Math.round(img.naturalWidth * scale));
  const height = Math.max(1, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return file;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(img, 0, 0, width, height);
  const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.84));
  return blob && blob.size < file.size ? blob : file;
}

export async function uploadFile(file: File, kind: MediaKind): Promise<UploadedMedia> {
  const isImage = file.type.startsWith('image/');
  const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
  if (kind === 'invoice' ? !(isImage || isPdf) : !isImage) throw new Error(kind === 'invoice' ? 'Envie a nota em PDF ou imagem.' : 'Envie uma imagem (JPG, PNG ou WEBP).');
  if (!isImage && file.size > 4.5 * 1024 * 1024) throw new Error('Arquivo grande demais (máximo 4,5 MB).');
  const blob = isImage ? await compressImage(file, MAX_SIDE[kind]) : file;
  if (blob.size > 4.5 * 1024 * 1024) throw new Error('Arquivo grande demais mesmo após reduzir. Tente outra foto.');
  const data = await readAsDataUrl(blob);
  const response = await api<{ media: UploadedMedia }>('/media', { method: 'POST', body: JSON.stringify({ kind, filename: file.name, data }) });
  return response.media;
}
