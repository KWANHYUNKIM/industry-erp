import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, extractErrorMessage } from '../../../api/client'
import EcSlipShell from '../../../components/EcSlipShell'
import type { Item, Partner, Warehouse } from '../../../types/api'
import AsReceiptScreen from '../../../features/as/AsReceiptForm'
import { useRequired } from '../../../utils/useRequired'
import { asReceiptBody, asReceiptCheck, blankAsDraft, emptyAsLines, type AsFormLine, type AsReceiptDraft } from '../../../features/as/AsReceiptForm'

/**
 * 재고 II › A/S관리 › A/S접수 › <b>A/S접수입력</b>(E040601) — 메뉴에서 여는 입력 화면.
 *
 * <p>원본은 A/S접수조회의 창이 아니라 메뉴에 따로 있는 화면이다(사이트맵 차례 입력 · 조회 · 현황).
 * 버튼줄 저장(F8) · 저장/전표(F7) · 다시 작성 · 리스트 · 웹자료올리기. 저장하면 글 없이 빈 입력 화면으로
 * 돌아가고 [창고]만 남는다. [리스트]는 A/S접수조회로 간다(2026-10-13 loginaa 실측).
 * 접수는 재고를 움직이지 않는다 — 부품 · 수리비는 A/S수리의 판매연결전표에서 판매로 잡는다.
 */
export default function AsReceiptEntryPage() {
  const navigate = useNavigate()
  const [partners, setPartners] = useState<Partner[]>([])
  const [items, setItems] = useState<Item[]>([])
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [projects, setProjects] = useState<{ id: number; code: string; name: string }[]>([])
  const [f, setF] = useState<AsReceiptDraft>(blankAsDraft())
  const [lines, setLines] = useState<AsFormLine[]>(emptyAsLines())
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const req = useRequired()

  useEffect(() => {
    Promise.all([
      api.get<Partner[]>('/partners'), api.get<Item[]>('/items'),
      api.get<Warehouse[]>('/warehouses'), api.get<{ id: number; code: string; name: string }[]>('/projects'),
    ]).then(([p, i, w, pj]) => { setPartners(p.data); setItems(i.data); setWarehouses(w.data); setProjects(pj.data) })
      .catch((err) => setError(extractErrorMessage(err)))
  }, [])

  function reset(keepWarehouse = false) {
    req.reset()
    setF((x) => blankAsDraft(keepWarehouse ? x.warehouseId : ''))
    setLines(emptyAsLines()); setError('')
  }

  async function submit(e?: FormEvent) {
    e?.preventDefault()
    if (saving) return
    if (!req.check(asReceiptCheck(f, lines))) return   /* 원본: 글 없이 빈 칸을 한꺼번에 빨갛게 */
    const built = asReceiptBody(f, lines)
    if ('error' in built) return setError(built.error)
    setSaving(true); setError('')
    try {
      await api.post('/as-requests', { ...built.body, receiptDate: f.receiptDate })
      reset(true)   /* 원본은 저장하면 빈 입력 화면으로 돌아가고 [창고]를 남긴다. */
    } catch (err) { setError(extractErrorMessage(err)) } finally { setSaving(false) }
  }

  return (
    <form onSubmit={submit} className="flex flex-col min-h-full">
      <EcSlipShell
        title="A/S접수입력"
        actions={[
          { label: saving ? '저장 중…' : '저장(F8)', primary: true, submit: true, disabled: saving },
          { label: '저장/전표(F7)', onClick: () => undefined },
          { label: '다시 작성', onClick: () => reset() },
          { label: '리스트', onClick: () => navigate('/quality/as') },
        ]}
      >
        {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
        <AsReceiptScreen f={f} setF={setF} lines={lines} setLines={setLines} editing={false} req={req}
                         partners={partners} warehouses={warehouses} projects={projects} items={items} />
      </EcSlipShell>
    </form>
  )
}
