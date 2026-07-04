import { useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { cloudConfigured, currentUser, onAuthChange } from './supabase';

export function useCloudUser(): User | null {
  const [user, setUser] = useState<User | null>(null);
  useEffect(() => {
    if (!cloudConfigured()) return;
    void currentUser().then(setUser);
    return onAuthChange(setUser);
  }, []);
  return user;
}
