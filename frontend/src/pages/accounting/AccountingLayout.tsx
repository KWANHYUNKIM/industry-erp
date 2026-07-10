import ModuleSideLayout from '../../components/ModuleSideLayout'

export default function AccountingLayout() {
  return (
    <ModuleSideLayout
      title="💰 회계/원가"
      tabs={[
        { to: '/accounting/accounts', label: '계정과목등록' },
        { to: '/accounting/profit', label: '손익요약' },
        { to: '/accounting/item-cost', label: '원가·이익' },
        { to: '/accounting/cost-build', label: '원가생성/수정' },
        { to: '/accounting/standard-cost', label: '표준원가현황' },
        { to: '/accounting/actual-cost', label: '실제원가현황' },
        { to: '/accounting/variance', label: '원가차이분석' },
        { to: '/accounting/monthly-profit', label: '월별이익현황' },
        { to: '/accounting/daily-profit', label: '일별이익현황' },
        { to: '/accounting/vat', label: '매입매출·부가세' },
        { to: '/accounting/expense', label: '비용관리' },
        { to: '/accounting/expense-detail', label: '비용내역현황' },
      ]}
    />
  )
}
