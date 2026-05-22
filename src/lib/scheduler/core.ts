import { mixSeed, nextRandom, normalizeSeed, randomInt } from "./random";
import type {
  CreateProcessInput,
  FutureProcess,
  Pcb,
  ProcessMetric,
  QueuePointers,
  ScheduleLogEntry,
  SchedulerAlgorithm,
  SchedulerConfig,
  SchedulerState,
  StepOptions,
  TimelineSegment,
} from "./types";

export const DEFAULT_CONFIG: SchedulerConfig = {
  capacity: 10,
  initialProcesses: 5,
  minPriority: 1,
  maxPriority: 9,
  minTime: 1,
  maxTime: 8,
  dynamicArrivalChance: 15,
  seed: 20260521,
};

export const ALGORITHM_LABELS: Record<SchedulerAlgorithm, string> = {
  "round-robin": "时间片轮转 ROUND-ROBIN",
  priority: "优先数 PRIORITY",
  spf: "最短进程优先 SPF",
  srtf: "最短剩余时间优先 SRTF",
};

export function createInitialState(
  algorithm: SchedulerAlgorithm = "round-robin",
  config: Partial<SchedulerConfig> = {},
) {
  const normalizedConfig = normalizeConfig({ ...DEFAULT_CONFIG, ...config });
  const generated = generateKnownProcesses(normalizedConfig);
  let state: SchedulerState = {
    algorithm,
    config: normalizedConfig,
    pcbArea: Array.from({ length: normalizedConfig.capacity }, () => null),
    futureQueue: generated.futureQueue,
    freeQueue: Array.from({ length: normalizedConfig.capacity }, (_, index) => index),
    readyQueue: [],
    terminatedQueue: [],
    run: null,
    readyPointers: toPointers([]),
    freePointer: normalizedConfig.capacity > 0 ? 0 : null,
    tick: 0,
    randomSeed: generated.seed,
    usedPids: generated.usedPids,
    logs: [],
    timeline: [],
    error: null,
  };

  state = releaseDueProcesses(state);

  return state;
}

export function normalizeConfig(config: SchedulerConfig): SchedulerConfig {
  const capacity = clampInt(config.capacity, 1, 30);
  const minPriority = clampInt(Math.min(config.minPriority, config.maxPriority), 0, 99);
  const maxPriority = clampInt(Math.max(config.minPriority, config.maxPriority), 0, 99);
  const minTime = clampInt(Math.min(config.minTime, config.maxTime), 1, 99);
  const maxTime = clampInt(Math.max(config.minTime, config.maxTime), 1, 99);

  return {
    capacity,
    initialProcesses: clampInt(config.initialProcesses, 0, capacity),
    minPriority,
    maxPriority,
    minTime,
    maxTime,
    dynamicArrivalChance: clampInt(config.dynamicArrivalChance, 0, 100),
    seed: normalizeSeed(config.seed),
  };
}

export function createProcess(
  state: SchedulerState,
  input: CreateProcessInput = {},
) {
  const shouldUseKnownPendingProcess =
    input.name == null && input.priority == null && input.time == null && input.arrivalTick == null;

  if (shouldUseKnownPendingProcess && state.futureQueue.length > 0) {
    return allocateFutureProcess(state, state.futureQueue[0], state.tick);
  }

  if (state.freeQueue.length === 0) {
    return {
      state: {
        ...state,
        error: "PCB 区已满",
      },
      process: null,
    };
  }

  let randomSeed = state.randomSeed;
  let name = input.name;
  if (name == null) {
    const pid = nextUniquePid(randomSeed, state.usedPids);
    name = pid.value;
    randomSeed = pid.seed;
  }

  if (state.pcbArea.some((process) => process?.name === name)) {
    return {
      state: {
        ...state,
        error: `PID ${name} 已存在`,
      },
      process: null,
    };
  }

  let priority = input.priority;
  if (priority == null) {
    const generated = randomInt(randomSeed, state.config.minPriority, state.config.maxPriority);
    priority = generated.value;
    randomSeed = generated.seed;
  }

  let time = input.time;
  if (time == null) {
    const generated = randomInt(randomSeed, state.config.minTime, state.config.maxTime);
    time = generated.value;
    randomSeed = generated.seed;
  }

  const slot = state.freeQueue[0];
  const process: Pcb = {
    slot,
    name,
    status: "ready",
    priority,
    remainingTime: time,
    totalTime: time,
    next: null,
    arrivalTick: input.arrivalTick ?? state.tick,
    startedTick: null,
    finishedTick: null,
  };

  const pcbArea = state.pcbArea.slice();
  pcbArea[slot] = process;
  const freeQueue = state.freeQueue.slice(1);
  const futureQueue = state.futureQueue.slice(1);
  const readyQueue = insertReady(state.algorithm, state.readyQueue, pcbArea, slot);
  const linkedArea = relinkReadyQueue(pcbArea, readyQueue);

  return {
    state: {
      ...state,
      pcbArea: linkedArea,
      futureQueue,
      freeQueue,
      readyQueue,
      readyPointers: toPointers(readyQueue),
      freePointer: freeQueue[0] ?? null,
      randomSeed,
      usedPids: [...state.usedPids, name],
      error: null,
    },
    process,
  };
}

