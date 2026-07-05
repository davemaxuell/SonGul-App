import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  insertedRows: [] as unknown[],
}));

vi.mock('../supabase', () => ({
  supabase: () => ({
    rpc: mocks.rpc,
    from: (table: string) => {
      if (table !== 'share_tokens') throw new Error('unexpected table ' + table);
      return {
        insert: (row: unknown) => {
          mocks.insertedRows.push(row);
          return {
            select: () => ({
              single: () => Promise.resolve({ data: { token: 'tok-123' }, error: null }),
            }),
          };
        },
      };
    },
  }),
  currentUser: () => Promise.resolve({ id: 'me-1', email: 'me@x.y' }),
  cloudConfigured: () => true,
}));

import { addMemberByEmail, createShareLink, listMembers, redeemShareToken, removeMember } from '../share';

describe('share client', () => {
  beforeEach(() => {
    mocks.rpc.mockReset();
    mocks.insertedRows.length = 0;
  });

  it('addMemberByEmail calls the RPC with exact args and propagates errors', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: null });
    await addMemberByEmail('nb-1', 'teacher@x.y', 'viewer');
    expect(mocks.rpc).toHaveBeenCalledWith('add_member_by_email', {
      nb: 'nb-1',
      member_email: 'teacher@x.y',
      member_role: 'viewer',
    });
    mocks.rpc.mockResolvedValue({ data: null, error: new Error('no account with that email') });
    await expect(addMemberByEmail('nb-1', 'x@y.z', 'editor')).rejects.toThrow('no account');
  });

  it('redeemShareToken returns the notebook id', async () => {
    mocks.rpc.mockResolvedValue({ data: 'nb-42', error: null });
    await expect(redeemShareToken('tok-9')).resolves.toBe('nb-42');
    expect(mocks.rpc).toHaveBeenCalledWith('redeem_share_token', { t: 'tok-9' });
  });

  it('createShareLink inserts a token row and returns the share URL', async () => {
    const url = await createShareLink('nb-7', 'viewer');
    expect(url).toBe('https://son-gul-web-ui.vercel.app/#share=tok-123');
    expect(mocks.insertedRows[0]).toMatchObject({ notebook_id: 'nb-7', role: 'viewer', created_by: 'me-1' });
  });

  it('listMembers and removeMember are thin RPC passthroughs', async () => {
    mocks.rpc.mockResolvedValue({ data: [{ user_id: 'u', email: 'e@x.y', role: 'viewer' }], error: null });
    await expect(listMembers('nb-1')).resolves.toEqual([{ user_id: 'u', email: 'e@x.y', role: 'viewer' }]);
    expect(mocks.rpc).toHaveBeenCalledWith('list_members', { nb: 'nb-1' });
    mocks.rpc.mockResolvedValue({ data: null, error: null });
    await removeMember('nb-1', 'u');
    expect(mocks.rpc).toHaveBeenCalledWith('remove_member', { nb: 'nb-1', member: 'u' });
  });
});
