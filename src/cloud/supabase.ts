// Cloud gate: all Supabase access goes through here. When the env vars are
// absent the app runs fully local (every cloud surface shows a hint instead).
import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

export function cloudConfigured(): boolean {
  return Boolean(url && key);
}

let client: SupabaseClient | null = null;

export function supabase(): SupabaseClient {
  if (!url || !key) {
    throw new Error('Cloud backup is not configured (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).');
  }
  if (!client) client = createClient(url, key);
  return client;
}

export async function signUp(email: string, password: string): Promise<void> {
  const { error } = await supabase().auth.signUp({ email, password });
  if (error) throw error;
}

export async function signIn(email: string, password: string): Promise<void> {
  const { error } = await supabase().auth.signInWithPassword({ email, password });
  if (error) throw error;
}

export async function signOut(): Promise<void> {
  const { error } = await supabase().auth.signOut();
  if (error) throw error;
}

export async function currentUser(): Promise<User | null> {
  if (!cloudConfigured()) return null;
  const { data } = await supabase().auth.getSession();
  return data.session?.user ?? null;
}

export function onAuthChange(cb: (user: User | null) => void): () => void {
  if (!cloudConfigured()) return () => {};
  const { data } = supabase().auth.onAuthStateChange((_event, session) => cb(session?.user ?? null));
  return () => data.subscription.unsubscribe();
}

/** In-app account deletion (Play policy). Server side: `delete_user` RPC. */
export async function deleteAccount(): Promise<void> {
  const { error } = await supabase().rpc('delete_user');
  if (error) throw error;
  await supabase().auth.signOut();
}
