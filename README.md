# 进程调度实验台

单处理器系统的进程调度模拟器。

这个项目对应《操作系统分析与设计实习》的题目四。重点不在页面展示，而是把 PCB、空闲 PCB 队列、就绪队列、运行进程指针、进程创建原语和进程调度原语跑清楚。

技术栈：

- Next.js / React / TypeScript
- Zustand
- React Hook Form / Zod
- Tailwind CSS / shadcn-ui / Base UI / lucide-react
- motion / Recharts
- Vitest / Playwright / Electron

## 功能

- 时间片轮转：队首运行一个时间片，未结束则回到队尾。
- 优先数调度：大数优先，每运行一次优先数和剩余时间各减 1。
- 最短进程优先：非抢占，选中后直接运行到结束。
- 最短剩余时间优先：按剩余时间排序，每次运行一个时间片。
- 支持 PCB 容量、初始进程数、优先数范围、运行时间范围、进程出现概率和随机种子配置。
- 展示运行进程、就绪队列、终止队列、PCB 使用情况、调度日志、时间线和等待 / 周转统计。

## 启动

```bash
npm install
npm run dev
```

默认访问：

```txt
http://localhost:3000
```

Windows 下也可以运行根目录的 `start.bat`。

## 验证

```bash
npm test
npm run lint
npm run build
```

浏览器 smoke 验证需要先启动本地服务：

```bash
npm run dev
npm run smoke
```

## 打包

```bash
npm run dist
```

打包结果会输出到 `dist/`，用于 Windows 免安装运行。

## 结构

```txt
src/
  app/                   页面入口
  components/scheduler/  调度实验台 UI
  components/ui/         shadcn/ui 组件
  lib/scheduler/         调度核心逻辑
  stores/                Zustand 状态连接层
scripts/
  smoke.mjs              页面 smoke 验证
wiki/
  requirement/           课程题目与要求
  report.md              课程设计报告草稿
```

调度核心在 `src/lib/scheduler/core.ts`，不依赖 React。页面只负责展示状态和触发操作。
