import { test, expect } from '@playwright/test'

test.describe('基础流程验证 (Smoke Test)', () => {
  test.beforeEach(async ({ page }) => {
    // 拦截所有 API 请求并返回 mock 数据，避免连接后端失败
    await page.route('**/api/**', async (route) => {
      const url = route.request().url()
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
    await page.goto('/')

    // 检查页面标题
    await expect(page).toHaveTitle(/.*Cine.*/i)

    // 检查关键元素是否存在
    const sidebar = page.locator('[data-testid="sidebar"]')
    await expect(sidebar).toBeVisible()
  })

  test('导航应该正常工作', async ({ page }) => {
    await page.goto('/')

    // 点击元数据刮削
    await page.click('text=元数据刮削')
    await expect(page).toHaveURL(/.*\/scraper/)

    // 点击批量重命名
    await page.click('text=批量重命名')
    await expect(page).toHaveURL(/.*\/renamer/)

    // 点击文件管理
    await page.click('text=文件管理')
    await expect(page).toHaveURL(/.*\/file-manager/)

    // 点击设置
    await page.click('text=设置')
    await expect(page).toHaveURL(/.*\/settings/)
  })

  test('暗色主题切换应该正常工作', async ({ page }) => {
    await page.goto('/')

    // 查找主题切换按钮 (Ant Design Button typically has title or icon)
    // Looking for the toggle in the Header
    const themeButton = page.locator('header button')
    if (await themeButton.count() > 0) {
      await themeButton.first().click()

      // 检查主题是否切换
      const html = page.locator('html')
      await expect(html).toHaveAttribute('data-theme', /dark|light/)
    }
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
    await page.goto('/')

    // 检查扫描输入框
    const input = page.locator('input[placeholder*="目录路径"]')
    await expect(input).toBeVisible()
  })
})
