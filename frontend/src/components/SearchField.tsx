import {
  createContext,
  type ChangeEvent,
  type HTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  useContext,
  useMemo,
} from 'react'
import clsx from 'clsx'

interface SearchFieldContextValue {
  value: string
  onChange?: (value: string) => void
}

const SearchFieldContext = createContext<SearchFieldContextValue | null>(null)

interface SearchFieldRootProps {
  children: ReactNode
  className?: string
  value?: string
  onChange?: (value: string) => void
}

function SearchFieldRoot({
  children,
  className,
  value = '',
  onChange,
}: SearchFieldRootProps) {
  const contextValue = useMemo(
    () => ({
      value,
      onChange,
    }),
    [onChange, value],
  )

  return (
    <SearchFieldContext.Provider value={contextValue}>
      <div className={clsx('min-w-0', className)}>{children}</div>
    </SearchFieldContext.Provider>
  )
}

function useSearchFieldContext(component: string) {
  const context = useContext(SearchFieldContext)
  if (!context) {
    throw new Error(`${component} must be used within SearchField`)
  }
  return context
}

function Group({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      {...props}
      className={clsx(
        'cine-search-field-group flex min-w-0 items-center gap-2 rounded-xl px-3',
        className,
      )}
    />
  )
}

function Input({ className, onChange, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  const context = useSearchFieldContext('SearchField.Input')

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    context.onChange?.(event.target.value)
    onChange?.(event)
  }

  return (
    <input
      {...props}
      type="search"
      value={context.value}
      onChange={handleChange}
      className={clsx(
        'min-w-0 flex-1 border-0 bg-transparent px-0 text-sm text-foreground outline-none placeholder:text-default-400',
        '[&::-webkit-search-cancel-button]:appearance-none',
        className,
      )}
    />
  )
}

function ClearButton({ className, ...props }: HTMLAttributes<HTMLButtonElement>) {
  const context = useSearchFieldContext('SearchField.ClearButton')

  if (!context.value) {
    return null
  }

  return (
    <button
      {...props}
      type="button"
      aria-label="Clear search"
      onClick={() => context.onChange?.('')}
      className={clsx(
        'inline-flex h-5 w-5 items-center justify-center rounded-full text-default-400 transition-colors hover:bg-default-200/70 hover:text-foreground',
        className,
      )}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-3.5 w-3.5">
        <path d="M6 6l12 12M18 6L6 18" />
      </svg>
    </button>
  )
}

function SearchIcon({ className, ...props }: HTMLAttributes<SVGSVGElement>) {
  return (
    <svg
      {...props}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      aria-hidden="true"
      className={clsx('h-4 w-4 shrink-0 text-default-400', className)}
    >
      <circle cx="11" cy="11" r="6.5" />
      <path d="M16 16l4 4" />
    </svg>
  )
}

type SearchFieldComponent = typeof SearchFieldRoot & {
  Group: typeof Group
  Input: typeof Input
  ClearButton: typeof ClearButton
  SearchIcon: typeof SearchIcon
}

const SearchField = SearchFieldRoot as SearchFieldComponent

SearchField.Group = Group
SearchField.Input = Input
SearchField.ClearButton = ClearButton
SearchField.SearchIcon = SearchIcon

export default SearchField
