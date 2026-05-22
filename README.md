# 进程调度实验台

单处理器系统进程调度模拟器。项目使用 Next.js / TypeScript 实现课程题目四要求的 PCB 区、空闲 PCB 队列、就绪队列、运行进程指针、进程创建原语和进程调度原语。

## 功能

- 时间片轮转调度：队首运行一个时间片，未结束则回到队尾。
- 优先数调度：大数优先，每运行一次优先数和剩余时间各减 1。
- 最短进程优先：非抢占式，选中后直接运行到结束。
- 最短剩余时间优先：按剩余时间排序，每次运行一个时间片。
- 支持随机种子、PCB 容量、初始进程数、优先数范围、运行时间范围、动态到达概率配置。
- 展示本次运行进程、就绪队列、终止队列、PCB 使用情况、调度日志、调度时间线和等待/周转统计。

## 启动

```bash
npm install
npm run dev
```

默认访问 `http://localhost:3000`。如果端口被占用，可以指定端口：

```bash
npm run dev -- --hostname 127.0.0.1 --port 3001
```

Windows 下也可以直接运行根目录的 `start.bat`。

## 免安装版

项目支持 Electron 打包为 Windows 免安装程序：

```bash
npm run dist
```

`npm run dist` 会先执行 `build:electron`，把 Next.js 页面静态导出到 `out/`，再用 Electron 打包。构建完成后，双击 `dist/进程调度实验台-0.1.0-x64.exe` 即可运行，不需要再启动浏览器或本地开发服务。

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

如果要验证指定地址：

```bash
$env:SMOKE_URL = "http://127.0.0.1:3003"
npm run smoke
```

## 结构

```txt
src/
  app/                         页面入口
  components/scheduler/        调度实验台 UI
  components/ui/               shadcn/ui 组件源码
  lib/scheduler/               调度核心逻辑与单元测试
  stores/                      Zustand 状态连接层
scripts/
  smoke.mjs                    Playwright 页面 smoke 验证
wiki/
  requirement/                 课程题目与要求
  report.md                    课程设计报告草稿
```

调度算法位于 `src/lib/scheduler/core.ts`，不依赖 React，方便单独测试和在报告中说明。
