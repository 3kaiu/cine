import { Button } from "@heroui/react";
import { Sun, Moon } from '@gravity-ui/icons'
import { useTheme } from '@/hooks/useTheme'

export default function ThemeToggle() {
  const { isDark, toggleTheme } = useTheme()

  return (
    <Button
      onPress={toggleTheme}
      isIconOnly
      variant="ghost"
      size="sm"
      className="text-foreground/70 hover:bg-default-100 hover:text-foreground transition-colors border-none"
    >
      {isDark ? <Sun className="w-[18px] h-[18px]" /> : <Moon className="w-[18px] h-[18px]" />}
    </Button>
  )
}
