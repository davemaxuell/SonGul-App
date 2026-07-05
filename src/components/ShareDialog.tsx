// Owner's sharing controls for one notebook (spec §12.1/§12.3):
// member list, invite by email, share links. Server enforces via RLS/RPCs.
import { useEffect, useState } from 'react';
import type { Notebook } from '../types';
import Modal from './Modal';
import {
  addMemberByEmail,
  createShareLink,
  listMembers,
  removeMember,
  type MemberRow,
  type ShareRole,
} from '../cloud/share';

interface Props {
  notebook: Notebook;
  onClose: () => void;
}

export default function ShareDialog({ notebook, onClose }: Props) {
  const [members, setMembers] = useState<MemberRow[] | null>(null);
  const [email, setEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<ShareRole>('viewer');
  const [linkRole, setLinkRole] = useState<ShareRole>('viewer');
  const [link, setLink] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  async function refresh() {
    try {
      setMembers(await listMembers(notebook.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setMembers([]);
    }
  }

  useEffect(() => {
    void refresh();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function invite() {
    const addr = email.trim();
    if (!addr) return;
    setBusy(true);
    setError('');
    try {
      await addMemberByEmail(notebook.id, addr, inviteRole);
      setEmail('');
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function makeLink() {
    setBusy(true);
    setError('');
    try {
      setLink(await createShareLink(notebook.id, linkRole));
      setCopied(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function drop(userId: string) {
    setBusy(true);
    setError('');
    try {
      await removeMember(notebook.id, userId);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={`공유 · Share “${notebook.title}”`} onClose={onClose} wide>
      <div className="share-section">
        <strong>멤버 · Members</strong>
        {members === null && <p className="panel-hint">Loading…</p>}
        {members !== null && members.length === 0 && (
          <p className="panel-hint">
            아직 이 노트만 동기화되지 않았어요 — 먼저 한 번 동기화하세요. This notebook hasn't synced
            yet — sync once first.
          </p>
        )}
        {members?.map((m) => (
          <div className="share-member" key={m.user_id}>
            <span className="share-member-email">{m.email}</span>
            <span className="share-member-role">{m.role}</span>
            {m.role !== 'owner' && (
              <button className="btn btn-quiet" disabled={busy} onClick={() => void drop(m.user_id)}>
                Remove
              </button>
            )}
          </div>
        ))}
      </div>

      <div className="share-section">
        <strong>이메일로 초대 · Invite by email</strong>
        <div className="share-row">
          <input
            className="field"
            type="email"
            placeholder="student@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <select className="field share-role-select" value={inviteRole} onChange={(e) => setInviteRole(e.target.value as ShareRole)}>
            <option value="viewer">보기+댓글 · viewer</option>
            <option value="editor">편집 · editor</option>
          </select>
          <button className="btn btn-primary" disabled={busy || !email.trim()} onClick={() => void invite()}>
            Add
          </button>
        </div>
        <p className="panel-hint">상대방도 손글 계정이 있어야 해요 · The invitee needs a SonGul account.</p>
      </div>

      <div className="share-section">
        <strong>링크 공유 · Share link</strong>
        <div className="share-row">
          <select className="field share-role-select" value={linkRole} onChange={(e) => setLinkRole(e.target.value as ShareRole)}>
            <option value="viewer">보기+댓글 · viewer</option>
            <option value="editor">편집 · editor</option>
          </select>
          <button className="btn btn-quiet" disabled={busy} onClick={() => void makeLink()}>
            Create link
          </button>
        </div>
        {link && (
          <div className="share-row">
            <input className="field share-link-field" readOnly value={link} onFocus={(e) => e.target.select()} />
            <button
              className="btn btn-primary"
              onClick={() => {
                void navigator.clipboard.writeText(link).then(() => setCopied(true));
              }}
            >
              {copied ? 'Copied ✓' : 'Copy'}
            </button>
          </div>
        )}
      </div>

      {error && <p className="ai-status fail">{error}</p>}
    </Modal>
  );
}
