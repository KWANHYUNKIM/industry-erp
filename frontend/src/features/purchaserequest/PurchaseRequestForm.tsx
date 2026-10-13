import { useEffect, useMemo, useState } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import Modal from '../../components/Modal'
import CodePickerField from '../../components/CodePickerField'
import EcNumInput from '../../components/EcNumInput'
import { useCondPickers } from '../../utils/useCondPickers'
import { partnerCodeItems } from '../../utils/codeItems'
import { lineSupply, roundWon } from '../../utils/lineSupply'
import { dateNo } from '../../utils/dateNo'
import type { Currency, Item, Partner, PurchaseOrder, PurchaseOrderLine } from '../../types/api'

/** 서버 줄 응답은 줄 거래처도 싣는다(OrderLineResponse.partnerId · partnerName) — 공용 타입에 없어 여기서만 넓힌다. */
type RequestLine = PurchaseOrderLine & { partnerId?: number | null; partnerName?: string | null }
interface LineForm { itemId: string; partnerId: string; quantity: string; unitPrice: string }
const emptyLine = (): LineForm => ({ itemId: '', partnerId: '', quantity: '', unitPrice: '' })
const won = (n: number) => Math.round(n).toLocaleString('ko-KR')
const today = () => new Date().toLocaleDateString('sv-SE')
/** 원본 격자는 빈 줄 셋으로 열린다(신규 2026-10-13 실측). 고칠 때는 담긴 줄 뒤에 한 줄을 더 둔다. */
const MIN_ROWS = 3

/**
 * 재고 I &gt; 구매관리 &gt; 발주요청 &gt; <b>발주요청입력</b> 창 — 발주요청조회의 [신규(F2)] 와 [발주요청일자] 를 누르면 뜬다
 * (2026-10-13 loginaa E040315 실측).
 *
 * <p>발주서입력과 <b>모양이 다르다</b>: 거래처가 머리가 아니라 <b>줄마다</b> 있다(품목코드 · 품목명 · 거래처코드 · 거래처명 · 규격 ·
 * 수량 · 단가 · 공급가액 · 부가세 · 합계). 품목을 고르면 품목의 구매처 · 규격 · 구매단가가 채워진다(A002 → 최고전자 · 1EA · 299,000).
 * 머리: 일자-No. · 담당자 / 거래유형(부가세율 적용) · 창고 / 프로젝트 · 통화(내자) / 납기일자(오늘).
 *
 * <p>막는 것: 줄이 없으면 '그리드(표)에 최소 1줄 이상 입력되어야 합니다.', 창고가 비면 문구 없이 그 칸만 빨갛게.
 * 저장하면 창이 닫히고 목록 맨 위에 선다. 고칠 때는 일자가 잠기고 [복사] · [이전] · [다음] · [삭제] 가 붙는다
 * — 삭제는 '전표를 삭제하겠습니까?\n- 발주요청'.
 *
 * <p>우리 발주요청은 발주서(REQUESTED)와 같은 자료다. 머리 매입처는 첫 줄의 거래처로 둔다.
 */
