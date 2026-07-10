import ApprovalListPage from './ApprovalListPage'

export default function MyApprovalPage() {
  return (
    <ApprovalListPage
      title="내결재관리"
      scope="mine"
      bottomActions={['인쇄', 'Excel']}
    />
  )
}
