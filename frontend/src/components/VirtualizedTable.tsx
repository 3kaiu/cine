import { FixedSizeList as List } from 'react-window'
import { Table, Spin } from 'antd'
import type { TableProps } from 'antd/es/table'

interface VirtualizedTableProps<T> extends Omit<TableProps<T>, 'components' | 'pagination'> {
  height?: number
  rowHeight?: number
  threshold?: number // 超过此数量才使用虚拟滚动
  showPagination?: boolean // 是否显示分页（虚拟滚动时通常不显示）
}

/**
 * 虚拟滚动表格组件
 * 用于优化大列表渲染性能
 */
export default function VirtualizedTable<T extends { id: string }>({
  dataSource = [],
  columns = [],
  height = 600,
  rowHeight = 50,
  threshold = 100,
  loading,
  showPagination = false,
  ...rest
}: VirtualizedTableProps<T>) {
  // 如果数据量小于阈值，使用普通表格
  if (dataSource.length < threshold) {
    return <Table 
      dataSource={dataSource} 
      columns={columns} 
      rowKey="id" 
      loading={loading}
      pagination={showPagination ? rest.pagination : false}
      {...rest} 
    />
  }

  if (loading) {
    return <Spin size="large" style={{ display: 'block', textAlign: 'center', padding: '50px' }} />
  }

  // 大列表使用虚拟滚动
  const Row = ({ index, style }: { index: number; style: React.CSSProperties }) => {
    const record = dataSource[index]
    return (
      <div style={style} className="virtual-table-row">
        {columns.map((col, colIndex) => {
          const value = col.dataIndex
            ? (record as any)[Array.isArray(col.dataIndex) ? col.dataIndex.join('.') : col.dataIndex]
            : null
          const displayValue = col.render ? col.render(value, record, index) : value

          return (
            <div
              key={colIndex}
              style={{
                display: 'inline-block',
                width: (col.width as number) || 200,
                padding: '8px',
                borderBottom: '1px solid #f0f0f0',
              }}
            >
              {displayValue}
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <div style={{ border: '1px solid #d9d9d9', borderRadius: '4px', overflow: 'hidden' }}>
      <div 
        className="virtual-table-header" 
        style={{ 
          display: 'flex', 
          borderBottom: '2px solid #f0f0f0',
          backgroundColor: '#fafafa',
          position: 'sticky',
          top: 0,
          zIndex: 1,
        }}
      >
        {columns.map((col, index) => (
          <div
            key={index}
            style={{
              flex: col.width ? `0 0 ${col.width}px` : '1 1 auto',
              minWidth: (col.width as number) || 200,
              padding: '12px',
              fontWeight: 600,
              fontSize: '14px',
            }}
          >
            {col.title}
          </div>
        ))}
      </div>
      <List
        height={height}
        itemCount={dataSource.length}
        itemSize={rowHeight}
        width="100%"
      >
        {Row}
      </List>
    </div>
  )
}
