import ModuleSideLayout from '../../components/ModuleSideLayout'

export default function InventoryLayout() {
  return (
    <ModuleSideLayout
      title="📦 재고관리"
      tabs={[
        { to: '/inventory/items', label: '품목등록' },
        { to: '/inventory/warehouses', label: '창고등록' },
        { to: '/inventory/manage-items', label: '관리항목등록' },
        { to: '/inventory/price-order', label: '단가적용순서설정' },
        { to: '/inventory/special-price-group', label: '거래처특별단가그룹' },
        { to: '/inventory/stock-io', label: '입출고' },
        { to: '/inventory/transfer', label: '기타이동' },
        { to: '/inventory/current', label: '재고현황' },
        { to: '/inventory/wms', label: 'WMS 로케이션' },
        { to: '/inventory/reports', label: '출력물' },
      ]}
    />
  )
}
