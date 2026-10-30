import { useEffect, useMemo, useState } from 'react'
import { api, extractErrorMessage } from '../../../api/client'
import CodePickerField from '../../../components/CodePickerField'
import Modal from '../../../components/Modal'
import { ecConfirm } from '../../../components/EcDialog'
import EcHistoryButton from '../../../components/EcHistory'
import { ymd } from '../../../components/EcPeriodPicks'
import type { CondPickers } from '../../../utils/useCondPickers'
import { useShortcut } from '../../../utils/useShortcut'
import { LOT_ADJUST, lotShownQty } from '../../../utils/lotQty'
import type { Lot, LotTransaction } from '../../../types/api'
import EcDateInput from '../../../components/ui/EcDateInput'

/*
 * 원본 '시리얼/로트No.내역입력' [전표구분] 후보 — 차례 그대로(2026-10-12 실측, 기본 견적).
 * 로트 재고 방향은 서버(LotService.MANUAL_DOC_SIGN)가 정한다.
 */
const DOC_TYPES = ['견적', '주문', '판매', '출하지시', '출하', '발주', '구매', '생산입고', '생산소모', 'A/S접수', 'A/S수리',
  '창고이동', '생산불출', '자가사용', '불량-품목대체(불량품목)', '불량-품목대체(정상품목)', '불량-정상사용', '불량-폐기',
  '품질검사요청', '품질검사', 'Invoice/Packing List'] as const
interface TxForm {
  txDate: string; docType: string; warehouseId: string; itemId: string; quantity: string; lotNo: string
  partnerId: string; mgmtId: string; chargeName: string; projectId: string; note: string
}
const emptyForm = (): TxForm => ({ txDate: ymd(new Date()), docType: '견적', warehouseId: '', itemId: '', quantity: '', lotNo: '',
  partnerId: '', mgmtId: '', chargeName: '', projectId: '', note: '' })

type Pickers = Pick<CondPickers, 'items' | 'warehouses' | 'partners' | 'projects' | 'employees'>

/**
 * 원본 '시리얼/로트No.내역입력' 창 — 시리얼/로트No.내역조회(E040618)의 [신규(F2)] 와,
 * 시리얼/로트No.재고조정(E040634) [보기] 창(같은 내역조회가 그 로트로 열린 것)의 [신규(F2)] 가 같은 창을 연다(2026-10-14 실측 —
 * 재고조정에서 열어도 품목 · 시리얼/로트No. 가 비어 있다).
 *
 * <p>빈 저장은 [창고 · 품목코드 · 수량 · 시리얼/로트No.] 가 빨개진다. 저장하면 창이 닫히고 목록에 그 줄(연결전표 없음)이 생긴다.
 * 구매 3 → 그 로트 재고 +3, 판매 3 → −3, 견적 → 그대로. 손으로 넣은 줄을 누르면 같은 창이 수정으로 열리고
 * [일자] · [전표구분] 이 잠긴다. [삭제] 는 '전표를 삭제하겠습니까?'.
 *
 * @param editing 수정할 줄(없으면 신규)
 * @param siblings 이전 · 다음으로 넘길 손입력 줄(목록 차례)
 */
