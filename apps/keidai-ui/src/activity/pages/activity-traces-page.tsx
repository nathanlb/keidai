import { ActivityTracesProvider } from "../context/activity-traces-provider.js";
import { ActivityTracesView } from "../activity-traces-view.js";

export function ActivityTracesPage() {
  return (
    <ActivityTracesProvider>
      <ActivityTracesView />
    </ActivityTracesProvider>
  );
}
