import type { SchedulerAlgorithmDefinition } from "./types";
import { withDynamicCreationReason } from "./types";

export const shortestRemainingTimeFirstAlgorithm: SchedulerAlgorithmDefinition = {
  id: "srtf",
  label: "最短剩余时间优先 SRTF",
  sortReadyQueue: true,
  getRunDuration: () => 1,
  updateAfterRun: (process, runDuration) => ({
    ...process,
    remainingTime: Math.max(0, process.remainingTime - runDuration),
  }),
  compareReady: (left, right) =>
    left.remainingTime - right.remainingTime ||
    left.arrivalTick - right.arrivalTick ||
    left.slot - right.slot,
  getTerminationReason: (createdPids) =>
    withDynamicCreationReason("运行一个时间片后终止", createdPids),
  getRequeueReason: (createdPids) =>
    withDynamicCreationReason("剩余时间减 1，按剩余时间回队", createdPids),
};
