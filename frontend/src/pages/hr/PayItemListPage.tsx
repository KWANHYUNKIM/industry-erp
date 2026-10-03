import { useEffect, useRef, useState } from 'react'
import EcListShell from '../../components/EcListShell'
import { api, extractErrorMessage } from '../../api/client'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import type { PayItem, PayMethod, PayTaxFreeType, PayslipLineKind } from '../../types/api'

const TAX_FREE: [PayTaxFreeType, string][] = [
  ['NONE', '전액과세'], ['NIGHT_WORK', '야간근로수당'], ['CHILDCARE', '보육수당'], ['MEAL', '식대'], ['VEHICLE', '차량유지비'],
]
const METHODS: [PayMethod, string][] = [
  ['FIXED', '고정'], ['DAILY', '변동(일)'], ['HOURLY', '변동(시간)'], ['RATE', '변동(지급률)'], ['MANUAL', '변동(직접입력)'],
]
/** 원본은 목록 끝에 빈 줄 세 개를 두고 거기 적으면 새 항목이 된다. */
const BLANK_ROWS = 3

interface Row {
  id: number | null
  code: string
  name: string
  sortOrder: string
  rate: string
  taxFreeType: PayTaxFreeType
  payMethod: PayMethod
  calcNote: string
  active: boolean
  defaultAmount: number
  dirty: boolean
}

const toRow = (i: PayItem): Row => ({
  id: i.id, code: i.code, name: i.name,
  sortOrder: String(i.sortOrder ?? ''), rate: i.rate == null ? '' : String(i.rate),
  taxFreeType: i.taxFreeType, payMethod: i.payMethod, calcNote: i.calcNote ?? '',
  active: i.active, defaultAmount: i.defaultAmount, dirty: false,
})
const blank = (): Row => ({
  id: null, code: '', name: '', sortOrder: '', rate: '', taxFreeType: 'NONE', payMethod: 'FIXED',
  calcNote: '', active: true, defaultAmount: 0, dirty: false,
})

/**
 * 관리 &gt; 급여관리 &gt; 기본사항등록 &gt; <b>수당항목등록</b> (원본 E090103, 화면 제목 '수당리스트').
 *
 * <p>2026-10-03 loginaa 실측. 조회 조건 없이 열자마자 격자가 뜨고, <b>격자 칸을 바로 고친 뒤
 * [저장(F8)] 한 번으로</b> 전부 저장한다. 끝의 빈 줄에 적으면 새 항목이 된다.
 * 열: 수당항목코드 · 수당항목명 · 표시순서 · 배율 · 비과세유형 · 지급유형 · 계산식 · 산출방법.
 * 지급유형 드롭다운: 고정 · 변동(일) · 변동(시간) · 변동(지급률) · 변동(직접입력).
 * 버튼줄: 저장(F8) · 사용중단/재사용(▲ 사용중단 · 삭제 · 재사용) · 사용중단포함 · 웹자료올리기 · H.
 * 저장하면 표시순서로 다시 정렬되고 안내는 없다. 수당항목명 · 표시순서가 비면 그 칸이 빨갛게 막힌다.
 *
 * <p>[계산식]은 그리지 않았다 — 원본은 항목마다 사용시점별 계산식(예: R( 기본급(급여지급사항) , 0 ))을
 * 따로 두고 급여계산이 그것을 푼다. 우리 급여계산은 그룹 금액을 그대로 더하므로 계산식을 담을 자리가 없다.
 * 웹자료올리기 · H(이력)도 없다.
 */
