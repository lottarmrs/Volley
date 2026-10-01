import { useEffect, useRef } from 'react';
import { isSupabaseConfigured, supabase } from '../lib/supabaseClient';

export function useSessionRealtime(sessionCloudId: string | null, onChange: () => void): void {
  const latest = useRef(onChange);
  useEffect(() => {
    latest.current = onChange;
  }, [onChange]);

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase || !sessionCloudId) return;
    const channel = supabase
      .channel(`pelada:${sessionCloudId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'registration_windows',
          filter: `session_id=eq.${sessionCloudId}`,
        },
        () => latest.current(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [sessionCloudId]);
}
