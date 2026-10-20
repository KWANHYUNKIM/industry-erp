import { useCallback, useEffect, useRef, useState } from 'react'
import EcListShell from '../../components/EcListShell'
import { ecConfirm } from '../../components/EcDialog'
import { api, extractErrorMessage } from '../../api/client'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import NumCheck from '../../components/NumCheck'

type Kind = 'ALLOWANCE' | 'DEDUCTION'

interface Item {
  id: number
  kind: Kind
  code: string
  name: string
  sortOrder: number
  payMethod: string | null
  rate: number | null
  taxType: string | null
  formula: string | null
  active: boolean
  builtin: boolean
}

/** 격자 한 줄(저장 전 편집 상태). id 가 없으면 빈 줄. */
interface Row {
  id?: number
  code: string
  name: string
  sortOrder: string
  payMethod: string
  rate: string
  taxType: string
  formula: string | null
  active: boolean
  dirty: boolean
}

/** 원본 [지급유형] 펼침(2026-10-03 실측). */
const PAY_METHODS = ['고정', '변동(일)', '변동(시간)', '변동(지급률)', '변동(직접입력)']
/** 원본 계산식 뒤 빈 열 — 기본 항목은 값이 없다. */
const ALLOWANCE_EXTRA = ['산출방법', '공통숫자항목2', '공통숫자항목3', '공통문자항목2', '공통문자항목3']
const DEDUCTION_EXTRA = ['산출방법', '공통숫자항목1', '공통숫자항목2', '공통숫자항목3', '공통문자항목1', '공통문자항목2', '공통문자항목3']
/** 원본은 항목 아래에 빈 줄 셋을 둔다(수당 1 + 3, 공제 0 + 3 — 2026-10-20 실측). */
const BLANK_ROWS = 3
const REQUIRED = '데이터를 입력하기 바랍니다.'
/** 격자 칸 안 입력칸 — 원본 본문 줄 36.9(2026-10-20 실측) = 여백 5.4 × 2 + 칸 25.1 + 선 1. */
const CELL = 'w-full h-[25.1px] border-0 bg-transparent px-[5px] outline-none'

const blank = (): Row => ({
  code: '', name: '', sortOrder: '', payMethod: '변동(일)', rate: '', taxType: '', formula: null, active: true, dirty: false,
})
const toRow = (i: Item): Row => ({
  id: i.id, code: i.code, name: i.name, sortOrder: String(i.sortOrder), payMethod: i.payMethod ?? '변동(일)',
  rate: i.rate == null ? '' : String(i.rate), taxType: i.taxType ?? '', formula: i.formula, active: i.active, dirty: false,
})


/**
 * 관리 &gt; 일용근로급여관리 &gt; 일용근로 기본사항 등록 &gt; <b>일용근로 수당등록</b>(원본 E020136 '일용근로 수당리스트') ·
 * <b>일용근로 공제등록</b>(E020137 '일용근로 공제리스트').
 *
 * <p>2026-10-20 loginaa 에서 직접 등록 · 수정 · 삭제해 본 그대로:
 * <ul>
 *   <li>격자는 항목 아래 빈 줄 셋. 빈 줄에 코드 · 이름 · 표시순서를 넣고 [저장(F8)] 하면 <b>안내 없이</b> 저장된다.
 *       수당은 지급유형 '변동(일)' · 과세구분 '전액과세' 가 기본, 계산식 칸은 저장 전 '설정'.</li>
 *   <li>표시순서를 비우면 그 칸이 빨갛게 되고 '데이터를 입력하기 바랍니다.' (저장 안 됨).</li>
 *   <li>계산식은 이름으로 자동 — 수당 변동(일) 'R( 이름(급여지급사항) * 이름(근무기록확정) , 0 )', 공제 'R( 이름(급여지급사항) , 0 )'.
 *       이름을 고치면 계산식도 따라 바뀐다. 코드는 저장 뒤 막힌다.</li>
 *   <li>번호 칸을 고르고 [사용중단/재사용] → 펼침(사용중단 · 삭제 · 재사용). 고른 것이 없으면
 *       '리스트에 선택된 자료가 없습니다. 체크박스에 체크한 후 다시 시도 바랍니다.', 삭제는 '삭제하겠습니까?' 뒤 안내 없이 사라짐.</li>
 * </ul>
 * 기본 항목(02 일근무 · 01 소득세 · 02 지방소득세)은 우리 급여계산(DailyPayService)이 셈하므로 지우지 못한다.
 * 새로 더한 항목이 근무입력 · 급여대장으로 흐르는 것은 아직 없다(plans/관리.md 남은 것).
 */
