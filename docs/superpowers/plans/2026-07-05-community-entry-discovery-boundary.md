# Community Entry Discovery Boundary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move community entry by code and public discovery behind application-layer hooks while preserving the current UI.

**Architecture:** Add the missing preview-by-code query to `communityMembershipUseCases`, then wrap entry/discovery state in two focused React hooks. Components keep the same markup and visual behavior, but stop importing Supabase services directly.

**Tech Stack:** React 19, TypeScript, Node test runner with `tsx`, Vitest, Testing Library `renderHook`, Supabase adapters behind existing gateways.

---

## File Structure

- Modify `src/application/communityMembershipUseCases.ts`: export `CommunityJoinPreview`, re-export `PublicCommunityResult`, and add `previewCommunityJoinByCodeQuery`.
- Modify `src/application/communityMembershipUseCases.test.ts`: add Node tests for the new preview query.
- Create `src/hooks/useJoinCommunityByCode.ts`: own code-entry modal state and call application use cases.
- Create `src/hooks/useJoinCommunityByCode.spec.tsx`: Vitest hook tests for preview and request state.
- Create `src/hooks/useCommunityDiscovery.ts`: own public discovery modal state and call application use cases.
- Create `src/hooks/useCommunityDiscovery.spec.tsx`: Vitest hook tests for search and request state.
- Modify `src/components/community/JoinCommunityByCode.tsx`: replace local service calls/state with `useJoinCommunityByCode`.
- Modify `src/components/community/CommunityDiscovery.tsx`: replace local service calls/state with `useCommunityDiscovery`.

## Task 1: Add Preview By Code Query

**Files:**
- Modify: `src/application/communityMembershipUseCases.ts`
- Test: `src/application/communityMembershipUseCases.test.ts`

- [ ] **Step 1: Write the failing application tests**

In `src/application/communityMembershipUseCases.test.ts`, add `previewCommunityJoinByCodeQuery` to the import from `./communityMembershipUseCases`:

```ts
  previewCommunityJoinByCodeQuery,
```

Append these tests after the existing `requestCommunityJoinByCodeCommand rejects empty code` test and before the existing technical-error test for `requestCommunityJoinByCodeCommand`:

```ts
test('previewCommunityJoinByCodeQuery normalizes code and returns found community', async () => {
  const calls: string[] = [];
  const result = await previewCommunityJoinByCodeQuery(
    { code: ' abcd1234 ' },
    membershipGateway(calls),
  );

  assert.equal(result.ok, true);
  assert.equal(result.value.community.id, 'community-cloud');
  assert.equal(result.value.community.name, 'Terca Forte');
  assert.deepEqual(calls, ['find:ABCD1234']);
});

test('previewCommunityJoinByCodeQuery rejects empty code without calling gateway', async () => {
  const calls: string[] = [];
  const result = await previewCommunityJoinByCodeQuery({ code: ' ' }, membershipGateway(calls));

  assertProductError(result, 'invalid_input');
  assert.deepEqual(calls, []);
});

test('previewCommunityJoinByCodeQuery returns not found when gateway returns null', async () => {
  const calls: string[] = [];
  const gateway = membershipGateway(calls);
  gateway.findByCode = async (code) => {
    calls.push(`find:${code}`);
    return null;
  };

  const result = await previewCommunityJoinByCodeQuery({ code: 'missing' }, gateway);

  assertProductError(result, 'not_found');
  assert.deepEqual(calls, ['find:MISSING']);
});

test('previewCommunityJoinByCodeQuery returns technical error when gateway throws', async () => {
  const gateway = membershipGateway([]);
  gateway.findByCode = async () => {
    throw new Error('preview failed');
  };

  const result = await previewCommunityJoinByCodeQuery({ code: 'ABCD1234' }, gateway);

  assertTechnicalError(result);
});
```

- [ ] **Step 2: Run the focused unit test and verify RED**

Run:

