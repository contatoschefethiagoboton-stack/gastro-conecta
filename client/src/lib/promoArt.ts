// Gera as artes de divulgação do profissional no próprio navegador (canvas): feed 4:5 e story 9:16.
// Sem servidor de imagens e sem depender da Meta: o profissional baixa ou compartilha e publica.

export type ArtFormat = 'feed' | 'story';
export type ArtData = {
  kind: 'perfil' | 'new_provider' | 'testimonial';
  name: string;
  profession: string;
  city: string;
  rating?: { average: number; count: number } | null;
  quote?: string;
  author?: string;
  stars?: number;
};

export const ART_SIZE: Record<ArtFormat, { w: number; h: number }> = { feed: { w: 1080, h: 1350 }, story: { w: 1080, h: 1920 } };
const C = { bg: '#FBF7F0', orange: '#DF572F', ink: '#262823', muted: '#6F716A', white: '#FFFFFF' };
const FONT = "'DM Sans', 'Inter', system-ui, sans-serif";

export function loadImage(src: string): Promise<HTMLImageElement | null> {
  if (!src) return Promise.resolve(null);
  return new Promise(resolve => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Quebra o texto em linhas que cabem na largura; corta com "…" se passar do limite. */
export function wrapLines(ctx: Pick<CanvasRenderingContext2D, 'measureText'>, text: string, maxWidth: number, maxLines: number): string[] {
  const words = String(text ?? '').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width <= maxWidth || !line) { line = test; continue; }
    lines.push(line); line = word;
    if (lines.length === maxLines) break;
  }
  if (lines.length < maxLines && line) lines.push(line);
  const used = lines.join(' ').split(' ').length;
  if (used < words.length && lines.length) {
    let last = lines[lines.length - 1];
    while (last && ctx.measureText(`${last}…`).width > maxWidth) last = last.slice(0, -1);
    lines[lines.length - 1] = `${last.replace(/[\s,.;:]+$/, '')}…`;
  }
  return lines;
}

function cover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number) {
  const scale = Math.max(w / img.width, h / img.height);
  const sw = w / scale, sh = h / scale;
  ctx.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, x, y, w, h);
}

const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]?.toUpperCase()).join('') || 'EC';

