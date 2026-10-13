import { useNavigate } from 'react-router-dom'
import EcListShell from '../../components/EcListShell'
import AssignmentSlipForm from '../../features/assignment/components/AssignmentSlipForm'

/** 관리 &gt; 인사관리 &gt; 인사발령 &gt; <b>인사발령입력</b> (원본 E020721 '인사발령입력등록'). 격자는 AssignmentSlipForm. */
export default function AssignmentInputPage() {
  const nav = useNavigate()
  return (
    <EcListShell title="인사발령입력등록" searchable={false}>
      <AssignmentSlipForm onClose={() => nav('/hr/assignments')} />
    </EcListShell>
  )
}
