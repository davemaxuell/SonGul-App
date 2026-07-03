import { useEffect, useRef } from 'react';
import type { Page, TemplateId } from '../types';
import { TEMPLATES } from '../templates';
import { drawPageBackground } from '../ink/render';

function TemplateThumb({ template }: { template: TemplateId }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const fake: Page = {
      id: 't',
      notebookId: 't',
      order: 0,
      template,
      w: 820,
      h: 1160,
      createdAt: 0,
      updatedAt: 0,
    };
    const scale = 104 / 820;
    canvas.width = 104;
    canvas.height = Math.round(1160 * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    drawPageBackground(ctx, fake, null);
  }, [template]);
  return <canvas ref={ref} className="template-thumb-canvas" />;
}

interface Props {
  value: TemplateId;
  onChange: (t: TemplateId) => void;
}

export default function TemplatePicker({ value, onChange }: Props) {
  return (
    <div className="template-grid">
      {TEMPLATES.map((t) => (
        <button
          key={t.id}
          className={'template-option' + (value === t.id ? ' selected' : '')}
          onClick={() => onChange(t.id)}
        >
          <TemplateThumb template={t.id} />
          <span className="template-name">
            {t.ko}
            <small>{t.en}</small>
          </span>
        </button>
      ))}
    </div>
  );
}
