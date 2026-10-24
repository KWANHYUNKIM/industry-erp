import { useEffect, useRef, useState } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import Modal from '../../components/Modal'
import CodePickerField from '../../components/CodePickerField'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import { ecAlert, ecConfirm } from '../../components/EcDialog'

export type CostLedgerMode = 'edit' | 'recalc'

interface Row {
  itemId: number; itemCode: string; itemName: string; spec: string | null; category: string | null; processName: string | null
  openingQty: number; openingAmount: number; increaseQty: number; increaseAmount: number
  decreaseQty: number; decreaseAmount: number | null; closingQty: number; closingAmount: number | null
}
interface Ledger { fromMonth: string; toMonth: string; rows: Row[] }
interface Detail {
  itemId: number; itemCode: string; itemName: string
  openingQty: number; openingAmount: number; purchaseQty: number; purchaseAmount: number
  productionQty: number; productionAmount: number; laborAmount: number; overheadAmount: number
  outsourcingQty: number; outsourcingAmount: number; adjustQty: number; adjustAmount: number
  decreaseQty: number; decreaseAmount: number | null; closingQty: number; closingAmount: number | null
}
interface Process { id: number; code: string; name: string }

/* 원본 원가계산내역: 수량은 정수(12,347), 금액은 원 단위, 0 은 빈 칸(A002 감소). 단가는 금액 ÷ 수량을 버림(338,089.35 → 338,089). */
const n0 = (v: number | null | undefined) => (v == null || v === 0 ? '' : v.toLocaleString('ko-KR', { maximumFractionDigits: 2 }))
const unit = (amount: number | null | undefined, qty: number) =>
  amount == null || amount === 0 || qty === 0 ? '' : Math.trunc(amount / qty).toLocaleString('ko-KR')
