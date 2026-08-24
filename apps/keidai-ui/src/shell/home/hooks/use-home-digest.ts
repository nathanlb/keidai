import { useCallback } from "react";
import { useNavigate } from "react-router";
import useSWR, { mutate as globalMutate } from "swr";
import { approveApproval } from "../../../torii/api/torii-client.js";
import { runSavedTask } from "../../../shaiden/api/shaiden-client.js";
import { runDetailHref } from "../../../shaiden/navigation.js";
import { APPROVALS_KEY } from "../../hooks/use-approvals.js";
import { fetchHomeDigestSources } from "../api/fetch-home-sources.js";
import { buildHomeDigest } from "../utils/build-home-digest.js";
import type { HomeAttentionCta } from "../types/home-digest.js";

export const HOME_DIGEST_KEY = "home-digest";

const REFRESH_INTERVAL_MS = 3_000;

export function useHomeDigest() {
  const navigate = useNavigate();
  const { data, error, isLoading, mutate } = useSWR(
    HOME_DIGEST_KEY,
    fetchHomeDigestSources,
    {
      onError: () => undefined,
      refreshInterval: REFRESH_INTERVAL_MS,
    },
  );

  const digest = data ? buildHomeDigest(data) : null;

  const refresh = useCallback(async () => {
    await mutate();
  }, [mutate]);

  const actOnAttention = useCallback(
    async (cta: HomeAttentionCta): Promise<string> => {
      if (cta.type === "approve") {
        await mutate(
          (current) =>
            current
              ? {
                  ...current,
                  approvals: current.approvals.filter(
                    (record) => record.id !== cta.approvalId,
                  ),
                }
              : current,
          { revalidate: false },
        );
        try {
          await approveApproval(cta.approvalId);
        } catch (err) {
          await mutate();
          throw err;
        }
        await Promise.all([mutate(), globalMutate(APPROVALS_KEY)]);
        return "Approved — run resumed.";
      }

      const { runId } = await runSavedTask(cta.taskId);
      await mutate();
      navigate(runDetailHref(runId));
      return "Retry started.";
    },
    [mutate, navigate],
  );

  return {
    digest,
    error,
    isLoading,
    refresh,
    actOnAttention,
  };
}
