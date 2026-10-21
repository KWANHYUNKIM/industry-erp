import { useEffect, useMemo, useState } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import EcListShell from '../../components/EcListShell'
import Modal from '../../components/Modal'
import NumCheck from '../../components/NumCheck'
import { EcCond } from '../../components/EcStatusPanel'
import { ecAlert, NO_SELECTION_MESSAGE } from '../../components/EcDialog'

type Division = 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE'
type DebitCredit = 'DEBIT' | 'CREDIT'
type EvalKind = 'NONE' | 'TARGET' | 'EVAL'
type CashFlowKind = 'NONE' | 'INCOME' | 'EXPENSE' | 'DEPOSIT'
/** 계정등록 [관련업무] — 원본 라디오 차례(E010107). 채권/채무 면 거래처관리대장 I · II 에 잡힌다. */
type RelatedWork = 'NONE' | 'DEPOSIT' | 'BORROWING' | 'NOTE' | 'TANGIBLE_ASSET' | 'INTANGIBLE_ASSET' | 'RECEIVABLE_PAYABLE'
const RELATED: [RelatedWork, string][] = [
  ['NONE', '없음'], ['DEPOSIT', '예금'], ['BORROWING', '차입금'], ['NOTE', '어음'],
  ['TANGIBLE_ASSET', '유형고정자산'], ['INTANGIBLE_ASSET', '무형고정자산'], ['RECEIVABLE_PAYABLE', '채권/채무'],
]
/** 원본 [계정종류] — 자산 · 부채 · 자본 · 손익. 손익은 대차구분이 차변이면 비용, 대변이면 수익으로 쌓는다. */
type Kind = '자산' | '부채' | '자본' | '손익'
const KINDS: Kind[] = ['자산', '부채', '자본', '손익']
const EVALS: [EvalKind, string][] = [['NONE', '해당없음'], ['TARGET', '평가계정대상'], ['EVAL', '평가계정']]
const CASHES: [CashFlowKind, string][] = [['INCOME', '수입'], ['EXPENSE', '지출'], ['DEPOSIT', '예금'], ['NONE', '없음']]

interface Account {
  id: number
  code: string
  name: string
  division: Division
  kindName: Kind
  active: boolean
  relatedWork: RelatedWork
  partnerAggregate: boolean
  parentId: number | null
  groupAccount: boolean
  debitCredit: DebitCredit
  debitCreditName: string
  evalKind: EvalKind
  evalKindName: string
  cashFlowKind: CashFlowKind
  searchKeyword: string | null
  remark1: string | null
  remark2: string | null
}

interface Form {
  id: number | null
  code: string
  name: string
  searchKeyword: string
  debitCredit: DebitCredit
  groupAccount: boolean
  kind: Kind
  cashFlowKind: CashFlowKind
  parentId: string
  partnerAggregate: boolean
  evalKind: EvalKind
  relatedWork: RelatedWork
  remark1: string
  remark2: string
}
const BLANK: Form = {
  id: null, code: '', name: '', searchKeyword: '', debitCredit: 'DEBIT', groupAccount: false, kind: '자산', cashFlowKind: 'INCOME',
  parentId: '', partnerAggregate: false, evalKind: 'NONE', relatedWork: 'NONE', remark1: '', remark2: '',
}

function divisionOf(kind: Kind, dc: DebitCredit): Division {
  if (kind === '자산') return 'ASSET'
  if (kind === '부채') return 'LIABILITY'
  if (kind === '자본') return 'EQUITY'
  return dc === 'DEBIT' ? 'EXPENSE' : 'REVENUE'
}

interface Cond {
  code: string; name: string; dc: '' | DebitCredit; kinds: Set<Kind>; parent: string
  related: '' | RelatedWork; remark1: string; remark2: string; use: '' | 'Y' | 'N'; withParent: boolean
}
const COND0: Cond = {
  code: '', name: '', dc: '', kinds: new Set(KINDS), parent: '', related: '', remark1: '', remark2: '', use: 'Y', withParent: true,
}

