import { readFileSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";

// 실계정 로그인 E2E용 비밀번호는 git에 올리지 않는다 — 루트 .env 의 E2E_* 값을 읽어 온다.
try {
  for (const line of readFileSync(new URL("../.env", import.meta.url), "utf8").split("\n")) {
    const m = line.trim().match(/^(E2E_[A-Z_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
} catch {
  /* .env 없으면 환경변수로 직접 넘긴다 */
}

// E2E: 백엔드(uvicorn:8000)와 프론트 개발서버(vite:5173)를 자동 기동한다.
// vite 프록시가 /api → 8000 으로 넘긴다.
// PW_NO_BACKEND=1 이면 백엔드를 띄우지 않는다 (모든 /api 를 모킹하는 테스트용).
const backend = {
  command: ".venv\\Scripts\\python.exe -m uvicorn main:app --port 8000",
  cwd: "../backend",
  url: "http://localhost:8000/api/health",
  reuseExistingServer: true,
  timeout: 60_000,
};
const frontend = {
  command: "npm run dev -- --port 5173 --strictPort",
  url: "http://localhost:5173",
  reuseExistingServer: true,
  timeout: 60_000,
};

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  fullyParallel: false,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:5173",
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: process.env.PW_NO_BACKEND ? [frontend] : [backend, frontend],
});
