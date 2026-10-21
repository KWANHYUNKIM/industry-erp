import { useEffect, useState } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import Modal from '../../components/Modal'

export interface BulkAccount {
  id: number; code: string; name: string; searchKeyword: string | null; debitCredit: 'DEBIT' | 'CREDIT'; groupAccount: boolean
  remark1: string | null; remark2: string | null; relatedWork: string; evalKind: string; indentOrder: number
  showMethod1: boolean; showMethod2: boolean; active: boolean
}

type Kind = 'text' | 'num' | 'select'
interface Field { key: string; label: string; kind: Kind; options?: [string, string][]; get: (a: BulkAccount) => string; body: (v: string) => Record<string, unknown> }
const SHOW: [string, string][] = [['Y', '표시'], ['N', '표시안함']]
/**
 * 창 '항목검색'의 항목(2026-10-22 loginaa 계정등록 [변경 ▲ 선택변경] 실측) — 묶음 계정정보 · 기타정보 · 재무제표 · 기타.
 */
const GROUPS: { group: string; fields: Field[] }[] = [
  { group: '계정정보', fields: [
    { key: 'name', label: '계정명', kind: 'text', get: (a) => a.name, body: (v) => ({ name: v }) },
    { key: 'searchKeyword', label: '검색창내용', kind: 'text', get: (a) => a.searchKeyword ?? '', body: (v) => ({ searchKeyword: v }) },
    { key: 'debitCredit', label: '대차구분', kind: 'select', options: [['DEBIT', '차변'], ['CREDIT', '대변']], get: (a) => a.debitCredit, body: (v) => ({ debitCredit: v }) },
    { key: 'groupAccount', label: '계정속성', kind: 'select', options: [['N', '전표입력계정'], ['Y', '집계계정(재무제표)']], get: (a) => (a.groupAccount ? 'Y' : 'N'), body: (v) => ({ groupAccount: v === 'Y' }) },
    { key: 'remark1', label: '적요1', kind: 'text', get: (a) => a.remark1 ?? '', body: (v) => ({ remark1: v }) },
    { key: 'remark2', label: '적요2', kind: 'text', get: (a) => a.remark2 ?? '', body: (v) => ({ remark2: v }) },
  ] },
  { group: '기타정보', fields: [
    { key: 'relatedWork', label: '관련업무', kind: 'select',
      options: [['NONE', '없음'], ['DEPOSIT', '예금'], ['BORROWING', '차입금'], ['NOTE', '어음'], ['TANGIBLE_ASSET', '유형고정자산'], ['INTANGIBLE_ASSET', '무형고정자산'], ['RECEIVABLE_PAYABLE', '채권/채무']],
      get: (a) => a.relatedWork, body: (v) => ({ relatedWork: v }) },
  ] },
  { group: '재무제표', fields: [
    { key: 'evalKind', label: '평가구분', kind: 'select', options: [['NONE', '해당없음'], ['TARGET', '평가계정대상'], ['EVAL', '평가계정']], get: (a) => a.evalKind, body: (v) => ({ evalKind: v }) },
    { key: 'indentOrder', label: '들여쓰기순서', kind: 'num', get: (a) => String(a.indentOrder ?? 0), body: (v) => ({ indentOrder: Number(v) || 0 }) },
    { key: 'showMethod1', label: '표시여부 (표시방법1)', kind: 'select', options: SHOW, get: (a) => (a.showMethod1 ? 'Y' : 'N'), body: (v) => ({ showMethod1: v === 'Y' }) },
    { key: 'showMethod2', label: '표시여부 (표시방법2)', kind: 'select', options: SHOW, get: (a) => (a.showMethod2 ? 'Y' : 'N'), body: (v) => ({ showMethod2: v === 'Y' }) },
  ] },
  { group: '기타', fields: [
    { key: 'active', label: '사용구분', kind: 'select', options: [['Y', '사용'], ['N', '사용중단']], get: (a) => (a.active ? 'Y' : 'N'), body: (v) => ({ active: v === 'Y' }) },
  ] },
]
const ALL = GROUPS.flatMap((g) => g.fields)

/**
 * 계정등록 [변경 ▲ 선택변경] → 창 '계정선택변경': 위 [변경항목선택] (+ 고른 첫 항목 칸 · [적용] = 모든 줄에 같은 값),
 * 표 순번 · 계정코드 · 계정명 · 고른 항목들, 아래 [저장(F8)] [닫기]. 창을 열면 '항목검색'(☐ 항목명, 묶음별, [적용(F8)] [닫기])이 먼저 뜬다.
 */
