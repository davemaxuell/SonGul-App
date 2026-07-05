// Teacher/collaborator comments for the current page (spec §12.2).
// Append-only; rows sync between members as ADD_COMMENT ops.
import { useEffect, useState } from 'react';
import type { BBox, Comment, Notebook, Page } from '../types';
import * as db from '../db';
import { uid } from '../ids';
import { currentUser } from '../cloud/supabase';
import { noteLocalMutation } from '../sync/engine';

interface Props {
  notebook: Notebook;
  page: Page;
  /** active lasso selection bbox — used as the new comment's anchor */
  anchor: BBox | null;
  onFlash: (bbox: BBox) => void;
  onClose: () => void;
  onCountChange: (n: number) => void;
}

export default function CommentsPanel({ notebook, page, anchor, onFlash, onClose, onCountChange }: Props) {
  const [rows, setRows] = useState<Comment[]>([]);
  const [text, setText] = useState('');
  const [email, setEmail] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void db.listCommentsByPage(page.id).then((r) => {
      setRows(r);
      onCountChange(r.length);
    });
  }, [page.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    void currentUser().then((u) => setEmail(u?.email ?? null));
  }, []);

  async function add() {
    const trimmed = text.trim();
    if (!trimmed || !email) return;
    setBusy(true);
    try {
      const c: Comment = {
        id: uid(),
        notebookId: notebook.id,
        pageId: page.id,
        bbox: anchor,
        text: trimmed,
        authorEmail: email,
        createdAt: Date.now(),
      };
      await db.addComment(c);
      noteLocalMutation();
      setText('');
      const next = [...rows, c];
      setRows(next);
      onCountChange(next.length);
    } finally {
      setBusy(false);
    }
  }

  return (
    <aside className="feedback-panel comments-panel">
      <div className="panel-head">
        <strong>댓글 · Comments</strong>
        <button className="icon-btn" onClick={onClose} aria-label="Close comments">
          ✕
        </button>
      </div>
      <div className="comments-list">
        {rows.length === 0 && <p className="panel-hint">이 페이지에는 아직 댓글이 없어요. No comments on this page yet.</p>}
        {rows.map((c) => (
          <div className="comment-item" key={c.id}>
            <div className="comment-meta">
              <span className="comment-author">{c.authorEmail}</span>
              <span className="comment-time">
                {new Date(c.createdAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
            <p className="comment-text">{c.text}</p>
            {c.bbox && (
              <button className="btn btn-quiet comment-locate" onClick={() => onFlash(c.bbox!)}>
                📍 위치 보기 · Show on page
              </button>
            )}
          </div>
        ))}
      </div>
      {email ? (
        <div className="comment-composer">
          {anchor && <p className="panel-hint">올가미 선택 영역에 고정됩니다 · Anchored to the lasso selection</p>}
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="댓글 입력… · Write a comment…"
            rows={3}
          />
          <button className="btn btn-primary" disabled={busy || !text.trim()} onClick={() => void add()}>
            댓글 남기기 · Add comment
          </button>
        </div>
      ) : (
        <p className="panel-hint">댓글을 쓰려면 설정에서 로그인하세요 · Sign in (Settings) to comment.</p>
      )}
    </aside>
  );
}