export function drawArt(canvas: HTMLCanvasElement, format: ArtFormat, data: ArtData, photo: HTMLImageElement | null) {
  const { w: W, h: H } = ART_SIZE[format];
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const M = 60;
  const story = format === 'story';
  ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);

  // Foto (ou iniciais) com cantos arredondados.
  const photoH = Math.round(H * (story ? 0.57 : 0.5));
  ctx.save(); roundRect(ctx, M, M, W - 2 * M, photoH, 44); ctx.clip();
  if (photo) cover(ctx, photo, M, M, W - 2 * M, photoH);
  else {
    const g = ctx.createLinearGradient(0, M, 0, M + photoH); g.addColorStop(0, '#E9764F'); g.addColorStop(1, C.orange);
    ctx.fillStyle = g; ctx.fillRect(M, M, W - 2 * M, photoH);
    ctx.fillStyle = 'rgba(255,255,255,.9)'; ctx.font = `700 240px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(initials(data.name), W / 2, M + photoH / 2);
  }
  ctx.restore();

  // Selo da marca e nota.
  ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
  ctx.font = `700 34px ${FONT}`;
  const brand = 'eventosconecta';
  const bw = ctx.measureText(brand).width + 40 + 56;
  ctx.fillStyle = C.white; roundRect(ctx, M + 28, M + 28, bw, 68, 34); ctx.fill();
  ctx.fillStyle = C.ink; ctx.fillText(brand, M + 56, M + 62);
  ctx.fillStyle = C.orange; ctx.beginPath(); ctx.arc(M + 56 + ctx.measureText(brand).width + 16, M + 74, 7, 0, Math.PI * 2); ctx.fill();
  if (data.rating && data.rating.count > 0 && data.rating.average >= 4) {
    const label = `★ ${data.rating.average.toFixed(1).replace('.', ',')}`;
    const rw = ctx.measureText(label).width + 52;
    ctx.fillStyle = C.white; roundRect(ctx, W - M - 28 - rw, M + 28, rw, 68, 34); ctx.fill();
    ctx.fillStyle = C.orange; ctx.fillText(label, W - M - 28 - rw + 26, M + 62);
  }

  // Chamada final (barra laranja).
  const ctaH = story ? 190 : 160;
  const ctaY = H - M - ctaH - (story ? 120 : 0);
  ctx.fillStyle = C.orange; roundRect(ctx, M, ctaY, W - 2 * M, ctaH, 36); ctx.fill();
  ctx.textAlign = 'center'; ctx.fillStyle = C.white;
  ctx.font = `700 ${story ? 54 : 48}px ${FONT}`; ctx.fillText('Peça seu orçamento grátis', W / 2, ctaY + ctaH * 0.38);
  ctx.font = `500 ${story ? 34 : 30}px ${FONT}`; ctx.fillStyle = 'rgba(255,255,255,.88)';
  ctx.fillText(story ? 'eventosconecta.com.br · toque no link' : 'eventosconecta.com.br · link na bio', W / 2, ctaY + ctaH * 0.72);

  // Texto entre a foto e a chamada.
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  const top = M + photoH + (story ? 90 : 70);
  const bottom = ctaY - (story ? 60 : 36);
  const maxW = W - 2 * M - 10;
  let y = top;
  if (data.kind === 'testimonial' && data.quote) {
    ctx.fillStyle = C.orange; ctx.font = `700 ${story ? 60 : 50}px ${FONT}`;
    ctx.fillText('★'.repeat(Math.max(1, Math.min(5, Math.round(data.stars ?? 5)))), M + 5, y);
    y += story ? 90 : 72;
    const size = story ? 50 : 42, lh = Math.round(size * 1.3);
    ctx.font = `italic 500 ${size}px ${FONT}`; ctx.fillStyle = C.ink;
    const room = Math.max(1, Math.floor((bottom - y - (story ? 120 : 100)) / lh) + 1);
    for (const line of wrapLines(ctx, `“${data.quote}”`, maxW, Math.min(room, story ? 7 : 4))) { ctx.fillText(line, M + 5, y); y += lh; }
    y += story ? 20 : 8;
    ctx.font = `600 ${story ? 36 : 32}px ${FONT}`; ctx.fillStyle = C.muted;
    ctx.fillText(wrapLines(ctx, `— ${data.author || 'Cliente'}, cliente de ${data.name}`, maxW, 1)[0] ?? '', M + 5, y);
  } else {
    ctx.fillStyle = C.orange; ctx.font = `700 ${story ? 36 : 32}px ${FONT}`;
    ctx.fillText(data.kind === 'new_provider' ? 'AGORA ESTOU NO EVENTOS CONECTA' : 'CONTRATE PARA O SEU EVENTO', M + 5, y);
    y += story ? 110 : 92;
    const nameSize = story ? 88 : 76;
    ctx.font = `700 ${nameSize}px ${FONT}`; ctx.fillStyle = C.ink;
    for (const line of wrapLines(ctx, data.name, maxW, 2)) { ctx.fillText(line, M + 5, y); y += Math.round(nameSize * 1.1); }
    y += story ? 10 : 0;
    ctx.font = `500 ${story ? 42 : 38}px ${FONT}`; ctx.fillStyle = C.muted;
    const sub = [data.profession, data.city && `${data.city} e região`].filter(Boolean).join(' · ');
    for (const line of wrapLines(ctx, sub, maxW, story ? 3 : 2)) { if (y > bottom) break; ctx.fillText(line, M + 5, y); y += story ? 58 : 52; }
  }
}

export function canvasToFile(canvas: HTMLCanvasElement, name: string): Promise<File | null> {
  return new Promise(resolve => canvas.toBlob(blob => resolve(blob ? new File([blob], name, { type: 'image/png' }) : null), 'image/png'));
}
