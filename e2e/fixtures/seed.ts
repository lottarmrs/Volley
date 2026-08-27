import type { Page } from '@playwright/test';

export interface SeedDataOptions {
  players?: any[];
  communities?: any[];
  sessions?: any[];
  activeSession?: any | null;
  championships?: any[];
  championshipTeams?: any[];
  championshipRounds?: any[];
  championshipRequests?: any[];
  activeCommunityId?: string | null;
}

export async function clearLocalStorage(page: Page) {
  await page.addInitScript(() => {
    window.localStorage.clear();
  });
}

export async function seedLocalStorage(page: Page, options: SeedDataOptions = {}) {
  await page.addInitScript((data) => {
    if (data.players) {
      window.localStorage.setItem('vpg_players', JSON.stringify(data.players));
    }
    if (data.communities) {
      window.localStorage.setItem('vpg_communities', JSON.stringify(data.communities));
    }
    if (data.sessions) {
      window.localStorage.setItem('vpg_sessions', JSON.stringify(data.sessions));
    }
    if (data.activeSession !== undefined) {
      if (data.activeSession === null) {
        window.localStorage.removeItem('vpg_active_session');
      } else {
        window.localStorage.setItem('vpg_active_session', JSON.stringify(data.activeSession));
      }
    }
    if (data.championships) {
      window.localStorage.setItem('vpg_championships', JSON.stringify(data.championships));
    }
    if (data.championshipTeams) {
      window.localStorage.setItem('vpg_championship_teams', JSON.stringify(data.championshipTeams));
    }
    if (data.championshipRounds) {
      window.localStorage.setItem('vpg_championship_rounds', JSON.stringify(data.championshipRounds));
    }
    if (data.championshipRequests) {
      window.localStorage.setItem('vpg_championship_requests', JSON.stringify(data.championshipRequests));
    }
    if (data.activeCommunityId) {
      window.localStorage.setItem('vpg_active_community_id', JSON.stringify(data.activeCommunityId));
    }
  }, options);
}
