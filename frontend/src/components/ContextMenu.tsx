import { Popover } from "@heroui/react"

interface ContextMenuItem {
  label: string
  icon: React.ReactNode
  action: () => void
  variant?: 'default' | 'danger'
}

interface ContextMenuProps {
  isOpen: boolean
  onClose: () => void
  position: { x: number; y: number }
  items: ContextMenuItem[]
}

export default function ContextMenu({ isOpen, onClose, position, items }: ContextMenuProps) {
  return (
    <Popover
      isOpen={isOpen}
      onOpenChange={(open) => !open && onClose()}
    >
      <Popover.Trigger>
        <div
          style={{
            position: 'fixed',
            left: position.x,
            top: position.y,
            width: 0,
            height: 0,
            pointerEvents: 'none'
          }}
        />
      </Popover.Trigger>
      <Popover.Content className="min-w-[160px] p-1">
        {items.map((item, index) => (
          <button
            key={index}
            onClick={() => {
              item.action()
              onClose()
            }}
            className={`
              w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium
              transition-all duration-150 hover:bg-default-100/50
              ${item.variant === 'danger' ? 'text-danger hover:bg-danger/10' : 'text-foreground'}
            `}
          >
            <span className="w-4 h-4 flex items-center justify-center">{item.icon}</span>
            {item.label}
          </button>
        ))}
      </Popover.Content>
    </Popover>
  )
}
