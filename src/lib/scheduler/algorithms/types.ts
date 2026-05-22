import type { Pcb, SchedulerAlgorithm } from "../types";

export type SchedulerAlgorithmDefinition = {
  id: SchedulerAlgorithm;
  label: string;
  sortReadyQueue: boolean;
  getRunDuration: (process: Pcb) => number;
  updateAfterRun: (process: Pcb, runDuration: number) => Pcb;
  compareReady: (left: Pcb, right: Pcb) => number;
  getTerminationReason: (createdPids: number[]) => string;
  getRequeueReason: (createdPids: number[]) => string;
};

export function withDynamicCreationReason(reason: string, createdPids: number[]) {
  if (createdPids.length === 0) {
    return reason;
  }

  return `${reason}；动态创建 P${createdPids.join(", P")}`;
}
