// Minimal in-memory Supabase double for the sync engine's query surface.
export interface ServerOpRow {
  notebook_id: string;
  server_seq: number;
  op_id: string;
  author_id: string;
  device_id: string;
  op_type: string;
  payload: unknown;
  client_ts: number;
}

export function makeFakeServer() {
  const ops: ServerOpRow[] = [];
  const registry = new Map<string, { owner_id: string; title: string }>();
  const members: { notebook_id: string; user_id: string; role: string }[] = [];
  let seq = 0;

  function insertOps(rows: Omit<ServerOpRow, 'server_seq'>[]): { error: null } {
    for (const r of rows) {
      if (ops.some((o) => o.op_id === r.op_id)) continue; // unique op_id → idempotent
      ops.push({ ...r, server_seq: ++seq });
    }
    return { error: null };
  }

  return {
    from(table: string) {
      if (table === 'sync_ops') {
        return {
          insert: (rows: Omit<ServerOpRow, 'server_seq'>[]) => Promise.resolve(insertOps(rows)),
          select: () => ({
            eq: (_c: string, nb: string) => ({
              gt: (_c2: string, cursor: number) => ({
                order: () => ({
                  limit: (n: number) =>
                    Promise.resolve({
                      data: ops
                        .filter((o) => o.notebook_id === nb && o.server_seq > cursor)
                        .sort((a, b) => a.server_seq - b.server_seq)
                        .slice(0, n),
                      error: null,
                    }),
                }),
              }),
            }),
          }),
        };
      }
      if (table === 'notebook_sync') {
        return {
          upsert: (rows: { notebook_id: string; owner_id: string; title: string }[]) => {
            rows.forEach((r) => {
              if (!registry.has(r.notebook_id)) {
                registry.set(r.notebook_id, { owner_id: r.owner_id, title: r.title });
              }
            });
            return Promise.resolve({ error: null });
          },
        };
      }
      if (table === 'notebook_members') {
        return {
          upsert: (rows: { notebook_id: string; user_id: string; role: string }[]) => {
            rows.forEach((r) => {
              if (!members.some((m) => m.notebook_id === r.notebook_id && m.user_id === r.user_id)) {
                members.push(r);
              }
            });
            return Promise.resolve({ error: null });
          },
          select: () => ({
            eq: (_c: string, uid: string) =>
              Promise.resolve({ data: members.filter((m) => m.user_id === uid), error: null }),
          }),
        };
      }
      throw new Error('fakeServer: unexpected table ' + table);
    },
    _state: { ops, registry, members },
    _seedRemoteOp(row: Omit<ServerOpRow, 'server_seq'>) {
      insertOps([row]);
    },
  };
}
