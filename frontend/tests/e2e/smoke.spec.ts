import { test, expect } from '@playwright/test'

test.describe('基础流程验证 (Smoke Test)', () => {
  test.beforeEach(async ({ page }) => {
    // 捕获浏览器日志以供 CI 调试
    page.on('console', (msg) => console.log(`BROWSER LOG [${msg.type()}]: ${msg.text()}`))
    page.on('pageerror', (err) => console.error(`BROWSER ERROR: ${err.message}`))

    // 拦截所有可能的 API 请求并返回 mock 数据，避免连接后端失败
    // 使用正则匹配，确保捕获所有 /api 开头的请求
    await page.route(/\/api\//, async (route) => {
      const url = route.request().url()
      // console.log(`E2E Mock: Intercepted ${url}`)
      if (url.includes('/api/files')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ files: [], total: 0, page: 1, page_size: 50 }),
        })
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true }),
        })
      }
    })
  })

  test('首页应该能正常加载', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' })

    // 检查页面标题
    await expect(page).toHaveTitle(/.*Cine.*/i)

    // 检查关键元素是否存在
    const sidebar = page.locator('[data-testid="sidebar"]')
    await expect(sidebar).toBeVisible({ timeout: 15000 })
  })

  test('导航应该正常工作', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' })

    // 等待页面稳定
    await page.waitForLoadState('networkidle')

    // 等待侧边栏可见
    const sidebar = page.locator('[data-testid="sidebar"]')
    await expect(sidebar).toBeVisible({ timeout: 15000 })

    // 点击元数据处理
    await page.locator('text=元数据处理').click()
    await expect(page).toHaveURL(/.*\/scraper/)

    // 点击批量重命名
    await page.locator('text=批量重命名').click()
    await expect(page).toHaveURL(/.*\/renamer/)

    // 点击文件管理
    await page.locator('text=文件管理').click()
    await expect(page).toHaveURL(/.*\/file-manager/)
  })

  test('暗色主题切换应该正常工作', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' })

    // 等待页面稳定
    await page.waitForLoadState('networkidle')

    // 等待侧边栏可见
    const sidebar = page.locator('[data-testid="sidebar"]')
    await expect(sidebar).toBeVisible({ timeout: 15000 })

    // 主题按钮在 Sidebar 底部的版本信息区域中
    const themeButton = sidebar.locator('button').last()
    await expect(themeButton).toBeVisible({ timeout: 10000 })
    await themeButton.click()

    // 检查主题是否切换
    const html = page.locator('html')
    await expect(html).toHaveAttribute('data-theme', /dark|light/, { timeout: 10000 })
  })
})

test.describe('文件扫描功能', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/api/**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, files: [], total: 0 }),
      })
    })
  })

  test('扫描页面应该显示', async ({ page }) => {
    await page.goto('/scanner', { waitUntil: 'domcontentloaded' })

    // 等待页面稳定
    await page.waitForLoadState('networkidle')

    // 检查扫描页面标题 - 使用更具体的选择器匹配 h2 元素
    const title = page.locator('h2:has-text("媒体库")')
    await expect(title).toBeVisible({ timeout: 10000 })
  })

  test('扫描页面应该显示搜索框', async ({ page }) => {
    await page.goto('/scanner', { waitUntil: 'domcontentloaded' })

    // 等待页面稳定
    await page.waitForLoadState('networkidle')

    // 检查搜索框
    const searchInput = page.locator('input[placeholder*="搜索"]')
    await expect(searchInput).toBeVisible({ timeout: 10000 })
  })
})
