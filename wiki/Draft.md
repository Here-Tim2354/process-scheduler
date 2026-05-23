# 概要设计

本程序把单处理器进程调度抽象成一个调度模拟器。页面负责展示和接收操作，调度核心只处理 PCB、队列、时间片和算法规则。

## 抽象数据类型

### PCB

PCB 对应一个进程控制块，用来保存进程在模拟调度中的必要信息。

```ts
type Pcb = {
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
```

其中 `slot` 是 PCB 区中的数组下标，`name` 是进程标识符，`status` 表示进程状态，`priority` 表示优先数，`remainingTime` 表示剩余运行时间，`next` 用来模拟静态链表中的下一个 PCB。

### ProcessStatus

进程状态分为五类：

```ts
type ProcessStatus = "pending" | "free" | "ready" | "running" | "terminated";
```

`pending` 表示未来才会到达的进程，`free` 表示空闲 PCB 槽位，`ready` 表示就绪，`running` 表示正在运行，`terminated` 表示已经结束。

### SchedulerAlgorithm

调度算法是一个枚举类型：

```ts
type SchedulerAlgorithm = "round-robin" | "priority" | "spf" | "srtf";
```

分别对应时间片轮转、优先数调度、最短进程优先和最短剩余时间优先。

### SchedulerConfig

配置项描述一轮模拟的输入范围。

```ts
type SchedulerConfig = {
  capacity: number;
  initialProcesses: number;
  minPriority: number;
  maxPriority: number;
  minTime: number;
  maxTime: number;
  dynamicArrivalChance: number;
  autoRunInterval: number;
  seed: number;
};
```

其中 `capacity` 控制 PCB 区容量，`initialProcesses` 控制初始就绪进程数，优先数和运行时间由上下限生成，`dynamicArrivalChance` 控制动态进程出现概率，`seed` 用来复现实验数据。

### SchedulerState

`SchedulerState` 是模拟器的完整状态。

```ts
type SchedulerState = {
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
```

这里的 `pcbArea` 模拟有限 PCB 区，`freeQueue` 模拟空闲 PCB 队列，`readyQueue` 模拟就绪队列，`terminatedQueue` 保存已终止进程，`run` 指向最近一次运行的 PCB 槽位。

### ScheduleLogEntry 和 TimelineSegment

`ScheduleLogEntry` 记录每次调度的文字日志，包括运行进程、调度前后剩余时间、调度原因和队列快照。

`TimelineSegment` 记录进程占用 CPU 的起止 tick，用来生成时间线和统计图表。

## 主程序流程

主程序入口是 `src/app/page.tsx`，它直接渲染 `SchedulerDashboard`。

程序启动后先创建默认模拟器状态：

1. 读取默认配置和当前调度算法。
2. 初始化有限 PCB 区、空闲 PCB 队列、未来进程队列和随机种子。
3. 将初始进程放入 PCB 区，并按当前算法插入就绪队列。
4. 页面显示当前算法、PCB 使用情况、运行区、就绪队列、终止队列、日志和时间线。

用户操作后，页面通过 Zustand store 调用调度核心：

1. 切换算法：重新按照算法规则排序就绪队列。
2. 应用配置或重置：重新创建模拟器状态。
3. 单步：执行一次调度，必要时尝试动态生成进程。
4. 自动运行：按固定间隔重复执行单步。
5. 运行到底：循环调度，直到就绪队列和未来进程队列都为空。

每次调度后，页面重新读取模拟器状态并更新 UI。

## 模块层次关系

项目按“界面、状态连接、调度核心、算法规则”分层。

```txt
src/app
  页面入口

src/components/scheduler
  调度实验台 UI

src/stores
  Zustand 状态连接层

src/lib/scheduler
  调度核心逻辑

src/lib/scheduler/algorithms
  四种调度算法规则
```

页面层只负责展示和用户操作。状态层负责把 UI 操作转成核心函数调用。调度核心负责创建进程、执行调度、维护队列和生成日志。算法层只描述不同算法的排序规则、运行时长和运行后的状态变化。

## 模块调用关系

主要调用关系如下：

```txt
page.tsx
  -> SchedulerDashboard
    -> useSchedulerStore
      -> createInitialState
      -> createProcess
      -> stepScheduler
      -> runUntilComplete
      -> switchAlgorithm
        -> getAlgorithmDefinition
        -> insertReadyByAlgorithm
          -> roundRobinAlgorithm
          -> priorityAlgorithm
          -> shortestProcessFirstAlgorithm
          -> shortestRemainingTimeFirstAlgorithm
```

`SchedulerDashboard` 不直接修改 PCB 和队列，而是调用 `useSchedulerStore` 暴露的方法。`useSchedulerStore` 再调用 `src/lib/scheduler/core.ts` 中的纯逻辑函数。

`stepScheduler` 是调度过程的核心函数。它先释放已经到达的未来进程，再从就绪队列取出队首进程，根据当前算法计算运行时间，更新剩余时间、优先数和状态，最后决定进程进入终止队列还是重新回到就绪队列。

四种算法的差异集中在 `src/lib/scheduler/algorithms`：

1. 时间片轮转不排序，队首运行 1 个时间片，未结束回队尾。
2. 优先数调度按 `priority` 降序排列，每次运行后优先数和剩余时间各减 1。
3. 最短进程优先按 `totalTime` 升序排列，选中后一次运行到结束。
4. 最短剩余时间优先按 `remainingTime` 升序排列，每次运行 1 个时间片。

这种拆分让报告中的算法说明可以直接对应到代码文件，也方便单独测试调度核心。