```powershell
node --import tsx --test src/application/communityMembershipUseCases.test.ts
```

Expected: FAIL because `previewCommunityJoinByCodeQuery` is not exported from `src/application/communityMembershipUseCases.ts`.

- [ ] **Step 3: Implement the minimal application query**

In `src/application/communityMembershipUseCases.ts`, replace the inline `findByCode` return type inside `CommunityMembershipGateway` with an exported interface.

Add this near the gateway interfaces:

```ts
export interface CommunityJoinPreview {
  id: string;
  name: string;
  description: string | null;
  memberCount: number;
  myStatus: string | null;
}

export type { PublicCommunityResult };
```

Change the `findByCode` signature inside `CommunityMembershipGateway` to:

```ts
  findByCode: (code: string) => Promise<CommunityJoinPreview | null>;
```

Add this function before `requestCommunityJoinByCodeCommand`:

```ts
export async function previewCommunityJoinByCodeQuery(
  input: { code: string },
  gateway: CommunityMembershipGateway = supabaseCommunityMembershipGateway,
): Promise<AppResult<{ community: CommunityJoinPreview }>> {
  const code = input.code.trim().toUpperCase();
  if (!code) return productError('invalid_input', 'Informe o codigo da comunidade.');

  try {
    const community = await gateway.findByCode(code);
    if (!community) {
      return productError(
        'not_found',
        'Codigo de convite invalido ou comunidade nao encontrada.',
      );
    }
    return appOk({ community });
  } catch (error) {
    return technicalError('Nao foi possivel buscar a comunidade.', error);
  }
}
```

- [ ] **Step 4: Run the focused unit test and verify GREEN**

Run:

```powershell
node --import tsx --test src/application/communityMembershipUseCases.test.ts
```

Expected: PASS for all `communityMembershipUseCases` tests.

- [ ] **Step 5: Commit Task 1**

Run:

```powershell
git add src/application/communityMembershipUseCases.ts src/application/communityMembershipUseCases.test.ts
git commit -m "feat(app): add community join preview query"
```

## Task 2: Add Join-By-Code Hook

**Files:**
- Create: `src/hooks/useJoinCommunityByCode.ts`
- Test: `src/hooks/useJoinCommunityByCode.spec.tsx`

- [ ] **Step 1: Write the failing hook test**

Create `src/hooks/useJoinCommunityByCode.spec.tsx` with this content:

