import * as ReactWindow from 'react-window'
const FixedSizeList = (ReactWindow as any).FixedSizeList
import { Spinner, Table, TableHeader, TableColumn, TableBody, TableRow, TableCell, getKeyValue } from "@heroui/react";
import clsx from 'clsx';

// Helper to render column title
const renderTitle = (title: any, props: any) => {
  if (typeof title === 'function') {
    return title(props)
  }
  return title
}

interface VirtualizedTableProps<T> {
  dataSource: T[]
  columns: any[]
  height?: number
  rowHeight?: number
  threshold?: number
  loading?: boolean
  showPagination?: boolean
  rowKey?: string
  pagination?: any
}

export default function VirtualizedTable<T extends { id: string }>({
  dataSource = [],
  columns = [],
  height = 600,
  rowHeight = 50,
  threshold = 100,
  loading,
}: VirtualizedTableProps<T>) {
  if (loading) {
    return (
      <div className="flex justify-center p-12">
        <Spinner size="lg" />
      </div>
    )
  }

  // Small dataset: Use HeroUI Table for better aesthetics
  if (dataSource.length < threshold) {
    return (
      <Table aria-label="Media Files" classNames={{ wrapper: "min-h-[222px]" }}>
        <TableHeader columns={columns}>
          {(column) => (
            <TableColumn key={column.key} width={column.width}>
              {renderTitle(column.title, {})}
            </TableColumn>
          )}
        </TableHeader>
        <TableBody items={dataSource}>
          {(item) => (
            <TableRow key={(item as any).id}>
              {(columnKey) => {
                const col = columns.find(c => c.key === columnKey);
                let cellValue = getKeyValue(item, columnKey);

                // Handle dataIndex path resolution (e.g. video_info.resolution)
                if (col.dataIndex) {
                  const path = Array.isArray(col.dataIndex) ? col.dataIndex : [col.dataIndex];
                  cellValue = path.reduce((obj: any, key: string) => obj && obj[key], item);
                }

                return (
                  <TableCell>
                    {col.render ? col.render(cellValue, item) : cellValue}
                  </TableCell>
                );
              }}
            </TableRow>
          )}
        </TableBody>
      </Table>
    );
  }

  // Large dataset: Custom Virtualized View
  const Row = ({ index, style }: { index: number; style: React.CSSProperties }) => {
    const record = dataSource[index]
    return (
      <div style={{ ...style }} className={clsx("flex items-center border-b border-divider hover:bg-default-100 transition-colors px-2")}>
        {columns.map((col, colIndex) => {
          let value = null;
          if (col.dataIndex) {
            const path = Array.isArray(col.dataIndex) ? col.dataIndex : [col.dataIndex];
            value = path.reduce((obj: any, key: string) => obj && obj[key], record);
          }

          const displayValue = col.render ? col.render(value, record, index) : value

          return (
            <div
              key={colIndex}
              style={{
                flex: col.width ? `0 0 ${col.width}px` : '1 1 0',
                minWidth: (col.width as number) || 100,
              }}
              className="px-4 text-sm whitespace-nowrap overflow-hidden text-ellipsis"
            >
              {displayValue}
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <div className="border border-divider rounded-large overflow-hidden bg-content1">
      <div className="flex border-b border-divider bg-default-100/50 backdrop-blur-sm sticky top-0 z-10 font-semibold text-foreground/70 text-sm">
        {columns.map((col, index) => (
          <div
            key={index}
            style={{
              flex: col.width ? `0 0 ${col.width}px` : '1 1 0',
              minWidth: (col.width as number) || 100,
            }}
            className="p-3"
          >
            {renderTitle(col.title, {})}
          </div>
        ))}
      </div>
      <FixedSizeList
        height={height}
        itemCount={dataSource.length}
        itemSize={rowHeight}
        width="100%"
      >
        {Row}
      </FixedSizeList>
    </div>
  )
}
