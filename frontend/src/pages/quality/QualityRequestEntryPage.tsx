import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, extractErrorMessage } from '../../api/client'
import EcSlipShell from '../../components/EcSlipShell'
import type { Item } from '../../types/api'
import QualityRequestScreen from '../../features/quality/components/QualityRequestForm'

/**
 * 재고 II › 품질관리 › 품질검사요청 › <b>품질검사요청입력</b>(E040628) — 따로 된 입력 화면.
 *
 * <p>원본은 조회 화면의 창이 아니라 이 메뉴만의 입력 화면이다(머리 일자-No. · 담당자, 줄 셋, 단추 저장(F8) · 저장/전표(F7) ·
 * 다시 작성 · 리스트 · 웹자료올리기). 저장하면 이 화면에 빈 입력으로 남고, 아래에 'HH:MM 임시저장되었습니다.' 가 뜬다.
 * 폼은 품질검사요청조회의 수정 창과 같은 부품(features/quality/components/QualityRequestForm)이다.
 * [저장/전표(F7)] · [웹자료올리기] 는 두지 않는다(전표 · 바깥 자료).
 */
export default function QualityRequestEntryPage() {
  const navigate = useNavigate()
  const [items, setItems] = useState<Item[]>([])
  const [projects, setProjects] = useState<{ id: number; code: string; name: string }[]>([])
  const [error, setError] = useState('')
  const [savedAt, setSavedAt] = useState<string | undefined>()

  useEffect(() => {
    Promise.all([api.get<Item[]>('/items'), api.get<{ id: number; code: string; name: string }[]>('/projects')])
      .then(([i, pj]) => { setItems(i.data); setProjects(pj.data) })
      .catch((err) => setError(extractErrorMessage(err)))
  }, [])

  return (
    <EcSlipShell title="품질검사요청입력" savedAt={savedAt}>
      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
      <QualityRequestScreen editing={null} items={items} projects={projects}
                          onSaved={() => setSavedAt(`${new Date().toLocaleTimeString('ko-KR', { hour: 'numeric', minute: '2-digit' })} 임시저장되었습니다.`)}
                          extraButtons={<button className="ec-btn" onClick={() => navigate('/quality/inspection-request')}>리스트</button>} />
    </EcSlipShell>
  )
}
