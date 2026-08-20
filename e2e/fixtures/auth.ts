import { test as base } from '@playwright/test';
import { seedLocalStorage, clearLocalStorage } from './seed';

export type UserRole = 'master' | 'programmer' | 'owner' | 'admin' | 'moderator' | 'organizador' | 'member' | 'guest';

export interface TestFixtures {
  mockUserRole: (role: UserRole, communityId?: string) => Promise<void>;
  resetStorage: () => Promise<void>;
}

export const test = base.extend<TestFixtures>({
  mockUserRole: async ({ page }, use) => {
    const fn = async (role: UserRole, communityId: string = 'comm_test_1') => {
      const userId = `user_${role}_1`;
      const globalRole = role === 'master' ? 'master' : role === 'programmer' ? 'programmer' : 'user';

      const communityMemberRole = (['owner', 'admin', 'moderator', 'organizador', 'member'].includes(role)
        ? role
        : 'member') as any;

      const demoCommunity = {
        id: communityId,
        name: 'Comunidade Teste E2E',
        description: 'Comunidade criada para testes automatizados Playwright',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const demoMembers = [
        {
          id: `member_${role}_1`,
          communityId,
          userId,
          role: communityMemberRole,
          status: 'active',
          name: `Usuário ${role.toUpperCase()}`,
          email: `${role}@test.com`,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ];

      await seedLocalStorage(page, {
        communities: [demoCommunity],
        activeCommunityId: communityId,
      });

      await page.addInitScript((args) => {
        window.localStorage.setItem(
          'vpg_auth_mock',
          JSON.stringify({
            user: { id: args.userId, email: `${args.role}@test.com` },
            profile: { id: args.userId, name: `Usuário ${args.role.toUpperCase()}`, role: args.globalRole },
            members: args.demoMembers,
          }),
        );
      }, { userId, role, globalRole, demoMembers });
    };

    await use(fn);
  },

  resetStorage: async ({ page }, use) => {
    const fn = async () => {
      await clearLocalStorage(page);
    };
    await use(fn);
  },
});

export { expect } from '@playwright/test';
