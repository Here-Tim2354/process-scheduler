import type { SchedulerAlgorithmDefinition } from "./types";
import { withDynamicCreationReason } from "./types";

export const priorityAlgorithm: SchedulerAlgorithmDefinition = {
  id: "priority",
  label: "优先数 PRIORITY",
  sortReadyQueue: true,
  getRunDuration: () => 1,
  updateAfterRun: (process, runDuration) => ({
    ...process,
    priority: Math.max(0, process.priority - 1),
    remainingTime: Math.max(0, process.remainingTime - runDuration),
  }),
  compareReady: (left, right) =>
    right.priority - left.priority || left.arrivalTick - right.arrivalTick || left.slot - right.slot,
  getTerminationReason: (createdPids) =>
    withDynamicCreationReason("运行一个时间片后终止", createdPids),
  getRequeueReason: (createdPids) =>
    withDynamicCreationReason("优先数与剩余时间各减 1，按优先数回队", createdPids),
};
