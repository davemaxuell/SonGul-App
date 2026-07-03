// Page templates. The Korean practice grid and TOPIK manuscript sheet (원고지)
// are the product's signature templates — drawn in the muted green of real
// Korean manuscript paper.
import type { Page, TemplateId } from './types';

export interface TemplateInfo {
  id: TemplateId;
  en: string;
  ko: string;
}

export const TEMPLATES: TemplateInfo[] = [
  { id: 'blank', en: 'Blank', ko: '백지' },
  { id: 'lined', en: 'Lined', ko: '줄 노트' },
  { id: 'grid', en: 'Grid', ko: '모눈' },
  { id: 'dotted', en: 'Dotted', ko: '점 노트' },
  { id: 'hangul', en: 'Hangul practice', ko: '한글 연습' },
  { id: 'topik', en: 'TOPIK essay (원고지)', ko: '원고지' },
  { id: 'cornell', en: 'Cornell notes', ko: '코넬 노트' },
];

const LINE = '#DDD5C2';
const LINE_SOFT = '#E8E2D2';
const MANUSCRIPT = '#A4BFA7'; // muted 원고지 green
const MANUSCRIPT_SOFT = '#C6D7C8';
const GUIDE_TEXT = '#B9B29F';

export function drawTemplate(ctx: CanvasRenderingContext2D, page: Page): void {
  const { w, h } = page;
  ctx.save();
  ctx.lineWidth = 1;
  switch (page.template) {
    case 'blank':
      break;
    case 'lined': {
      ctx.strokeStyle = LINE;
      const top = 96;
      const gap = 42;
      for (let y = top; y < h - 48; y += gap) line(ctx, 56, y, w - 56, y);
      break;
    }
    case 'grid': {
      ctx.strokeStyle = LINE_SOFT;
      const cell = 34;
      for (let x = cell; x < w; x += cell) line(ctx, x, 0, x, h);
      for (let y = cell; y < h; y += cell) line(ctx, 0, y, w, y);
      break;
    }
    case 'dotted': {
      ctx.fillStyle = LINE;
      const cell = 34;
      for (let x = cell; x < w; x += cell) {
        for (let y = cell; y < h; y += cell) {
          ctx.beginPath();
          ctx.arc(x, y, 1.4, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      break;
    }
    case 'hangul': {
      // rows of large squares with dashed centre guides, like beginner
      // Hangul copybooks (쓰기 연습장)
      const cols = 7;
      const margin = 52;
      const cell = (w - margin * 2) / cols;
      const rowGap = 26;
      let y = 88;
      ctx.strokeStyle = MANUSCRIPT;
      while (y + cell < h - 56) {
        for (let c = 0; c < cols; c++) {
          const x = margin + c * cell;
          ctx.strokeStyle = MANUSCRIPT;
          ctx.setLineDash([]);
          ctx.strokeRect(x + 2, y, cell - 4, cell);
          ctx.strokeStyle = MANUSCRIPT_SOFT;
          ctx.setLineDash([5, 5]);
          line(ctx, x + 2, y + cell / 2, x + cell - 2, y + cell / 2);
          line(ctx, x + cell / 2, y, x + cell / 2, y + cell);
        }
        ctx.setLineDash([]);
        y += cell + rowGap;
      }
      break;
    }
    case 'topik': {
      // 원고지 manuscript sheet: 20 cells per row, writing row + narrow
      // spacing band, as used for TOPIK 쓰기 answers.
      const cols = 20;
      const margin = 46;
      const cell = (w - margin * 2) / cols;
      const band = 14;
      let y = 96;
      ctx.strokeStyle = MANUSCRIPT;
      ctx.fillStyle = MANUSCRIPT;
      ctx.font = '13px system-ui, sans-serif';
      ctx.fillText('제목 (Title)', margin, 52);
      line(ctx, margin, 62, w - margin, 62);
      let row = 0;
      while (y + cell < h - 48) {
        for (let c = 0; c < cols; c++) {
          ctx.strokeRect(margin + c * cell, y, cell, cell);
        }
        // running character count at the row end, every other row
        row++;
        if (row % 2 === 0) {
          ctx.fillStyle = MANUSCRIPT;
          ctx.font = '10px system-ui, sans-serif';
          ctx.fillText(String(row * cols), w - margin + 6, y + cell / 2 + 3);
        }
        y += cell + band;
      }
      break;
    }
    case 'cornell': {
      ctx.strokeStyle = LINE;
      const cueX = Math.round(w * 0.28);
      const summaryY = Math.round(h * 0.82);
      const top = 96;
      line(ctx, 40, top - 28, w - 40, top - 28);
      ctx.strokeStyle = MANUSCRIPT;
      line(ctx, cueX, top - 28, cueX, summaryY);
      line(ctx, 40, summaryY, w - 40, summaryY);
      ctx.strokeStyle = LINE_SOFT;
      for (let y = top + 24; y < summaryY - 12; y += 40) line(ctx, cueX + 12, y, w - 48, y);
      ctx.fillStyle = GUIDE_TEXT;
      ctx.font = '12px system-ui, sans-serif';
      ctx.fillText('단서 Cues', 44, top - 40);
      ctx.fillText('필기 Notes', cueX + 12, top - 40);
      ctx.fillText('요약 Summary', 44, summaryY + 22);
      break;
    }
    case 'practice': {
      // generated practice sheet: trace the corrected sentence, then copy it
      const sentences = page.practice?.sentences ?? [];
      ctx.fillStyle = GUIDE_TEXT;
      ctx.font = '15px system-ui, sans-serif';
      ctx.fillText('연습 · Practice — trace the gray sentence, then copy it below', 52, 60);
      const guideFont = '500 30px "Apple SD Gothic Neo", "Malgun Gothic", system-ui, sans-serif';
      const maxWidth = w - 112;
      let y = 126;
      for (const sentence of sentences.slice(0, 6)) {
        ctx.font = guideFont;
        for (const row of wrapText(ctx, sentence, maxWidth)) {
          if (y > page.h - 120) break;
          ctx.fillStyle = GUIDE_TEXT;
          ctx.font = guideFont;
          ctx.fillText(row, 56, y);
          ctx.strokeStyle = LINE;
          line(ctx, 52, y + 12, w - 52, y + 12);
          line(ctx, 52, y + 64, w - 52, y + 64);
          y += 112;
        }
        y += 28;
        if (y > page.h - 120) break;
      }
      break;
    }
  }
  ctx.restore();
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(' ');
  const rows: string[] = [];
  let cur = '';
  for (const word of words) {
    const attempt = cur ? cur + ' ' + word : word;
    if (ctx.measureText(attempt).width <= maxWidth || !cur) cur = attempt;
    else {
      rows.push(cur);
      cur = word;
    }
  }
  if (cur) rows.push(cur);
  return rows;
}

function line(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number) {
  ctx.beginPath();
  ctx.moveTo(x1 + 0.5, y1 + 0.5);
  ctx.lineTo(x2 + 0.5, y2 + 0.5);
  ctx.stroke();
}