```tsx
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  previewCommunityJoinByCodeQuery,
  requestCommunityJoinByCodeCommand,
} from '../application/communityMembershipUseCases';
import { useJoinCommunityByCode } from './useJoinCommunityByCode';

vi.mock('../application/communityMembershipUseCases', async () => {
  const actual = await vi.importActual<typeof import('../application/communityMembershipUseCases')>(
    '../application/communityMembershipUseCases',
  );
  return {
    ...actual,
    previewCommunityJoinByCodeQuery: vi.fn(),
    requestCommunityJoinByCodeCommand: vi.fn(),
  };
});

const preview = {
  id: 'community-cloud',
  name: 'Terca Forte',
  description: null,
  memberCount: 12,
  myStatus: null,
};

describe('useJoinCommunityByCode', () => {
  beforeEach(() => {
    vi.mocked(previewCommunityJoinByCodeQuery).mockReset();
    vi.mocked(requestCommunityJoinByCodeCommand).mockReset();
  });

  it('uppercases code input and loads preview through the application query', async () => {
    vi.mocked(previewCommunityJoinByCodeQuery).mockResolvedValue({
      ok: true,
      value: { community: preview },
    });

    const { result } = renderHook(() => useJoinCommunityByCode());

    act(() => {
      result.current.setCode(' abcd1234 ');
    });

    await act(async () => {
      await result.current.previewCommunity();
    });

    expect(result.current.code).toBe(' ABCD1234 ');
    expect(result.current.preview).toEqual(preview);
    expect(result.current.error).toBeNull();
    expect(result.current.requested).toBe(false);
    expect(previewCommunityJoinByCodeQuery).toHaveBeenCalledWith({ code: ' ABCD1234 ' });
  });

  it('shows application errors and clears stale preview', async () => {
    vi.mocked(previewCommunityJoinByCodeQuery).mockResolvedValueOnce({
      ok: true,
      value: { community: preview },
    });
    vi.mocked(previewCommunityJoinByCodeQuery).mockResolvedValueOnce({
      ok: false,
      error: {
        kind: 'product',
        code: 'not_found',
        message: 'Codigo de convite invalido ou comunidade nao encontrada.',
        recoverable: false,
      },
    });

    const { result } = renderHook(() => useJoinCommunityByCode());

    act(() => {
      result.current.setCode('ABCD1234');
    });
    await act(async () => {
      await result.current.previewCommunity();
    });
    await act(async () => {
      await result.current.previewCommunity();
    });

    expect(result.current.preview).toBeNull();
    expect(result.current.error).toBe('Codigo de convite invalido ou comunidade nao encontrada.');
    expect(result.current.loading).toBe(false);
  });

  it('marks request as sent when join by code succeeds', async () => {
    vi.mocked(requestCommunityJoinByCodeCommand).mockResolvedValue({
      ok: true,
      value: {
        member: {
          id: 'member-pending',
          communityId: 'community-local',
          userId: 'user-1',
          role: 'member',
          status: 'pending',
          name: null,
          email: null,
          invitedBy: null,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      },
    });

    const { result } = renderHook(() => useJoinCommunityByCode());

    act(() => {
      result.current.setCode('abcd1234');
    });
    await act(async () => {
      await result.current.requestJoin();
    });

    expect(requestCommunityJoinByCodeCommand).toHaveBeenCalledWith({ code: 'ABCD1234' });
    expect(result.current.requested).toBe(true);
    expect(result.current.error).toBeNull();
    expect(result.current.loading).toBe(false);
  });
});
```

- [ ] **Step 2: Run the focused hook test and verify RED**

Run:

```powershell
npm run test:ui -- src/hooks/useJoinCommunityByCode.spec.tsx
```

Expected: FAIL because `src/hooks/useJoinCommunityByCode.ts` does not exist.

- [ ] **Step 3: Implement the hook**

Create `src/hooks/useJoinCommunityByCode.ts` with this content:

```ts
import { useCallback, useState } from 'react';
import {
  previewCommunityJoinByCodeQuery,
  requestCommunityJoinByCodeCommand,
  type CommunityJoinPreview,
} from '../application/communityMembershipUseCases';

export function useJoinCommunityByCode() {
  const [code, setCodeState] = useState('');
  const [preview, setPreview] = useState<CommunityJoinPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [requested, setRequested] = useState(false);

  const setCode = useCallback((value: string) => {
    setCodeState(value.toUpperCase());
  }, []);

  const previewCommunity = useCallback(async () => {
    setLoading(true);
    setError(null);
    setPreview(null);
    setRequested(false);
    try {
      const result = await previewCommunityJoinByCodeQuery({ code });
      if (result.ok === false) {
        setError(result.error.message);
        return;
      }
      setPreview(result.value.community);
    } finally {
      setLoading(false);
    }
  }, [code]);

  const requestJoin = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await requestCommunityJoinByCodeCommand({ code });
      if (result.ok === false) {
        setError(result.error.message);
        return;
      }
      setRequested(true);
    } finally {
      setLoading(false);
    }
  }, [code]);

  return {
    code,
    setCode,
    preview,
    loading,
    error,
    requested,
    previewCommunity,
    requestJoin,
  };
}
```

- [ ] **Step 4: Run the focused hook test and verify GREEN**

Run:

```powershell
npm run test:ui -- src/hooks/useJoinCommunityByCode.spec.tsx
```

Expected: PASS for `useJoinCommunityByCode`.