export function stepScheduler(state: SchedulerState, options: StepOptions = {}) {
  let working = releaseDueProcesses(state);
  const createdDuringStep: number[] = [];

  if (options.allowDynamicArrival) {
    const random = nextRandom(working.randomSeed);
    working = { ...working, randomSeed: random.seed };
    if (random.value * 100 < working.config.dynamicArrivalChance) {
      const result =
        working.futureQueue.length > 0
          ? allocateFutureProcess(working, working.futureQueue[0], working.tick)
          : createProcess(working);
      working = result.state;
      if (result.process) {
        createdDuringStep.push(result.process.name);
      }
    }
  }

  if (working.readyQueue.length === 0 && working.futureQueue[0]) {
    working = releaseDueProcesses({
      ...working,
      tick: working.futureQueue[0].arrivalTick,
    });
  }

  if (working.readyQueue.length === 0) {
    return appendLog(working, {
      pid: null,
      slot: null,
      priority: null,
      remainingBefore: null,
      remainingAfter: null,
      reason:
        createdDuringStep.length > 0
          ? `动态创建 P${createdDuringStep.join(", P")}，等待下一次调度`
          : "就绪队列为空",
    });
  }

  const [slot, ...restQueue] = working.readyQueue;
  const process = working.pcbArea[slot];
  if (!process) {
    return appendLog(
      {
        ...working,
        readyQueue: restQueue,
      },
      {
        pid: null,
        slot: null,
        priority: null,
        remainingBefore: null,
        remainingAfter: null,
        reason: `槽位 ${slot} 为空，已跳过`,
      },
    );
  }

  const pcbArea = working.pcbArea.slice();
  const remainingBefore = process.remainingTime;
  const priorityBefore = process.priority;
  const runDuration = working.algorithm === "spf" ? process.remainingTime : 1;
  const updatedProcess: Pcb = {
    ...process,
    status: "running",
    startedTick: process.startedTick ?? working.tick,
  };
  pcbArea[slot] = updatedProcess;

  const afterRun: Pcb = {
    ...updatedProcess,
    priority:
      working.algorithm === "priority"
        ? Math.max(0, updatedProcess.priority - 1)
        : updatedProcess.priority,
    remainingTime: Math.max(0, updatedProcess.remainingTime - runDuration),
  };

  const nextTick = working.tick + runDuration;
  const timeline: TimelineSegment = {
    id: `${working.timeline.length + 1}-${process.name}-${working.tick}`,
    pid: process.name,
    slot,
    algorithm: working.algorithm,
    start: working.tick,
    end: nextTick,
  };

  let readyQueue = restQueue;
  let terminatedQueue = working.terminatedQueue;
  let reason = "";

  if (afterRun.remainingTime === 0) {
    pcbArea[slot] = {
      ...afterRun,
      status: "terminated",
      finishedTick: nextTick,
      next: null,
    };
    terminatedQueue = [...terminatedQueue, slot];
    reason =
      working.algorithm === "spf"
        ? "非抢占运行至结束"
        : createdDuringStep.length > 0
          ? `运行一个时间片后终止；动态创建 P${createdDuringStep.join(", P")}`
          : "运行一个时间片后终止";
  } else {
    pcbArea[slot] = {
      ...afterRun,
      status: "ready",
    };
    readyQueue = insertReady(working.algorithm, readyQueue, pcbArea, slot);
    reason =
      working.algorithm === "round-robin"
        ? "时间片用尽，回到队尾"
        : working.algorithm === "priority"
          ? "优先数与剩余时间各减 1，按优先数回队"
          : "剩余时间减 1，按剩余时间回队";

    if (createdDuringStep.length > 0) {
      reason = `${reason}；动态创建 P${createdDuringStep.join(", P")}`;
    }
  }

  const linkedArea = relinkReadyQueue(pcbArea, readyQueue);
  working = releaseDueProcesses({
    ...working,
    pcbArea: linkedArea,
    readyQueue,
    terminatedQueue,
    run: slot,
    readyPointers: toPointers(readyQueue),
    tick: nextTick,
    timeline: [...working.timeline, timeline],
    error: null,
  });

  return appendLog(
    working,
    {
      pid: process.name,
      slot,
      priority: priorityBefore,
      remainingBefore,
      remainingAfter: afterRun.remainingTime,
      reason,
    },
  );
}