export default function PayItemListPage({ kind = 'ALLOWANCE' }: { kind?: PayslipLineKind }) {
  const word = kind === 'ALLOWANCE' ? '수당' : '공제'
  const [rows, setRows] = useState<Row[]>([])
  const [error, setError] = useState('')
  const [includeInactive, setIncludeInactive] = useState(false)
  const [checked, setChecked] = useState<Set<number>>(new Set())
  const tableRef = useRef<HTMLTableElement>(null)
  useTableColumnCheck(tableRef, `${word}리스트`, [rows, includeInactive])

  function load() {
    setError('')
    api.get<PayItem[]>('/pay-settings/items')
      .then((r) => {
        const mine = r.data.filter((i) => i.kind === kind)
        setRows([...mine.map(toRow), ...Array.from({ length: BLANK_ROWS }, blank)])
      })
      .catch((e) => setError(extractErrorMessage(e)))
  }

  useEffect(() => { load() }, [kind])

  function edit(idx: number, patch: Partial<Row>) {
    setRows((rs) => rs.map((r, i) => (i === idx ? { ...r, ...patch, dirty: true } : r)))
  }

  const body = (r: Row) => ({
    code: r.code.trim(), name: r.name.trim(), kind,
    taxable: r.taxFreeType === 'NONE', defaultAmount: r.defaultAmount, active: r.active,
    sortOrder: r.sortOrder === '' ? 0 : Number(r.sortOrder),
    rate: r.rate === '' ? null : Number(r.rate),
    taxFreeType: kind === 'ALLOWANCE' ? r.taxFreeType : null,
    payMethod: r.payMethod,
    calcNote: r.calcNote.trim() || null,
  })

  async function save() {
    setError('')
    const todo = rows.filter((r) => r.dirty && (r.id || r.code.trim() || r.name.trim()))
    for (const r of todo) {
      if (!r.code.trim()) { setError(`${word}항목코드를 입력 바랍니다.`); return }
      if (!r.name.trim()) { setError(`${word}항목명을 입력 바랍니다.`); return }
      if (r.sortOrder === '') { setError('표시순서를 입력 바랍니다.'); return }
    }
    try {
      for (const r of todo) {
        if (r.id) await api.put(`/pay-settings/items/${r.id}`, body(r))
        else await api.post('/pay-settings/items', body(r))
      }
      // 원본은 저장해도 안내 없이 표시순서로 다시 그린다
      load()
    } catch (e) {
      setError(extractErrorMessage(e))
      load()
    }
  }

  /**
   * 원본 [사용중단/재사용 ▲] — 펼치면 <b>사용중단 · 삭제 · 재사용</b>. 고른 줄에 대고 한다.
   * 삭제는 '삭제하겠습니까?' 를 묻는다. 급여 그룹이 물고 있는 항목은 서버(FK)가 막는다.
   */
  const [menuOpen, setMenuOpen] = useState(false)
  async function applyToChecked(op: '사용중단' | '삭제' | '재사용') {
    setMenuOpen(false)
    const targets = rows.filter((r) => r.id && checked.has(r.id))
    if (op === '삭제' && !window.confirm('삭제하겠습니까?')) return
    try {
      for (const r of targets) {
        if (op === '삭제') await api.delete(`/pay-settings/items/${r.id}`)
        else await api.put(`/pay-settings/items/${r.id}`, body({ ...r, active: op === '재사용' }))
      }
    } catch (e) {
      setError(extractErrorMessage(e))
    }
    setChecked(new Set())
    load()
  }

  const shown = rows
    .map((r, idx) => ({ r, idx }))
    .filter(({ r }) => r.id == null || includeInactive || r.active)

  return (
    <EcListShell
      title={`${word}리스트`}
      searchable={false}
      actions={[
        { label: '저장(F8)', onClick: save, primary: true },
        { label: '사용중단/재사용 ▲', onClick: () => setMenuOpen((v) => !v), disabled: checked.size === 0 },
        { label: includeInactive ? '사용중단제외' : '사용중단포함', onClick: () => setIncludeInactive((v) => !v) },
      ]}
    >
      {menuOpen && (
        <>
          <div className="ec-backdrop-clear" onClick={() => setMenuOpen(false)} />
          <div className="ec-menu fixed top-auto right-auto bottom-[44px] left-[300px] mobile:left-[16px]">
            {(['사용중단', '삭제', '재사용'] as const).map((op) => (
              <button key={op} type="button" onClick={() => applyToChecked(op)}>{op}</button>
            ))}
          </div>
        </>
      )}
      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}

      <table ref={tableRef} className="w-full text-left">
        <thead>
          <tr>
            <th className="w-[34px]"></th>
            <th className="w-[34px]"></th>
            <th className="w-[130px]">{word}항목코드</th>
            <th className="w-[180px]">{word}항목명</th>
            <th className="w-[80px] text-right">표시순서</th>
            <th className="w-[70px] text-right">배율</th>
            <th className="w-[120px]">비과세유형</th>
            <th className="w-[130px]">지급유형</th>
            <th>산출방법</th>
          </tr>
        </thead>
        <tbody>
          {shown.map(({ r, idx }, n) => (
            <tr key={r.id ?? `new-${idx}`} className={r.active ? undefined : 'text-ec-hint'}>
              <td className="text-center text-ec-hint">{n + 1}</td>
              <td className="text-center">
                {r.id != null && (
                  <input type="checkbox" checked={checked.has(r.id)}
                         onChange={() => {
                           const next = new Set(checked)
                           if (next.has(r.id!)) next.delete(r.id!); else next.add(r.id!)
                           setChecked(next)
                         }} />
                )}
              </td>
              <td>
                {r.id != null
                  ? r.code
                  : <input className="ec-input w-full" value={r.code} onChange={(e) => edit(idx, { code: e.target.value })} />}
              </td>
              <td><input className="ec-input w-full" value={r.name} onChange={(e) => edit(idx, { name: e.target.value })} /></td>
              <td>
                <input className="ec-input w-full text-right" inputMode="numeric" value={r.sortOrder}
                       onChange={(e) => edit(idx, { sortOrder: e.target.value.replace(/[^0-9]/g, '') })} />
              </td>
              <td>
                <input className="ec-input w-full text-right" inputMode="decimal" value={r.rate}
                       onChange={(e) => edit(idx, { rate: e.target.value.replace(/[^0-9.]/g, '') })} />
              </td>
              <td>
                {kind === 'ALLOWANCE' ? (
                  <select className="ec-input w-full" value={r.taxFreeType}
                          onChange={(e) => edit(idx, { taxFreeType: e.target.value as PayTaxFreeType })}>
                    {TAX_FREE.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                ) : null}
              </td>
              <td>
                <select className="ec-input w-full" value={r.payMethod}
                        onChange={(e) => edit(idx, { payMethod: e.target.value as PayMethod })}>
                  {METHODS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </td>
              <td><input className="ec-input w-full" value={r.calcNote} onChange={(e) => edit(idx, { calcNote: e.target.value })} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </EcListShell>
  )
}