/** 회계 I › 기초등록 › 계정등록(원본 E010107, 제목 '계정리스트') — plans/회계1/E010107.md */
export default function AccountsPage() {
  const [rows, setRows] = useState<Account[]>([])
  const [error, setError] = useState('')
  const [quick, setQuick] = useState('')
  const [cond, setCond] = useState<Cond>(COND0)
  const [applied, setApplied] = useState<Cond>(COND0)
  const [checked, setChecked] = useState<Set<number>>(new Set())
  const [folded, setFolded] = useState<Set<number>>(new Set())
  const [open, setOpen] = useState(false)
  const [formError, setFormError] = useState('')
  const [invalid, setInvalid] = useState(false)
  const [f, setF] = useState<Form>(BLANK)

  function load() {
    api.get<Account[]>('/accounts').then((r) => setRows(r.data)).catch((e) => setError(extractErrorMessage(e)))
    setChecked(new Set())
  }
  useEffect(() => { load() }, [])

  function nextCode() {
    const nums = rows.map((r) => Number(r.code)).filter((n) => Number.isFinite(n))
    return String((nums.length ? Math.max(...nums) : 0) + 1)
  }
  function openNew() { setF({ ...BLANK, code: nextCode() }); setFormError(''); setInvalid(false); setOpen(true) }
  function openEdit(a: Account) {
    setF({
      id: a.id, code: a.code, name: a.name, searchKeyword: a.searchKeyword ?? '', debitCredit: a.debitCredit, groupAccount: a.groupAccount,
      kind: a.kindName, cashFlowKind: a.cashFlowKind, parentId: a.parentId ? String(a.parentId) : '',
      partnerAggregate: a.partnerAggregate, evalKind: a.evalKind, relatedWork: a.relatedWork,
      remark1: a.remark1 ?? '', remark2: a.remark2 ?? '',
    })
    setFormError(''); setInvalid(false); setOpen(true)
  }

  async function save(ev?: React.FormEvent) {
    ev?.preventDefault()
    if (!f.name.trim() || !f.code.trim()) { setInvalid(true); setFormError(''); return }
    const body = {
      name: f.name.trim(), division: divisionOf(f.kind, f.debitCredit), debitCredit: f.debitCredit, groupAccount: f.groupAccount,
      cashFlowKind: f.cashFlowKind, parentId: f.parentId ? Number(f.parentId) : f.id ? 0 : null,
      partnerAggregate: f.partnerAggregate, evalKind: f.evalKind, relatedWork: f.relatedWork,
      searchKeyword: f.searchKeyword, remark1: f.remark1, remark2: f.remark2,
    }
    try {
      if (f.id) await api.patch(`/accounts/${f.id}`, body)
      else await api.post('/accounts', { code: f.code.trim(), ...body })
      setOpen(false)
      load()
    } catch (e) {
      setFormError(extractErrorMessage(e))
    }
  }

  async function setActive(active: boolean) {
    if (checked.size === 0) { await ecAlert(NO_SELECTION_MESSAGE); return }
    try { for (const id of checked) await api.patch(`/accounts/${id}`, { active }) } catch (e) { await ecAlert(extractErrorMessage(e)) }
    load()
  }

  /** 걸러진 줄 + (상위계정포함검색이면) 그 줄의 윗계정들 → 나무 차례(부모 아래 자식, 같은 층은 코드 차례). */
  const tree = useMemo(() => {
    const byId = new Map(rows.map((r) => [r.id, r]))
    const parentCode = (r: Account) => (r.parentId ? byId.get(r.parentId)?.code ?? '' : '')
    const c = applied
    const hit = (r: Account) =>
      (!c.code || r.code.includes(c.code)) && (!c.name || r.name.includes(c.name)) && (!c.dc || r.debitCredit === c.dc) &&
      c.kinds.has(r.kindName) && (!c.parent || parentCode(r).includes(c.parent)) && (!c.related || r.relatedWork === c.related) &&
      (!c.remark1 || (r.remark1 ?? '').includes(c.remark1)) && (!c.remark2 || (r.remark2 ?? '').includes(c.remark2)) &&
      (!c.use || (c.use === 'Y') === r.active) &&
      (!quick || r.code.includes(quick) || r.name.includes(quick) || (r.searchKeyword ?? '').includes(quick))
    const keep = new Set<number>()
    for (const r of rows) {
      if (!hit(r)) continue
      keep.add(r.id)
      if (c.withParent) for (let p = r.parentId ? byId.get(r.parentId) : undefined; p; p = p.parentId ? byId.get(p.parentId) : undefined) keep.add(p.id)
    }
    const kids = new Map<number | null, Account[]>()
    for (const r of rows) {
      const k = r.parentId && byId.has(r.parentId) ? r.parentId : null
      kids.set(k, [...(kids.get(k) ?? []), r])
    }
    const out: { a: Account; depth: number; hasKids: boolean }[] = []
    const walk = (pid: number | null, depth: number) => {
      for (const a of (kids.get(pid) ?? []).sort((x, y) => x.code.localeCompare(y.code))) {
        if (!keep.has(a.id)) continue
        const has = (kids.get(a.id) ?? []).some((k) => keep.has(k.id))
        out.push({ a, depth, hasKids: has })
        if (!folded.has(a.id)) walk(a.id, depth + 1)
      }
    }
    walk(null, 0)
    return out
  }, [rows, applied, quick, folded])

  const allChecked = tree.length > 0 && tree.every((t) => checked.has(t.a.id))
  const red = (bad: boolean) => (invalid && bad ? 'border-ec-danger' : '')
  const parentChoices = rows.filter((r) => r.id !== f.id).sort((x, y) => x.code.localeCompare(y.code))

  return (
    <EcListShell
      title="계정리스트"
      search={quick}
      onSearchChange={setQuick}
      onSearch={() => setApplied(cond)}
      onNew={openNew}
      onReset={() => { setCond(COND0); setApplied(COND0) }}
      actions={[
        {
          label: '사용중단/재사용',
          menu: [{ label: '사용중단', onClick: () => void setActive(false) }, { label: '재사용', onClick: () => void setActive(true) }],
        },
        { label: 'Excel' },
      ]}
    >
      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
      <ul className="ec-cond mb-[8px]">
        <EcCond label="계정코드"><input className="ec-input w-[140px]" aria-label="계정코드" value={cond.code} onChange={(e) => setCond({ ...cond, code: e.target.value })} /></EcCond>
        <EcCond label="계정명"><input className="ec-input w-[140px]" aria-label="계정명" value={cond.name} onChange={(e) => setCond({ ...cond, name: e.target.value })} /></EcCond>
        <EcCond label="대차구분">
          <select className="ec-input w-[100px]" aria-label="대차구분" value={cond.dc} onChange={(e) => setCond({ ...cond, dc: e.target.value as Cond['dc'] })}>
            <option value="">전체</option><option value="DEBIT">차변</option><option value="CREDIT">대변</option>
          </select>
        </EcCond>
        <EcCond label="계정종류">
          {KINDS.map((k) => (
            <label key={k} className="mr-[8px]"><input type="checkbox" checked={cond.kinds.has(k)}
              onChange={(e) => { const s = new Set(cond.kinds); if (e.target.checked) s.add(k); else s.delete(k); setCond({ ...cond, kinds: s }) }} /> {k}</label>
          ))}
        </EcCond>
        <EcCond label="상위계정"><input className="ec-input w-[140px]" aria-label="상위계정" value={cond.parent} onChange={(e) => setCond({ ...cond, parent: e.target.value })} /></EcCond>
        <EcCond label="관련업무">
          <select className="ec-input w-[140px]" aria-label="관련업무" value={cond.related} onChange={(e) => setCond({ ...cond, related: e.target.value as Cond['related'] })}>
            <option value="">전체</option>{RELATED.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </EcCond>
        <EcCond label="적요1"><input className="ec-input w-[140px]" aria-label="적요1" value={cond.remark1} onChange={(e) => setCond({ ...cond, remark1: e.target.value })} /></EcCond>
        <EcCond label="적요2"><input className="ec-input w-[140px]" aria-label="적요2" value={cond.remark2} onChange={(e) => setCond({ ...cond, remark2: e.target.value })} /></EcCond>
        <EcCond label="사용구분">
          <select className="ec-input w-[100px]" aria-label="사용구분" value={cond.use} onChange={(e) => setCond({ ...cond, use: e.target.value as Cond['use'] })}>
            <option value="">전체</option><option value="Y">사용</option><option value="N">사용중단</option>
          </select>
        </EcCond>
        <EcCond label="기타">
          <label><input type="checkbox" checked={cond.withParent} onChange={(e) => setCond({ ...cond, withParent: e.target.checked })} /> 상위계정포함검색</label>
        </EcCond>
      </ul>

      <table className="w-full text-left">
        <thead>
          <tr>
            <th className="w-[40px] text-center">
              <NumCheck no="" head label="전체선택" on={allChecked} onChange={(v) => setChecked(v ? new Set(tree.map((t) => t.a.id)) : new Set())} />
            </th>
            <th>[계정코드]계정명</th>
            <th className="w-[70px]">계정</th>
            <th className="w-[80px]">대차구분</th>
            <th className="w-[80px]">계정종류</th>
            <th className="w-[110px]">평가구분</th>
            <th className="w-[80px]">사용구분</th>
            <th className="w-[80px]">적요</th>
          </tr>
        </thead>
        <tbody>
          {tree.length === 0 ? (
            <tr><td colSpan={8} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
          ) : tree.map(({ a, depth, hasKids }, n) => (
            <tr key={a.id} className={a.active ? undefined : '[&>td]:bg-[var(--ec-bg-row-off)]'}>
              <td className="text-center">
                <NumCheck no={n + 1} label={`${a.code} 선택`} on={checked.has(a.id)}
                          onChange={(v) => setChecked((s) => { const x = new Set(s); if (v) x.add(a.id); else x.delete(a.id); return x })} />
              </td>
              <td style={{ paddingLeft: 8 + depth * 14 }} className={a.groupAccount ? 'font-bold' : undefined}>
                {hasKids ? (
                  <button type="button" className="no-ec mr-[4px] text-[10px]" aria-label="접기"
                          onClick={() => setFolded((s) => { const x = new Set(s); if (x.has(a.id)) x.delete(a.id); else x.add(a.id); return x })}>
                    {folded.has(a.id) ? '▶' : '◢'}
                  </button>
                ) : null}
                {a.groupAccount ? `[${a.code}] ${a.name}` : <button type="button" className="ec-link" onClick={() => openEdit(a)}>[{a.code}] {a.name}</button>}
              </td>
              <td>{a.groupAccount ? <button type="button" className="ec-link" onClick={() => openEdit(a)}>추가</button> : ''}</td>
              <td>{a.debitCreditName}</td>
              <td>{a.kindName}</td>
              <td>{a.evalKindName}</td>
              <td>{a.groupAccount ? '' : a.active ? 'Yes' : 'No'}</td>
              <td>{a.groupAccount ? '' : <button type="button" className="ec-link" onClick={() => openEdit(a)}>등록</button>}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <Modal error={formError} open={open} title={f.id ? '계정수정' : '계정등록'} width={760} onClose={() => setOpen(false)}>{(
        <form onSubmit={save}>
          <ul className="ec-form">
            <li className="wide"><span className="title">계정코드</span>
              <div className="form">{f.id ? <span>{f.code}</span> : (
                <input className={`ec-input w-[160px] ${red(!f.code.trim())}`} aria-label="계정코드" maxLength={20} value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} />)}</div></li>
            <li className="wide"><span className="title">계정명</span>
              <div className="form"><input className={`ec-input w-full ${red(!f.name.trim())}`} aria-label="계정명" maxLength={100} autoFocus value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div></li>
            <li className="wide"><span className="title">검색창내용</span>
              <div className="form"><input className="ec-input w-full" aria-label="검색창내용" maxLength={100} value={f.searchKeyword} onChange={(e) => setF({ ...f, searchKeyword: e.target.value })} /></div></li>
            <li className="wide"><span className="title">대차구분</span>
              <div className="form flex gap-[12px]">
                <label><input type="radio" name="dc" checked={f.debitCredit === 'DEBIT'} onChange={() => setF({ ...f, debitCredit: 'DEBIT' })} /> 차변</label>
                <label><input type="radio" name="dc" checked={f.debitCredit === 'CREDIT'} onChange={() => setF({ ...f, debitCredit: 'CREDIT' })} /> 대변</label>
              </div></li>
            <li className="wide"><span className="title">계정속성</span>
              <div className="form flex gap-[8px]">
                <select className="ec-input w-[140px]" aria-label="계정속성" value={f.groupAccount ? 'G' : 'E'} onChange={(e) => setF({ ...f, groupAccount: e.target.value === 'G' })}>
                  <option value="E">전표입력계정</option><option value="G">묶음계정</option>
                </select>
                <select className="ec-input w-[100px]" aria-label="계정종류" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as Kind })}>
                  {KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
                </select>
              </div></li>
            <li className="wide"><span className="title">수입지출구분</span>
              <div className="form flex gap-[12px]">
                {CASHES.map(([v, l]) => <label key={v}><input type="radio" name="cash" checked={f.cashFlowKind === v} onChange={() => setF({ ...f, cashFlowKind: v })} /> {l}</label>)}
              </div></li>
            <li className="wide"><span className="title">상위계정</span>
              <div className="form">
                <select className="ec-input w-[260px]" aria-label="상위계정" value={f.parentId} onChange={(e) => setF({ ...f, parentId: e.target.value })}>
                  <option value="">없음</option>
                  {parentChoices.map((p) => <option key={p.id} value={p.id}>[{p.code}] {p.name}</option>)}
                </select>
              </div></li>
            <li className="wide"><span className="title">평가구분</span>
              <div className="form flex gap-[12px]">
                {EVALS.map(([v, l]) => <label key={v}><input type="radio" name="evalKind" checked={f.evalKind === v} onChange={() => setF({ ...f, evalKind: v })} /> {l}</label>)}
              </div></li>
            <li className="wide"><span className="title">거래처별집계구분</span>
              <div className="form flex gap-[12px]">
                <label><input type="radio" name="partnerAggregate" checked={!f.partnerAggregate} onChange={() => setF({ ...f, partnerAggregate: false })} /> 없음</label>
                <label><input type="radio" name="partnerAggregate" checked={f.partnerAggregate} onChange={() => setF({ ...f, partnerAggregate: true })} /> 거래처별</label>
              </div></li>
            <li className="wide"><span className="title">관련업무</span>
              <div className="form flex gap-[12px] flex-wrap">
                {RELATED.map(([v, l]) => <label key={v}><input type="radio" name="relatedWork" checked={f.relatedWork === v} onChange={() => setF({ ...f, relatedWork: v })} /> {l}</label>)}
              </div></li>
            <li className="wide"><span className="title">적요1</span>
              <div className="form"><input className="ec-input w-full" aria-label="적요1" maxLength={100} value={f.remark1} onChange={(e) => setF({ ...f, remark1: e.target.value })} /></div></li>
            <li className="wide"><span className="title">적요2</span>
              <div className="form"><input className="ec-input w-full" aria-label="적요2" maxLength={100} value={f.remark2} onChange={(e) => setF({ ...f, remark2: e.target.value })} /></div></li>
          </ul>
          <div className="flex gap-[6px] mt-[12px]">
            <button type="submit" className="ec-btn ec-btn-primary">저장(F8)</button>
            <button type="button" className="ec-btn" onClick={() => setOpen(false)}>닫기</button>
          </div>
        </form>
      )}</Modal>
    </EcListShell>
  )
}
