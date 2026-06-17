import type { Latest } from "../lib/api";
import { analyze } from "../lib/analysis";
import { InsightList } from "./InsightList";

export function AnalysisCard({ latest, capacity }: { latest: Latest; capacity?: number }) {
  return <InsightList items={analyze(latest, capacity)} />;
}
