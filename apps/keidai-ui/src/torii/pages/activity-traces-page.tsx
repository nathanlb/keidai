import { ActivityTracesProvider } from "../activity/context/activity-traces-provider.js";
import { ActivityTracesView } from "../activity/activity-traces-view.js";

export function ActivityTracesPage() {
  return (
    <ActivityTracesProvider>
      <ActivityTracesView />
    </ActivityTracesProvider>
  );
}
