import { describe, expect, it } from "vitest";
import {
  createInitialState,
  createProcess,
  getAllKnownProcesses,
  runUntilComplete,
  stepScheduler,
} from "./core";

describe("scheduler core", () => {
  it("generates a positive known process count within PCB capacity", () => {
    const counts = Array.from({ length: 12 }, (_, index) => {
      const state = createInitialState("round-robin", {
        capacity: 10,
        initialProcesses: 10,
        seed: 20260521 + index,
      });
      return getAllKnownProcesses(state).length;
    });

    expect(counts.every((count) => count > 0 && count <= 10)).toBe(true);
    expect(new Set(counts).size).toBeGreaterThan(1);
  });

  it("creates processes through limited PCB slots and reports capacity", () => {
    let state = createInitialState("round-robin", {
      capacity: 2,
      initialProcesses: 0,
      seed: 7,
    });

    state = createProcess(state, { name: 101, priority: 3, time: 2 }).state;
    state = createProcess(state, { name: 102, priority: 4, time: 2 }).state;
    const result = createProcess(state, { name: 103, priority: 5, time: 2 });

    expect(result.process).toBeNull();
    expect(result.state.error).toBe("PCB 区已满");
    expect(result.state.readyQueue).toHaveLength(2);
    expect(result.state.freePointer).toBeNull();
  });

  it("runs round-robin by one time slice and sends unfinished jobs to tail", () => {
    let state = createInitialState("round-robin", { capacity: 3, initialProcesses: 0 });
    state = createProcess(state, { name: 201, priority: 1, time: 2 }).state;
    state = createProcess(state, { name: 202, priority: 1, time: 1 }).state;

    state = stepScheduler(state);

    expect(state.tick).toBe(1);
    expect(state.pcbArea[0]?.remainingTime).toBe(1);
    expect(state.readyQueue.map((slot) => state.pcbArea[slot]?.name)).toEqual([202, 201]);
  });

  it("runs priority scheduling with high priority first and priority decay", () => {
    let state = createInitialState("priority", { capacity: 2, initialProcesses: 0 });
    state = createProcess(state, { name: 301, priority: 2, time: 2 }).state;
    state = createProcess(state, { name: 302, priority: 8, time: 1 }).state;

    state = stepScheduler(state);

    expect(state.logs[0].pid).toBe(302);
    expect(state.terminatedQueue.map((slot) => state.pcbArea[slot]?.name)).toEqual([302]);
  });

  it("runs shortest process first as non-preemptive", () => {
    let state = createInitialState("spf", { capacity: 3, initialProcesses: 0 });
    state = createProcess(state, { name: 401, priority: 1, time: 5 }).state;
    state = createProcess(state, { name: 402, priority: 1, time: 2 }).state;

    state = stepScheduler(state);

    expect(state.tick).toBe(2);
    expect(state.logs[0].pid).toBe(402);
    expect(state.pcbArea[1]?.remainingTime).toBe(0);
    expect(state.terminatedQueue).toEqual([1]);
  });

  it("runs shortest remaining time first by remaining time", () => {
    let state = createInitialState("srtf", { capacity: 4, initialProcesses: 0 });
    state = createProcess(state, { name: 501, priority: 1, time: 6 }).state;
    state = createProcess(state, { name: 502, priority: 1, time: 2 }).state;

    state = stepScheduler(state);
    state = createProcess(state, { name: 503, priority: 1, time: 1 }).state;
    state = stepScheduler(state);

    expect(state.logs[0].pid).toBe(502);
    expect(state.readyQueue.map((slot) => state.pcbArea[slot]?.name)).toEqual([503, 501]);
  });

  it("can finish all ready processes", () => {
    let state = createInitialState("priority", { capacity: 2, initialProcesses: 0 });
    state = createProcess(state, { name: 601, priority: 3, time: 2 }).state;
    state = createProcess(state, { name: 602, priority: 1, time: 1 }).state;

    state = runUntilComplete(state);

    expect(state.readyQueue).toHaveLength(0);
    expect(state.terminatedQueue).toHaveLength(2);
    expect(state.terminatedQueue.every((slot) => state.pcbArea[slot]?.status === "terminated")).toBe(true);
  });

  it("can dynamically create a process before a scheduling step", () => {
    let state = createInitialState("round-robin", {
      capacity: 2,
      initialProcesses: 0,
      dynamicArrivalChance: 100,
      minTime: 2,
      maxTime: 2,
      seed: 9,
    });

    state = stepScheduler(state, { allowDynamicArrival: true });

    expect(state.pcbArea.filter(Boolean)).toHaveLength(1);
    expect(state.logs[0].reason).toContain("动态创建");
    expect(state.readyQueue).toHaveLength(1);
  });
});
