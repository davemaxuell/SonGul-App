// Sharing client (spec §12.1) — thin wrappers over the v0.5 SQL RPCs.
import { currentUser, supabase } from './supabase';

export type ShareRole = 'editor' | 'viewer';

export interface MemberRow {
  user_id: string;
  email: string;
  role: string;
}

export const SHARE_LINK_BASE = 'https://son-gul-web-ui.vercel.app/#share=';

export async function listMembers(notebookId: string): Promise<MemberRow[]> {
  const { data, error } = await supabase().rpc('list_members', { nb: notebookId });
  if (error) throw error;
  return (data ?? []) as MemberRow[];
}

export async function addMemberByEmail(
  notebookId: string,
  email: string,
  role: ShareRole
): Promise<void> {
  const { error } = await supabase().rpc('add_member_by_email', {
    nb: notebookId,
    member_email: email,
    member_role: role,
  });
  if (error) throw error;
}

export async function removeMember(notebookId: string, userId: string): Promise<void> {
  const { error } = await supabase().rpc('remove_member', { nb: notebookId, member: userId });
  if (error) throw error;
}

export async function createShareLink(notebookId: string, role: ShareRole): Promise<string> {
  const user = await currentUser();
  if (!user) throw new Error('Sign in first.');
  const { data, error } = await supabase()
    .from('share_tokens')
    .insert({ notebook_id: notebookId, role, created_by: user.id })
    .select()
    .single();
  if (error || !data) throw error ?? new Error('Could not create the link.');
  return SHARE_LINK_BASE + (data as { token: string }).token;
}

/** Returns the shared notebook's id; the next sync pulls its content. */
export async function redeemShareToken(token: string): Promise<string> {
  const { data, error } = await supabase().rpc('redeem_share_token', { t: token });
  if (error) throw error;
  return data as string;
}
