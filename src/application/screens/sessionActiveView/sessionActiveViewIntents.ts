export type SessionActiveViewIntent =
  | { kind: 'updateFreePlayQueue'; newQueue: string[] }
  | { kind: 'exit' }
  | { kind: 'finishSession' };
