import { useNavigate } from 'react-router-dom'
import EcSlipShell from '../../components/EcSlipShell'
import { useShipmentEntry } from '../../features/shipment/useShipmentEntry'

/**
 * 재고 I › 영업관리 › 출하 › 출하입력(E040225) — 2026-10-21 재고1 출하 바퀴.
 *
 * <p>원본은 창이 아니라 화면(제목 '출하입력'). 아래 단추 저장(F8) · 저장/전표(F7) · 다시 작성 · 리스트 · 웹자료올리기 —
 * 우리는 저장(F8) · 다시 작성 · 리스트(저장/전표 · 웹자료올리기는 그 기능이 없다). 저장하면 <b>말 없이 빈 폼</b>.
 */
export default function ShipmentEntryPage() {
  const navigate = useNavigate()
  const entry = useShipmentEntry(null)
  return (
    <EcSlipShell
      title="출하입력"
      actions={[
        { label: '저장(F8)', primary: true, disabled: entry.busy, onClick: () => { void entry.save().then((ok) => { if (ok) entry.reset() }) } },
        { label: '다시 작성', onClick: entry.reset },
        { label: '리스트', onClick: () => navigate('/sales/shipment-inquiry') },
      ]}
    >
      {entry.form}
    </EcSlipShell>
  )
}
