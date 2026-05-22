import { priorityAlgorithm } from "./priority";
import { roundRobinAlgorithm } from "./round-robin";
import { shortestProcessFirstAlgorithm } from "./spf";
import { shortestRemainingTimeFirstAlgorithm } from "./srtf";
import type { SchedulerAlgorithmDefinition } from "./types";
import type { Pcb, SchedulerAlgorithm } from "../types";

export const ALGORITHM_DEFINITIONS: Record<SchedulerAlgorithm, SchedulerAlgorithmDefinition> = {
  "round-robin": roundRobinAlgorithm,
  priority: priorityAlgorithm,
  spf: shortestProcessFirstAlgorithm,
  srtf: shortestRemainingTimeFirstAlgorithm,
};

export const ALGORITHM_LABELS = Object.fromEntries(
  Object.values(ALGORITHM_DEFINITIONS).map((definition) => [definition.id, definition.label]),
) as Record<SchedulerAlgorithm, string>;

export function getAlgorithmDefinition(algorithm: SchedulerAlgorithm) {
  return ALGORITHM_DEFINITIONS[algorithm];
}

export function insertReadyByAlgorithm(
  algorithm: SchedulerAlgorithm,
  queue: number[],
  pcbArea: Array<Pcb | null>,
  slot: number,
) {
  const definition = getAlgorithmDefinition(algorithm);
  const nextQueue = [...queue, slot];

  if (!definition.sortReadyQueue) {
    return nextQueue;
  }

  return nextQueue.sort((leftSlot, rightSlot) => {
    const left = pcbArea[leftSlot];
    const right = pcbArea[rightSlot];
    if (!left || !right) {
      return left ? -1 : 1;
    }

    return definition.compareReady(left, right);
  });
}
