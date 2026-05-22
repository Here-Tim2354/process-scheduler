import type { SchedulerAlgorithmDefinition } from "./types";
import { withDynamicCreationReason } from "./types";

export const shortestProcessFirstAlgorithm: SchedulerAlgorithmDefinition = {
  id: "spf",
  label: "最短进程优先 SPF",
  sortReadyQueue: true,
  getRunDuration: (process) => process.remainingTime,
  updateAfterRun: (process, runDuration) => ({
    ...process,
    remainingTime: Math.max(0, process.remainingTime - runDuration),
  }),
  compareReady: (left, right) =>
    left.totalTime - right.totalTime || left.arrivalTick - right.arrivalTick || left.slot - right.slot,
  getTerminationReason: () => "非抢占运行至结束",
  getRequeueReason: (createdPids) =>
    withDynamicCreationReason("剩余时间减 1，按剩余时间回队", createdPids),
};
