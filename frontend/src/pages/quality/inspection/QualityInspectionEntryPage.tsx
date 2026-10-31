import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, extractErrorMessage } from '../../../api/client'
import EcSlipShell from '../../../components/EcSlipShell'
import type { CommonCode, Item } from '../../../types/api'
import QualityInspectionForm from '../../../features/quality/components/QualityInspectionForm'

/**
 * 재고 II › 품질관리 › 품질검사 › <b>품질검사입력</b>(E040621) — 따로 된 입력 화면.
 *
 * <p>원본은 조회 화면의 창이 아니라 이 메뉴만의 입력 화면이다(품질검사요청입력 E040628 과 같은 꼴). 저장하면 이 화면에 빈 입력으로 남는다.
 * 폼은 품질검사조회의 수정 창과 같은 부품(features/quality/components/QualityInspectionForm)이다.
 * 예전에는 품질검사조회 화면이 입력 창을 열고 떴다.
 */
export default function QualityInspectionEntryPage() {
  const navigate = useNavigate()
  const [items, setItems] = useState<Item[]>([])
  const [defectTypes, setDefectTypes] = useState<CommonCode[]>([])
  const [error, setError] = useState('')

  useEffect(() => {
    /* 원본 [부적격관리]의 불량유형 — 공통코드 그룹 DEFECT_TYPE. */
    Promise.all([api.get<Item[]>('/items'), api.get<CommonCode[]>('/codes/DEFECT_TYPE')])
      .then(([i, d]) => { setItems(i.data); setDefectTypes(d.data) })
      .catch((err) => setError(extractErrorMessage(err)))
  }, [])

  return (
    <EcSlipShell title="품질검사입력">
      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
      <QualityInspectionForm editing={null} items={items} defectTypes={defectTypes}
                             onSaved={() => undefined}
                             extraButtons={<button className="ec-btn" onClick={() => navigate('/quality/inspection')}>리스트</button>} />
    </EcSlipShell>
  )
}
