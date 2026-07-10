import ModuleSideLayout from '../../components/ModuleSideLayout'

export default function HrLayout() {
  return (
    <ModuleSideLayout
      title="🧑‍💼 근태/인사"
      tabs={[
        { to: '/hr/attendance-input', label: '근태입력' },
        { to: '/hr/attendance-list', label: '근태조회' },
        { to: '/hr/attendance-status', label: '근태현황' },
        { to: '/hr/vacation-use', label: '휴가사용실적현황' },
        { to: '/hr/vacation-remain', label: '휴가잔여일수현황' },
      ]}
    />
  )
}
