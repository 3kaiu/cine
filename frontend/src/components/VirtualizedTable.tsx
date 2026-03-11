import React, { useMemo, useCallback } from 'react';
import { useVirtualizer, VirtualItem } from '@tanstack/react-virtual';
import { Spinner, ListBox, Selection } from "@heroui/react";

/**
 * 基础列配置类型（由页面提供）
 */
export interface TableColumn<T> {
  key?: string;
  title: React.ReactNode;
  dataIndex?: string | string[] | number;
  width?: number;
  render?: (value: unknown, record: T, index: number) => React.ReactNode;
}

/**
 * 内部处理后的列配置
 */
interface InternalProcessedColumn<T> {
  key: string;
  title: React.ReactNode;
  dataIndex?: string | string[] | number;
  width?: number;
  render?: (value: unknown, record: T, index: number) => React.ReactNode;
  dataGetter?: (record: T) => unknown;
  flexValue: string;
  minWidth: number;
}

/**
 * 虚拟化行组件
 */
interface VirtualRowProps<T> {
  record: T;
  columns: InternalProcessedColumn<T>[];
  style: React.CSSProperties;
  index: number;
}

const VirtualRow = React.memo(<T extends { id: string }>({
  record,
  columns,
  style,
  index
}: VirtualRowProps<T>) => {
  return (
    <ListBox.Item
      key={record.id}
      id={record.id}
      textValue={record.id}
      className="p-0 border-b border-divider last:border-0 data-[hover=true]:bg-default-100 data-[selected=true]:bg-primary/5 transition-colors"
      style={style}
    >
      <div className="flex items-center h-full w-full">
        {columns.map((col) => {
          const value = col.dataGetter ? col.dataGetter(record) : undefined;
          const displayValue = col.render ? col.render(value, record, index) : (value as React.ReactNode);

          return (
            <div
              key={col.key}
              style={{
                flex: col.flexValue,
                minWidth: col.minWidth,
              }}
              className="px-4 text-sm text-foreground whitespace-nowrap overflow-hidden text-ellipsis"
            >
              {displayValue}
            </div>
          );
        })}
      </div>
    </ListBox.Item>
  );
});

VirtualRow.displayName = 'VirtualRow';

interface VirtualizedTableProps<T> {
  dataSource: T[]
  columns: TableColumn<T>[]
  height?: number
  rowHeight?: number
  loading?: boolean
  showPagination?: boolean
  rowKey?: string
  pagination?: unknown
  onSelectionChange?: (keys: Selection) => void
  selectedKeys?: Selection
  selectionMode?: "none" | "single" | "multiple"
}

// 数据访问函数编译器 - 将dataIndex路径预编译为函数
function compileDataGetter<T>(dataIndex?: string | string[] | number): ((record: T) => unknown) | undefined {
  if (dataIndex === undefined || dataIndex === null) return undefined;

  const path = Array.isArray(dataIndex) ? dataIndex : [dataIndex];

  if (path.length === 1) {
    const key = path[0] as keyof T;
    return (record: T) => record?.[key];
  } else if (path.length === 2) {
    const [key1, key2] = path;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (record: T) => (record?.[key1 as keyof T] as any)?.[key2];
  } else {
    return (record: T) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let value: any = record;
      for (const key of path) {
        if (value == null) return undefined;
        value = value[key];
      }
      return value;
    };
  }
}

export default function VirtualizedTable<T extends { id: string }>({
  dataSource = [],
  columns = [],
  height = 600,
  rowHeight = 52,
  loading,
  onSelectionChange,
  selectedKeys,
  selectionMode = "none",
}: VirtualizedTableProps<T>) {
  const parentRef = React.useRef<HTMLDivElement>(null);

  // 内部预计算列配置
  const processedColumns = useMemo<InternalProcessedColumn<T>[]>(() => {
    return columns.map((col, idx) => ({
      ...col,
      key: col.key || (typeof col.dataIndex === 'string' ? col.dataIndex : `col-${idx}`),
      dataGetter: compileDataGetter<T>(col.dataIndex),
      flexValue: col.width ? `0 0 ${col.width}px` : '1 1 0',
      minWidth: col.width || 120,
    }));
  }, [columns]);

  const headerContent = useMemo(() => (
    <div className="flex border-b border-divider sticky top-0 z-20 bg-surface text-xs font-medium text-muted shrink-0">
      {processedColumns.map((col) => (
        <div
          key={col.key}
          style={{
            flex: col.flexValue,
            minWidth: col.minWidth,
          }}
          className="px-4 py-3"
        >
          {col.title}
        </div>
      ))}
    </div>
  ), [processedColumns]);

  const rowVirtualizer = useVirtualizer({
    count: dataSource.length,
    getScrollElement: () => parentRef.current,
    estimateSize: useCallback(() => rowHeight, [rowHeight]),
    overscan: 10,
  });

  const renderVirtualRow = useCallback((virtualRow: VirtualItem) => {
    const record = dataSource[virtualRow.index];
    if (!record) return null;

    return (
      <VirtualRow
        key={virtualRow.key}
        record={record}
        // @ts-expect-error - Internal generic variance mismatch
        columns={processedColumns}
        index={virtualRow.index}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: `${virtualRow.size}px`,
          transform: `translateY(${virtualRow.start}px)`,
        }}
      />
    );
  }, [dataSource, processedColumns]);

  if (loading) {
    return (
      <div className="flex justify-center p-12">
        <Spinner size="lg" color="accent" />
      </div>
    )
  }

  return (
    <div className="flex flex-col overflow-hidden h-full">
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
            {rowVirtualizer.getVirtualItems().map(renderVirtualRow)}
          </ListBox>
        </div>
      </div>
    </div>
  );
}
