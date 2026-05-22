export type ProcessStatus = "pending" | "free" | "ready" | "running" | "terminated";

export type SchedulerAlgorithm = "round-robin" | "priority" | "spf" | "srtf";

export type Pcb = {
  slot: number;
  name: number;
  status: ProcessStatus;
  priority: number;
  remainingTime: number;
  totalTime: number;
  next: number | null;
  arrivalTick: number;
  startedTick: number | null;
  finishedTick: number | null;
};

export type FutureProcess = {
  id: string;
  slot: null;
  name: number;
  status: "pending";
  priority: number;
  remainingTime: number;
  totalTime: number;
  next: null;
  arrivalTick: number;
  startedTick: null;
  finishedTick: null;
};

export type SchedulerConfig = {
  capacity: number;
  initialProcesses: number;
  minPriority: number;
  maxPriority: number;
  minTime: number;
  maxTime: number;
  dynamicArrivalChance: number;
  seed: number;
};

export type QueuePointers = {
  head: number | null;
  tail: number | null;
};

export type TimelineSegment = {
  id: string;
  pid: number;
  slot: number;
  algorithm: SchedulerAlgorithm;
  start: number;
  end: number;
};

export type ScheduleLogEntry = {
  id: string;
  tick: number;
  pid: number | null;
  slot: number | null;
  priority: number | null;
  remainingBefore: number | null;
  remainingAfter: number | null;
  reason: string;
  readyQueue: number[];
  terminatedQueue: number[];
};

export type SchedulerState = {
  algorithm: SchedulerAlgorithm;
  config: SchedulerConfig;
  pcbArea: Array<Pcb | null>;
  futureQueue: FutureProcess[];
  freeQueue: number[];
  readyQueue: number[];
  terminatedQueue: number[];
  run: number | null;
  readyPointers: QueuePointers;
  freePointer: number | null;
  tick: number;
  randomSeed: number;
  usedPids: number[];
  logs: ScheduleLogEntry[];
  timeline: TimelineSegment[];
  error: string | null;
};

export type CreateProcessInput = {
  priority?: number;
  time?: number;
  name?: number;
  arrivalTick?: number;
};

export type StepOptions = {
  allowDynamicArrival?: boolean;
};

export type ProcessMetric = {
  pid: number;
  arrivalTick: number;
  finishedTick: number;
  turnaroundTime: number;
  waitingTime: number;
};