export default function LotTxEntryModal({ open, editing, siblings = [], pickers, onClose, onSaved, onEdit }: {
  open: boolean
  editing: LotTransaction | null
  siblings?: LotTransaction[]
  pickers: Pickers
  onClose: () => void
  /** 저장 · 삭제 뒤 — 목록을 다시 읽는다. */
  onSaved: () => void
  /** 이전 · 다음 — 그 줄로 다시 연다. */
  onEdit?: (r: LotTransaction) => void
}) {
  const [f, setF] = useState<TxForm>(emptyForm())
  const [tried, setTried] = useState(false)
  const [formError, setFormError] = useState('')
  const [lots, setLots] = useState<Lot[]>([])
  const [mgmts, setMgmts] = useState<{ id: number; code: string; name: string }[]>([])

  useEffect(() => {
    if (!open) return
    setTried(false); setFormError('')
    void api.get<Lot[]>('/lots').then((r) => setLots(r.data)).catch(() => {})
    void api.get<{ id: number; code: string; name: string }[]>('/management-items').then((r) => setMgmts(r.data)).catch(() => {})
    if (!editing) { setF(emptyForm()); return }
    const r = editing
    setF({
      txDate: r.txDate, docType: r.docType ?? '견적', warehouseId: r.txWarehouseId ? String(r.txWarehouseId) : '',
      itemId: String(r.itemId), quantity: String(lotShownQty(r)), lotNo: r.lotNo,
      partnerId: String(pickers.partners.find((p) => p.name === r.partnerName)?.value ?? ''),
      mgmtId: '', chargeName: r.chargeName ?? '', projectId: r.projectId ? String(r.projectId) : '', note: r.note ?? '',
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing])

  /* 원본 코드도움은 시리얼/로트No. 만 보인다 — 예전엔 이름 칸에 'QA재고2-L02 (0.00)' 처럼 재고를 붙였다. */
  const lotPicks = useMemo(() => lots.filter((l) => !f.itemId || String(l.itemId) === f.itemId)
    .map((l) => ({ value: l.lotNo, code: l.lotNo, name: l.lotNo })), [lots, f.itemId])
  const missing = (v: string) => tried && !v

  async function saveTx() {
    setTried(true); setFormError('')
    /* 재고조정 줄은 창고 없이 생긴다(원본 수정 창도 창고가 빈 채) — 창고는 그 밖의 줄만 필수. */
    if ((!f.warehouseId && f.docType !== LOT_ADJUST) || !f.itemId || !f.quantity || !f.lotNo) return
    const partner = pickers.partners.find((p) => String(p.value) === f.partnerId)
    const mgmt = mgmts.find((m) => String(m.id) === f.mgmtId)
    const body = {
      txDate: f.txDate, docType: f.docType, warehouseId: f.warehouseId ? Number(f.warehouseId) : undefined, itemId: Number(f.itemId),
      quantity: Number(f.quantity), lotNo: f.lotNo, partnerName: partner?.name, mgmtName: mgmt?.name ?? (editing?.mgmtName ?? undefined),
      chargeName: f.chargeName || undefined, projectId: f.projectId ? Number(f.projectId) : undefined, note: f.note || undefined,
    }
    try {
      if (editing) await api.put(`/lots/transactions/${editing.id}`, body)
      else await api.post('/lots/transactions', body)
      onClose()
      onSaved()
    } catch (e) { setFormError(extractErrorMessage(e)) }
  }
  useShortcut('F8', saveTx, open)

  async function remove() {
    if (!editing || !(await ecConfirm('전표를 삭제하겠습니까?\n- 시리얼/로트No.내역입력'))) return
    try {
      await api.post('/lots/transactions/delete', { ids: [editing.id] })
      onClose()
      onSaved()
    } catch (e) { setFormError(extractErrorMessage(e)) }
  }

  const at = editing ? siblings.findIndex((r) => r.id === editing.id) : -1
  return (
    <Modal open={open} width={640} title="시리얼/로트No.내역입력" error={formError} onClose={onClose}>
      <ul className="ec-form">
        <li><div className="title">일자</div><div className="form">
          <EcDateInput className="ec-input w-[150px]" value={f.txDate} disabled={!!editing} onChange={(e) => setF((x) => ({ ...x, txDate: e.target.value }))} />
        </div></li>
        <li><div className="title">전표구분</div><div className="form">
          <select className="ec-input w-full" aria-label="전표구분" value={f.docType} disabled={!!editing}
                  onChange={(e) => setF((x) => ({ ...x, docType: e.target.value }))}>
            {DOC_TYPES.map((d) => <option key={d} value={d}>{d}</option>)}
            {editing?.docType === LOT_ADJUST && <option value={LOT_ADJUST}>{LOT_ADJUST}</option>}
          </select>
        </div></li>
        <li><div className="title">창고</div><div className={`form${missing(f.warehouseId) && f.docType !== LOT_ADJUST ? ' [&_input]:border-ec-danger' : ''}`}>
          <CodePickerField label="창고" hideLabel fill pair value={f.warehouseId} items={pickers.warehouses}
                           onChange={(v) => setF((x) => ({ ...x, warehouseId: v }))} />
        </div></li>
        <li><div className="title">품목코드</div><div className={`form${missing(f.itemId) ? ' [&_input]:border-ec-danger' : ''}`}>
          <CodePickerField label="품목코드" hideLabel fill pair value={f.itemId} items={pickers.items}
                           onChange={(v) => setF((x) => ({ ...x, itemId: v, lotNo: v === x.itemId ? x.lotNo : '' }))} />
        </div></li>
        <li><div className="title">수량</div><div className="form">
          <input className={`ec-input w-full text-right${missing(f.quantity) ? ' border-ec-danger' : ''}`} aria-label="수량" inputMode="decimal"
                 value={f.quantity} onChange={(e) => setF((x) => ({ ...x, quantity: e.target.value }))} />
        </div></li>
        <li><div className="title">시리얼/로트No.</div><div className={`form${missing(f.lotNo) ? ' [&_input]:border-ec-danger' : ''}`}>
          <CodePickerField label="시리얼/로트No." hideLabel fill pair value={f.lotNo} items={lotPicks}
                           onChange={(v) => setF((x) => ({ ...x, lotNo: v }))} />
        </div></li>
        <li><div className="title">거래처</div><div className="form">
          <CodePickerField label="거래처" hideLabel fill pair value={f.partnerId} items={pickers.partners}
                           onChange={(v) => setF((x) => ({ ...x, partnerId: v }))} />
        </div></li>
        <li><div className="title">관리항목</div><div className="form">
          <CodePickerField label="관리항목" hideLabel fill pair value={f.mgmtId}
                           items={mgmts.map((m) => ({ value: String(m.id), code: m.code, name: m.name }))}
                           onChange={(v) => setF((x) => ({ ...x, mgmtId: v }))} />
        </div></li>
        <li><div className="title">담당자</div><div className="form">
          <CodePickerField label="담당자" hideLabel fill pair value={f.chargeName} items={pickers.employees}
                           onChange={(v) => setF((x) => ({ ...x, chargeName: v }))} />
        </div></li>
        <li><div className="title">프로젝트</div><div className="form">
          <CodePickerField label="프로젝트" hideLabel fill pair value={f.projectId} items={pickers.projects}
                           onChange={(v) => setF((x) => ({ ...x, projectId: v }))} />
        </div></li>
        <li><div className="title">적요</div><div className="form">
          <input className="ec-input w-full" aria-label="적요" placeholder="적요" value={f.note}
                 onChange={(e) => setF((x) => ({ ...x, note: e.target.value }))} />
        </div></li>
      </ul>
      <div className="flex gap-[4px] mt-[9px]">
        <button className="ec-btn ec-btn-primary" onClick={() => void saveTx()}>저장(F8)</button>
        {/* 원본 수정 창: 저장(F8) · 이전 · 다음 · 닫기 · 삭제 · H(2026-10-14 실측). 이전 · 다음은 목록에서 앞 · 뒤 손입력 줄을 같은 창에 연다. [H] 는 그 줄의 이력 — 서버가 같은 줄을 고쳐 id 가 그대로라 이어진다. */}
        {editing && onEdit && (<>
          <button className="ec-btn" disabled={at <= 0} onClick={() => onEdit(siblings[at - 1])}>이전</button>
          <button className="ec-btn" disabled={at < 0 || at >= siblings.length - 1} onClick={() => onEdit(siblings[at + 1])}>다음</button>
        </>)}
        {!editing && <button className="ec-btn" onClick={() => { setF(emptyForm()); setTried(false) }}>다시 작성</button>}
        <button className="ec-btn" onClick={onClose}>닫기</button>
        {editing && <button className="ec-btn" onClick={() => void remove()}>삭제</button>}
        <EcHistoryButton target="LOT_TX" id={editing?.id} last />
      </div>
    </Modal>
  )
}
