import type { SchedulerAlgorithmDefinition } from "./types";
import { withDynamicCreationReason } from "./types";

export const roundRobinAlgorithm: SchedulerAlgorithmDefinition = {
  id: "round-robin",
  label: "时间片轮转 ROUND-ROBIN",
  sortReadyQueue: false,
  getRunDuration: () => 1,
  updateAfterRun: (process, runDuration) => ({
    ...process,
    remainingTime: Math.max(0, process.remainingTime - runDuration),
  }),
  compareReady: (left, right) => left.arrivalTick - right.arrivalTick || left.slot - right.slot,
  getTerminationReason: (createdPids) =>
    withDynamicCreationReason("运行一个时间片后终止", createdPids),
  getRequeueReason: (createdPids) =>
    withDynamicCreationReason("时间片用尽，回到队尾", createdPids),
};
