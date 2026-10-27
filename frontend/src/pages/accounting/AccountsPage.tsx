import { useEffect, useMemo, useState } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import EcListShell from '../../components/EcListShell'
import Modal from '../../components/Modal'
import NumCheck from '../../components/NumCheck'
import { EcCond } from '../../components/EcStatusPanel'
import { ecAlert, NO_SELECTION_MESSAGE } from '../../components/EcDialog'
import AccountRemarkModal from '../../features/accountmaster/AccountRemarkModal'
import AccountBulkChangeModal from '../../features/accountmaster/AccountBulkChangeModal'
import AccountOrderModal from '../../features/accountmaster/AccountOrderModal'

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
/** 원본 [계정종류] 목록 전부(2026-10-21 실측) — 원가1~3 · 없음은 우리 계정 구분에 없어 고를 수만 없게 보인다(계정 체계 사용자 결정). */
const KINDS_ALL = ['자산', '부채', '자본', '손익', '원가1', '원가2', '원가3', '없음']
/** 원본 [계정속성] 목록(2026-10-21 실측). 우리는 전표입력 / 집계 둘만 든다 — 집계계정 셋은 집계(묶음), 자동대체계정은 전표입력으로 저장. */
const ATTRS = ['전표입력계정', '집계계정(재무제표)', '집계계정(수입지출명세서)', '집계계정(전체)', '자동대체계정(손익)', '자동대체계정(원가1)', '자동대체계정(원가2)', '자동대체계정(원가3)']
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
  /** [표시순서] · 표시방법 탭(V457) */
  displayOrder: number | null
  indentOrder: number
  showMethod1: boolean
  showMethod2: boolean
}

/** 신규 · 수정 창 탭(원본 '계정등록' 784 — 기본 · 코드정보 · 표시방법). 기본은 칸 전부, 코드정보는 평가구분 위까지, 표시방법은 평가구분부터. */
const FORM_TABS = ['기본', '코드정보', '표시방법'] as const
type FormTab = typeof FORM_TABS[number]

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
  indentOrder: string
  showMethod1: boolean
  showMethod2: boolean
}
const BLANK: Form = {
  id: null, code: '', name: '', searchKeyword: '', debitCredit: 'DEBIT', groupAccount: false, kind: '자산', cashFlowKind: 'INCOME',
  parentId: '', partnerAggregate: false, evalKind: 'NONE', relatedWork: 'NONE', remark1: '', remark2: '',
  indentOrder: '0', showMethod1: false, showMethod2: false,
}

function divisionOf(kind: Kind, dc: DebitCredit): Division {
  if (kind === '자산') return 'ASSET'
  if (kind === '부채') return 'LIABILITY'
  if (kind === '자본') return 'EQUITY'
  return dc === 'DEBIT' ? 'EXPENSE' : 'REVENUE'
}

