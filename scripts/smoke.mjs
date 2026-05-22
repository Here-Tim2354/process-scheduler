import { access, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = new URL("../", import.meta.url);
const desktopPath = fileURLToPath(new URL(".next/qa-desktop.png", root));
const mobilePath = fileURLToPath(new URL(".next/qa-mobile.png", root));
const targetUrl = process.env.SMOKE_URL ?? "http://localhost:3000";

await mkdir(new URL(".next/tmp", root), { recursive: true });

const chromePath = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const edgePath = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const executablePath = await firstExistingPath([chromePath, edgePath]);
const browser = await chromium.launch({
  headless: true,
  executablePath,
});
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });

await page.goto(targetUrl, { waitUntil: "networkidle" });
const title = await page.locator("h1").textContent();
const initialBodyText = await page.locator("body").innerText();
if (initialBodyText.includes("运行中")) {
  throw new Error("Expected reset state to show only ready processes, but found 运行中");
}
await page.locator('button[aria-label="展开或收起配置"]').click();
const capacityInput = page.getByLabel("PCB 容量");
await capacityInput.fill("12");
await page.getByRole("button", { name: "随机", exact: true }).click();
const capacityAfterRandom = await capacityInput.inputValue();
if (capacityAfterRandom !== "12") {
  throw new Error(`Expected random action to preserve PCB capacity 12, got ${capacityAfterRandom}`);
}
await page.getByRole("button", { name: "单步" }).click();
await page.waitForTimeout(200);
await page.getByRole("button", { name: "随机", exact: true }).click();
await page.waitForTimeout(200);
await page.getByRole("button", { name: "运行到底" }).click();
await page.waitForTimeout(800);
await page.getByRole("button", { name: "项目信息" }).click();
await page.getByRole("heading", { name: "项目信息" }).waitFor();
const projectInfoText = await page.getByRole("dialog").innerText();
await page.getByRole("button", { name: "关闭" }).click();
const bodyText = await page.locator("body").innerText();
await page.screenshot({ path: desktopPath, fullPage: true });
const algorithmResults = [];

for (const label of ["优先数", "最短进程优先", "最短剩余时间优先", "时间片轮转"]) {
  await page.getByRole("combobox", { name: "选择调度算法" }).click();
  await page.getByRole("option", { name: label }).click();
  await page.getByRole("button", { name: "重置" }).click();
  await page.getByRole("button", { name: "运行到底" }).click();
  await page.waitForTimeout(300);
  const text = await page.locator("body").innerText();
  algorithmResults.push({
    label,
    visible: text.includes(label),
    completed: text.includes("终止队列") && text.includes("已完成本轮任务"),
  });
}

const mobile = await browser.newPage({ viewport: { width: 390, height: 900 } });
await mobile.goto(targetUrl, { waitUntil: "networkidle" });
await mobile.screenshot({ path: mobilePath, fullPage: true });

await browser.close();

console.log(
  JSON.stringify(
    {
      title,
      url: targetUrl,
      tick31: bodyText.includes("Tick 31"),
      terminatedQueueVisible: bodyText.includes("终止队列"),
      projectInfoVisible:
        projectInfoText.includes("Next.js") &&
        projectInfoText.includes("Electron") &&
        projectInfoText.includes("src/lib/scheduler/core.ts"),
      randomPreservesCapacity: capacityAfterRandom === "12",
      algorithmResults,
      desktopScreenshot: desktopPath,
      mobileScreenshot: mobilePath,
    },
    null,
    2,
  ),
);

async function firstExistingPath(paths) {
  for (const path of paths) {
    try {
      await access(path);
      return path;
    } catch {
      // Try the next locally installed Chromium-compatible browser.
    }
  }
  return undefined;
}