export default function AccountBulkChangeModal({ accounts, onClose, onSaved }: {
  accounts: BulkAccount[] | null
  onClose: () => void
  onSaved: () => void
}) {
  const [picked, setPicked] = useState<string[]>([])
  const [pickerOpen, setPickerOpen] = useState(false)
  const [draft, setDraft] = useState<Set<string>>(new Set())
  const [vals, setVals] = useState<Record<number, Record<string, string>>>({})
  const [bulk, setBulk] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (!accounts) return
    setPicked([]); setDraft(new Set()); setPickerOpen(true); setBulk(''); setError('')
    setVals(Object.fromEntries(accounts.map((a) => [a.id, Object.fromEntries(ALL.map((f) => [f.key, f.get(a)]))])))
  }, [accounts])

  const fields = picked.map((k) => ALL.find((f) => f.key === k)!)
  const first = fields[0]
  const editor = (f: Field, v: string, on: (v: string) => void, label: string) =>
    f.kind === 'select' ? (
      <select className="ec-input w-full" aria-label={label} value={v} onChange={(e) => on(e.target.value)}>
        {f.kind === 'select' && v === '' && <option value=""></option>}
        {f.options!.map(([o, l]) => <option key={o} value={o}>{l}</option>)}
      </select>
    ) : (
      <input className={`ec-input w-full${f.kind === 'num' ? ' text-right' : ''}`} aria-label={label} inputMode={f.kind === 'num' ? 'numeric' : undefined}
             value={v} onChange={(e) => on(e.target.value)} />
    )

  async function save() {
    if (!accounts) return
    try {
      for (const a of accounts) {
        const body = fields.reduce((b, f) => (vals[a.id][f.key] !== f.get(a) ? { ...b, ...f.body(vals[a.id][f.key]) } : b), {} as Record<string, unknown>)
        if (Object.keys(body).length) await api.patch(`/accounts/${a.id}`, body)
      }
      onSaved(); onClose()
    } catch (e) { setError(extractErrorMessage(e)) }
  }

  return (
    <>
      <Modal open={!!accounts} title="계정선택변경" width={900} error={error} onClose={onClose}>
        <div onKeyDown={(e) => { if (e.key === 'F8' && !pickerOpen) { e.preventDefault(); void save() } }}>
          <div className="flex gap-[4px] items-center mb-[8px]">
            <button type="button" className="ec-btn" onClick={() => { setDraft(new Set(picked)); setPickerOpen(true) }}>변경항목선택</button>
            {first && (
              <>
                <span className="ml-[6px]">{first.label}</span>
                <span className="w-[200px]">{editor(first, bulk, setBulk, `${first.label} 일괄값`)}</span>
                <button type="button" className="ec-btn" onClick={() => setVals((o) => Object.fromEntries(Object.entries(o).map(([id, r]) => [id, { ...r, [first.key]: bulk }])))}>적용</button>
              </>
            )}
          </div>
          <table className="w-full text-left mb-[10px]">
            <thead>
              <tr>
                <th className="w-[40px]"></th><th className="w-[110px]">계정코드</th><th>계정명</th>
                {fields.filter((f) => f.key !== 'name').map((f) => <th key={f.key}>{f.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {(accounts ?? []).map((a, i) => (
                <tr key={a.id}>
                  <td className="text-center">{i + 1}</td>
                  <td>{a.code}</td>
                  <td>{picked.includes('name')
                    ? editor(ALL[0], vals[a.id]?.name ?? '', (v) => setVals((o) => ({ ...o, [a.id]: { ...o[a.id], name: v } })), `${a.code} 계정명`)
                    : a.name}</td>
                  {fields.filter((f) => f.key !== 'name').map((f) => (
                    <td key={f.key}>{editor(f, vals[a.id]?.[f.key] ?? '', (v) => setVals((o) => ({ ...o, [a.id]: { ...o[a.id], [f.key]: v } })), `${a.code} ${f.label}`)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex gap-[4px]">
            <button type="button" className="ec-btn ec-btn-primary" onClick={() => void save()}>저장(F8)</button>
            <button type="button" className="ec-btn" onClick={onClose}>닫기</button>
          </div>
        </div>
      </Modal>
      <Modal open={!!accounts && pickerOpen} title="항목검색" width={500} onClose={() => setPickerOpen(false)}>
        <div onKeyDown={(e) => { if (e.key === 'F8') { e.preventDefault(); setPicked(ALL.map((f) => f.key).filter((k) => draft.has(k))); setPickerOpen(false) } }}>
          <table className="w-full text-left mb-[10px]">
            <thead><tr><th className="w-[34px]"></th><th>항목명</th></tr></thead>
            <tbody>
              {GROUPS.map((g) => [
                <tr key={g.group} className="bg-ec-page"><td></td><td className="font-bold">{g.group}</td></tr>,
                ...g.fields.map((f) => (
                  <tr key={f.key}>
                    <td className="text-center">
                      <input type="checkbox" aria-label={`${f.label} 고르기`} checked={draft.has(f.key)}
                             onChange={(e) => setDraft((s) => { const x = new Set(s); if (e.target.checked) x.add(f.key); else x.delete(f.key); return x })} />
                    </td>
                    <td>{f.label}</td>
                  </tr>
                )),
              ])}
            </tbody>
          </table>
          <div className="flex gap-[4px]">
            <button type="button" className="ec-btn ec-btn-primary"
                    onClick={() => { setPicked(ALL.map((f) => f.key).filter((k) => draft.has(k))); setPickerOpen(false) }}>적용(F8)</button>
            <button type="button" className="ec-btn" onClick={() => setPickerOpen(false)}>닫기</button>
          </div>
        </div>
      </Modal>
    </>
  )
}
