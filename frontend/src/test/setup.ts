import '@testing-library/jest-dom'
import React from 'react'
import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'

function createComponent(tag = 'div') {
  return React.forwardRef<HTMLElement, React.PropsWithChildren<Record<string, unknown>>>(
    ({ children, onPress, ...props }, ref) =>
      React.createElement(tag, { ref, onClick: onPress, ...props }, children as React.ReactNode)
  )
}

vi.mock('@/ui/heroui', () => {
  const Spinner = ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) =>
    React.createElement('div', { 'data-testid': 'spinner', ...props }, children as React.ReactNode)

  const Button = createComponent('button')
  const Chip = createComponent('div')
  const Surface = createComponent('div')
  const Label = createComponent('label')
  const TextArea = createComponent('textarea')
  const TextField = createComponent('div')
  const Skeleton = createComponent('div')
  const Tooltip = createComponent('div')

  const Card = Object.assign(createComponent('div'), {
    Content: createComponent('div'),
  })

  const ListBoxRoot = React.forwardRef<HTMLElement, React.PropsWithChildren<Record<string, unknown>>>(
    ({ children, 'aria-label': ariaLabel, ...props }, ref) =>
      React.createElement(
        'div',
        { ref, role: 'listbox', 'aria-label': ariaLabel, ...props },
        children as React.ReactNode
      )
  )

  const ListBox = Object.assign(ListBoxRoot, {
    Item: React.forwardRef<HTMLElement, React.PropsWithChildren<Record<string, unknown>>>(({ children, ...props }, ref) =>
      React.createElement('div', { ref, role: 'option', ...props }, children as React.ReactNode)
    ),
  })

  const Popover = Object.assign(createComponent('div'), {
    Trigger: createComponent('div'),
    Content: createComponent('div'),
  })

  const Modal = Object.assign(createComponent('div'), {
    Backdrop: createComponent('div'),
    Container: createComponent('div'),
    Dialog: createComponent('div'),
    CloseTrigger: createComponent('button'),
    Header: createComponent('div'),
    Icon: createComponent('div'),
    Heading: createComponent('h2'),
    Body: createComponent('div'),
    Footer: createComponent('div'),
  })

  const Checkbox = Object.assign(createComponent('label'), {
    Control: createComponent('div'),
    Indicator: createComponent('span'),
  })

  const Switch = createComponent('button')

  const Tabs = Object.assign(createComponent('div'), {
    ListContainer: createComponent('div'),
    List: createComponent('div'),
    Tab: createComponent('button'),
    Panel: createComponent('div'),
  })

  const SearchField = Object.assign(createComponent('div'), {
    Group: createComponent('div'),
    SearchIcon: createComponent('span'),
    Input: createComponent('input'),
    ClearButton: createComponent('button'),
  })

  const Select = Object.assign(createComponent('div'), {
    Trigger: createComponent('button'),
    Value: createComponent('span'),
    Indicator: createComponent('span'),
    Popover: createComponent('div'),
  })

  const InputGroup = Object.assign(createComponent('div'), {
    Input: createComponent('input'),
    Prefix: createComponent('div'),
    Suffix: createComponent('div'),
  })

  const Input = createComponent('input')

  return {
    Spinner,
    Button,
    Chip,
    Surface,
    Card,
    ListBox,
    Popover,
    Modal,
    Checkbox,
    Tabs,
    SearchField,
    Select,
    Label,
    Switch,
    TextField,
    InputGroup,
    Input,
    TextArea,
    Skeleton,
    Tooltip,
  }
})

// 清理每个测试后的 DOM
afterEach(() => {
  cleanup()
})

// Mock window.matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
})

// Mock IntersectionObserver
vi.stubGlobal('IntersectionObserver', class IntersectionObserver {
  constructor() { }
  disconnect() { }
  observe() { }
  takeRecords() {
    return []
  }
  unobserve() { }
})

vi.stubGlobal(
  'WebSocket',
  class MockWebSocket {
    onopen: ((event: Event) => void) | null = null
    onclose: ((event: CloseEvent) => void) | null = null
    onerror: ((event: Event) => void) | null = null
    onmessage: ((event: MessageEvent) => void) | null = null

    constructor() {
      queueMicrotask(() => {
        this.onopen?.(new Event('open'))
      })
    }

    close() {
      this.onclose?.(new CloseEvent('close', { code: 1000 }))
    }

    send() {}
  }
)
