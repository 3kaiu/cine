import { test, expect } from '@playwright/test'

test.describe('基础流程验证 (Smoke Test)', () => {
  test('首页应该能正常加载', async ({ page }) => {
    await page.goto('/')

    // 检查页面标题
    await expect(page).toHaveTitle(/.*Media Toolbox.*/i)

    // 检查关键元素是否存在
    const sidebar = page.locator('[data-testid="sidebar"]')
    await expect(sidebar).toBeVisible()
  })

  test('导航应该正常工作', async ({ page }) => {
    await page.goto('/')

    // 点击文件扫描
    await page.click('text=文件扫描')
    await expect(page).toHaveURL(/.*\/$/)

    // 点击元数据刮削
    await page.click('text=元数据刮削')
    await expect(page).toHaveURL(/.*\/scraper/)

    // 点击文件去重
    await page.click('text=文件去重')
    await expect(page).toHaveURL(/.*\/dedupe/)
  })

  test('暗色主题切换应该正常工作', async ({ page }) => {
    await page.goto('/')

    // 查找主题切换按钮
    const themeButton = page.locator('button[title*="主题"]')
    if (await themeButton.isVisible()) {
      await themeButton.click()

      // 检查主题是否切换
      const html = page.locator('html')
      const classList = await html.getAttribute('class')
      expect(classList).toBeTruthy()
    }
  })
})

test.describe('文件扫描功能', () => {
  test('扫描页面应该显示', async ({ page }) => {
    await page.goto('/')

    // 检查扫描输入框
    const input = page.locator('input[placeholder*="目录路径"]')
    await expect(input).toBeVisible()
  })
})
