import { useEffect, useState } from 'react';
import { validateHandle } from '@logic/handle';
import { playerCloudService } from '@infra/supabase/playerCloudService';

export type HandleAvailability = 'idle' | 'checking' | 'free' | 'taken';

export function useHandleAvailability(handle: string): HandleAvailability {
  const [availability, setAvailability] = useState<HandleAvailability>('idle');

  useEffect(() => {
    if (!handle || validateHandle(handle) !== null) {
      setAvailability('idle');
      return;
    }
    let cancelled = false;
    setAvailability('checking');
    const timer = setTimeout(() => {
      playerCloudService
        .isHandleAvailable(handle)
        .then((free) => {
          if (!cancelled) setAvailability(free ? 'free' : 'taken');
        })
        .catch(() => {
          if (!cancelled) setAvailability('idle');
        });
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [handle]);

  return availability;
}