- [ ] **Step 5: Commit Task 2**

Run:

```powershell
git add src/hooks/useJoinCommunityByCode.ts src/hooks/useJoinCommunityByCode.spec.tsx
git commit -m "feat(app): add join community by code hook"
```

## Task 3: Add Public Discovery Hook

**Files:**
- Create: `src/hooks/useCommunityDiscovery.ts`
- Test: `src/hooks/useCommunityDiscovery.spec.tsx`

- [ ] **Step 1: Write the failing hook test**

Create `src/hooks/useCommunityDiscovery.spec.tsx` with this content:

```tsx
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  requestPublicCommunityJoinCommand,
  searchPublicCommunitiesQuery,
} from '../application/communityMembershipUseCases';
import { useCommunityDiscovery } from './useCommunityDiscovery';

vi.mock('../application/communityMembershipUseCases', async () => {
  const actual = await vi.importActual<typeof import('../application/communityMembershipUseCases')>(
    '../application/communityMembershipUseCases',
  );
  return {
    ...actual,
    requestPublicCommunityJoinCommand: vi.fn(),
    searchPublicCommunitiesQuery: vi.fn(),
  };
});

const community = {
  id: 'community-cloud',
  name: 'Terca Forte',
  description: null,
  memberCount: 12,
  myStatus: null,
};

describe('useCommunityDiscovery', () => {
  beforeEach(() => {
    vi.mocked(requestPublicCommunityJoinCommand).mockReset();
    vi.mocked(searchPublicCommunitiesQuery).mockReset();
  });

  it('loads public communities through the application query', async () => {
    vi.mocked(searchPublicCommunitiesQuery).mockResolvedValue({
      ok: true,
      value: { communities: [community] },
    });

    const { result } = renderHook(() => useCommunityDiscovery());

    act(() => {
      result.current.setQuery('terca');
    });
    await act(async () => {
      await result.current.search('terca');
    });

    expect(searchPublicCommunitiesQuery).toHaveBeenCalledWith({ query: 'terca' });
    expect(result.current.results).toEqual([community]);
    expect(result.current.error).toBeNull();
    expect(result.current.loading).toBe(false);
  });

  it('shows search errors and preserves previous results', async () => {
    vi.mocked(searchPublicCommunitiesQuery).mockResolvedValueOnce({
      ok: true,
      value: { communities: [community] },
    });
    vi.mocked(searchPublicCommunitiesQuery).mockResolvedValueOnce({
      ok: false,
      error: {
        kind: 'technical',
        code: 'technical_error',
        message: 'Nao foi possivel buscar comunidades.',
        recoverable: true,
      },
    });

    const { result } = renderHook(() => useCommunityDiscovery());

    await act(async () => {
      await result.current.search('');
    });
    await act(async () => {
      await result.current.search('falha');
    });

    expect(result.current.results).toEqual([community]);
    expect(result.current.error).toBe('Nao foi possivel buscar comunidades.');
    expect(result.current.loading).toBe(false);
  });

  it('marks requested community as pending after public join succeeds', async () => {
    vi.mocked(searchPublicCommunitiesQuery).mockResolvedValue({
      ok: true,
      value: { communities: [community] },
    });
    vi.mocked(requestPublicCommunityJoinCommand).mockResolvedValue({
      ok: true,
      value: {},
    });

    const { result } = renderHook(() => useCommunityDiscovery());

    await act(async () => {
      await result.current.search('');
    });
    await act(async () => {
      await result.current.requestJoin(community);
    });

    expect(requestPublicCommunityJoinCommand).toHaveBeenCalledWith({
      communityCloudId: 'community-cloud',
    });
    expect(result.current.results[0].myStatus).toBe('pending');
    expect(result.current.actingId).toBeNull();
    expect(result.current.error).toBeNull();
  });
});
```

- [ ] **Step 2: Run the focused hook test and verify RED**

Run:

