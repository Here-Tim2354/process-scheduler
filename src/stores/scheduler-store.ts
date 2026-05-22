"use client";

import { create } from "zustand";
import {
  createInitialState,
  createProcess,
  DEFAULT_CONFIG,
  runUntilComplete,
  stepScheduler,
  switchAlgorithm,
} from "@/lib/scheduler/core";
import type { SchedulerAlgorithm, SchedulerConfig, SchedulerState } from "@/lib/scheduler/types";

type SchedulerStore = {
  simulator: SchedulerState;
  reset: (config?: Partial<SchedulerConfig>, algorithm?: SchedulerAlgorithm) => void;
  setAlgorithm: (algorithm: SchedulerAlgorithm) => void;
  generateProcess: () => void;
  step: (allowDynamicArrival?: boolean) => void;
  runToEnd: () => void;
};

export const useSchedulerStore = create<SchedulerStore>((set, get) => ({
  simulator: createInitialState("round-robin", DEFAULT_CONFIG),
  reset: (config, algorithm) =>
    set((state) => ({
      simulator: createInitialState(
        algorithm ?? state.simulator.algorithm,
        config ?? state.simulator.config,
      ),
    })),
  setAlgorithm: (algorithm) =>
    set((state) => ({
      simulator: switchAlgorithm(state.simulator, algorithm),
    })),
  generateProcess: () =>
    set((state) => ({
      simulator: createProcess(state.simulator).state,
    })),
  step: (allowDynamicArrival = false) =>
    set((state) => ({
      simulator: stepScheduler(state.simulator, { allowDynamicArrival }),
    })),
  runToEnd: () =>
    set(() => ({
      simulator: runUntilComplete(get().simulator),
    })),
}));
