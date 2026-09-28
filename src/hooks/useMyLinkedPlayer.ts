import { useCallback, useEffect, useState } from 'react';
import { playerCloudService } from '@infra/supabase/playerCloudService';
import type { Player } from '../types';

export interface UseMyLinkedPlayerResult {
  linkedPlayer: Player | null;
  buscado: boolean;
  erro: boolean;
  tentarDeNovo: () => void;
  setLinkedPlayer: (player: Player) => void;
}

export function useMyLinkedPlayer(
  userId: string | undefined,
  currentPlayer: Player | null,
): UseMyLinkedPlayerResult {
  const [linkedPlayer, setLinkedPlayer] = useState<Player | null>(null);
  const [buscado, setBuscado] = useState(false);
  const [erro, setErro] = useState(false);
  const [tentativa, setTentativa] = useState(0);

  useEffect(() => {
    if (currentPlayer || !userId) {
      setBuscado(true);
      setErro(false);
      return;
    }
    setBuscado(false);
    setErro(false);
    let cancelado = false;
    playerCloudService
      .fetchLinkedToUser(userId)
      .then((encontrada) => {
        if (cancelado) return;
        setLinkedPlayer(encontrada);
        setBuscado(true);
      })
      .catch(() => {
        if (cancelado) return;
        setErro(true);
        setBuscado(true);
      });
    return () => {
      cancelado = true;
    };
  }, [userId, currentPlayer, tentativa]);

  const tentarDeNovo = useCallback(() => setTentativa((n) => n + 1), []);

  return { linkedPlayer, buscado, erro, tentarDeNovo, setLinkedPlayer };
}
