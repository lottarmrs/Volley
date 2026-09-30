import type { ShellApi } from '../shellContext';

export function onlineDataState({ comm, play, communityRules }: ShellApi) {
  return {
    readError:
      comm.status.readError ?? play.status.readError ?? communityRules.status.readError ?? null,
    retry: () => {
      void comm.refresh();
      play.refreshRoster();
      void communityRules.refresh();
    },
  };
}
