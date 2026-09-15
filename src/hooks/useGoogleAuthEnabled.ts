import { useEffect, useState } from 'react';

export function useGoogleAuthEnabled(isGoogleEnabled: () => Promise<boolean>): boolean {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    let active = true;
    isGoogleEnabled().then(
      (value) => {
        if (active) setEnabled(value);
      },
      () => {},
    );
    return () => {
      active = false;
    };
  }, [isGoogleEnabled]);

  return enabled;
}
