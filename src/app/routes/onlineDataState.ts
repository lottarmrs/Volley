import type { ShellApi } from '../shellContext';

export function onlineDataState({ comm, play, communityRules, sess }: ShellApi) {
  return {
    readError:
      comm.status.readError ??
      play.status.readError ??
      communityRules.status.readError ??
      sess.status.readError ??
      null,
    retry: () => {
      void comm.refresh();
      play.refreshRoster();
      void communityRules.refresh();
      void sess.refresh();
    },
  };
}
