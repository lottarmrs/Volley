import { useState, useEffect, useCallback } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabaseClient';
import { User } from '@supabase/supabase-js';
import { UserProfile } from '../types';

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, fallback: T): Promise<T> {
  let timeoutId: any;
  const timeoutPromise = new Promise<T>((resolve) => {
    timeoutId = setTimeout(() => {
      resolve(fallback);
    }, timeoutMs);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => {
    clearTimeout(timeoutId);
  });
}

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = useCallback(async (userId: string): Promise<UserProfile | null> => {
    if (!isSupabaseConfigured) return null;
    try {
      const queryPromise = supabase.from('profiles').select('*').eq('id', userId).single();
      const { data, error } = await withTimeout(queryPromise, 3000, {
        data: null,
        error: { message: 'Request timeout' },
      } as any);

      if (error) {
        console.error('Error fetching profile:', error);
        return null;
      }

      if (!data) return null;

      return {
        id: data.id,
        name: data.name,
        email: data.email,
        role: data.role,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
      };
    } catch (err) {
      console.error('Failed to fetch profile:', err);
      return null;
    }
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setLoading(false);
      return;
    }

    // Get active session on mount
    const getSessionPromise = supabase.auth.getSession();
    withTimeout(getSessionPromise, 3000, { data: { session: null } } as any)
      .then(({ data: { session } }) => {
        const activeUser = session?.user ?? null;
        setUser(activeUser);
        if (activeUser) {
          fetchProfile(activeUser.id)
            .then((p) => {
              setProfile(p);
              setLoading(false);
            })
            .catch((err) => {
              console.error('Failed to fetch profile after getSession:', err);
              setLoading(false);
            });
        } else {
          setProfile(null);
          setLoading(false);
        }
      })
      .catch((err) => {
        console.error('Failed to get active session on mount:', err);
        setProfile(null);
        setLoading(false);
      });

    // Listen to auth state changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      const activeUser = session?.user ?? null;
      setUser(activeUser);
      if (activeUser) {
        setLoading(true);
        try {
          const p = await fetchProfile(activeUser.id);
          setProfile(p);
        } catch (err) {
          console.error('Failed to fetch profile on auth state change:', err);
        } finally {
          setLoading(false);
        }
      } else {
        setProfile(null);
        setLoading(false);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [fetchProfile]);

  const signIn = useCallback(async (email: string, password: string) => {
    if (!isSupabaseConfigured) throw new Error('Supabase is not configured.');
    setLoading(true);
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) {
      setLoading(false);
      throw error;
    }
    return data;
  }, []);

  const signUp = useCallback(async (email: string, password: string, name?: string) => {
    if (!isSupabaseConfigured) throw new Error('Supabase is not configured.');
    setLoading(true);
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          name: name || '',
        },
      },
    });
    if (error) {
      setLoading(false);
      throw error;
    }
    return data;
  }, []);

  const signOut = useCallback(async () => {
    if (!isSupabaseConfigured) return;
    setLoading(true);
    const { error } = await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
    setLoading(false);
    if (error) throw error;
  }, []);

  const refreshProfile = useCallback(async () => {
    if (user) {
      setLoading(true);
      const p = await fetchProfile(user.id);
      setProfile(p);
      setLoading(false);
    }
  }, [user, fetchProfile]);

  return {
    user,
    profile,
    loading,
    signIn,
    signUp,
    signOut,
    refreshProfile,
    isSupabaseConfigured,
    isAdmin: profile?.role === 'admin',
    isOrganizer: profile?.role === 'organizer' || profile?.role === 'admin',
  };
}
