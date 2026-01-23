import React, { useMemo, useCallback } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Spinner, ListBox } from "@heroui/react";

// 预计算的列配置类型
interface ProcessedColumn {
  key: string;
  title: React.ReactNode;
  dataIndex?: string | string[];
  width?: number;
  render?: (value: any, record: any, index: number) => React.ReactNode;
  // 预编译的数据访问函数
  dataGetter?: (record: any) => any;
  // 预计算的flex值
  flexValue: string;
  minWidth: number;
}

// 虚拟化行组件 - 使用React.memo优化重渲染
interface VirtualRowProps<T> {
  record: T;
  columns: ProcessedColumn[];
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
          // 使用预计算的数据访问函数
          const value = col.dataGetter ? col.dataGetter(record) : undefined;
          const displayValue = col.render ? col.render(value, record, index) : value;

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

// 数据访问函数编译器 - 将dataIndex路径预编译为函数
function compileDataGetter(dataIndex?: string | string[]): ((record: any) => any) | undefined {
  if (!dataIndex) return undefined;

  const path = Array.isArray(dataIndex) ? dataIndex : [dataIndex];

  if (path.length === 1) {
    // 优化单层访问
    const key = path[0];
    return (record: any) => record?.[key];
  } else if (path.length === 2) {
    // 优化双层访问
    const [key1, key2] = path;
    return (record: any) => record?.[key1]?.[key2];
  } else {
    // 多层访问
    return (record: any) => {
      let value = record;
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

  // 预计算列配置 - 只在columns改变时重新计算
  const processedColumns = useMemo<ProcessedColumn[]>(() => {
    return columns.map((col, index) => ({
      key: col.key || `col-${index}`,
      title: typeof col.title === 'function' ? col.title({}) : col.title,
      dataIndex: col.dataIndex,
      width: col.width,
      render: col.render,
      dataGetter: compileDataGetter(col.dataIndex),
      flexValue: col.width ? `0 0 ${col.width}px` : '1 1 0',
      minWidth: col.width || 120,
    }));
  }, [columns]);

  // 预计算表头 - 只在processedColumns改变时重新计算
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

  // 渲染单个虚拟行
  const renderVirtualRow = useCallback((virtualRow: any) => {
    const record = dataSource[virtualRow.index];
    if (!record) return null;

    return (
      <VirtualRow
        key={virtualRow.key}
        record={record}
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
