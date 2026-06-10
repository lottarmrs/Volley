import { Session, Player } from '../types';

export function getSessionSetupWarnings(session: Session, selectedPlayers: Player[]): string[] {
  const warnings: string[] = [];
  const teamCount = session.config?.teamCount ?? 0;

  if (teamCount > 0 && selectedPlayers.length > 0) {
    if (selectedPlayers.length / teamCount < 3) {
      warnings.push('Os times terão menos de 3 atletas em média.');
    }
  }

  const females = selectedPlayers.filter((p) => p.genero === 'F').length;
  if (teamCount > 0 && females > 0 && females % teamCount !== 0) {
    warnings.push(
      'A distribuição de gênero ficará desigual, mas será balanceada dentro do possível.',
    );
  }

  const setters = selectedPlayers.filter((p) => p.atributos.levantamento >= 6).length;
  if (teamCount > 1 && setters < teamCount) {
    if (setters === 0) {
      warnings.push('Nenhum levantador forte (nível 6+) foi selecionado.');
    } else {
      warnings.push(
        'Há menos bons levantadores do que times. Algum time pode ficar sem levantador forte.',
      );
    }
  }

  const injured = selectedPlayers.filter((p) => p.status?.lesionado).length;
  if (injured > 0) {
    warnings.push(`${injured} atleta(s) marcado(s) como lesionado(s) foram selecionados.`);
  }

  if (session.type === 'tournament' && teamCount >= 6) {
    warnings.push('O torneio tera muitos jogos para uma unica sessao.');
  }

  return warnings;
}
