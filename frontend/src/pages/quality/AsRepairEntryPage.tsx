import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, extractErrorMessage } from '../../api/client'
import EcSlipShell from '../../components/EcSlipShell'
import type { Item, Partner, Warehouse } from '../../types/api'
import { useRequired } from '../../utils/useRequired'
import AsRepairScreen, { asRepairBody, asRepairCheck, blankRepairDraft, blankRepairLines, type AsRepairDraft, type AsReqPick, type RepairFormLine } from '../../features/as/AsRepairForm'

/**
 * 재고 II › A/S관리 › A/S수리 › <b>A/S수리입력</b>(E040605) — 메뉴에서 여는 입력 화면.
 *
 * <p>원본은 A/S수리조회의 창이 아니라 메뉴에 따로 있는 화면이다(사이트맵 차례 입력 · 조회 · 현황 · 소모현황).
 * 버튼줄 저장(F8) · 저장/전표(F7) · 다시 작성 · 리스트 · 웹자료올리기. 저장하면 빈 입력으로 돌아가고 [담당자] · [창고]만 남는다.
 * [리스트]는 A/S수리조회로 간다(2026-10-13 loginaa 실측 — 거래처 없는 접수 26/10/11-1 을 불러와 거래처 없이 저장됨).
 */
export default function AsRepairEntryPage() {
  const navigate = useNavigate()
  const [partners, setPartners] = useState<Partner[]>([])
  const [items, setItems] = useState<Item[]>([])
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [asReqs, setAsReqs] = useState<AsReqPick[]>([])
  const [f, setF] = useState<AsRepairDraft>(blankRepairDraft())
  const [lines, setLines] = useState<RepairFormLine[]>(blankRepairLines())
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const req = useRequired()

  useEffect(() => {
    Promise.all([
      api.get<Partner[]>('/partners'), api.get<Item[]>('/items'),
      api.get<Warehouse[]>('/warehouses'), api.get<AsReqPick[]>('/as-requests'),
    ]).then(([p, i, w, a]) => { setPartners(p.data); setItems(i.data); setWarehouses(w.data); setAsReqs(a.data) })
      .catch((err) => setError(extractErrorMessage(err)))
  }, [])

  function reset() {
    req.reset()
    setF((x) => blankRepairDraft(x))
    setLines(blankRepairLines()); setError('')
  }

  async function submit(e?: FormEvent) {
    e?.preventDefault()
    if (saving) return
    if (!req.check(asRepairCheck(f, lines))) return
    const built = asRepairBody(f, lines)
    if ('error' in built) return setError(built.error)
    setSaving(true); setError('')
    try {
      await api.post('/as-repairs', built.body)
      reset()   /* 원본은 저장하면 빈 입력 화면으로 돌아가고 [담당자] · [창고]를 남긴다. */
    } catch (err) { setError(extractErrorMessage(err)) } finally { setSaving(false) }
  }

  return (
    <form onSubmit={submit} className="flex flex-col min-h-full">
      <EcSlipShell
        title="A/S수리입력"
        actions={[
          { label: saving ? '저장 중…' : '저장(F8)', primary: true, submit: true, disabled: saving },
          { label: '다시 작성', onClick: () => reset() },
          { label: '리스트', onClick: () => navigate('/quality/as-repair-list') },
        ]}
      >
        {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
        <AsRepairScreen f={f} setF={setF} lines={lines} setLines={setLines} editing={false}
                        partners={partners} warehouses={warehouses} items={items} asReqs={asReqs} req={req} />
      </EcSlipShell>
    </form>
  )
}
