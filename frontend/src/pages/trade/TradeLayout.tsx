import ModuleSideLayout from '../../components/ModuleSideLayout'

export default function TradeLayout() {
  return (
    <ModuleSideLayout
      title="🧾 판매/구매"
      tabs={[
        { to: '/sales/partners', label: '거래처등록' },
        { to: '/sales/orders', label: '오더관리(수주)' },
        { to: '/sales/order-types', label: '오더관리유형리스트' },
        { to: '/sales/order-stages', label: '오더관리진행단계' },
        { to: '/sales/sell', label: '판매입력' },
        { to: '/sales/sales-list', label: '판매조회' },
        { to: '/sales/sales-status', label: '판매현황' },
        { to: '/sales/sales-discount', label: '판매할인현황' },
        { to: '/sales/sales-price-bulk', label: '판매단가일괄변경' },
        { to: '/sales/partner-entry', label: '거래처중심입력' },
        { to: '/sales/statement', label: '거래명세서인쇄' },
        { to: '/sales/buy', label: '구매입력' },
        { to: '/sales/purchase-list', label: '구매조회' },
        { to: '/sales/purchase-status', label: '구매현황' },
        { to: '/sales/purchase-discount', label: '구매할인현황' },
        { to: '/sales/purchase-price-bulk', label: '구매단가일괄변경' },
        { to: '/sales/shipment-order', label: '출하지시서' },
        { to: '/sales/shipment', label: '출하현황' },
        { to: '/sales/unshipped', label: '미출하현황' },
        { to: '/sales/mall', label: '쇼핑몰관리' },
        { to: '/sales/export', label: '수출관리' },
        { to: '/sales/collection', label: '수금현황' },
        { to: '/sales/payment', label: '지급현황' },
        { to: '/sales/payment-history', label: '결제내역조회' },
        { to: '/sales/payment-compare', label: '결제내역자료비교' },
        { to: '/sales/settlement', label: '수금/지급' },
        { to: '/sales/ledger', label: '채권·채무현황' },
        { to: '/sales/partner-ledger', label: '거래처관리대장' },
        { to: '/sales/accounting-reflection', label: '회계반영/미반영' },
        { to: '/sales/outsourcing-discount', label: '외주비할인현황' },
      ]}
    />
  )
}