interface Cond {
  code: string; name: string; keyword: string; dc: '' | DebitCredit; kinds: Set<Kind>; parent: string
  related: '' | RelatedWork; remark1: string; remark2: string; use: '' | 'Y' | 'N'; withParent: boolean
}
const COND0: Cond = {
  code: '', name: '', keyword: '', dc: '', kinds: new Set(KINDS), parent: '', related: '', remark1: '', remark2: '', use: 'Y', withParent: true,
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
  const [formTab, setFormTab] = useState<FormTab>('기본')
  const [remarkOf, setRemarkOf] = useState<Account | null>(null)
  const [bulk, setBulk] = useState<Account[] | null>(null)
  const [orderOpen, setOrderOpen] = useState(false)

  function load() {
    api.get<Account[]>('/accounts').then((r) => setRows(r.data)).catch((e) => setError(extractErrorMessage(e)))
    setChecked(new Set())
  }
  useEffect(() => { load() }, [])

  function nextCode() {
    const nums = rows.map((r) => Number(r.code)).filter((n) => Number.isFinite(n))
    return String((nums.length ? Math.max(...nums) : 0) + 1)
  }
  function openNew() { setF({ ...BLANK, code: nextCode() }); setFormTab('기본'); setFormError(''); setInvalid(false); setOpen(true) }
  function openEdit(a: Account) {
    setF({
      id: a.id, code: a.code, name: a.name, searchKeyword: a.searchKeyword ?? '', debitCredit: a.debitCredit, groupAccount: a.groupAccount,
      kind: a.kindName, cashFlowKind: a.cashFlowKind, parentId: a.parentId ? String(a.parentId) : '',
      partnerAggregate: a.partnerAggregate, evalKind: a.evalKind, relatedWork: a.relatedWork,
      remark1: a.remark1 ?? '', remark2: a.remark2 ?? '',
      indentOrder: String(a.indentOrder ?? 0), showMethod1: a.showMethod1, showMethod2: a.showMethod2,
    })
    setFormTab('기본')
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
      indentOrder: Number(f.indentOrder) || 0, showMethod1: f.showMethod1, showMethod2: f.showMethod2,
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
      (!c.code || r.code.includes(c.code)) && (!c.name || r.name.includes(c.name)) && (!c.keyword || (r.searchKeyword ?? '').includes(c.keyword)) && (!c.dc || r.debitCredit === c.dc) &&
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
          label: '변경',
          menu: [
            { label: '선택변경', onClick: () => {
              if (checked.size === 0) { void ecAlert('선택된 자료가 없습니다.\n변경할 자료를 체크한 후 다시 시도 바랍니다.'); return }
              setBulk(tree.map((t) => t.a).filter((a) => checked.has(a.id)))
            } },
            { label: '표시순서변경', onClick: () => setOrderOpen(true) },
          ],
        },
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
        <EcCond label="검색창내용"><input className="ec-input w-[140px]" aria-label="검색창내용" value={cond.keyword} onChange={(e) => setCond({ ...cond, keyword: e.target.value })} /></EcCond>
        {/* 원본 조건 판(2026-10-21 실측): 대차구분 ◉전체 ○차변 ○대변 · 계정종류 ☐전체 ☑자산 … ☑원가3 ☐없음 · 사용구분 ○전체 ◉사용 ○사용중단. */}
        <EcCond label="대차구분">
          {([['', '전체'], ['DEBIT', '차변'], ['CREDIT', '대변']] as const).map(([v, l]) => (
            <label key={l} className="mr-[8px]"><input type="radio" name="acct-dc" checked={cond.dc === v} onChange={() => setCond({ ...cond, dc: v })} /> {l}</label>
          ))}
        </EcCond>
        <EcCond label="계정종류">
          <label className="mr-[8px]"><input type="checkbox" checked={KINDS.every((k) => cond.kinds.has(k))}
            onChange={(e) => setCond({ ...cond, kinds: e.target.checked ? new Set(KINDS) : new Set() })} /> 전체</label>
          {KINDS_ALL.slice(0, 7).map((k) => (
            <label key={k} className="mr-[8px]"><input type="checkbox" checked={(KINDS as string[]).includes(k) ? cond.kinds.has(k as Kind) : true} disabled={!(KINDS as string[]).includes(k)}
              onChange={(e) => { const s = new Set(cond.kinds); if (e.target.checked) s.add(k as Kind); else s.delete(k as Kind); setCond({ ...cond, kinds: s }) }} /> {k}</label>
          ))}
          <label className="mr-[8px]"><input type="checkbox" checked={false} disabled /> 없음</label>
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
          {([['', '전체'], ['Y', '사용'], ['N', '사용중단']] as const).map(([v, l]) => (
            <label key={l} className="mr-[8px]"><input type="radio" name="acct-use" checked={cond.use === v} onChange={() => setCond({ ...cond, use: v })} /> {l}</label>
          ))}
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
              <td>{a.groupAccount ? '' : <button type="button" className="ec-link" onClick={() => setRemarkOf(a)}>등록</button>}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <Modal error={formError} open={open} title={f.id ? '계정수정' : '계정등록'} width={784} onClose={() => setOpen(false)}>{(
        <form onSubmit={save} onKeyDown={(e) => { if (e.key === 'F8') { e.preventDefault(); void save() } }}>
          <ul className="ec-tabs mb-[10px]">
            {FORM_TABS.map((t) => (
              <li key={t} className={`ec-tab relative cursor-pointer${formTab === t ? ' active' : ''}`} onClick={() => setFormTab(t)}>{t}
                {/* 원본: 빈 계정명으로 저장하면 탭 셋 다 빨간 '!'(2026-10-21 실측) */}
                {invalid && !f.name.trim() && (
                  <span aria-label="입력 안 된 칸" className="absolute -top-[6.3px] right-0 w-[16px] h-[16px] rounded-full bg-[var(--ec-text-danger)] text-ec-panel text-[11px] font-bold leading-[16px] text-center">!</span>
                )}
              </li>
            ))}
          </ul>
          <ul className="ec-form">
            {formTab !== '표시방법' && <>
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
              <div className="form">
                <select className="ec-input w-[200px]" aria-label="계정속성" value={f.groupAccount ? ATTRS[1] : ATTRS[0]}
                        onChange={(e) => setF({ ...f, groupAccount: e.target.value.startsWith('집계계정') })}>
                  {ATTRS.map((a) => <option key={a} value={a}>{a}</option>)}
                </select>
              </div></li>
            <li className="wide"><span className="title">계정종류</span>
              <div className="form">
                <select className="ec-input w-[120px]" aria-label="계정종류" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as Kind })}>
                  {KINDS_ALL.map((k) => <option key={k} value={k} disabled={!(KINDS as string[]).includes(k)}>{k}</option>)}
                </select>
              </div></li>
            <li className="wide"><span className="title">수입지출구분</span>
              <div className="form flex gap-[12px]">
                {CASHES.map(([v, l]) => <label key={v}><input type="radio" name="cash" checked={f.cashFlowKind === v} onChange={() => setF({ ...f, cashFlowKind: v })} /> {l}</label>)}
              </div></li>
            <li className="wide"><span className="title">재무제표상위계정</span>
              <div className="form">
                <select className="ec-input w-[260px]" aria-label="재무제표상위계정" value={f.parentId} onChange={(e) => setF({ ...f, parentId: e.target.value })}>
                  <option value="">없음</option>
                  {parentChoices.map((p) => <option key={p.id} value={p.id}>[{p.code}] {p.name}</option>)}
                </select>
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
            </>}
            {formTab !== '코드정보' && <>
            <li className="wide"><span className="title">평가구분</span>
              <div className="form flex gap-[12px]">
                {EVALS.map(([v, l]) => <label key={v}><input type="radio" name="evalKind" checked={f.evalKind === v} onChange={() => setF({ ...f, evalKind: v })} /> {l}</label>)}
              </div></li>
            <li className="wide"><span className="title">들여쓰기순서</span>
              <div className="form"><input className="ec-input w-[80px] text-right" inputMode="numeric" aria-label="들여쓰기순서" value={f.indentOrder}
                                           onChange={(e) => setF({ ...f, indentOrder: e.target.value.replace(/\D/g, '') })} /></div></li>
            {([['showMethod1', '표시방법1'], ['showMethod2', '표시방법2']] as const).map(([k, l]) => (
              <li key={k} className="wide"><span className="title">{l}</span>
                <div className="form flex gap-[12px]">
                  <label><input type="radio" name={k} checked={f[k]} onChange={() => setF({ ...f, [k]: true })} /> 표시</label>
                  <label><input type="radio" name={k} checked={!f[k]} onChange={() => setF({ ...f, [k]: false })} /> 표시안함</label>
                </div></li>
            ))}
            </>}
          </ul>
          <div className="flex gap-[6px] mt-[12px]">
            <button type="submit" className="ec-btn ec-btn-primary">저장(F8)</button>
            <button type="button" className="ec-btn" onClick={() => setOpen(false)}>닫기</button>
          </div>
        </form>
      )}</Modal>
      <AccountRemarkModal account={remarkOf} onClose={() => setRemarkOf(null)} />
      <AccountBulkChangeModal accounts={bulk} onClose={() => setBulk(null)} onSaved={load} />
      <AccountOrderModal open={orderOpen} accounts={rows} onClose={() => setOrderOpen(false)} onSaved={load} />
    </EcListShell>
  )
}
