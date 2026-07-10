import ModuleSideLayout from '../../components/ModuleSideLayout'

export default function ProductionLayout() {
  return (
    <ModuleSideLayout
      title="🏭 생산관리"
      tabs={[
        { to: '/production/planning', label: '생산계획(MPS)' },
        { to: '/production/mrp', label: '생산계획(MRP)리스트' },
        { to: '/production/bom', label: 'BOM(소요량)등록' },
        { to: '/production/process', label: '공정등록' },
        { to: '/production/resource', label: '자원등록' },
        { to: '/production/bor', label: '작업소요시간(BOR)' },
        { to: '/production/time-calc', label: '소요시간계산' },
        { to: '/production/work-orders', label: '작업지시' },
        { to: '/production/wo-status', label: '작업지시서현황' },
        { to: '/production/wo-progress', label: '작업지시서별진행현황' },
        { to: '/production/wo-efficiency', label: '작업지시서효율현황' },
        { to: '/production/issue', label: '생산불출' },
        { to: '/production/issue-status', label: '생산불출현황' },
        { to: '/production/work-result', label: '작업내역입력' },
        { to: '/production/work-result-status', label: '작업내역현황' },
        { to: '/production/result', label: '생산실적' },
        { to: '/production/receipt-bom', label: '생산입고 I(BOM기준소모)' },
        { to: '/production/receipt-manual', label: '생산입고 II(소모품목선택)' },
        { to: '/production/receipt-inquiry', label: '생산입고조회' },
        { to: '/production/receipt-status', label: '생산입고현황' },
        { to: '/production/consume-status', label: '생산입고 소모현황' },
      ]}
    />
  )
}