```powershell
npm run test:ui -- src/hooks/useCommunityDiscovery.spec.tsx
```

Expected: FAIL because `src/hooks/useCommunityDiscovery.ts` does not exist.

- [ ] **Step 3: Implement the hook**

Create `src/hooks/useCommunityDiscovery.ts` with this content:

```ts
import { useCallback, useState } from 'react';
import {
  requestPublicCommunityJoinCommand,
  searchPublicCommunitiesQuery,
  type PublicCommunityResult,
} from '../application/communityMembershipUseCases';

export function useCommunityDiscovery() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PublicCommunityResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actingId, setActingId] = useState<string | null>(null);

  const search = useCallback(async (nextQuery: string) => {
    setLoading(true);
    setError(null);
    try {
      const result = await searchPublicCommunitiesQuery({ query: nextQuery });
      if (result.ok === false) {
        setError(result.error.message);
        return;
      }
      setResults(result.value.communities);
    } finally {
      setLoading(false);
    }
  }, []);

  const requestJoin = useCallback(async (community: PublicCommunityResult) => {
    setActingId(community.id);
    setError(null);
    try {
      const result = await requestPublicCommunityJoinCommand({
        communityCloudId: community.id,
      });
      if (result.ok === false) {
        setError(result.error.message);
        return;
      }
      setResults((previous) =>
        previous.map((candidate) =>
          candidate.id === community.id ? { ...candidate, myStatus: 'pending' } : candidate,
        ),
      );
    } finally {
      setActingId(null);
    }
  }, []);

  return {
    query,
    setQuery,
    results,
    loading,
    error,
    actingId,
    search,
    requestJoin,
  };
}
```

- [ ] **Step 4: Run the focused hook test and verify GREEN**

Run:

```powershell
npm run test:ui -- src/hooks/useCommunityDiscovery.spec.tsx
```

Expected: PASS for `useCommunityDiscovery`.

- [ ] **Step 5: Commit Task 3**

Run:

```powershell
git add src/hooks/useCommunityDiscovery.ts src/hooks/useCommunityDiscovery.spec.tsx
git commit -m "feat(app): add community discovery hook"
```

## Task 4: Route Components Through Hooks

**Files:**
- Modify: `src/components/community/JoinCommunityByCode.tsx`
- Modify: `src/components/community/CommunityDiscovery.tsx`

- [ ] **Step 1: Run the textual boundary check and verify RED**

Run:

```powershell
rg -n "membershipCloudService|communityDiscoveryService|supabase\\.from|supabase\\.rpc" src\components\community\JoinCommunityByCode.tsx src\components\community\CommunityDiscovery.tsx
```

Expected: FAIL by finding at least:

```text
src\components\community\JoinCommunityByCode.tsx:3:import { membershipCloudService } from '../../services/supabase/membershipCloudService';
src\components\community\CommunityDiscovery.tsx:4:  communityDiscoveryService,
```

- [ ] **Step 2: Refactor `JoinCommunityByCode.tsx` to use the hook**

In `src/components/community/JoinCommunityByCode.tsx`, replace:

```ts
import { useState } from 'react';
import { KeyRound, Loader2, Users, Check, X } from 'lucide-react';
import { membershipCloudService } from '../../services/supabase/membershipCloudService';
```

with:

```ts
import { KeyRound, Loader2, Users, Check, X } from 'lucide-react';
import { useJoinCommunityByCode } from '../../hooks/useJoinCommunityByCode';
```

Remove the local `Preview` type and `messageOf` function from the component file.

Inside `JoinCommunityByCode`, replace all local `useState` declarations and both handlers with:

```ts
  const {
    code,
    setCode,
    preview,
    loading,
    error,
    requested,
    previewCommunity,
    requestJoin,
  } = useJoinCommunityByCode();

  const handlePreview = async () => {
    if (!code.trim()) return;
    await previewCommunity();
  };

  const handleRequest = async () => {
    await requestJoin();
  };
```

