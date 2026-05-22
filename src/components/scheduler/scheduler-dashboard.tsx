"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  Activity,
  CirclePause,
  CircleHelp,
  ChevronDown,
  ListRestart,
  Play,
  RotateCcw,
  Shuffle,
  SkipForward,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useForm, type UseFormReturn } from "react-hook-form";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip as ChartTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { z } from "zod";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Collapsible,
  CollapsiblePanel,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  ALGORITHM_LABELS,
  DEFAULT_CONFIG,
  getAllKnownProcesses,
  getProcessMetrics,
  getQueueSnapshot,
  normalizeConfig,
} from "@/lib/scheduler/core";
import type {
  FutureProcess,
  Pcb,
  SchedulerAlgorithm,
  SchedulerConfig,
} from "@/lib/scheduler/types";
import { useSchedulerStore } from "@/stores/scheduler-store";

const configSchema = z
  .object({
    capacity: z.coerce.number().int().min(1).max(30),
    initialProcesses: z.coerce.number().int().min(0).max(30),
    minPriority: z.coerce.number().int().min(0).max(99),
    maxPriority: z.coerce.number().int().min(0).max(99),
    minTime: z.coerce.number().int().min(1).max(99),
    maxTime: z.coerce.number().int().min(1).max(99),
    dynamicArrivalChance: z.coerce.number().int().min(0).max(100),
    seed: z.coerce.number().int().min(1),
  })
  .refine((data) => data.initialProcesses <= data.capacity, {
    message: "初始进程数不能超过 PCB 容量",
    path: ["initialProcesses"],
  })
  .refine((data) => data.minPriority <= data.maxPriority, {
    message: "最小优先数不能大于最大优先数",
    path: ["minPriority"],
  })
  .refine((data) => data.minTime <= data.maxTime, {
    message: "最小运行时间不能大于最大运行时间",
    path: ["minTime"],
  });

type ConfigFormInput = z.input<typeof configSchema>;
type ConfigForm = z.output<typeof configSchema>;
type ProcessCardField = "slot" | "priority" | "remaining" | "next";
type TableGlossaryField =
  | "process"
  | "pid"
  | "status"
  | "arrival"
  | "start"
  | "finish"
  | "slot"
  | "priority"
  | "remaining"
  | "totalTime"
  | "next";

const algorithms = Object.keys(ALGORITHM_LABELS) as SchedulerAlgorithm[];

