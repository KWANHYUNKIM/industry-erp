import { useEffect, useState } from 'react'
import EcListShell from '../../components/EcListShell'
import Modal from '../../components/Modal'
import CodePickerField from '../../components/CodePickerField'
import { EcCond } from '../../components/EcStatusPanel'
import { useTableSort } from '../../utils/useTableSort'
import { api, extractErrorMessage } from '../../api/client'
import type { BankAccountRow, Currency } from '../../types/api'
import { ecConfirm } from '../../components/EcDialog'
import { BANK_CODES } from '../../utils/bankCodes'

interface AccountOption { id: number; code: string; name: string; division?: string }
/** 은행명 코드도움 — 값은 은행 이름(계좌에 이름을 든다). */
const BANK_ITEMS = BANK_CODES.map(([code, name]) => ({ value: name, code, name }))

/**
 * 회계 I &gt; 기초등록 &gt; <b>계좌등록</b> (원본 E010104, 화면 제목 '계좌리스트') — 2026-10-13 loginaa 에서 등록 · 수정 · 이체정보 · 삭제해 본 그대로.
 *
 * <ul>
 *   <li>격자: 계좌코드 · 계좌명 · 계정명(계정코드) 예 '보통예금(103)' · 검색창내용 · 적요 · 외화통장(사용/미사용) · 사용(YES/NO) · 이체정보.
 *       [이체정보] 는 [등록] 링크 — 은행명을 넣어 둔 계좌는 주황 알약(.text-warning-inverse)으로 바뀐다.
 *       버튼 신규(F2) · 사용중단/재사용 ▲(사용중단 · 삭제 · 재사용) · Excel · 웹자료올리기.</li>
 *   <li>[Search(F3)] 조건: 계좌코드 · 계좌명 · 계정 · 검색창내용 · 적요 · 외화통장환종 · 사용구분(전체 · <b>사용</b> · 사용중단).</li>
 *   <li>신규 창 '통장계좌등록': 계좌코드 · 계좌명(둘 다 비우면 빨간 테두리) · 계정(예금계정만, 기본 보통예금) · 검색창내용 · 적요 · 외화계좌(미사용 + 통화).
 *       저장하면 안내 없이 닫힌다. 코드를 누르면 '통장계좌수정' — 계좌코드가 잠기고 [사용중단/재사용 ▲] 이 붙는다. 삭제는 '삭제하겠습니까?'.</li>
 *   <li>'이체정보등록' 창: 은행명 · 계좌번호(기본 = 계좌코드의 숫자만 — 원본은 QA1B01 → 101) · 예금주명 · 적요1 · 적요2.
 *       은행명을 비우고 저장하면 '거래은행명을 입력 바랍니다.'</li>
 * </ul>
 * 흐름: 계좌의 [계정]이 계좌 입출금 분개의 예금 쪽이 된다(기본 보통예금). 입출금은 [계좌/카드] 화면에 있다. 웹자료올리기는 아직 없다.
 */