export default function PurchaseRequestForm({ editing, onClose, onSaved, onDeleted, onCopy, onStep }: {
  /** 고칠 발주요청. null 이면 신규. */
  editing: PurchaseOrder | null
  onClose: () => void
  onSaved: () => void
  onDeleted: () => void
  /** [복사] — 같은 내용을 신규 창으로(일자 · 납기 오늘). */
  onCopy: (src: PurchaseOrder) => void
  /** [이전](+1, 목록 아래) · [다음](-1, 목록 위). */
  onStep: (dir: 1 | -1) => void
}) {
  const pickers = useCondPickers(['warehouses', 'projects', 'employees'])
  const [items, setItems] = useState<Item[]>([])
  const [partners, setPartners] = useState<Partner[]>([])
  const [currencies, setCurrencies] = useState<Currency[]>([])
  useEffect(() => {
    api.get<Item[]>('/items').then((r) => setItems(r.data)).catch(() => {})
    api.get<Partner[]>('/partners').then((r) => setPartners(r.data.filter((p) => p.type !== 'CUSTOMER'))).catch(() => {})
    api.get<Currency[]>('/currencies').then((r) => setCurrencies(r.data)).catch(() => {})
  }, [])

  const isEdit = editing != null && editing.id > 0
  const [orderDate, setOrderDate] = useState(editing?.orderDate ?? today())
  const [dueDate, setDueDate] = useState(editing?.dueDate ?? today())
  const [employeeId, setEmployeeId] = useState(editing?.employeeId ? String(editing.employeeId) : '')
  const [warehouseId, setWarehouseId] = useState(editing?.warehouseId ? String(editing.warehouseId) : '')
  const [projectId, setProjectId] = useState(editing?.projectId ? String(editing.projectId) : '')
  const [currency, setCurrency] = useState(editing?.currency ?? 'KRW')
  const [taxable, setTaxable] = useState(editing?.taxable ?? true)
  const [whMissing, setWhMissing] = useState(false)
  const [lines, setLines] = useState<LineForm[]>(() => {
    const got = ((editing?.lines ?? []) as RequestLine[]).map((l) => ({
      itemId: String(l.itemId),
      partnerId: String(l.partnerId ?? editing?.partnerId ?? ''),
      quantity: String(l.quantity),
      unitPrice: String(l.unitPrice),
    }))
    return [...got, ...Array.from({ length: Math.max(1, MIN_ROWS - got.length) }, emptyLine)]
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const itemOf = (id: string) => items.find((x) => String(x.id) === id)
  const partnerOf = (id: string) => partners.find((x) => String(x.id) === id)
  const itemPicks = useMemo(() => items.map((x) => ({ value: String(x.id), code: x.code, name: x.name, sub: x.spec })), [items])
  const partnerPicks = useMemo(() => partnerCodeItems(partners).map((p, i) => ({ ...p, value: String(partners[i].id) })), [partners])

  function setLine(i: number, patch: Partial<LineForm>) {
    setLines((ls) => {
      const next = ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l))
      /* 마지막 줄을 채우면 빈 줄을 하나 더 단다 — 원본 격자처럼 줄이 모자라지 않게. */
      return next[next.length - 1].itemId ? [...next, emptyLine()] : next
    })
  }
  /** 원본: 품목을 고르면 품목의 구매처 · 구매단가가 따라온다(A002 → 1234567001 최고전자 · 299,000). */
  function pickItem(i: number, itemId: string) {
    const it = itemOf(itemId)
    const pp = it?.purchasePrice ?? 0
    setLine(i, {
      itemId,
      partnerId: it?.supplierId ? String(it.supplierId) : lines[i].partnerId,
      unitPrice: pp > 0 ? String(pp) : '',
    })
  }

  const filled = lines.filter((l) => l.itemId)
  const calc = lines.map((l) => {
    const supply = lineSupply(Number(l.quantity) || 0, Number(l.unitPrice) || 0)
    const vat = taxable ? roundWon(supply * 0.1) : 0
    return { supply, vat, total: supply + vat }
  })
  const sum = (k: 'supply' | 'vat' | 'total') => calc.reduce((a, c) => a + c[k], 0)
  const qtySum = lines.reduce((a, l) => a + (Number(l.quantity) || 0), 0)

  async function save() {
    setError('')
    if (filled.length === 0) {
      alert('아래의 경우 처리가 불가능합니다.\n자세한 내용은 아래의 사항을 참고하시기 바랍니다.\n아래 사항을 수정 후 다시 진행하시기 바랍니다.\n\n발주요청입력 - 그리드(표)에 최소 1줄 이상 입력되어야 합니다.')
      return
    }
    /* 원본: 창고가 비면 문구 없이 그 칸만 빨갛게 두르고 저장하지 않는다. */
    if (!warehouseId) { setWhMissing(true); return }
    const body = {
      partnerId: filled.find((l) => l.partnerId)?.partnerId ? Number(filled.find((l) => l.partnerId)!.partnerId) : null,
      orderDate,
      dueDate: dueDate || null,
      taxable,
      employeeId: employeeId ? Number(employeeId) : null,
      warehouseId: Number(warehouseId),
      projectId: projectId ? Number(projectId) : null,
      currency,
      remark: editing?.remark ?? null,
      lines: filled.map((l) => ({
        itemId: Number(l.itemId),
        quantity: Number(l.quantity) || 0,
        unitPrice: l.unitPrice === '' ? null : Number(l.unitPrice),
        partnerId: l.partnerId ? Number(l.partnerId) : null,
      })),
    }
    setSaving(true)
    try {
      if (isEdit) await api.put(`/purchase-orders/${editing!.id}`, body)
      else await api.post('/purchase-orders', body)
      onSaved()
    } catch (e) {
      setError(extractErrorMessage(e))
    } finally {
      setSaving(false)
    }
  }

  async function remove() {
    if (!isEdit) return
    if (!confirm('전표를 삭제하겠습니까?\n- 발주요청')) return
    try {
      await api.delete(`/purchase-orders/${editing!.id}`)
      onDeleted()
    } catch (e) {
      setError(extractErrorMessage(e))
    }
  }

  const reset = () => {
    setOrderDate(today()); setDueDate(today()); setEmployeeId(''); setWarehouseId(''); setProjectId('')
    setCurrency('KRW'); setTaxable(true); setWhMissing(false); setLines(Array.from({ length: MIN_ROWS }, emptyLine)); setError('')
  }

  return (
    <Modal open title={isEdit ? '발주요청입력(수정)' : '발주요청입력'} width={1040} onClose={onClose} error={error}>
      <div className="ec-form mb-[8px] grid grid-cols-2 gap-x-[24px] gap-y-[6px] mobile:grid-cols-1">
        <label className="flex items-center gap-[8px]">
          <span className="w-[93px] shrink-0 text-ec-label">일자-No.</span>
          <input type="date" className="ec-input w-[150px]" value={orderDate} onChange={(e) => setOrderDate(e.target.value)}
            /* 원본 수정 창도 일자를 잠근다 — 번호가 일자에 묶여 있다. */
            disabled={isEdit} />
          {isEdit && <span className="text-ec-hint">{dateNo(editing!.orderDate, editing!.orderNo)}</span>}
        </label>
        <div className="flex items-center gap-[8px]">
          <span className="w-[93px] shrink-0 text-ec-label">담당자</span>
          <CodePickerField label="담당자" hideLabel width={240} emptyLabel="선택 안 함" placeholder="담당자"
            value={employeeId} onChange={setEmployeeId}
            items={pickers.employees.map((x) => ({ ...x, value: String(x.id) }))} />
        </div>
        <label className="flex items-center gap-[8px]">
          <span className="w-[93px] shrink-0 text-ec-label">거래유형</span>
          <select className="ec-input w-[240px]" value={taxable ? 'VAT' : 'FREE'} onChange={(e) => setTaxable(e.target.value === 'VAT')}>
            <option value="VAT">부가세율 적용</option>
            <option value="FREE">부가세율 미적용</option>
          </select>
        </label>
        <div className="flex items-center gap-[8px]">
          <span className="w-[93px] shrink-0 text-ec-label">창고</span>
          <div className={`inline-block${whMissing ? ' rounded-ec outline outline-1 outline-ec-danger' : ''}`} data-invalid={whMissing || undefined}>
            <CodePickerField label="창고" hideLabel width={240} emptyLabel="선택 안 함" placeholder="창고"
              value={warehouseId} onChange={(v) => { setWarehouseId(v); if (v) setWhMissing(false) }}
              items={pickers.warehouses} />
          </div>
        </div>
        <div className="flex items-center gap-[8px]">
          <span className="w-[93px] shrink-0 text-ec-label">프로젝트</span>
          <CodePickerField label="프로젝트" hideLabel width={240} emptyLabel="선택 안 함" placeholder="프로젝트"
            value={projectId} onChange={setProjectId} items={pickers.projects} />
        </div>
        <label className="flex items-center gap-[8px]">
          <span className="w-[93px] shrink-0 text-ec-label">통화</span>
          <select className="ec-input w-[240px]" value={currency} onChange={(e) => setCurrency(e.target.value)}>
            <option value="KRW">내자</option>
            {currencies.filter((c) => c.code !== 'KRW').map((c) => <option key={c.id} value={c.code}>{c.code} {c.name}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-[8px]">
          <span className="w-[93px] shrink-0 text-ec-label">납기일자</span>
          <input type="date" className="ec-input w-[150px]" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </label>
      </div>

      <table className="w-full text-left table-fixed">
        <thead>
          <tr>
            <th className="w-[34px]"></th>
            <th className="w-[150px]">품목코드</th>
            <th>품목명</th>
            <th className="w-[150px]">거래처코드</th>
            <th>거래처명</th>
            <th className="w-[70px]">규격</th>
            <th className="w-[80px] text-right">수량</th>
            <th className="w-[100px] text-right">단가</th>
            <th className="w-[100px] text-right">공급가액</th>
            <th className="w-[80px] text-right">부가세</th>
            <th className="w-[100px] text-right">합계</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l, i) => (
            <tr key={i}>
              <td className="text-center text-ec-hint">{i + 1}</td>
              <td>
                <CodePickerField label="품목" hideLabel fill placeholder="품목코드" emptyLabel="선택 해제"
                  value={l.itemId} onChange={(v) => pickItem(i, v)} items={itemPicks} />
              </td>
              <td>{itemOf(l.itemId)?.name ?? ''}</td>
              <td>
                <CodePickerField label="거래처" hideLabel fill placeholder="거래처코드" emptyLabel="선택 해제"
                  value={l.partnerId} onChange={(v) => setLine(i, { partnerId: v })} items={partnerPicks} />
              </td>
              <td>{partnerOf(l.partnerId)?.name ?? ''}</td>
              <td>{itemOf(l.itemId)?.spec ?? ''}</td>
              <td><EcNumInput className="ec-input w-full text-right" value={l.quantity} onValue={(v) => setLine(i, { quantity: v })} /></td>
              <td><EcNumInput className="ec-input w-full text-right" value={l.unitPrice} onValue={(v) => setLine(i, { unitPrice: v })} /></td>
              <td className="text-right">{l.itemId ? won(calc[i].supply) : ''}</td>
              <td className="text-right">{l.itemId ? won(calc[i].vat) : ''}</td>
              <td className="text-right">{l.itemId ? won(calc[i].total) : ''}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="font-bold bg-ec-page">
            <td colSpan={6}></td>
            <td className="text-right">{qtySum.toLocaleString('ko-KR')}</td>
            <td></td>
            <td className="text-right">{won(sum('supply'))}</td>
            <td className="text-right">{won(sum('vat'))}</td>
            <td className="text-right">{won(sum('total'))}</td>
          </tr>
        </tfoot>
      </table>

      {/* 원본 단추줄 — 신규: 저장(F8) · 저장/전표(F7) · 다시 작성 · 닫기 / 수정: 저장(F8) · 저장/전표(F7) · 복사 · 이전 · 다음 · 닫기 · 삭제 · 보내기 · H */}
      <div className="mt-[10px] flex flex-wrap items-center gap-[4px]">
        <button type="button" className="ec-btn ec-btn-primary" disabled={saving} onClick={save}>{saving ? '저장 중…' : '저장(F8)'}</button>
        {isEdit ? <>
          <button type="button" className="ec-btn" onClick={() => onCopy(editing!)}>복사</button>
          <button type="button" className="ec-btn" onClick={() => onStep(1)}>이전</button>
          <button type="button" className="ec-btn" onClick={() => onStep(-1)}>다음</button>
          <button type="button" className="ec-btn" onClick={onClose}>닫기</button>
          <button type="button" className="ec-btn" onClick={remove}>삭제</button>
        </> : <>
          <button type="button" className="ec-btn" onClick={reset}>다시 작성</button>
          <button type="button" className="ec-btn" onClick={onClose}>닫기</button>
        </>}
      </div>
    </Modal>
  )
}