export function SchedulerDashboard() {
  const { simulator, reset, setAlgorithm, step, runToEnd } =
    useSchedulerStore();
  const [isAutoRunning, setIsAutoRunning] = useState(false);
  const form = useForm<ConfigFormInput, unknown, ConfigForm>({
    resolver: zodResolver(configSchema),
    defaultValues: DEFAULT_CONFIG,
  });

  const candidateSlot = simulator.readyQueue[0] ?? null;
  const readyProcesses = getQueueSnapshot(simulator, simulator.readyQueue);
  const terminatedProcesses = getQueueSnapshot(
    simulator,
    simulator.terminatedQueue,
  );
  const knownProcesses = getAllKnownProcesses(simulator);
  const isRoundComplete =
    simulator.readyQueue.length === 0 &&
    simulator.futureQueue.length === 0 &&
    simulator.terminatedQueue.length > 0;
  const metrics = getProcessMetrics(simulator);
  const chartData = metrics.map((metric) => ({
    pid: `P${metric.pid}`,
    waiting: metric.waitingTime,
    turnaround: metric.turnaroundTime,
  }));
  const usedPercent = Math.round(
    ((simulator.config.capacity - simulator.freeQueue.length) /
      simulator.config.capacity) *
      100,
  );

  const average = useMemo(() => {
    if (metrics.length === 0) {
      return { waiting: 0, turnaround: 0 };
    }
    return {
      waiting: round(
        metrics.reduce((sum, item) => sum + item.waitingTime, 0) /
          metrics.length,
      ),
      turnaround: round(
        metrics.reduce((sum, item) => sum + item.turnaroundTime, 0) /
          metrics.length,
      ),
    };
  }, [metrics]);

  useEffect(() => {
    if (!isAutoRunning) {
      return;
    }
    const timer = window.setInterval(() => {
      const current = useSchedulerStore.getState().simulator;
      if (current.readyQueue.length === 0 && current.futureQueue.length === 0) {
        setIsAutoRunning(false);
        return;
      }
      useSchedulerStore.getState().step(true);
    }, 600);
    return () => window.clearInterval(timer);
  }, [isAutoRunning]);

  function applyConfig(values: ConfigForm) {
    const nextConfig = normalizeConfig(values as SchedulerConfig);
    reset(nextConfig, simulator.algorithm);
    setIsAutoRunning(false);
  }

  function randomizeAndApplyConfig() {
    const parsedConfig = configSchema.safeParse(form.getValues());
    if (!parsedConfig.success) {
      void form.trigger();
      return;
    }

    const seed =
      typeof crypto !== "undefined" && "getRandomValues" in crypto
        ? crypto.getRandomValues(new Uint32Array(1))[0]
        : Math.floor(Math.random() * 2_147_483_647);
    const nextConfig = normalizeConfig({
      ...parsedConfig.data,
      seed: Math.max(1, seed),
    } as SchedulerConfig);
    form.reset(nextConfig);
    reset(nextConfig, simulator.algorithm);
    setIsAutoRunning(false);
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-4 px-4 py-4 lg:px-6">
        <header className="grid gap-3 border-b pb-4 lg:grid-cols-[320px_1fr]">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <Activity aria-hidden="true" />
            </div>
            <div>
              <h1 className="text-xl font-semibold tracking-tight">
                进程调度实验台
              </h1>
              <p className="text-sm text-muted-foreground">
                Tick {simulator.tick}
                {isRoundComplete ? " / 已完成本轮任务" : ""}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-start gap-2 lg:justify-end">
            <ActionButton
              label="随机"
              onClick={randomizeAndApplyConfig}
              icon={Shuffle}
            />
            <ActionButton
              label="单步"
              onClick={() => step(true)}
              icon={SkipForward}
            />
            <ActionButton
              label={isAutoRunning ? "暂停" : "自动运行"}
              onClick={() => setIsAutoRunning((value) => !value)}
              icon={isAutoRunning ? CirclePause : Play}
              variant={isAutoRunning ? "outline" : "default"}
            />
            <ActionButton
              label="运行到底"
              onClick={runToEnd}
              icon={ListRestart}
              variant="outline"
            />
            <ActionButton
              label="重置"
              onClick={form.handleSubmit(applyConfig)}
              icon={RotateCcw}
              variant="outline"
            />
            <ProjectInfoDialog />
          </div>
        </header>

        <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
          <aside className="flex flex-col gap-4">
            <Card>
              <CardHeader>
                <CardTitle>算法</CardTitle>
                <CardDescription>
                  {ALGORITHM_LABELS[simulator.algorithm]}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Select
                  value={simulator.algorithm}
                  onValueChange={(value) =>
                    setAlgorithm(value as SchedulerAlgorithm)
                  }
                >
                  <SelectTrigger className="w-full" aria-label="选择调度算法">
                    <SelectValue>
                      {(value) =>
                        value
                          ? ALGORITHM_LABELS[value as SchedulerAlgorithm]
                          : "选择调度算法"
                      }
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {algorithms.map((algorithm) => (
                      <SelectItem key={algorithm} value={algorithm}>
                        {ALGORITHM_LABELS[algorithm]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>PCB 区</CardTitle>
                <CardDescription>
                  空闲头 {formatNullable(simulator.freePointer)} / 就绪头{" "}
                  {formatNullable(simulator.readyPointers.head)}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <Progress value={usedPercent} />
                <div className="grid grid-cols-3 gap-2 text-sm">
                  <Stat label="容量" value={simulator.config.capacity} />
                  <Stat
                    label="已用"
                    value={
                      simulator.config.capacity - simulator.freeQueue.length
                    }
                  />
                  <Stat label="空闲" value={simulator.freeQueue.length} />
                </div>
                {simulator.error ? (
                  <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                    {simulator.error}
                  </div>
                ) : null}
              </CardContent>
            </Card>

            <Card>
              <Collapsible>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <CardTitle>配置</CardTitle>
                    </div>
                    <CollapsibleTrigger
                      aria-label="展开或收起配置"
                      className="size-8 shrink-0 justify-center px-0 py-0"
                    >
                      <ChevronDown
                        aria-hidden="true"
                        className="size-4 transition-transform duration-150 group-data-[panel-open]:rotate-180"
                      />
                    </CollapsibleTrigger>
                  </div>
                </CardHeader>
                <CollapsiblePanel>
                  <CardContent className="pt-0">
                    <form
                      className="flex flex-col gap-4"
                      onSubmit={form.handleSubmit(applyConfig)}
                    >
                      <div className="grid grid-cols-2 gap-3">
                        <NumberField
                          label="PCB 容量"
                          name="capacity"
                          form={form}
                        />
                        <NumberField
                          label="初始进程"
                          name="initialProcesses"
                          form={form}
                        />
                        <NumberField
                          label="优先数下限"
                          name="minPriority"
                          form={form}
                        />
                        <NumberField
                          label="优先数上限"
                          name="maxPriority"
                          form={form}
                        />
                        <NumberField
                          label="时间下限"
                          name="minTime"
                          form={form}
                        />
                        <NumberField
                          label="时间上限"
                          name="maxTime"
                          form={form}
                        />
                        <NumberField
                          label="动态概率"
                          name="dynamicArrivalChance"
                          form={form}
                        />
                        <SeedField form={form} />
                      </div>
                      {Object.values(form.formState.errors)[0]?.message ? (
                        <p className="text-sm text-destructive">
                          {Object.values(form.formState.errors)[0]?.message}
                        </p>
                      ) : null}
                      <Button type="submit" className="w-full">
                        应用配置
                      </Button>
                    </form>
                  </CardContent>
                </CollapsiblePanel>
              </Collapsible>
            </Card>

            <Card>
              <Collapsible>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <CardTitle>名词</CardTitle>
                      <CardDescription>
                        展开查看 algorithm 和 field 解释
                      </CardDescription>
                    </div>
                    <CollapsibleTrigger
                      aria-label="展开或收起名词说明"
                      className="size-8 shrink-0 justify-center px-0 py-0"
                    >
                      <ChevronDown
                        aria-hidden="true"
                        className="size-4 transition-transform duration-150 group-data-[panel-open]:rotate-180"
                      />
                    </CollapsibleTrigger>
                  </div>
                </CardHeader>
                <CollapsiblePanel>
                  <CardContent className="pt-0">
                    <div className="grid gap-3 text-sm leading-6 text-muted-foreground">
                      <GlossaryGroup
                        title="algorithm"
                        items={[
                          "时间片轮转 ROUND-ROBIN：取 readyQueue 队首运行 1 个 time slice，remainingTime 减 1，未结束则回到队尾。",
                          "优先数 PRIORITY：运行 1 个 time slice 后，priority 和 remainingTime 各减 1，未结束则按 priority 重新插入 readyQueue。数值越大越先运行。",
                          "最短进程优先 SPF：按 totalTime 排序，选中的 process 一次运行到 terminated，不发生抢占。",
                          "最短剩余时间优先 SRTF：按 remainingTime 排序，每次运行 1 个 time slice，未结束则按 remainingTime 重新插入 readyQueue。",
                        ]}
                      />
                      <GlossaryGroup
                        title="field"
                        items={[
                          "slot：pcbArea 的数组下标，表示有限 PCB 区中的位置。",
                          "priority：当前优先级。当前实现里数值越大，越先被选中。",
                          "remainingTime：process 还需要占用 CPU 的时间。",
                          "totalTime：process 创建时生成的初始运行时间。",
                          "next：静态链表中的下一个 slot，用来串起 readyQueue。",
                          "arrivalTick：process 进入模拟器的时刻；未到达的 process 保存在 futureQueue。",
                          "startedTick：process 第一次真正占用 CPU 的时刻。",
                          "finishedTick：process 进入 terminated 状态的时刻。",
                          "status：pending / ready / running / terminated / free，分别对应未到达、就绪、运行中、已终止、空闲。",
                        ]}
                      />
                    </div>
                  </CardContent>
                </CollapsiblePanel>
              </Collapsible>
            </Card>
          </aside>

          <section className="flex min-w-0 flex-col gap-4">
            {isRoundComplete ? (
              <div className="rounded-md border border-[#002FA7]/25 bg-[#eaf3ff] px-4 py-3 text-sm font-medium text-[#002FA7]">
                已完成本轮任务
              </div>
            ) : null}

            <KnownProcessTable
              processes={knownProcesses}
              runningSlot={simulator.run}
              totalProcesses={knownProcesses.length}
            />

            <div className="grid gap-4 xl:grid-cols-2">
              <QueuePanel
                title="就绪队列"
                processes={readyProcesses}
                algorithm={simulator.algorithm}
                candidateSlot={candidateSlot}
                hasSchedulerStarted={simulator.timeline.length > 0}
              />
              <QueuePanel
                title="终止队列"
                processes={terminatedProcesses}
                algorithm={simulator.algorithm}
                muted
              />
            </div>

            <Tabs defaultValue="timeline" className="min-w-0">
              <TabsList>
                <TabsTrigger value="timeline">时间线</TabsTrigger>
                <TabsTrigger value="pcb">PCB</TabsTrigger>
                <TabsTrigger value="log">日志</TabsTrigger>
              </TabsList>
              <TabsContent value="timeline" className="mt-4">
                <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
                  <Card>
                    <CardHeader>
                      <CardTitle>调度时间线</CardTitle>
                      <CardDescription>每段代表一次处理器占用</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="flex min-h-36 flex-wrap content-start gap-2">
                        {simulator.timeline.length === 0 ? (
                          <EmptyText text="尚未调度" />
                        ) : (
                          simulator.timeline.map((segment) => (
                            <motion.div
                              layout
                              key={segment.id}
                              className="min-w-24 rounded-md border bg-muted px-3 py-2 font-mono text-sm"
                            >
                              <div className="font-semibold">
                                P{segment.pid}
                              </div>
                              <div className="text-muted-foreground">
                                {segment.start} - {segment.end}
                              </div>
                            </motion.div>
                          ))
                        )}
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle>统计</CardTitle>
                      <CardDescription>
                        平均等待 {average.waiting} / 平均周转{" "}
                        {average.turnaround}
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="h-56 min-h-56 min-w-1">
                        {chartData.length === 0 ? (
                          <EmptyText text="暂无终止进程" />
                        ) : (
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={chartData}>
                              <CartesianGrid
                                strokeDasharray="3 3"
                                vertical={false}
                              />
                              <XAxis
                                dataKey="pid"
                                tickLine={false}
                                axisLine={false}
                              />
                              <YAxis
                                tickLine={false}
                                axisLine={false}
                                allowDecimals={false}
                              />
                              <ChartTooltip />
                              <Bar
                                dataKey="waiting"
                                name="等待"
                                fill="#6b7280"
                                radius={[4, 4, 0, 0]}
                              />
                              <Bar
                                dataKey="turnaround"
                                name="周转"
                                fill="#002FA7"
                                radius={[4, 4, 0, 0]}
                              />
                            </BarChart>
                          </ResponsiveContainer>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>
              <TabsContent value="pcb" className="mt-4">
                <PcbTable processes={simulator.pcbArea} />
              </TabsContent>
              <TabsContent value="log" className="mt-4">
                <LogTable simulator={simulator} />
              </TabsContent>
            </Tabs>
          </section>
        </div>
      </div>
    </main>
  );
}

function ProjectInfoDialog() {
  return (
    <Dialog>
      <DialogTrigger
        render={
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="项目信息"
          />
        }
      >
        <CircleHelp aria-hidden="true" />
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>项目信息</DialogTitle>
          <DialogDescription>
            单处理器进程调度模拟器，用于展示
            PCB、就绪队列、运行指针和四种调度算法。
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 text-sm">
          <ProjectInfoRow label="核心" value="Next.js / React / TypeScript" />
          <ProjectInfoRow label="状态" value="Zustand" />
          <ProjectInfoRow label="表单" value="React Hook Form / Zod" />
          <ProjectInfoRow
            label="UI"
            value="Tailwind CSS / shadcn-ui / Base UI / lucide-react"
          />
          <ProjectInfoRow label="动效与图表" value="motion / Recharts" />
          <ProjectInfoRow
            label="验证与分发"
            value="Vitest / Playwright / Electron"
          />
        </div>

        <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm leading-6 text-muted-foreground">
          调度核心位于{" "}
          <span className="font-mono text-foreground">
            src/lib/scheduler/core.ts
          </span>
          ， UI 只负责展示和触发状态变化。
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ProjectInfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[6rem_1fr] gap-3 rounded-md border px-3 py-2">
      <div className="text-muted-foreground">{label}</div>
      <div className="font-mono text-[13px] text-foreground">{value}</div>
    </div>
  );
}

function ActionButton({
  label,
  onClick,
  icon: Icon,
  variant = "default",
}: {
  label: string;
  onClick: () => void;
  icon: typeof Play;
  variant?: "default" | "outline";
}) {
  return (
    <Button type="button" variant={variant} onClick={onClick}>
      <Icon data-icon="inline-start" aria-hidden="true" />
      {label}
    </Button>
  );
}

function NumberField({
  label,
  name,
  form,
}: {
  label: string;
  name: keyof ConfigFormInput;
  form: UseFormReturn<ConfigFormInput, unknown, ConfigForm>;
}) {
  const id = `config-${name}`;
  const invalid = Boolean(form.formState.errors[name]);
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="number"
        aria-invalid={invalid}
        {...form.register(name)}
      />
    </div>
  );
}

function SeedField({
  form,
}: {
  form: UseFormReturn<ConfigFormInput, unknown, ConfigForm>;
}) {
  function randomizeSeed() {
    const seed =
      typeof crypto !== "undefined" && "getRandomValues" in crypto
        ? crypto.getRandomValues(new Uint32Array(1))[0]
        : Math.floor(Math.random() * 2_147_483_647);
    form.setValue("seed", Math.max(1, seed), {
      shouldDirty: true,
      shouldValidate: true,
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor="config-seed">随机种子</Label>
      <div className="flex gap-2">
        <Input
          id="config-seed"
          type="number"
          aria-invalid={Boolean(form.formState.errors.seed)}
          {...form.register("seed")}
        />
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label="随机种子"
          onClick={randomizeSeed}
        >
          <Shuffle aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}

function QueuePanel({
  title,
  processes,
  algorithm,
  candidateSlot = null,
  hasSchedulerStarted = false,
  muted = false,
}: {
  title: string;
  processes: Pcb[];
  algorithm: SchedulerAlgorithm;
  candidateSlot?: number | null;
  hasSchedulerStarted?: boolean;
  muted?: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{processes.length} 个进程</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex min-h-36 flex-col gap-2">
          <AnimatePresence initial={false}>
            {processes.length === 0 ? (
              <EmptyText text="空队列" />
            ) : (
              processes.map((process) => (
                <ProcessCard
                  key={`${process.slot}-${process.name}`}
                  process={process}
                  algorithm={algorithm}
                  candidate={process.slot === candidateSlot}
                  statusOverride={
                    hasSchedulerStarted && process.slot === candidateSlot
                      ? "running"
                      : undefined
                  }
                  statusTone={
                    hasSchedulerStarted && process.slot === candidateSlot
                      ? "candidate"
                      : undefined
                  }
                  muted={muted}
                />
              ))
            )}
          </AnimatePresence>
        </div>
      </CardContent>
    </Card>
  );
}

function ProcessCard({
  process,
  algorithm,
  running = false,
  candidate = false,
  muted = false,
  statusOverride,
  statusTone,
}: {
  process: Pcb;
  algorithm: SchedulerAlgorithm;
  running?: boolean;
  candidate?: boolean;
  muted?: boolean;
  statusOverride?: Pcb["status"];
  statusTone?: "candidate";
}) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      className={[
        "relative overflow-hidden rounded-md border px-3 py-3 text-sm transition-[border-color,box-shadow,background-color]",
        running
          ? "border-[#002FA7] bg-[#eaf3ff] shadow-[0_0_0_2px_rgba(0,47,167,0.14)]"
          : "bg-card",
        candidate
          ? "border-[#002FA7]/70 shadow-[0_0_0_1px_rgba(0,47,167,0.12),0_18px_42px_rgba(0,47,167,0.16)]"
          : "",
        muted ? "bg-muted/60 text-muted-foreground" : "",
      ].join(" ")}
    >
      {candidate ? (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -inset-x-8 -top-10 z-0 h-24 bg-[#eaf3ff] opacity-80 blur-2xl"
        />
      ) : null}
      <div className="relative z-10 flex items-center justify-between gap-2">
        <div className="relative font-mono text-base font-semibold">
          进程 P{process.name}
        </div>
        <StatusBadge
          status={statusOverride ?? process.status}
          tone={statusTone}
        />
      </div>
      <Separator className="relative z-10 my-2" />
      <div className="relative z-10 grid grid-cols-4 gap-2 font-mono">
        <MiniStat
          label="slot"
          value={process.slot}
          ignoredReason={getIgnoredProcessCardFieldReason(algorithm, "slot")}
        />
        <MiniStat
          label="priority"
          value={process.priority}
          ignoredReason={getIgnoredProcessCardFieldReason(
            algorithm,
            "priority",
          )}
        />
        <MiniStat
          label="remaining"
          value={process.remainingTime}
          ignoredReason={getIgnoredProcessCardFieldReason(
            algorithm,
            "remaining",
          )}
        />
        <MiniStat
          label="next"
          value={formatNullable(process.next)}
          ignoredReason={getIgnoredProcessCardFieldReason(algorithm, "next")}
        />
      </div>
    </motion.div>
  );
}

function PcbTable({ processes }: { processes: Array<Pcb | null> }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>PCB 明细</CardTitle>
        <CardDescription>数组模拟有限 PCB 区</CardDescription>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHeadWithTooltip field="slot" />
              <TableHeadWithTooltip field="pid" />
              <TableHeadWithTooltip field="status" />
              <TableHeadWithTooltip field="priority" />
              <TableHeadWithTooltip field="remaining" />
              <TableHeadWithTooltip field="totalTime" />
              <TableHeadWithTooltip field="next" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {processes.map((process, slot) => (
              <TableRow key={slot}>
                <TableCell className="font-mono">{slot}</TableCell>
                <TableCell className="font-mono">
                  {process ? `P${process.name}` : "-"}
                </TableCell>
                <TableCell>
                  <StatusBadge status={process?.status ?? "free"} />
                </TableCell>
                <TableCell className="font-mono">
                  {process?.priority ?? "-"}
                </TableCell>
                <TableCell className="font-mono">
                  {process?.remainingTime ?? "-"}
                </TableCell>
                <TableCell className="font-mono">
                  {process?.totalTime ?? "-"}
                </TableCell>
                <TableCell className="font-mono">
                  {process ? formatNullable(process.next) : "-"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function KnownProcessTable({
  processes,
  runningSlot,
  totalProcesses,
}: {
  processes: Array<Pcb | FutureProcess>;
  runningSlot: number | null;
  totalProcesses: number;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>所有已知进程</CardTitle>
        <CardDescription>
          包含就绪、运行、终止状态与动态到达进程，共计 {totalProcesses} 个进程
        </CardDescription>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHeadWithTooltip field="process" />
              <TableHeadWithTooltip field="status" />
              <TableHeadWithTooltip field="arrival" />
              <TableHeadWithTooltip field="start" />
              <TableHeadWithTooltip field="finish" />
              <TableHeadWithTooltip field="priority" />
              <TableHeadWithTooltip field="remaining" />
              <TableHeadWithTooltip field="totalTime" />
              <TableHeadWithTooltip field="next" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {processes.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9}>
                  <EmptyText text="暂无已知进程" />
                </TableCell>
              </TableRow>
            ) : (
              processes.map((process) => {
                const isRunning =
                  process.slot != null && process.slot === runningSlot;
                return (
                  <TableRowMotion
                    key={`${process.slot ?? "future"}-${process.name}`}
                    running={isRunning}
                  >
                    <TableCell className="font-mono font-semibold">
                      进程 P{process.name}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={process.status} />
                    </TableCell>
                    <TableCell className="font-mono">
                      {process.arrivalTick}
                    </TableCell>
                    <TableCell className="font-mono">
                      {formatNullable(process.startedTick)}
                    </TableCell>
                    <TableCell className="font-mono">
                      {formatNullable(process.finishedTick)}
                    </TableCell>
                    <TableCell className="font-mono">
                      {process.priority}
                    </TableCell>
                    <TableCell className="font-mono">
                      {process.remainingTime}
                    </TableCell>
                    <TableCell className="font-mono">
                      {process.totalTime}
                    </TableCell>
                    <TableCell className="font-mono">
                      {formatNullable(process.next)}
                    </TableCell>
                  </TableRowMotion>
                );
              })
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function TableHeadWithTooltip({ field }: { field: TableGlossaryField }) {
  return (
    <TableHead>
      <Tooltip>
        <TooltipTrigger
          render={<span className="cursor-help" aria-label={`${field} 说明`} />}
        >
          {field}
        </TooltipTrigger>
        <TooltipContent>{getTableGlossaryTooltip(field)}</TooltipContent>
      </Tooltip>
    </TableHead>
  );
}

function TableRowMotion({
  running,
  children,
}: {
  running: boolean;
  children: ReactNode;
}) {
  return (
    <motion.tr
      layout
      initial={false}
      animate={{
        backgroundColor: running
          ? "rgba(234, 243, 255, 1)"
          : "rgba(255, 255, 255, 1)",
        borderColor: running
          ? "rgba(0, 47, 167, 0.7)"
          : "rgba(229, 229, 229, 1)",
      }}
      transition={{
        backgroundColor: { duration: 0.18 },
        borderColor: { duration: 0.18 },
      }}
      className="border-b border-t"
    >
      {children}
    </motion.tr>
  );
}

function StatusBadge({
  status,
  tone,
}: {
  status: Pcb["status"] | FutureProcess["status"];
  tone?: "candidate";
}) {
  const styles: Record<Pcb["status"] | FutureProcess["status"], string> = {
    pending: "border-muted-foreground/20 bg-muted text-muted-foreground",
    ready: "border-[#93c5fd]/50 bg-[#eaf3ff] text-[#1d4ed8]",
    running: "border-[#002FA7]/40 bg-[#002FA7] text-white",
    terminated: "border-red-200 bg-red-50 text-red-700",
    free: "border-muted-foreground/20 bg-muted text-muted-foreground",
  };

  const labels: Record<Pcb["status"] | FutureProcess["status"], string> = {
    pending: "未到达",
    ready: "就绪",
    running: "运行中",
    terminated: "已终止",
    free: "空闲",
  };

  return (
    <Badge
      variant="outline"
      className={
        tone === "candidate" && status === "running"
          ? "border-green-200 bg-green-50 text-green-700"
          : styles[status]
      }
    >
      {labels[status]}
    </Badge>
  );
}

function LogTable({
  simulator,
}: {
  simulator: ReturnType<typeof useSchedulerStore.getState>["simulator"];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>调度日志</CardTitle>
        <CardDescription>最近 {simulator.logs.length} 条</CardDescription>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tick</TableHead>
              <TableHead>运行</TableHead>
              <TableHead>priority</TableHead>
              <TableHead>remaining</TableHead>
              <TableHead>原因</TableHead>
              <TableHead>ready</TableHead>
              <TableHead>terminated</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {simulator.logs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7}>
                  <EmptyText text="暂无日志" />
                </TableCell>
              </TableRow>
            ) : (
              simulator.logs.map((log) => (
                <TableRow key={log.id}>
                  <TableCell className="font-mono">{log.tick}</TableCell>
                  <TableCell className="font-mono">
                    {log.pid ? `P${log.pid}` : "-"}
                  </TableCell>
                  <TableCell className="font-mono">
                    {log.priority ?? "-"}
                  </TableCell>
                  <TableCell className="font-mono">
                    {log.remainingBefore ?? "-"} → {log.remainingAfter ?? "-"}
                  </TableCell>
                  <TableCell className="min-w-56">{log.reason}</TableCell>
                  <TableCell className="font-mono">
                    {log.readyQueue.join(", ") || "-"}
                  </TableCell>
                  <TableCell className="font-mono">
                    {log.terminatedQueue.join(", ") || "-"}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border px-3 py-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-mono text-lg font-semibold">{value}</div>
    </div>
  );
}

function GlossaryGroup({ title, items }: { title: string; items: string[] }) {
  return (
    <section className="rounded-md border bg-muted/25 p-3">
      <div className="mb-2 flex items-center gap-2">
        <Badge variant="outline" className="h-5 px-1.5 text-[11px]">
          {title}
        </Badge>
      </div>
      <ul className="space-y-2">
        {items.map((item) => (
          <li key={item} className="text-pretty">
            {item}
          </li>
        ))}
      </ul>
    </section>
  );
}

function MiniStat({
  label,
  value,
  ignoredReason = null,
}: {
  label: string;
  value: string | number;
  ignoredReason?: string | null;
}) {
  const labelClassName = [
    "cursor-help text-[11px] font-semibold",
    ignoredReason ? "text-muted-foreground/40" : "text-muted-foreground",
  ].join(" ");
  const valueClassName = [
    "truncate font-normal tabular-nums",
    ignoredReason ? "text-muted-foreground/40" : "",
  ].join(" ");
  const tooltipText = getProcessCardFieldTooltip(
    label as ProcessCardField,
    ignoredReason,
  );

  return (
    <div className="min-w-0" title={label}>
      <Tooltip>
        <TooltipTrigger
          render={
            <span className={labelClassName} aria-label={`${label} 说明`} />
          }
        >
          {label}
        </TooltipTrigger>
        <TooltipContent>{tooltipText}</TooltipContent>
      </Tooltip>
      <div className={valueClassName}>{value}</div>
    </div>
  );
}

function getIgnoredProcessCardFields(
  algorithm: SchedulerAlgorithm,
): Set<ProcessCardField> {
  if (algorithm === "priority") {
    return new Set();
  }

  return new Set(["priority"]);
}

function getIgnoredProcessCardFieldReason(
  algorithm: SchedulerAlgorithm,
  field: ProcessCardField,
) {
  if (!getIgnoredProcessCardFields(algorithm).has(field)) {
    return null;
  }

  return `当前算法 ${ALGORITHM_LABELS[algorithm]} 不会参考 ${field} 参数。`;
}

function getProcessCardFieldTooltip(
  field: ProcessCardField,
  ignoredReason: string | null,
) {
  const explanations: Record<ProcessCardField, string> = {
    slot: "slot 对应 PCB 区中的槽位，也就是 pcbArea 的数组下标。",
    priority: "priority 对应进程优先级，当前实现中数值越大优先级越高。",
    remaining: "remaining 对应 remainingTime，表示进程还需要运行的时间。",
    next: "next 对应静态链表中的下一个槽位，用来连接 readyQueue。",
  };

  return ignoredReason
    ? `${explanations[field]} ${ignoredReason}`
    : explanations[field];
}

function getTableGlossaryTooltip(field: TableGlossaryField) {
  const explanations: Record<TableGlossaryField, string> = {
    process: "process 对应进程标识，页面中显示为进程 P 加 PID。",
    pid: "pid 对应进程标识符，用于区分不同 process。",
    status:
      "status 对应进程状态，包括 pending、ready、running、terminated、free。",
    arrival: "arrival 对应 arrivalTick，表示 process 到达模拟器的时刻。",
    start: "start 对应 startedTick，表示 process 第一次占用 CPU 的时刻。",
    finish: "finish 对应 finishedTick，表示 process 进入 terminated 的时刻。",
    slot: "slot 对应 PCB 区中的槽位，也就是 pcbArea 的数组下标。",
    priority: "priority 对应进程优先级，当前实现中数值越大优先级越高。",
    remaining: "remaining 对应 remainingTime，表示 process 还需要运行的时间。",
    totalTime: "totalTime 对应 process 创建时生成的初始运行时间。",
    next: "next 对应静态链表中的下一个 slot，用来连接 readyQueue。",
  };

  return explanations[field];
}

function EmptyText({ text }: { text: string }) {
  return (
    <div className="flex min-h-20 w-full items-center justify-center rounded-md border border-dashed px-3 text-center text-sm text-muted-foreground">
      {text}
    </div>
  );
}

function formatNullable(value: number | null) {
  return value == null ? "-" : value;
}

function round(value: number) {
  return Math.round(value * 10) / 10;
}
