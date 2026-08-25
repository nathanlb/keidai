import { Spinner } from "@keidai/ui";
import { useState } from "react";
import { AllClearCard } from "./components/all-clear-card.js";
import { GoalCompletionCard } from "./components/goal-completion-card.js";
import { HomeHeader } from "./components/home-header.js";
import {
  HomeRunsTable,
  type HomeRunsTab,
} from "./components/home-runs-table.js";
import { HomeStatTiles } from "./components/home-stat-tiles.js";
import { HomeToast } from "./components/home-toast.js";
import { NeedsYouBand } from "./components/needs-you-band.js";
import { RunningNowCard } from "./components/running-now-card.js";
import { YourAgentsStrip } from "./components/your-agents-strip.js";
import { useHomeDigest } from "./hooks/use-home-digest.js";
import { useHomeToast } from "./hooks/use-home-toast.js";
import type { HomeAttentionItem } from "./types/home-digest.js";

export function HomeView() {
  const { digest, error, isLoading, actOnAttention } = useHomeDigest();
  const { message, showToast } = useHomeToast();
  const [tab, setTab] = useState<HomeRunsTab>("recent");
  const [actingId, setActingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const handleAct = async (item: HomeAttentionItem) => {
    setActionError(null);
    setActingId(item.id);
    try {
      const toast = await actOnAttention(item.cta);
      showToast(toast);
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "Could not complete that action.",
      );
    } finally {
      setActingId(null);
    }
  };

  if (isLoading && !digest) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Spinner className="size-4" aria-hidden />
        Loading home…
      </div>
    );
  }

  if (error && !digest) {
    return (
      <p className="text-sm text-destructive">
        Could not load the home digest.
      </p>
    );
  }

  if (!digest) {
    return null;
  }

  return (
    <div className="flex flex-col gap-4.5">
      <HomeHeader subtitle={digest.subtitle} />

      {actionError ? (
        <p className="text-[13px] text-destructive">{actionError}</p>
      ) : null}

      {digest.attention.length > 0 ? (
        <NeedsYouBand
          items={digest.attention}
          actingId={actingId}
          onAct={(item) => void handleAct(item)}
        />
      ) : (
        <AllClearCard />
      )}

      <HomeStatTiles
        awaitingYou={digest.awaitingYou}
        oldestParkedLabel={digest.oldestParkedLabel}
        runningCount={digest.runningCount}
        runningAgentLabel={digest.runningAgentLabel}
        goalMet24h={digest.goalMet24h}
        partial24h={digest.partial24h}
        failed24h={digest.failed24h}
        failedTaskName={digest.failedTaskName}
      />

      <div className="
        grid grid-cols-1 items-stretch gap-3.5
        lg:grid-cols-[1.15fr_1fr]
      ">
        <RunningNowCard runs={digest.liveRuns} />
        <GoalCompletionCard
          rateLabel={digest.goalRateLabel}
          week={digest.week}
        />
      </div>

      <HomeRunsTable
        tab={tab}
        onTabChange={setTab}
        recent={digest.recentRuns}
        totalRunCount={digest.totalRunCount}
        scheduled={digest.scheduled}
        pausedScheduledCount={digest.pausedScheduledCount}
      />

      <YourAgentsStrip agents={digest.agents} />
      <HomeToast message={message} />
    </div>
  );
}
