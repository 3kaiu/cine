import { defineConfig, devices } from '@playwright/test'

/**
 * Playwright E2E 测试配置
 * https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir: './tests/e2e',
  /* 每个测试的最长运行时间 */
  timeout: process.env.CI ? 60 * 1000 : 30 * 1000,
  expect: {
    timeout: 10000,
  },
  /* 失败时重试 */
  retries: process.env.CI ? 2 : 0,
  /* 全量运行时的并行度 */
  workers: process.env.CI ? 1 : undefined,
  /* 报告器格式 */
  reporter: process.env.CI ? 'github' : 'html',
  /* 基础路径和浏览器配置 */
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  /* 在多个浏览器中运行 */
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
  ],

  /* 运行测试前先启动本地服务器 */
  webServer: {
    command: process.env.CI ? 'pnpm run preview' : 'pnpm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
  },
})