export default function BankAccountListPage() {
  const [rows, setRows] = useState<BankAccountRow[]>([])
  const [accounts, setAccounts] = useState<AccountOption[]>([])
  const [currencies, setCurrencies] = useState<Currency[]>([])
  const [error, setError] = useState('')
  const [checked, setChecked] = useState<Set<number>>(new Set())
  const [quick, setQuick] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)

  /* 조회 조건 — 받아 둔 줄을 그 자리에서 거른다 */
  const [cond, setCond] = useState({ code: '', name: '', glId: '', searchText: '', remark: '', currencyId: '', use: 'Y' as 'ALL' | 'Y' | 'N', byUpdated: false })

  /* 신규 · 수정 창 */
  const [formOpen, setFormOpen] = useState(false)
  const [formError, setFormError] = useState('')
  const [invalid, setInvalid] = useState(false)
  const [editMenu, setEditMenu] = useState(false)
  const blank = { id: null as number | null, code: '', name: '', glAccountId: '', searchText: '', remark: '', currencyId: '', active: true }
  const [f, setF] = useState(blank)

  /* 이체정보 창 */
  const [tOpen, setTOpen] = useState<BankAccountRow | null>(null)
  const [tError, setTError] = useState('')
  const [t, setT] = useState({ bankName: '', accountNo: '', holder: '', remark1: '', remark2: '' })

  function load() {
    setError('')
    Promise.all([
      api.get<BankAccountRow[]>('/bank-cards/accounts'),
      api.get<AccountOption[]>('/accounts', { params: { slip: true } }),
      api.get<Currency[]>('/currencies'),
    ]).then(([b, a, c]) => { setRows(b.data); setAccounts(a.data); setCurrencies(c.data) })
      .catch((e) => setError(extractErrorMessage(e)))
  }
  useEffect(() => { load() }, [])

  /* 원본 [계정] 선택상자는 현금 · 예금 · 적금 계정만 든다 */
  const depositAccounts = accounts.filter((a) => /현금|예금|적금/.test(a.name))
  const defaultGl = depositAccounts.find((a) => a.code === '1039')

  function openNew() {
    setF({ ...blank, glAccountId: defaultGl ? String(defaultGl.id) : '' })
    setFormError(''); setInvalid(false); setEditMenu(false); setFormOpen(true)
  }
  function openEdit(b: BankAccountRow) {
    setF({ id: b.id, code: b.code ?? b.accountNo, name: b.name ?? '', glAccountId: String(b.glAccountId),
      searchText: b.searchText ?? '', remark: b.remark ?? '', currencyId: b.currencyId != null ? String(b.currencyId) : '', active: b.active })
    setFormError(''); setInvalid(false); setEditMenu(false); setFormOpen(true)
  }

  /** PUT 은 칸을 통째로 덮는다 — 안 보낸 칸이 지워지지 않게 줄의 값을 바탕에 깐다. */
  function bodyOf(b: BankAccountRow) {
    return {
      code: b.code, name: b.name, bankName: b.bankName, accountNo: b.accountNo, holder: b.holder,
      glAccountId: b.glAccountId, currencyId: b.currencyId, active: b.active, remark: b.remark,
      searchText: b.searchText ?? '', transferRemark1: b.transferRemark1 ?? '', transferRemark2: b.transferRemark2 ?? '',
    }
  }

  async function save(ev?: React.FormEvent) {
    ev?.preventDefault()
    if (!f.code.trim() || !f.name.trim()) { setInvalid(true); setFormError(''); return }
    const old = rows.find((r) => r.id === f.id)
    const body = {
      ...(old ? bodyOf(old) : {}),
      code: f.code.trim(), name: f.name.trim(),
      glAccountId: f.glAccountId ? Number(f.glAccountId) : null,
      searchText: f.searchText.trim(), remark: f.remark.trim(),
      currencyId: f.currencyId ? Number(f.currencyId) : null, active: f.active,
    }
    try {
      if (f.id) await api.put(`/bank-cards/accounts/${f.id}`, body)
      else await api.post('/bank-cards/accounts', body)
      setFormOpen(false)
      load()
    } catch (e) {
      setFormError(extractErrorMessage(e))
    }
  }

  function openTransfer(b: BankAccountRow) {
    const registered = !!b.bankName
    setT({
      bankName: b.bankName ?? '',
      // 원본: 처음 열면 계좌번호 = 계좌코드의 숫자만
      accountNo: registered ? b.accountNo : (b.code ?? b.accountNo).replace(/[^0-9-]/g, ''),
      holder: b.holder ?? '', remark1: b.transferRemark1 ?? '', remark2: b.transferRemark2 ?? '',
    })
    setTError(''); setTOpen(b)
  }
  async function saveTransfer(ev?: React.FormEvent) {
    ev?.preventDefault()
    if (!tOpen) return
    if (!t.bankName.trim()) { setTError('거래은행명을 입력 바랍니다.'); return }
    try {
      await api.put(`/bank-cards/accounts/${tOpen.id}`, {
        ...bodyOf(tOpen), bankName: t.bankName.trim(), accountNo: t.accountNo.trim(), holder: t.holder.trim(),
        transferRemark1: t.remark1.trim(), transferRemark2: t.remark2.trim(),
      })
      setTOpen(null)
      load()
    } catch (e) {
      setTError(extractErrorMessage(e))
    }
  }

  async function apply(ids: number[], op: '사용중단' | '삭제' | '재사용') {
    setMenuOpen(false); setEditMenu(false)
    if (ids.length === 0) { setError('선택된 데이터가 없습니다.'); return }
    if (op === '삭제' && !(await ecConfirm('삭제하겠습니까?'))) return
    try {
      for (const id of ids) {
        const b = rows.find((r) => r.id === id)
        if (!b) continue
        if (op === '삭제') await api.delete(`/bank-cards/accounts/${id}`)
        else await api.put(`/bank-cards/accounts/${id}`, { ...bodyOf(b), active: op === '재사용' })
      }
      setFormOpen(false)
    } catch (e) {
      if (formOpen) setFormError(extractErrorMessage(e)); else setError(extractErrorMessage(e))
    }
    setChecked(new Set())
    load()
  }

  const has = (v: string | null | undefined, q: string) => !q || (v ?? '').includes(q)
  const codeOf = (b: BankAccountRow) => b.code ?? b.accountNo
  const nameOf = (b: BankAccountRow) => b.name ?? `${b.bankName} ${b.accountNo}`
  const shownRows = rows
    .filter((b) => cond.use === 'ALL' || (cond.use === 'Y') === b.active)
    .filter((b) => has(codeOf(b), cond.code) && has(nameOf(b), cond.name) && has(b.searchText, cond.searchText)
      && has(b.remark, cond.remark) && (!cond.glId || String(b.glAccountId) === cond.glId)
      && (!cond.currencyId || String(b.currencyId) === cond.currencyId))
    .filter((b) => !quick || has(codeOf(b), quick) || has(nameOf(b), quick) || has(b.searchText, quick))
    /* 기타 ☑수정일자순(정렬) — 고친 차례로 최근이 위(2026-10-21 원본: 5544332211 · 1122334455 · 000), 끄면 계좌코드순. */
    .sort((a, b) => (cond.byUpdated ? (b.updatedAt ?? '').localeCompare(a.updatedAt ?? '') : codeOf(a).localeCompare(codeOf(b))))
  const sort = useTableSort(shownRows, {
    계좌코드: codeOf,
    계좌명: nameOf,
    검색창내용: (b) => b.searchText ?? '',
    적요: (b) => b.remark ?? '',
    외화통장: (b) => (b.currencyId != null ? '사용' : '미사용'),
    사용: (b) => (b.active ? 'YES' : 'NO'),
  })
  const shown = sort.sorted
  const allChecked = shown.length > 0 && shown.every((b) => checked.has(b.id))
  const glItems = depositAccounts.map((a) => ({ value: String(a.id), code: a.code, name: a.name }))
  const currencyItems = currencies.map((c) => ({ value: String(c.id), code: c.code, name: c.name }))
  const editing = rows.find((r) => r.id === f.id)

  return (
    <EcListShell
      title="계좌리스트"
      search={quick}
      onSearchChange={setQuick}
      onSearch={() => undefined}
      collapseConditions
      onNew={openNew}
      actions={[
        { label: `사용중단/재사용${' ▲'}`, onClick: () => setMenuOpen((v) => !v) },
        { label: 'Excel' },
      ]}
    >
      <ul className="ec-cond">
        <EcCond label="계좌코드"><input className="ec-input w-full" placeholder="계좌코드" value={cond.code} onChange={(e) => setCond({ ...cond, code: e.target.value })} /></EcCond>
        <EcCond label="계좌명"><input className="ec-input w-full" placeholder="계좌명" value={cond.name} onChange={(e) => setCond({ ...cond, name: e.target.value })} /></EcCond>
        <EcCond label="계정" pick>
          <CodePickerField label="계정" hideLabel fill placeholder="계정" value={cond.glId} items={glItems}
                           onChange={(v) => setCond({ ...cond, glId: v })} />
        </EcCond>
        <EcCond label="검색창내용"><input className="ec-input w-full" placeholder="검색창내용" value={cond.searchText} onChange={(e) => setCond({ ...cond, searchText: e.target.value })} /></EcCond>
        <EcCond label="적요"><input className="ec-input w-full" placeholder="적요" value={cond.remark} onChange={(e) => setCond({ ...cond, remark: e.target.value })} /></EcCond>
        <EcCond label="외화통장환종" pick>
          <CodePickerField label="외화통장환종" hideLabel fill placeholder="외화통장환종" value={cond.currencyId} items={currencyItems}
                           onChange={(v) => setCond({ ...cond, currencyId: v })} />
        </EcCond>
        <EcCond label="사용구분">
          {([['ALL', '전체'], ['Y', '사용'], ['N', '사용중단']] as const).map(([v, l]) => (
            <label key={v} className="mr-[10px]"><input type="radio" name="bank-use" checked={cond.use === v} onChange={() => setCond({ ...cond, use: v })} /> {l}</label>
          ))}
        </EcCond>
        <EcCond label="기타">
          <label><input type="checkbox" aria-label="수정일자순(정렬)" checked={cond.byUpdated} onChange={(e) => setCond({ ...cond, byUpdated: e.target.checked })} /> 수정일자순(정렬)</label>
        </EcCond>
      </ul>

      {menuOpen && (
        <>
          <div className="ec-backdrop-clear" onClick={() => setMenuOpen(false)} />
          <div className="ec-menu fixed top-auto right-auto bottom-[44px] left-[300px] mobile:left-[16px]">
            {(['사용중단', '삭제', '재사용'] as const).map((op) => (
              <button key={op} type="button" onClick={() => void apply([...checked], op)}>{op}</button>
            ))}
          </div>
        </>
      )}
      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}

      <table className="w-full text-left">
        <thead>
          <tr>
            <th className="w-[34px] text-center">
              <input type="checkbox" aria-label="전체 선택" checked={allChecked}
                     onChange={() => setChecked(allChecked ? new Set() : new Set(shown.map((b) => b.id)))} />
            </th>
            <th className="cursor-pointer" onClick={() => sort.toggle('계좌코드')}>계좌코드 {sort.mark('계좌코드')}</th>
            <th className="cursor-pointer" onClick={() => sort.toggle('계좌명')}>계좌명 {sort.mark('계좌명')}</th>
            <th>계정명(계정코드)</th>
            <th className="cursor-pointer" onClick={() => sort.toggle('검색창내용')}>검색창내용 {sort.mark('검색창내용')}</th>
            <th className="cursor-pointer" onClick={() => sort.toggle('적요')}>적요 {sort.mark('적요')}</th>
            <th className="cursor-pointer w-[90px] text-center" onClick={() => sort.toggle('외화통장')}>외화통장 {sort.mark('외화통장')}</th>
            <th className="cursor-pointer w-[70px] text-center" onClick={() => sort.toggle('사용')}>사용 {sort.mark('사용')}</th>
            <th className="w-[60px] text-center">이체정보</th>
          </tr>
        </thead>
        <tbody>
          {shown.length === 0 ? (
            <tr><td colSpan={9} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
          ) : shown.map((b) => (
            <tr key={b.id} className={b.active ? undefined : '[&>td]:bg-[var(--ec-bg-row-off)]'}>
              <td className="text-center">
                <input type="checkbox" aria-label={`${codeOf(b)} 선택`} checked={checked.has(b.id)}
                       onChange={() => {
                         const next = new Set(checked)
                         if (next.has(b.id)) next.delete(b.id); else next.add(b.id)
                         setChecked(next)
                       }} />
              </td>
              <td><a href="#" onClick={(e) => { e.preventDefault(); openEdit(b) }}>{codeOf(b)}</a></td>
              <td><a href="#" onClick={(e) => { e.preventDefault(); openEdit(b) }}>{nameOf(b)}</a></td>
              <td>{b.glAccountName}({b.glAccountCode})</td>
              <td>{b.searchText ?? ''}</td>
              <td>{b.remark ?? ''}</td>
              <td className="text-center">{b.currencyId != null ? '사용' : '미사용'}</td>
              <td className="text-center">{b.active ? 'YES' : 'NO'}</td>
              <td className="text-center">
                <a href="#" onClick={(e) => { e.preventDefault(); openTransfer(b) }}
                   className={b.bankName ? 'inline-block rounded-[6px] px-[1.8px] py-[0.9px] text-[12px] leading-[13.2px] bg-[var(--ec-tag-warn)] text-[var(--ec-bg-panel)] no-underline' : undefined}>등록</a>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <Modal error={formError} open={formOpen} title={f.id ? '통장계좌수정' : '통장계좌등록'} width={780} onClose={() => setFormOpen(false)}>{(
        <form onSubmit={save}>
          <ul className="ec-form">
            <li className="wide">
              <span className="title">계좌코드</span>
              <div className="form">
                {f.id && editing?.code ? <span>{f.code}</span> : (
                  <input className={`ec-input w-full ${invalid && !f.code.trim() ? 'border-ec-danger' : ''}`} aria-label="계좌코드" placeholder="계좌코드" autoFocus
                         value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} />
                )}
              </div>
            </li>
            <li className="wide">
              <span className="title">계좌명</span>
              <div className="form">
                <input className={`ec-input w-full ${invalid && !f.name.trim() ? 'border-ec-danger' : ''}`} aria-label="계좌명" placeholder="계좌명"
                       value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
              </div>
            </li>
            <li className="wide">
              <span className="title">계정</span>
              <div className="form">
                <select className="ec-input w-full" aria-label="계정" value={f.glAccountId} onChange={(e) => setF({ ...f, glAccountId: e.target.value })}>
                  {depositAccounts.map((a) => <option key={a.id} value={a.id}>{a.code} {a.name}</option>)}
                </select>
              </div>
            </li>
            <li className="wide">
              <span className="title">검색창내용</span>
              <div className="form"><input className="ec-input w-full" aria-label="검색창내용" placeholder="검색창내용" value={f.searchText} onChange={(e) => setF({ ...f, searchText: e.target.value })} /></div>
            </li>
            <li className="wide">
              <span className="title">적요</span>
              <div className="form"><textarea className="ec-input w-full" aria-label="적요" rows={2} placeholder="적요" value={f.remark} onChange={(e) => setF({ ...f, remark: e.target.value })} /></div>
            </li>
            <li className="wide">
              <span className="title">외화계좌</span>
              <div className="form">
                <select className="ec-input w-full" aria-label="외화계좌" value={f.currencyId} onChange={(e) => setF({ ...f, currencyId: e.target.value })}>
                  <option value="">미사용</option>
                  {currencies.map((c) => <option key={c.id} value={c.id}>{c.code} {c.name}</option>)}
                </select>
              </div>
            </li>
          </ul>
          <div className="relative flex gap-[6px] mt-[12px]">
            <button type="submit" className="ec-btn ec-btn-primary">저장(F8)</button>
            <button type="button" className="ec-btn" onClick={() => { if (editing) openEdit(editing); else openNew() }}>다시 작성</button>
            {f.id && (
              <span className="relative inline-flex">
                <button type="button" className="ec-btn" onClick={() => setEditMenu((v) => !v)}>사용중단/재사용 ▲</button>
                {editMenu && (
                  <div className="ec-menu top-auto bottom-[calc(100%+4px)] left-0 right-auto">
                    {(f.active ? ['사용중단', '삭제'] as const : ['재사용', '삭제'] as const)
                      .map((op) => <button key={op} type="button" onClick={() => void apply([f.id as number], op)}>{op}</button>)}
                  </div>
                )}
              </span>
            )}
            <button type="button" className="ec-btn" onClick={() => setFormOpen(false)}>닫기</button>
          </div>
        </form>
      )}</Modal>

      <Modal error={tError} open={!!tOpen} title="이체정보등록" width={780} onClose={() => setTOpen(null)}>{(
        <form onSubmit={saveTransfer}>
          <ul className="ec-form">
            <li className="wide">
              <span className="title">은행명</span>
              <div className="form">
                {/* 원본 은행명은 은행코드 코드도움(003 → 기업은행, 2026-10-21 실측) — 계좌에는 은행 이름을 든다. */}
                <div className={`w-full${tError && !t.bankName.trim() ? ' ec-invalid' : ''}`}>
                  <CodePickerField label="은행명" hideLabel pair fill placeholder="은행명" value={t.bankName} items={BANK_ITEMS}
                                   onChange={(v) => setT({ ...t, bankName: v })} />
                </div>
              </div>
            </li>
            <li className="wide">
              <span className="title">계좌번호</span>
              <div className="form"><input className="ec-input w-full" aria-label="계좌번호" placeholder="계좌번호" value={t.accountNo} onChange={(e) => setT({ ...t, accountNo: e.target.value })} /></div>
            </li>
            <li className="wide">
              <span className="title">예금주명</span>
              <div className="form"><input className="ec-input w-full" aria-label="예금주명" placeholder="예금주명" value={t.holder} onChange={(e) => setT({ ...t, holder: e.target.value })} /></div>
            </li>
            <li className="wide">
              <span className="title">적요1</span>
              <div className="form"><input className="ec-input w-full" aria-label="적요1" placeholder="적요1" value={t.remark1} onChange={(e) => setT({ ...t, remark1: e.target.value })} /></div>
            </li>
            <li className="wide">
              <span className="title">적요2</span>
              <div className="form"><input className="ec-input w-full" aria-label="적요2" placeholder="적요2" value={t.remark2} onChange={(e) => setT({ ...t, remark2: e.target.value })} /></div>
            </li>
          </ul>
          <div className="flex gap-[6px] mt-[12px]">
            <button type="submit" className="ec-btn ec-btn-primary">저장(F8)</button>
            <button type="button" className="ec-btn" onClick={() => tOpen && openTransfer(tOpen)}>다시 작성</button>
            <button type="button" className="ec-btn" onClick={() => setTOpen(null)}>닫기</button>
          </div>
        </form>
      )}</Modal>
    </EcListShell>
  )
}
