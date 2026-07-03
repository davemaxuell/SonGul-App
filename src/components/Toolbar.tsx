import type { InkTool, Tool } from '../types';

export const PEN_COLORS = ['#26211A', '#2C4E80', '#C4472B', '#3F7261'];
export const HL_COLORS = ['#F7D44C', '#8FD3A0', '#F6A8BC'];
export const PEN_WIDTHS = [2.5, 4, 6.5];
export const HL_WIDTHS = [16, 26, 38];

interface Props {
  tool: Tool;
  penColor: string;
  penWidth: number;
  hlColor: string;
  hlWidth: number;
  canUndo: boolean;
  canRedo: boolean;
  canPaste: boolean;
  onTool: (t: Tool) => void;
  onColor: (tool: InkTool, c: string) => void;
  onWidth: (tool: InkTool, w: number) => void;
  onUndo: () => void;
  onRedo: () => void;
  onPaste: () => void;
}

const TOOLS: { id: Tool; label: string; icon: string }[] = [
  { id: 'pen', label: 'Pen', icon: '✒️' },
  { id: 'highlighter', label: 'Highlighter', icon: '🖍️' },
  { id: 'eraser', label: 'Eraser', icon: '◻️' },
  { id: 'lasso', label: 'Lasso select', icon: '◌' },
  { id: 'hand', label: 'Pan', icon: '✋' },
];

export default function Toolbar(p: Props) {
  const inkTool: InkTool = p.tool === 'highlighter' ? 'highlighter' : 'pen';
  const colors = inkTool === 'highlighter' ? HL_COLORS : PEN_COLORS;
  const widths = inkTool === 'highlighter' ? HL_WIDTHS : PEN_WIDTHS;
  const activeColor = inkTool === 'highlighter' ? p.hlColor : p.penColor;
  const activeWidth = inkTool === 'highlighter' ? p.hlWidth : p.penWidth;

  return (
    <div className="toolbar" role="toolbar" aria-label="Drawing tools">
      <div className="tool-group">
        {TOOLS.map((t) => (
          <button
            key={t.id}
            className={'tool-btn' + (p.tool === t.id ? ' active' : '')}
            title={t.label}
            aria-label={t.label}
            aria-pressed={p.tool === t.id}
            onClick={() => p.onTool(t.id)}
          >
            <span className="tool-icon">{t.icon}</span>
          </button>
        ))}
      </div>

      <div className="tool-sep" />
      <div className="tool-group">
        {colors.map((c) => (
          <button
            key={c}
            className={'color-dot' + (activeColor === c ? ' active' : '')}
            style={{ background: c }}
            aria-label={`Color ${c}`}
            onClick={() => p.onColor(inkTool, c)}
          />
        ))}
      </div>
      <div className="tool-sep" />
      <div className="tool-group">
        {widths.map((w, i) => (
          <button
            key={w}
            className={'width-btn' + (activeWidth === w ? ' active' : '')}
            aria-label={`Width ${w}`}
            onClick={() => p.onWidth(inkTool, w)}
          >
            <span
              className="width-dot"
              style={{ width: 4 + i * 4, height: 4 + i * 4, background: activeColor }}
            />
          </button>
        ))}
      </div>

      <div className="tool-sep" />
      <div className="tool-group">
        <button className="tool-btn" disabled={!p.canUndo} onClick={p.onUndo} title="Undo (Ctrl+Z)" aria-label="Undo">
          ↩
        </button>
        <button className="tool-btn" disabled={!p.canRedo} onClick={p.onRedo} title="Redo (Ctrl+Y)" aria-label="Redo">
          ↪
        </button>
        {p.canPaste && (
          <button className="tool-btn" onClick={p.onPaste} title="Paste strokes (Ctrl+V)" aria-label="Paste">
            📋
          </button>
        )}
      </div>
    </div>
  );
}
