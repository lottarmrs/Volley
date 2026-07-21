import type { CloudSyncStatus } from './sync';

export type Gender = 'M' | 'F';

export interface Attributes {
  saque: number;
  recepcao: number;
  levantamento: number;
  ataque: number;
  bloqueio: number;
  defesa: number;
  velocidade: number;
  resistencia: number;
  leituraDeJogo: number;
  regularidade: number;
  controleEmocional: number;
}

export type Position = 'levantador' | 'oposto' | 'ponteiro' | 'central' | 'libero' | 'all-rounder';

export type RotationType = '6x0' | '5x1';

export interface RoleComposition {
  levantador: number;
  ponteiro: number;
  oposto: number;
  central: number;
  libero: number;
}

export type AvatarProposalStatus = 'pending' | 'approved' | 'rejected' | 'superseded';

export interface PlayerAvatarProposal {
  id: string;
  playerCloudId: string;
  proposedBy: string;
  imageUrl: string;
  status: AvatarProposalStatus;
  reviewedBy?: string;
  reviewedAt?: string;
  createdAt: string;
}

export interface Player {
  id: string;
  username?: string;
  avatarUrl?: string;
  nome: string;
  apelido: string;
  genero: Gender;
  ativo: boolean;
  posicaoPrincipal: Position;
  posicoesSecundarias: Position[];
  alturaCm?: number;
  maoDominante: 'direita' | 'esquerda';
  atributos: Attributes;
  perfil: {
    nivel: number;
    classe: string;
    arquetipo: string;
    especialidade: string;
    fraqueza: string;
  };
  formaAtual: {
    valor: number;
    observacao: string;
    ultimasPartidas: number[];
  };
  status: {
    lesionado: boolean;
    limitacaoFisica: string | null;
    presencaFrequente: boolean;
  };
  metadata: {
    criadoEm: string;
    atualizadoEm: string;
  };
  communityIds?: string[];
  isGuest?: boolean;
  cloudId?: string;
  cloudOwnerId?: string;
  personalAttributes?: Attributes;
  hasOwnEvaluation?: boolean;
  evaluationAggregate?: {
    attributes: Attributes;
    evaluatorCount: number;
    includedValueCount: number;
    outlierValueCount: number;
    updatedAt?: string;
  };
  syncStatus?: CloudSyncStatus;
  lastSyncedAt?: string;
  deletedAt?: string;
  updatedAt?: string;
  userId?: string;
  pendingUserLinkAction?: 'unlink';
}

export interface PlayerLinkProposal {
  id: string;
  playerCloudId?: string;
  playerId: string;
  userId: string;
  status: 'pending' | 'approved' | 'rejected' | 'superseded';
  reviewedBy?: string;
  reviewedAt?: string;
  createdAt: string;
  syncStatus?: CloudSyncStatus;
  lastSyncedAt?: string;
  deletedAt?: string;
}

export interface PlayerEvaluation {
  id: string;
  playerId: string;
  playerCloudId?: string;
  ownerId?: string;
  attributes: Attributes;
  profile?: Player['perfil'];
  status?: Player['status'];
  notes?: string;
  cloudId?: string;
  syncStatus?: CloudSyncStatus;
  lastSyncedAt?: string;
  deletedAt?: string;
  createdAt: string;
  updatedAt: string;
}