export function runUntilComplete(state: SchedulerState, maxSteps = 300) {
  let working = releaseDueProcesses(state);
  let steps = 0;
  while ((working.readyQueue.length > 0 || working.futureQueue.length > 0) && steps < maxSteps) {
    if (working.readyQueue.length === 0 && working.futureQueue[0]) {
      working = releaseDueProcesses({
        ...working,
        tick: working.futureQueue[0].arrivalTick,
      });
    }
    working = stepScheduler(working);
    steps += 1;
  }
  return working;
}

export function getAllKnownProcesses(state: SchedulerState) {
  return [
    ...state.pcbArea.filter((process): process is Pcb => Boolean(process)),
    ...state.futureQueue,
  ].sort((left, right) => left.arrivalTick - right.arrivalTick || left.name - right.name);
}

export function switchAlgorithm(state: SchedulerState, algorithm: SchedulerAlgorithm) {
  const readyQueue = state.readyQueue.reduce<number[]>(
    (queue, slot) => insertReady(algorithm, queue, state.pcbArea, slot),
    [],
  );
  return {
    ...state,
    algorithm,
    readyQueue,
    readyPointers: toPointers(readyQueue),
    pcbArea: relinkReadyQueue(state.pcbArea.slice(), readyQueue),
    error: null,
  };
}

export function getProcessMetrics(state: SchedulerState): ProcessMetric[] {
  return state.terminatedQueue
    .map((slot) => state.pcbArea[slot])
    .filter((process): process is Pcb => Boolean(process?.finishedTick))
    .map((process) => {
      const turnaroundTime = Number(process.finishedTick) - process.arrivalTick;
      return {
        pid: process.name,
        arrivalTick: process.arrivalTick,
        finishedTick: Number(process.finishedTick),
        turnaroundTime,
        waitingTime: Math.max(0, turnaroundTime - process.totalTime),
      };
    });
}

export function getQueueSnapshot(state: SchedulerState, queue: number[]) {
  return queue
    .map((slot) => state.pcbArea[slot])
    .filter((process): process is Pcb => Boolean(process));
}

function appendLog(
  state: SchedulerState,
  input: Omit<ScheduleLogEntry, "id" | "tick" | "readyQueue" | "terminatedQueue">,
) {
  const entry: ScheduleLogEntry = {
    ...input,
    id: `${state.logs.length + 1}-${state.tick}-${input.pid ?? "idle"}`,
    tick: state.tick,
    readyQueue: state.readyQueue.map((slot) => state.pcbArea[slot]?.name ?? slot),
    terminatedQueue: state.terminatedQueue.map((slot) => state.pcbArea[slot]?.name ?? slot),
  };

  return {
    ...state,
    logs: [entry, ...state.logs].slice(0, 80),
  };
}

function generateKnownProcesses(config: SchedulerConfig) {
  let seed = normalizeSeed(config.seed);
  const processCount = randomInt(mixSeed(seed), 1, config.capacity);
  seed = processCount.seed;
  const totalProcesses = processCount.value;
  const initialProcesses = Math.min(config.initialProcesses, totalProcesses);
  const usedPids: number[] = [];
  const futureQueue: FutureProcess[] = [];
  let futureArrivalTick = 0;
  const maxArrivalGap =
    config.dynamicArrivalChance <= 0 ? 6 : Math.max(1, Math.round(100 / config.dynamicArrivalChance));

  for (let index = 0; index < totalProcesses; index += 1) {
    const pid = nextUniquePid(seed, usedPids);
    seed = pid.seed;
    usedPids.push(pid.value);

    const priority = randomInt(seed, config.minPriority, config.maxPriority);
    seed = priority.seed;

    const time = randomInt(seed, config.minTime, config.maxTime);
    seed = time.seed;

    if (index >= initialProcesses) {
      const gap = randomInt(seed, 1, maxArrivalGap);
      seed = gap.seed;
      futureArrivalTick += gap.value;
    }

    futureQueue.push({
      id: `job-${index}-${pid.value}`,
      slot: null,
      name: pid.value,
      status: "pending",
      priority: priority.value,
      remainingTime: time.value,
      totalTime: time.value,
      next: null,
      arrivalTick: index < initialProcesses ? 0 : futureArrivalTick,
      startedTick: null,
      finishedTick: null,
    });
  }

  return {
    seed,
    usedPids,
    futureQueue,
  };
}

