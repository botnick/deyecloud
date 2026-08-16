import type { Latest } from "../lib/api";
import { analyze } from "../lib/analysis";
import { useSettings } from "../lib/settings";
import { InsightList } from "./InsightList";

export function AnalysisCard({ latest, capacity }: { latest: Latest; capacity?: number }) {
  // Read the user's tariff here rather than letting analyze() fall back to the
  // default — otherwise the insight text quotes a different ฿/หน่วย than the money
  // cards on the same screen, which run through economics.savingsOf with settings.
  const { settings } = useSettings();
  return <InsightList items={analyze(latest, capacity, settings)} />;
}