/* 원가수정 창 숫자: 수량 12,155.00 · 단가 338,089 · 금액 4,109,476,075 — 0 도 찍는다. */
const q2 = (v: number) => v.toLocaleString('ko-KR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const won = (v: number) => Math.round(v).toLocaleString('ko-KR')
const unitOf = (amount: number, qty: number) => (qty === 0 ? 0 : Math.trunc(amount / qty))
const ymText = (m: string) => m.replace('-', '/')
const nameSpec = (name: string, spec: string | null) => (spec ? `${name} [${spec}]` : name)
const AUTO = '자동계산'

/**
 * 원가생성/수정(E040802) 원가계산 [수정] · [기말금액재계산] — 2026-10-13 loginaa 실측.
 *
 * <p>둘 다 먼저 대상 창이 뜬다(제목 '원가수정' / '기말금액재계산', '대상 공정을 선택 바랍니다.', 대상 ◉전체 ○선택공정 →
 * 선택공정이면 공정 코드도움, [적용(F8)] · [닫기]). [적용] 하면 '원가계산내역' 창: 열 [품목코드 · 품목명[규격] · 품목구분 ·
 * 생산공정명 · 기초 · 증가 · 감소 · 기말](각 수량 · 단가 · 금액), 아래 [변경] · [닫기]. [기말금액재계산] 은 연 뒤가 아니라
 * 적용할 때 감소 · 기말 금액을 총평균으로 다시 낸다.
 *
 * <p>[변경] 은 체크한 줄의 '원가수정' 창을 연다 — 안 골랐으면 '리스트에 선택된 자료가 없습니다.' 를 알린다. 원가수정 창의 흰 칸
 * (고칠 수 있는 칸)은 기초 수량 · 단가, 생산입고 단가, 노무비 · 경비 금액, 외주비 단가, 조정/대체/반품 단가. 하나라도 고치면
 * 감소 · 기말의 단가 · 금액 칸이 '자동계산' 으로 바뀐다. 원본 [Excel] · 원가수정 [H] 는 없다(내려받기 · 이력 화면이 따로다).
 */
export default function CostLedgerModal({ periodId, mode, onClose }: { periodId: number; mode: CostLedgerMode; onClose: () => void }) {
  const [step, setStep] = useState<'target' | 'list'>('target')
  const [scope, setScope] = useState<'all' | 'process'>('all')
  const [processId, setProcessId] = useState('')
  const [processes, setProcesses] = useState<Process[]>([])
  const [ledger, setLedger] = useState<Ledger | null>(null)
  const [checked, setChecked] = useState<number[]>([])
  const [detail, setDetail] = useState<Detail | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    api.get<Process[]>('/processes').then((r) => setProcesses(r.data)).catch(() => setProcesses([]))
  }, [])

  const query = () => (scope === 'process' && processId ? `?processId=${processId}` : '')
  async function load() {
    const r = await api.get<Ledger>(`/cost-periods/${periodId}/ledger${query()}`)
    setLedger(r.data)
  }
  async function apply() {
    setError('')
    if (scope === 'process' && !processId) return setError('대상 공정을 선택 바랍니다.')
    try {
      if (mode === 'recalc') setLedger((await api.post<Ledger>(`/cost-periods/${periodId}/ledger/recalc${query()}`)).data)
      else await load()
      setChecked([]); setStep('list')
    } catch (err) { setError(extractErrorMessage(err)) }
  }
  async function openChange() {
    if (checked.length === 0) {
      void ecAlert('리스트에 선택된 자료가 없습니다.\n\n체크박스에 체크한 후 다시 시도 바랍니다.')
      return
    }
    setError('')
    try { setDetail((await api.get<Detail>(`/cost-periods/${periodId}/ledger/${checked[0]}`)).data) } catch (err) { setError(extractErrorMessage(err)) }
  }
  const tableRef = useRef<HTMLTableElement>(null)
  useTableColumnCheck(tableRef, '원가계산내역', [ledger?.rows.length, step, detail == null])
  const toggle = (id: number) => setChecked((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]))
  const rows = ledger?.rows ?? []
  const allOn = rows.length > 0 && checked.length === rows.length

  if (step === 'target') {
    const title = mode === 'edit' ? '원가수정' : '기말금액재계산'
    return (
      <Modal open title={title} width={760} error={error} onClose={onClose}>{(
        <div>
          <div className="font-bold mb-[8px]">{title}</div>
          <p className="text-ec-label mb-[6px]">› 대상 공정을 선택 바랍니다.</p>
          <div className="ec-form grid grid-cols-[110px_1fr] gap-y-[6px] items-center">
            <span className="text-ec-label">대상</span>
            <div>
              <div className="flex gap-[10px]">
                <label className="inline-flex items-center gap-[3px]">
                  <input type="radio" name="cost-ledger-scope" checked={scope === 'all'} onChange={() => setScope('all')} /> 전체
                </label>
                <label className="inline-flex items-center gap-[3px]">
                  <input type="radio" name="cost-ledger-scope" checked={scope === 'process'} onChange={() => setScope('process')} /> 선택공정
                </label>
              </div>
              {scope === 'process' && (
                <div className="mt-[4px]">
                  <CodePickerField label="대상" hideLabel width={420} placeholder="대상" emptyLabel="선택 해제"
                                   value={processId} onChange={setProcessId}
                                   items={processes.map((p) => ({ value: String(p.id), code: p.code, name: p.name }))} />
                </div>
              )}
            </div>
          </div>
          <div className="flex gap-[4px] mt-[10px]">
            <button type="button" className="ec-btn ec-btn-primary" onClick={() => void apply()}>적용(F8)</button>
            <button type="button" className="ec-btn" onClick={onClose}>닫기</button>
          </div>
        </div>
      )}</Modal>
    )
  }

  return (
    <>
      <Modal open={!detail} title="원가계산내역" width={1200} error={detail ? '' : error} onClose={onClose}>{(
        <div>
          <div className="flex items-end mb-[6px]">
            <div className="font-bold">원가계산내역</div>
            {ledger && <span className="ml-auto text-ec-label">{ymText(ledger.fromMonth)} ~{ymText(ledger.toMonth)}</span>}
          </div>
          <div className="overflow-x-auto">
            <table ref={tableRef} className="w-full text-left">
              <thead>
                <tr>
                  <th rowSpan={2} className="w-[34px] text-center">
                    <input type="checkbox" aria-label="전체 선택" checked={allOn} onChange={() => setChecked(allOn ? [] : rows.map((r) => r.itemId))} />
                  </th>
                  <th rowSpan={2} className="text-center">품목코드</th>
                  <th rowSpan={2} className="text-center">품목명[규격]</th>
                  <th rowSpan={2} className="text-center">품목구분</th>
                  <th rowSpan={2} className="text-center">생산공정명</th>
                  <th colSpan={3} className="text-center">기초</th>
                  <th colSpan={3} className="text-center">증가</th>
                  <th colSpan={3} className="text-center">감소</th>
                  <th colSpan={3} className="text-center">기말</th>
                </tr>
                <tr>
                  {['기초', '증가', '감소', '기말'].flatMap((g) => ['수량', '단가', '금액'].map((c) => <th key={g + c} className="text-center">{c}</th>))}
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr><td colSpan={17} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
                ) : rows.map((r, i) => (
                  <tr key={r.itemId}>
                    <td className="text-center">
                      <label className="inline-flex items-center gap-[3px]">
                        <input type="checkbox" aria-label={`${r.itemCode} 선택`} checked={checked.includes(r.itemId)} onChange={() => toggle(r.itemId)} />
                        <span className="text-ec-hint">{i + 1}</span>
                      </label>
                    </td>
                    <td><span className="ec-link">{r.itemCode}</span></td>
                    <td>{nameSpec(r.itemName, r.spec)}</td>
                    <td>{r.category ?? ''}</td>
                    <td>{r.processName ?? ''}</td>
                    <td className="text-right">{n0(r.openingQty)}</td>
                    <td className="text-right">{unit(r.openingAmount, r.openingQty)}</td>
                    <td className="text-right">{n0(r.openingAmount)}</td>
                    <td className="text-right">{n0(r.increaseQty)}</td>
                    <td className="text-right">{unit(r.increaseAmount, r.increaseQty)}</td>
                    <td className="text-right">{n0(r.increaseAmount)}</td>
                    <td className="text-right">{n0(r.decreaseQty)}</td>
                    <td className="text-right">{r.decreaseAmount == null ? AUTO : unit(r.decreaseAmount, r.decreaseQty)}</td>
                    <td className="text-right">{r.decreaseAmount == null ? AUTO : n0(r.decreaseAmount)}</td>
                    <td className="text-right">{n0(r.closingQty)}</td>
                    <td className="text-right">{r.closingAmount == null ? AUTO : unit(r.closingAmount, r.closingQty)}</td>
                    <td className="text-right">{r.closingAmount == null ? AUTO : n0(r.closingAmount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex gap-[4px] mt-[10px]">
            <button type="button" className="ec-btn ec-btn-primary" onClick={() => void openChange()}>변경</button>
            <button type="button" className="ec-btn" onClick={onClose}>닫기</button>
          </div>
        </div>
      )}</Modal>
      {detail && (
        <CostLedgerEdit periodId={periodId} detail={detail}
                        onClose={() => setDetail(null)}
                        onSaved={() => { setDetail(null); void load().catch((err) => setError(extractErrorMessage(err))) }} />
      )}
    </>
  )
}

/** 체크 → [변경] '원가수정' 창 — 원본 2026-10-13 실측 칸 배치(내역 · 수량 · 단가 · 금액). */
function CostLedgerEdit({ periodId, detail, onClose, onSaved }: { periodId: number; detail: Detail; onClose: () => void; onSaved: () => void }) {
  const d = detail
  const [f, setF] = useState({
    openingQty: String(d.openingQty), openingPrice: String(unitOf(d.openingAmount, d.openingQty)),
    productionPrice: String(unitOf(d.productionAmount, d.productionQty)),
    laborAmount: String(d.laborAmount), overheadAmount: String(d.overheadAmount),
    outsourcingPrice: String(unitOf(d.outsourcingAmount, d.outsourcingQty)),
    adjustPrice: String(unitOf(d.adjustAmount, d.adjustQty)),
  })
  const [dirty, setDirty] = useState(d.closingAmount == null)
  /** 손댄 칸만 보낸다 — 단가 칸은 버림한 값이라 그대로 보내면 금액이 몇 원씩 바뀐다(338,089.35 → 338,089). */
  const [touched, setTouched] = useState<(keyof typeof f)[]>([])
  const [error, setError] = useState('')
  const num = (v: string) => (v.trim() === '' ? 0 : Number(v.replace(/,/g, '')))
  const set = (k: keyof typeof f, v: string) => {
    setF((x) => ({ ...x, [k]: v })); setDirty(true)
    setTouched((t) => (t.includes(k) ? t : [...t, k]))
  }
  const sent = (k: keyof typeof f) => (touched.includes(k) ? num(f[k]) : null)
  const amt = (k: keyof typeof f, qty: number, stored: number) => (touched.includes(k) ? qty * num(f[k]) : stored)

  async function save() {
    setError('')
    const vals = Object.values(f)
    if (vals.some((v) => Number.isNaN(num(v)))) return setError('숫자를 확인하세요.')
    try {
      await api.put(`/cost-periods/${periodId}/ledger/${d.itemId}`, {
        openingQty: sent('openingQty'),
        // 기초 수량만 고쳐도 금액은 수량 × 단가로 다시 매긴다
        openingPrice: touched.includes('openingQty') ? num(f.openingPrice) : sent('openingPrice'),
        productionPrice: sent('productionPrice'),
        laborAmount: sent('laborAmount'), overheadAmount: sent('overheadAmount'),
        outsourcingPrice: sent('outsourcingPrice'), adjustPrice: sent('adjustPrice'),
      })
      onSaved()
    } catch (err) { setError(extractErrorMessage(err)) }
  }
  async function remove() {
    if (!(await ecConfirm('삭제한 데이터는 복구되지 않습니다.\n\n삭제하겠습니까?'))) return
    try { await api.delete(`/cost-periods/${periodId}/ledger/${d.itemId}`); onSaved() } catch (err) { setError(extractErrorMessage(err)) }
  }

  const cell = (k: keyof typeof f, label: string) => (
    <input className="ec-input w-full text-right" aria-label={label} value={f[k]} onChange={(e) => set(k, e.target.value)} />
  )
  const openingQty = num(f.openingQty)
  const openAmt = touched.includes('openingQty') || touched.includes('openingPrice') ? openingQty * num(f.openingPrice) : d.openingAmount
  const prodAmt = amt('productionPrice', d.productionQty, d.productionAmount)
  const outAmt = amt('outsourcingPrice', d.outsourcingQty, d.outsourcingAmount)
  const adjAmt = amt('adjustPrice', d.adjustQty, d.adjustAmount)

  return (
    <Modal open title="원가수정" width={900} error={error} onClose={onClose}>{(
      <div>
        <div className="font-bold mb-[8px]">원가수정</div>
        <div className="ec-form grid grid-cols-[110px_1fr] gap-y-[6px] items-center mb-[8px]">
          <span className="text-ec-label">품목코드</span><span>{d.itemCode}</span>
          <span className="text-ec-label">품목명</span><span>{d.itemName}</span>
        </div>
        <table className="w-full text-left">
          <thead>
            <tr><th colSpan={2}>내역</th><th className="text-right">수량</th><th className="text-right">단가</th><th className="text-right">금액</th></tr>
          </thead>
          <tbody>
            <tr>
              <td colSpan={2}>기초</td>
              <td className="text-right">{cell('openingQty', '기초 수량')}</td>
              <td className="text-right">{cell('openingPrice', '기초 단가')}</td>
              <td className="text-right">{won(openAmt)}</td>
            </tr>
            <tr>
              <td rowSpan={6}>증가</td>
              <td>구매</td>
              <td className="text-right">{q2(d.purchaseQty)}</td>
              <td className="text-right">{won(unitOf(d.purchaseAmount, d.purchaseQty))}</td>
              <td className="text-right">{won(d.purchaseAmount)}</td>
            </tr>
            <tr>
              <td>생산입고</td>
              <td className="text-right">{q2(d.productionQty)}</td>
              <td className="text-right">{cell('productionPrice', '생산입고 단가')}</td>
              <td className="text-right">{won(prodAmt)}</td>
            </tr>
            <tr>
              <td>노무비</td><td></td><td></td>
              <td className="text-right">{cell('laborAmount', '노무비 금액')}</td>
            </tr>
            <tr>
              <td>경비</td><td></td><td></td>
              <td className="text-right">{cell('overheadAmount', '경비 금액')}</td>
            </tr>
            <tr>
              <td>외주비</td>
              <td className="text-right">{q2(d.outsourcingQty)}</td>
              <td className="text-right">{cell('outsourcingPrice', '외주비 단가')}</td>
              <td className="text-right">{won(outAmt)}</td>
            </tr>
            <tr>
              <td>조정/대체/반품</td>
              <td className="text-right">{q2(d.adjustQty)}</td>
              <td className="text-right">{cell('adjustPrice', '조정/대체/반품 단가')}</td>
              <td className="text-right">{won(adjAmt)}</td>
            </tr>
            <tr>
              <td colSpan={2}>감소</td>
              <td className="text-right">{q2(d.decreaseQty)}</td>
              <td className="text-right">{dirty || d.decreaseAmount == null ? AUTO : won(unitOf(d.decreaseAmount, d.decreaseQty))}</td>
              <td className="text-right">{dirty || d.decreaseAmount == null ? AUTO : won(d.decreaseAmount)}</td>
            </tr>
            <tr>
              <td colSpan={2}>기말</td>
              <td className="text-right">{q2(openingQty + d.purchaseQty + d.productionQty + d.outsourcingQty + d.adjustQty - d.decreaseQty)}</td>
              <td className="text-right">{dirty || d.closingAmount == null ? AUTO : won(unitOf(d.closingAmount, d.closingQty))}</td>
              <td className="text-right">{dirty || d.closingAmount == null ? AUTO : won(d.closingAmount)}</td>
            </tr>
          </tbody>
        </table>
        <div className="flex gap-[4px] mt-[10px]">
          <button type="button" className="ec-btn ec-btn-primary" onClick={() => void save()}>저장(F8)</button>
          <button type="button" className="ec-btn" onClick={() => void remove()}>삭제</button>
          <button type="button" className="ec-btn" onClick={onClose}>닫기</button>
        </div>
      </div>
    )}</Modal>
  )
}