function releaseDueProcesses(state: SchedulerState) {
  let working = state;
  while (working.futureQueue[0] && working.futureQueue[0].arrivalTick <= working.tick) {
    const result = allocateFutureProcess(working, working.futureQueue[0]);
    if (!result.process) {
      return result.state;
    }
    working = result.state;
  }
  return working;
}

function allocateFutureProcess(
  state: SchedulerState,
  futureProcess: FutureProcess,
  arrivalTick = futureProcess.arrivalTick,
) {
  if (state.freeQueue.length === 0) {
    return {
      state: {
        ...state,
        error: "PCB 区已满",
      },
      process: null,
    };
  }

  const slot = state.freeQueue[0];
  const process: Pcb = {
    ...futureProcess,
    slot,
    status: "ready",
    arrivalTick,
  };

  const pcbArea = state.pcbArea.slice();
  pcbArea[slot] = process;
  const freeQueue = state.freeQueue.slice(1);
  const futureQueue = state.futureQueue.filter((item) => item.id !== futureProcess.id);
  const readyQueue = insertReady(state.algorithm, state.readyQueue, pcbArea, slot);
  const linkedArea = relinkReadyQueue(pcbArea, readyQueue);

  return {
    state: {
      ...state,
      pcbArea: linkedArea,
      futureQueue,
      freeQueue,
      readyQueue,
      readyPointers: toPointers(readyQueue),
      freePointer: freeQueue[0] ?? null,
      error: null,
    },
    process,
  };
}

function insertReady(
  algorithm: SchedulerAlgorithm,
  queue: number[],
  pcbArea: Array<Pcb | null>,
  slot: number,
) {
  const nextQueue = [...queue, slot];
  if (algorithm === "round-robin") {
    return nextQueue;
  }

  return nextQueue.sort((leftSlot, rightSlot) => {
    const left = pcbArea[leftSlot];
    const right = pcbArea[rightSlot];
    if (!left || !right) {
      return left ? -1 : 1;
    }

    if (algorithm === "priority") {
      return right.priority - left.priority || left.arrivalTick - right.arrivalTick || left.slot - right.slot;
    }

    const leftTime = algorithm === "spf" ? left.totalTime : left.remainingTime;
    const rightTime = algorithm === "spf" ? right.totalTime : right.remainingTime;
    return leftTime - rightTime || left.arrivalTick - right.arrivalTick || left.slot - right.slot;
  });
}

function relinkReadyQueue(pcbArea: Array<Pcb | null>, readyQueue: number[]) {
  const readySet = new Set(readyQueue);
  return pcbArea.map((process, slot) => {
    if (!process) {
      return process;
    }
    if (!readySet.has(slot)) {
      return { ...process, next: null };
    }
    const index = readyQueue.indexOf(slot);
    return {
      ...process,
      next: readyQueue[index + 1] ?? null,
    };
  });
}

function toPointers(queue: number[]): QueuePointers {
  return {
    head: queue[0] ?? null,
    tail: queue[queue.length - 1] ?? null,
  };
}

function nextUniquePid(seed: number, usedPids: number[]) {
  let currentSeed = seed;
  for (let attempts = 0; attempts < 1000; attempts += 1) {
    const generated = randomInt(currentSeed, 100, 999);
    currentSeed = generated.seed;
    if (!usedPids.includes(generated.value)) {
      return {
        seed: currentSeed,
        value: generated.value,
      };
    }
  }

  const fallback = 1000 + usedPids.length;
  return {
    seed: currentSeed,
    value: fallback,
  };
}

function clampInt(value: number, min: number, max: number) {
  const normalized = Number.isFinite(value) ? Math.round(value) : min;
  return Math.min(max, Math.max(min, normalized));
}
