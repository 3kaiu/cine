import React from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Spinner, ListBox, Surface } from "@heroui/react";

interface VirtualizedTableProps<T> {
  dataSource: T[]
  columns: any[]
  height?: number
  rowHeight?: number
  loading?: boolean
  showPagination?: boolean
  rowKey?: string
  pagination?: any
  onSelectionChange?: (keys: any) => void
  selectedKeys?: any
  selectionMode?: "none" | "single" | "multiple"
}

export default function VirtualizedTable<T extends { id: string }>({
  dataSource = [],
  columns = [],
  height = 600,
  rowHeight = 52, // Standardizing on a slightly larger height for premium feel
  loading,
  onSelectionChange,
  selectedKeys,
  selectionMode = "none",
}: VirtualizedTableProps<T>) {
  const parentRef = React.useRef<HTMLDivElement>(null);

  const rowVirtualizer = useVirtualizer({
    count: dataSource.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => rowHeight,
    overscan: 10,
  });

  if (loading) {
    return (
      <div className="flex justify-center p-12">
        <Spinner size="lg" color="accent" />
      </div>
    )
  }

  // Small dataset or specific threshold can still use this premium virtualized view
  // for consistency, but we keep the threshold logic if needed.

  const headerContent = (
    <div className="flex border-b border-divider/10 bg-default-100/30 backdrop-blur-md sticky top-0 z-20 font-bold text-default-400 text-[10px] uppercase tracking-widest shrink-0 shadow-sm">
      {columns.map((col, index) => (
        <div
          key={index}
          style={{
            flex: col.width ? `0 0 ${col.width}px` : '1 1 0',
            minWidth: (col.width as number) || 120,
          }}
          className="px-6 py-4"
        >
          {typeof col.title === 'function' ? col.title({}) : col.title}
        </div>
      ))}
    </div>
  );

  return (
    <Surface className="flex flex-col border border-divider/10 rounded-2xl overflow-hidden bg-background/5 shadow-none h-full">
      {headerContent}
      <div
        ref={parentRef}
        className="overflow-auto relative scrollbar-hide"
        style={{ height: `${height}px` }}
      >
        <div
          style={{
            height: `${rowVirtualizer.getTotalSize()}px`,
            width: '100%',
            position: 'relative',
          }}
        >
          <ListBox
            aria-label="Virtualized List"
            selectionMode={selectionMode}
            selectedKeys={selectedKeys}
            onSelectionChange={onSelectionChange}
            variant="default"
            className="p-0 gap-0"
          >
            {rowVirtualizer.getVirtualItems().map((virtualRow) => {
              const record = dataSource[virtualRow.index];
              return (
                <ListBox.Item
                  key={virtualRow.key}
                  id={record.id}
                  textValue={record.id}
                  className="p-0 border-b border-divider/5 last:border-0 data-[hover=true]:bg-default-100/50 data-[selected=true]:bg-primary/5 transition-all duration-200"
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: `${virtualRow.size}px`,
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                >
                  <div className="flex items-center h-full w-full">
                    {columns.map((col, colIndex) => {
                      let value = null;
                      if (col.dataIndex) {
                        const path = Array.isArray(col.dataIndex) ? col.dataIndex : [col.dataIndex];
                        value = path.reduce((obj: any, key: string) => obj && obj[key], record);
                      }

                      const displayValue = col.render ? col.render(value, record, virtualRow.index) : value;

                      return (
                        <div
                          key={colIndex}
                          style={{
                            flex: col.width ? `0 0 ${col.width}px` : '1 1 0',
                            minWidth: (col.width as number) || 120,
                          }}
                          className="px-6 text-[13px] font-medium text-foreground/80 whitespace-nowrap overflow-hidden text-ellipsis"
                        >
                          {displayValue}
                        </div>
                      );
                    })}
                  </div>
                </ListBox.Item>
              );
            })}
          </ListBox>
        </div>
      </div>
    </Surface>
  );
}
