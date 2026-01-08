import { useState, useEffect } from 'react'
import { theme } from 'antd'

const { defaultAlgorithm, darkAlgorithm } = theme

export function useTheme() {
  const [isDark, setIsDark] = useState(() => {
    const saved = localStorage.getItem('theme')
    if (saved) {
      return saved === 'dark'
    }
    return window.matchMedia('(prefers-color-scheme: dark)').matches
  })

  useEffect(() => {
    localStorage.setItem('theme', isDark ? 'dark' : 'light')
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light')
  }, [isDark])

  const toggleTheme = () => {
    setIsDark(!isDark)
  }

  return {
    isDark,
    toggleTheme,
    algorithm: isDark ? darkAlgorithm : defaultAlgorithm,
  }
}
