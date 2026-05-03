import type { StartLiveMutationResult } from '../../lib/liveLifecycleClient';

export const START_LIVE_UNEXPECTED_ERROR_MESSAGE =
  'Unable to start live right now. Please try again.';

type SubmitGoLiveStartParams = {
  title: string;
  inviteOnly: boolean;
  pendingRef: {
    current: boolean;
  };
  startLive: (title: string, inviteOnly: boolean) => Promise<StartLiveMutationResult>;
  setPendingStart: (pending: boolean) => void;
  setStartError: (error: string | null) => void;
  showStartErrorToast: (message: string) => void;
  navigateToLive: (liveId: string) => void;
};

export async function submitGoLiveStart(params: SubmitGoLiveStartParams): Promise<void> {
  if (params.pendingRef.current) return;

  params.pendingRef.current = true;
  params.setPendingStart(true);
  params.setStartError(null);

  try {
    const startResult = await params.startLive(params.title, params.inviteOnly);
    if (!startResult.ok) {
      params.setPendingStart(false);
      params.setStartError(startResult.message);
      params.showStartErrorToast(startResult.message);
      return;
    }

    params.setPendingStart(false);
    params.setStartError(null);
    params.navigateToLive(startResult.liveId);
  } catch {
    params.setPendingStart(false);
    params.setStartError(START_LIVE_UNEXPECTED_ERROR_MESSAGE);
    params.showStartErrorToast(START_LIVE_UNEXPECTED_ERROR_MESSAGE);
  } finally {
    params.pendingRef.current = false;
  }
}
