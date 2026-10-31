import ApprovalListPage from './ApprovalListPage'

export default function ApprovalAllPage() {
  return (
    <ApprovalListPage
      title="기안서통합관리"
      scope="all"
      bottomActions={['인쇄', 'Excel']}
    />
  )
}
