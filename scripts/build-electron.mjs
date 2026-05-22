import { spawnSync } from "node:child_process";

const result = spawnSync(process.execPath, ["node_modules/next/dist/bin/next", "build"], {
  env: {
    ...process.env,
    BUILD_TARGET: "electron",
  },
  shell: false,
  stdio: "inherit",
});

process.exit(result.status ?? 1);
