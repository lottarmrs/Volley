import React, { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { Calendar, Plus, Search, Trophy, Users } from 'lucide-react';
import { useShell } from '../../app/shellContext';
import { paths } from '../../application/appRoutes';

export function ChampionshipsHubView() {
  const { comm, championships } = useShell();
  const [selectedCommunityId, setSelectedCommunityId] = useState<string>('all');
  const [search, setSearch] = useState('');

  const filteredChampionships = useMemo(() => {
    return championships.championships.filter((item) => {
      if (item.deletedAt) return false;
      if (selectedCommunityId !== 'all' && item.communityId !== selectedCommunityId) return false;
      if (search.trim() && !item.name.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [championships.championships, selectedCommunityId, search]);

  const activeCount = championships.championships.filter((c) => !c.deletedAt).length;

  return (
    <div className="space-y-6 pb-24">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black uppercase tracking-tight flex items-center gap-2">
            <Trophy className="w-6 h-6 text-primary" /> Ligas de Vôlei
          </h2>
          <p className="text-sm text-base-content/60">
            Central de campeonatos por pontos corridos, tabelas e estatísticas da temporada.
          </p>
        </div>
        <Link to={paths.ligaNova} className="btn btn-primary btn-sm">
          <Plus className="w-4 h-4" /> Nova liga
        </Link>
      </div>

      {/* Quick Metrics Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="card card-border bg-base-200 p-4">
          <span className="text-xs uppercase font-bold text-base-content/60">Ligas Ativas</span>
          <p className="text-2xl font-black text-primary mt-1">{activeCount}</p>
        </div>
        <div className="card card-border bg-base-200 p-4">
          <span className="text-xs uppercase font-bold text-base-content/60">Comunidades</span>
          <p className="text-2xl font-black mt-1">{comm.communities.length}</p>
        </div>
        <div className="card card-border bg-base-200 p-4">
          <span className="text-xs uppercase font-bold text-base-content/60">Equipes Cadastradas</span>
          <p className="text-2xl font-black mt-1">{championships.championshipTeams.length}</p>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative grow">
          <Search className="w-4 h-4 absolute left-3 top-3 text-base-content/50" />
          <input
            type="text"
            className="input input-bordered input-sm w-full pl-9"
            placeholder="Buscar liga..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          className="select select-bordered select-sm"
          value={selectedCommunityId}
          onChange={(e) => setSelectedCommunityId(e.target.value)}
        >
          <option value="all">Todas as comunidades</option>
          {comm.communities.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      {/* League Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredChampionships.map((item) => {
          const community = comm.communities.find((c) => c.id === item.communityId);
          const teamsCount = championships.championshipTeams.filter(
            (t) => t.championshipId === item.id,
          ).length;

          return (
            <div key={item.id} className="card card-border bg-base-200 hover:border-primary/50 transition-colors">
              <div className="card-body p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <span className="badge badge-primary badge-soft">{community?.name || 'Comunidade'}</span>
                  <span className="badge badge-outline text-[10px]">
                    {item.format === 'double_round_robin' ? 'Turno & Returno' : 'Turno Único'}
                  </span>
                </div>
                <h3 className="card-title text-lg uppercase font-black">{item.name}</h3>
                <div className="text-xs text-base-content/60 space-y-1">
                  <p className="flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5" /> {teamsCount} equipes inscritas
                  </p>
                  <p className="flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5" /> Início: {item.recurrenceRule?.startDate || '-'}
                  </p>
                </div>
                <div className="card-actions justify-end pt-2 border-t border-base-300">
                  <Link to={paths.liga(item.id)} className="btn btn-outline btn-xs btn-block">
                    Abrir liga
                  </Link>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {filteredChampionships.length === 0 && (
        <div className="card card-border bg-base-200 border-dashed py-12 text-center space-y-2">
          <Trophy className="w-8 h-8 text-base-content/30 mx-auto" />
          <h4 className="font-bold">Nenhuma liga encontrada</h4>
          <p className="text-xs text-base-content/60">Crie a primeira liga para gerenciar a temporada.</p>
        </div>
      )}
    </div>
  );
}
