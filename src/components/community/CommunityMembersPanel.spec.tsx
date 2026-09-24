import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Community, CommunityMember } from '../../types';
import { CommunityMembersPanel } from './CommunityMembersPanel';
import { playerCloudService } from '@infra/supabase/playerCloudService';

vi.mock('@infra/supabase/playerCloudService', () => ({
  playerCloudService: { fetchLinkedToUser: vi.fn() },
}));

const { useCommunityMembersMock } = vi.hoisted(() => ({
  useCommunityMembersMock: vi.fn(),
}));

vi.mock('../../hooks/useCommunityMembers', () => ({
  useCommunityMembers: useCommunityMembersMock,
}));

const { listOrganizersMock, setDutyMock } = vi.hoisted(() => ({
  listOrganizersMock: vi.fn(),
  setDutyMock: vi.fn(),
}));

vi.mock('@app/sessionOrganizerUseCases', () => ({
  listCommunityOrganizers: listOrganizersMock,
  setCommunityOrganizerDuty: setDutyMock,
}));

const community: Community = {
  id: 'community-local',
  cloudId: 'community-cloud',
  name: 'Terca Forte',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

function member(overrides: Partial<CommunityMember>): CommunityMember {
  return {
    id: 'member-id',
    communityId: 'community-local',
    userId: 'user-1',
    role: 'member',
    status: 'active',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

let changeRoleSpy = vi.fn();

function mockUseCommunityMembers(members: CommunityMember[]) {
  changeRoleSpy = vi.fn().mockResolvedValue(undefined);
  useCommunityMembersMock.mockReturnValue({
    members,
    loading: false,
    error: null,
    reload: vi.fn(),
    invite: vi.fn(),
    changeRole: changeRoleSpy,
    remove: vi.fn(),
    approveRequest: vi.fn(),
    rejectRequest: vi.fn(),
    generateJoinCode: vi.fn(),
    disableJoinCode: vi.fn(),
    leave: vi.fn(),
  });
}

beforeEach(() => {
  // Os mocks vivem no modulo: sem limpar, uma chamada de outro teste passa por
  // chamada deste.
  listOrganizersMock.mockReset();
  setDutyMock.mockReset();
  listOrganizersMock.mockResolvedValue({ ok: true, value: [] });
  setDutyMock.mockResolvedValue({ ok: true, value: undefined });
});

/** Tirar passa por confirmacao; dar, nao. */
async function confirmarNoDialogo(nome: RegExp) {
  const dialogo = await screen.findByRole('dialog');
  fireEvent.click(within(dialogo).getByRole('button', { name: nome }));
}

describe('CommunityMembersPanel', () => {
  it('atualiza o elenco local após aprovar o membro', async () => {
    mockUseCommunityMembers([
      member({ id: 'owner', userId: 'owner', role: 'owner' }),
      member({ id: 'pending', userId: 'applicant', status: 'pending', name: 'Bia' }),
    ]);
    const player = { id: 'athlete', cloudId: 'cloud-athlete', nome: 'Bia', userId: 'applicant' };
    vi.mocked(playerCloudService.fetchLinkedToUser).mockResolvedValue(player as never);
    const onLinkedPlayer = vi.fn();
    render(
      <CommunityMembersPanel
        community={community}
        currentUserId="owner"
        isSupabaseConfigured
        onLinkedPlayer={onLinkedPlayer}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Aprovar' }));
    await waitFor(() =>
      expect(onLinkedPlayer).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'athlete', communityIds: ['community-local'] }),
        'community-local',
      ),
    );
  });
  it('o seletor de cargo não oferece mais Organizador: organizar virou selo, não cargo', () => {
    mockUseCommunityMembers([
      member({ id: 'owner-row', userId: 'owner-1', role: 'owner', name: 'Ana' }),
      member({ id: 'member-row', userId: 'user-2', role: 'member', name: 'Bruno' }),
    ]);

    render(
      <CommunityMembersPanel
        community={community}
        currentUserId="owner-1"
        isSupabaseConfigured={true}
        globalRole="user"
      />,
    );

    const roleSelect = screen.getByLabelText('Papel do membro');
    expect(within(roleSelect).queryByText('Organizador')).toBeNull();
    expect(within(roleSelect).getByText('Membro')).toBeDefined();
  });

  it('quem já tem o cargo legado Organizador continua sendo exibido como tal', () => {
    mockUseCommunityMembers([
      member({ id: 'owner-row', userId: 'owner-1', role: 'owner', name: 'Ana' }),
      member({ id: 'antiga', userId: 'user-2', role: 'organizador', name: 'Bruno' }),
    ]);

    render(
      <CommunityMembersPanel community={community} currentUserId="owner-1" isSupabaseConfigured />,
    );

    const roleSelect = screen.getByLabelText('Papel do membro') as HTMLSelectElement;
    expect(roleSelect.value).toBe('organizador');
  });

  it('does not render an email line for a member whose email was hidden by RLS (email: null)', () => {
    mockUseCommunityMembers([
      member({ id: 'owner-row', userId: 'owner-1', role: 'owner', name: 'Ana' }),
      member({
        id: 'member-row',
        userId: 'user-2',
        role: 'member',
        name: 'Bruno',
        email: null,
      }),
    ]);

    render(
      <CommunityMembersPanel
        community={community}
        currentUserId="owner-1"
        isSupabaseConfigured={true}
        globalRole="user"
      />,
    );

    // Escopado na LINHA do membro, nao na tela toda: o /@/ global casava com qualquer
    // '@' da pagina — inclusive o texto de ajuda do campo "e-mail ou @username" — e
    // portanto nunca provou que o e-mail do Bruno estava escondido.
    const row = screen.getByText('Bruno').closest('li, tr, div') as HTMLElement;
    expect(row).toBeTruthy();
    expect(within(row).queryByText(/@/)).toBeNull();
  });

  it('renders the email line for a member whose email is visible', () => {
    mockUseCommunityMembers([
      member({ id: 'owner-row', userId: 'owner-1', role: 'owner', name: 'Ana' }),
      member({
        id: 'member-row',
        userId: 'user-2',
        role: 'member',
        name: 'Bruno',
        email: 'bruno@example.com',
      }),
    ]);

    render(
      <CommunityMembersPanel
        community={community}
        currentUserId="owner-1"
        isSupabaseConfigured={true}
        globalRole="user"
      />,
    );

    expect(screen.getByText('bruno@example.com')).toBeTruthy();
  });

  it('lets a moderator see and act on pending join requests', () => {
    // O banco (capability approve_members) e o caso de uso
    // (ensureApprovingCurrentMember) ja liberavam moderador, mas o painel gateava a
    // secao por canManage (owner/admin), entao o moderador nunca via os botoes — o
    // recurso ficava inalcancavel justamente para o papel para o qual foi feito.
    mockUseCommunityMembers([
      member({ id: 'mod-row', userId: 'mod-1', role: 'moderator', name: 'Carla' }),
      member({
        id: 'pending-row',
        userId: 'user-9',
        role: 'member',
        status: 'pending',
        name: 'Diego',
      }),
    ]);

    render(
      <CommunityMembersPanel
        community={community}
        currentUserId="mod-1"
        isSupabaseConfigured={true}
        globalRole="user"
      />,
    );

    expect(screen.getByText(/pedidos para entrar/i)).toBeTruthy();
    expect(screen.getByText('Diego')).toBeTruthy();
  });

  it('does not show pending join requests to an ordinary member', () => {
    // approve_members nao e concedida a 'member', entao a secao nao deve aparecer.
    mockUseCommunityMembers([
      member({ id: 'me-row', userId: 'plain-1', role: 'member', name: 'Elisa' }),
      member({
        id: 'pending-row',
        userId: 'user-9',
        role: 'member',
        status: 'pending',
        name: 'Diego',
      }),
    ]);

    render(
      <CommunityMembersPanel
        community={community}
        currentUserId="plain-1"
        isSupabaseConfigured={true}
        globalRole="user"
      />,
    );

    expect(screen.queryByText(/pedidos para entrar/i)).toBeNull();
  });
});

describe('CommunityMembersPanel — quem organiza', () => {
  it('o selo de organizar é separado do cargo: mostra quem organiza sem mexer no crachá', async () => {
    listOrganizersMock.mockResolvedValue({ ok: true, value: ['bia'] });
    setDutyMock.mockResolvedValue({ ok: true, value: undefined });
    mockUseCommunityMembers([
      member({ id: 'dono', userId: 'dono', role: 'owner', name: 'Ana Prado' }),
      member({ id: 'bia', userId: 'bia', role: 'member', name: 'Bianca Ferraz' }),
    ]);

    render(
      <CommunityMembersPanel community={community} currentUserId="dono" isSupabaseConfigured />,
    );

    const linha = await screen.findByRole('listitem', { name: /bianca ferraz/i });
    expect(within(linha).getByText(/organiza as peladas/i)).toBeDefined();
    expect(within(linha).getByLabelText(/papel do membro/i)).toHaveProperty('value', 'member');
  });

  it('tirar a organização chama o servidor com enabled falso', async () => {
    listOrganizersMock.mockResolvedValue({ ok: true, value: ['bia'] });
    setDutyMock.mockResolvedValue({ ok: true, value: undefined });
    mockUseCommunityMembers([
      member({ id: 'dono', userId: 'dono', role: 'owner', name: 'Ana Prado' }),
      member({ id: 'bia', userId: 'bia', role: 'member', name: 'Bianca Ferraz' }),
    ]);

    render(
      <CommunityMembersPanel community={community} currentUserId="dono" isSupabaseConfigured />,
    );

    const linha = await screen.findByRole('listitem', { name: /bianca ferraz/i });
    fireEvent.click(within(linha).getByRole('button', { name: /tirar a organização/i }));
    await confirmarNoDialogo(/tirar a organização/i);

    await waitFor(() =>
      expect(setDutyMock).toHaveBeenCalledWith({
        communityCloudId: 'community-cloud',
        userId: 'bia',
        enabled: false,
      }),
    );
  });

  it('quem não organiza recebe o convite para passar a organizar', async () => {
    listOrganizersMock.mockResolvedValue({ ok: true, value: [] });
    setDutyMock.mockResolvedValue({ ok: true, value: undefined });
    mockUseCommunityMembers([
      member({ id: 'dono', userId: 'dono', role: 'owner', name: 'Ana Prado' }),
      member({ id: 'bia', userId: 'bia', role: 'member', name: 'Bianca Ferraz' }),
    ]);

    render(
      <CommunityMembersPanel community={community} currentUserId="dono" isSupabaseConfigured />,
    );

    const linha = await screen.findByRole('listitem', { name: /bianca ferraz/i });
    expect(within(linha).queryByText(/organiza as peladas/i)).toBeNull();
    fireEvent.click(within(linha).getByRole('button', { name: /deixar organizar/i }));

    await waitFor(() =>
      expect(setDutyMock).toHaveBeenCalledWith({
        communityCloudId: 'community-cloud',
        userId: 'bia',
        enabled: true,
      }),
    );
  });

  it('quem não administra não vê o botão, só o selo', async () => {
    listOrganizersMock.mockResolvedValue({ ok: true, value: ['bia'] });
    mockUseCommunityMembers([
      member({ id: 'dono', userId: 'dono', role: 'owner', name: 'Ana Prado' }),
      member({ id: 'bia', userId: 'bia', role: 'member', name: 'Bianca Ferraz' }),
    ]);

    render(
      <CommunityMembersPanel community={community} currentUserId="bia" isSupabaseConfigured />,
    );

    const linha = await screen.findByRole('listitem', { name: /bianca ferraz/i });
    expect(within(linha).getByText(/organiza as peladas/i)).toBeDefined();
    expect(within(linha).queryByRole('button', { name: /tirar a organização/i })).toBeNull();
  });

  it('a recusa do servidor aparece e o selo não muda', async () => {
    listOrganizersMock.mockResolvedValue({ ok: true, value: ['bia'] });
    setDutyMock.mockResolvedValue({
      ok: false,
      error: { kind: 'permission_denied', message: 'Esta ação pede verificação em duas etapas.' },
    });
    mockUseCommunityMembers([
      member({ id: 'dono', userId: 'dono', role: 'owner', name: 'Ana Prado' }),
      member({ id: 'bia', userId: 'bia', role: 'member', name: 'Bianca Ferraz' }),
    ]);

    render(
      <CommunityMembersPanel community={community} currentUserId="dono" isSupabaseConfigured />,
    );

    const linha = await screen.findByRole('listitem', { name: /bianca ferraz/i });
    fireEvent.click(within(linha).getByRole('button', { name: /tirar a organização/i }));
    await confirmarNoDialogo(/tirar a organização/i);

    await waitFor(() => expect(screen.getByText(/duas etapas/i)).toBeDefined());
    expect(within(linha).getByText(/organiza as peladas/i)).toBeDefined();
  });

  it('tirar a organizacao de quem tem o cargo legado tambem derruba o cargo', async () => {
    listOrganizersMock.mockResolvedValue({ ok: true, value: ['bia'] });
    setDutyMock.mockResolvedValue({ ok: true, value: undefined });
    mockUseCommunityMembers([
      member({ id: 'dono', userId: 'dono', role: 'owner', name: 'Ana Prado' }),
      member({ id: 'bia-row', userId: 'bia', role: 'organizador', name: 'Bianca Ferraz' }),
    ]);

    render(
      <CommunityMembersPanel community={community} currentUserId="dono" isSupabaseConfigured />,
    );

    const linha = await screen.findByRole('listitem', { name: /bianca ferraz/i });
    fireEvent.click(within(linha).getByRole('button', { name: /tirar a organização/i }));
    await confirmarNoDialogo(/tirar a organização/i);

    // Sem isto o espelho de community_members devolve a responsabilidade no
    // proximo toque no cargo, e a remocao nao se sustenta.
    await waitFor(() => expect(changeRoleSpy).toHaveBeenCalledWith('bia-row', 'member'));
    expect(setDutyMock).toHaveBeenCalledWith({
      communityCloudId: 'community-cloud',
      userId: 'bia',
      enabled: false,
    });
  });

  it('dar a organizacao nao mexe no cargo de ninguem', async () => {
    listOrganizersMock.mockResolvedValue({ ok: true, value: [] });
    setDutyMock.mockResolvedValue({ ok: true, value: undefined });
    mockUseCommunityMembers([
      member({ id: 'dono', userId: 'dono', role: 'owner', name: 'Ana Prado' }),
      member({ id: 'bia-row', userId: 'bia', role: 'member', name: 'Bianca Ferraz' }),
    ]);

    render(
      <CommunityMembersPanel community={community} currentUserId="dono" isSupabaseConfigured />,
    );

    const linha = await screen.findByRole('listitem', { name: /bianca ferraz/i });
    fireEvent.click(within(linha).getByRole('button', { name: /deixar organizar/i }));

    await waitFor(() => expect(setDutyMock).toHaveBeenCalled());
    expect(changeRoleSpy).not.toHaveBeenCalled();
  });

  it('tirar a organização avisa que isso tranca lista aberta, antes de agir', async () => {
    listOrganizersMock.mockResolvedValue({ ok: true, value: ['bia'] });
    setDutyMock.mockResolvedValue({ ok: true, value: undefined });
    mockUseCommunityMembers([
      member({ id: 'dono', userId: 'dono', role: 'owner', name: 'Ana Prado' }),
      member({ id: 'bia-row', userId: 'bia', role: 'member', name: 'Bianca Ferraz' }),
    ]);

    render(
      <CommunityMembersPanel community={community} currentUserId="dono" isSupabaseConfigured />,
    );

    const linha = await screen.findByRole('listitem', { name: /bianca ferraz/i });
    fireEvent.click(within(linha).getByRole('button', { name: /tirar a organização/i }));

    // Nada acontece até a pessoa confirmar.
    expect(setDutyMock).not.toHaveBeenCalled();
    const dialogo = screen.getByRole('dialog');
    expect(dialogo.textContent).toMatch(/lista aberta|inscrição aberta/i);

    fireEvent.click(within(dialogo).getByRole('button', { name: /tirar a organização/i }));
    await waitFor(() => expect(setDutyMock).toHaveBeenCalled());
  });

  it('dar a organização não pede confirmação: não tira nada de ninguém', async () => {
    listOrganizersMock.mockResolvedValue({ ok: true, value: [] });
    setDutyMock.mockResolvedValue({ ok: true, value: undefined });
    mockUseCommunityMembers([
      member({ id: 'dono', userId: 'dono', role: 'owner', name: 'Ana Prado' }),
      member({ id: 'bia-row', userId: 'bia', role: 'member', name: 'Bianca Ferraz' }),
    ]);

    render(
      <CommunityMembersPanel community={community} currentUserId="dono" isSupabaseConfigured />,
    );

    const linha = await screen.findByRole('listitem', { name: /bianca ferraz/i });
    fireEvent.click(within(linha).getByRole('button', { name: /deixar organizar/i }));

    await waitFor(() => expect(setDutyMock).toHaveBeenCalled());
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