Change the input `onChange` handler to:

```tsx
            onChange={(e) => setCode(e.target.value)}
```

Leave the rest of the JSX and existing classes unchanged.

- [ ] **Step 3: Refactor `CommunityDiscovery.tsx` to use the hook**

In `src/components/community/CommunityDiscovery.tsx`, replace:

```ts
import { useEffect, useState } from 'react';
import { Search, Loader2, Users, Check, X } from 'lucide-react';
import {
  communityDiscoveryService,
  PublicCommunityResult,
} from '../../services/supabase/communityDiscoveryService';
```

with:

```ts
import { useEffect } from 'react';
import { Search, Loader2, Users, Check, X } from 'lucide-react';
import {
  useCommunityDiscovery,
} from '../../hooks/useCommunityDiscovery';
import type { PublicCommunityResult } from '../../application/communityMembershipUseCases';
```

Remove the local `messageOf` function from the component file.

Inside `CommunityDiscovery`, replace all local `useState` declarations and the local `search` function with:

```ts
  const {
    query,
    setQuery,
    results,
    loading,
    error,
    actingId,
    search,
    requestJoin,
  } = useCommunityDiscovery();
```

Keep the initial search effect, but make it call the hook:

```ts
  useEffect(() => {
    search('');
  }, [search]);
```

Replace `handleRequest` with:

```ts
  const handleRequest = async (community: PublicCommunityResult) => {
    await requestJoin(community);
  };
```

Leave the rest of the JSX and existing classes unchanged.

- [ ] **Step 4: Run UI tests and verify component integration**

Run:

```powershell
npm run test:ui
```

Expected: PASS for all Vitest specs, including the two new hook specs.

- [ ] **Step 5: Run the textual boundary check and verify GREEN**

Run:

```powershell
rg -n "membershipCloudService|communityDiscoveryService|supabase\\.from|supabase\\.rpc" src\components\community\JoinCommunityByCode.tsx src\components\community\CommunityDiscovery.tsx
```

Expected: no output and exit code `1`, meaning the forbidden imports/calls are gone from those components.

- [ ] **Step 6: Commit Task 4**

Run:

```powershell
git add src/components/community/JoinCommunityByCode.tsx src/components/community/CommunityDiscovery.tsx
git commit -m "refactor(app): route community entry ui through hooks"
```

## Task 5: Full Verification

**Files:**
- Verify: entire repo

- [ ] **Step 1: Run TypeScript lint**

Run:

```powershell
npm run lint
```

Expected: PASS with TypeScript reporting no errors.

- [ ] **Step 2: Run Node unit tests**

Run:

```powershell
npm run test:unit
```

Expected: PASS for all Node test files, including `src/application/communityMembershipUseCases.test.ts`.

- [ ] **Step 3: Run UI tests**

Run:

```powershell
npm run test:ui
```

Expected: PASS for all Vitest specs, including `src/hooks/useJoinCommunityByCode.spec.tsx` and `src/hooks/useCommunityDiscovery.spec.tsx`.

- [ ] **Step 4: Run production build**

Run:

```powershell
npm run build
```

Expected: PASS. The existing Vite chunk-size warning is acceptable if there are no build errors.

- [ ] **Step 5: Re-run boundary checks**

Run:

```powershell
rg -n "membershipCloudService|communityDiscoveryService|supabase\\.from|supabase\\.rpc" src\components\community\JoinCommunityByCode.tsx src\components\community\CommunityDiscovery.tsx
```

Expected: no output and exit code `1`.

Run:

```powershell
rg -n "membershipCloudService|communityDiscoveryService" src\components\community src\hooks
```

Expected: no output and exit code `1`. Supabase services should only be imported by application gateways and service files, not by these UI/hook entry points.

- [ ] **Step 6: Check git status**

Run:

```powershell
git status --short --branch
```

Expected: clean working tree on the implementation branch after all task commits.