export default function DailyPayItemListPage({ kind = 'ALLOWANCE' }: { kind?: Kind }) {
  const allowance = kind === 'ALLOWANCE'
  const title = allowance ? '일용근로 수당리스트' : '일용근로 공제리스트'
  const extra = allowance ? ALLOWANCE_EXTRA : DEDUCTION_EXTRA
  const tableRef = useRef<HTMLTableElement>(null)
  useTableColumnCheck(tableRef, title, [kind])

  const [rows, setRows] = useState<Row[]>([])
  const [includeInactive, setIncludeInactive] = useState(false)
  const [checked, setChecked] = useState<Set<number>>(new Set())
  const [invalid, setInvalid] = useState<Set<string>>(new Set())
  const [error, setError] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)

  const load = useCallback(async () => {
    const { data } = await api.get<Item[]>('/hr/daily-pay-items', { params: { kind, includeInactive } })
    setRows([...data.map(toRow), ...Array.from({ length: BLANK_ROWS }, () => blank())])
    setChecked(new Set())
    setInvalid(new Set())
  }, [kind, includeInactive, allowance])

  useEffect(() => { load().catch((e) => setError(extractErrorMessage(e))) }, [load])

  function edit(i: number, patch: Partial<Row>) {
    setRows((rs) => rs.map((r, k) => {
      if (k !== i) return r
      const next = { ...r, ...patch, dirty: true }
      // 원본: 빈 줄에 이름을 넣으면 과세구분이 '전액과세' 로 찬다
      if (allowance && !r.id && patch.name && !next.taxType) next.taxType = '전액과세'
      return next
    }))
  }

  async function save() {
    const targets = rows.map((r, i) => ({ r, i })).filter(({ r }) => r.dirty && (r.id || r.code.trim() || r.name.trim()))
    const bad = new Set<string>()
    for (const { r, i } of targets) {
      if (!r.id && !r.code.trim()) bad.add(`${i}:code`)
      if (!r.name.trim()) bad.add(`${i}:name`)
      if (!r.sortOrder.trim() || Number.isNaN(Number(r.sortOrder))) bad.add(`${i}:sortOrder`)
    }
    setInvalid(bad)
    if (bad.size) { setError(REQUIRED); return }
    setError('')
    try {
      for (const { r } of targets) {
        const body = {
          kind, code: r.code.trim(), name: r.name.trim(), sortOrder: Number(r.sortOrder),
          payMethod: allowance ? r.payMethod : null, rate: allowance && r.rate.trim() ? Number(r.rate) : null,
          taxType: allowance ? r.taxType || null : null, active: r.active,
        }
        if (r.id) await api.put(`/hr/daily-pay-items/${r.id}`, body)
        else await api.post('/hr/daily-pay-items', body)
      }
      await load()
    } catch (e) {
      setError(extractErrorMessage(e))
    }
  }

  async function apply(op: '사용중단' | '삭제' | '재사용') {
    setMenuOpen(false)
    if (op === '삭제' && !(await ecConfirm('삭제하겠습니까?'))) return
    try {
      for (const r of rows.filter((x) => x.id && checked.has(x.id))) {
        if (op === '삭제') await api.delete(`/hr/daily-pay-items/${r.id}`)
        else await api.put(`/hr/daily-pay-items/${r.id}`, {
          kind, code: r.code, name: r.name, sortOrder: Number(r.sortOrder), payMethod: allowance ? r.payMethod : null,
          rate: allowance && r.rate ? Number(r.rate) : null, taxType: allowance ? r.taxType || null : null, active: op === '재사용',
        })
      }
      setError('')
    } catch (e) {
      setError(extractErrorMessage(e))
    }
    await load()
  }

  const toggle = (id: number) => setChecked((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const cell = (i: number, f: string) => (invalid.has(`${i}:${f}`) ? 'ec-invalid' : '')
  const text = (i: number, f: 'code' | 'name' | 'sortOrder' | 'rate', label: string, right = false) => (
    <input className={`${CELL}${right ? ' text-right' : ''}`} aria-label={`${i + 1}행 ${label}`} value={rows[i][f]}
           onChange={(e) => edit(i, { [f]: e.target.value })}
           onKeyDown={(e) => { if (e.key === 'F8') { e.preventDefault(); void save() } }} />
  )

  return (
    <EcListShell
      title={title}
      searchable={false}
      actions={[
        { label: '저장(F8)', primary: true, onClick: () => void save() },
        { label: '사용중단/재사용', selected: checked.size, onClick: () => setMenuOpen((v) => !v) },
        { label: includeInactive ? '사용중단미포함' : '사용중단포함', onClick: () => setIncludeInactive((v) => !v) },
      ]}
    >
      {menuOpen && (
        <>
          <div className="ec-backdrop-clear" onClick={() => setMenuOpen(false)} />
          <div className="ec-menu fixed top-auto right-auto bottom-[44px] left-[300px] mobile:left-[16px]">
            {(['사용중단', '삭제', '재사용'] as const).map((op) => (
              <button key={op} type="button" onClick={() => void apply(op)}>{op}</button>
            ))}
          </div>
        </>
      )}
      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
      <div className="overflow-x-auto">
        <table ref={tableRef} className="w-full text-left">
          <thead>
            <tr>
              <th className="w-[34px]"></th>
              <th>{allowance ? '수당항목코드' : '공제항목코드'}</th>
              <th>{allowance ? '수당항목명' : '공제항목명'}</th>
              <th className="text-right">표시순서</th>
              {allowance && <th>지급유형</th>}
              {allowance && <th className="text-right">배율</th>}
              {allowance && <th>근무기록</th>}
              {allowance && <th>과세구분</th>}
              <th>계산식</th>
              {extra.map((h) => <th key={h}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.id ?? `new-${i}`} className={r.active ? '' : 'text-ec-hint'}>
                <td className="pad text-center">
                  {r.id ? <NumCheck tone="plain" hover={false} no={i + 1} on={checked.has(r.id)} onChange={() => toggle(r.id!)} label={`${i + 1}행 고르기`} />
                    : <span className="text-ec-icon">{i + 1}</span>}
                </td>
                <td className={cell(i, 'code')}>{r.id ? <span className="block px-[5px]">{r.code}</span> : text(i, 'code', '코드')}</td>
                <td className={cell(i, 'name')}>{text(i, 'name', '항목명')}</td>
                <td className={`text-right ${cell(i, 'sortOrder')}`}>{text(i, 'sortOrder', '표시순서', true)}</td>
                {allowance && (
                  <td>
                    <select className={CELL} aria-label={`${i + 1}행 지급유형`} value={r.payMethod} onChange={(e) => edit(i, { payMethod: e.target.value })}>
                      {PAY_METHODS.map((m) => <option key={m}>{m}</option>)}
                    </select>
                  </td>
                )}
                {allowance && <td className="text-right">{text(i, 'rate', '배율', true)}</td>}
                {allowance && <td className="pad"></td>}
                {allowance && <td className="pad">{r.taxType}</td>}
                <td className="pad whitespace-nowrap">{r.formula ?? <span className="text-ec-navy">설정</span>}</td>
                {extra.map((h) => <td key={h} className="pad"></td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </EcListShell>
  )
}
