import { useEffect, useState } from 'react'
import EcListShell from '../../components/EcListShell'
import Modal from '../../components/Modal'
import CodePickerField from '../../components/codepicker/CodePickerField'
import { EcCond } from '../../components/EcStatusPanel'
import { useTableSort } from '../../utils/useTableSort'
import { api, extractErrorMessage } from '../../api/client'
import type { BankAccountRow, CardIssuer } from '../../types/api'
import { ecConfirm } from '../../components/EcDialog'

interface AccountOption { id: number; code: string; name: string }

/**
 * 회계 I &gt; 기초등록 &gt; <b>카드사등록</b> (원본 E010109) — 2026-10-13 loginaa 에서 등록 · 수정 · 삭제 · 검증해 본 그대로.
 *
 * <ul>
 *   <li>격자: 카드사 코드 · 카드명 · 입금계좌코드 · 계정명(계정코드) · 수수료율(오른쪽, '3%' — 2.5 를 넣어도 정수로 반올림해 보인다) · 사용(Yes/No) · 검색창내용 · 적요.
 *       버튼 신규(F2) · 사용중단/재사용 ▲(사용중단 · 삭제 · 재사용) · Excel.</li>
 *   <li>[Search(F3)] 조건: 카드사 코드 · 카드사명 · 입금계좌 · 검색창내용 · 적요 · 사용구분(전체 · <b>사용</b> · 사용중단).</li>
 *   <li>신규 창 '카드사등록': 카드사 코드 · 카드사명 · 입금계좌(계좌 코드도움) · 계정 · 수수료율 % · 검색창내용 · 적요.
 *       비우고 저장하면 카드사명 · 입금계좌 · 계정이 빨개진다. 쓰인 코드면 '이미 등록된 코드입니다.'. 저장하면 안내 없이 닫힌다.</li>
 *   <li>코드를 누르면 '카드사수정' — 코드가 잠기고 [사용중단/재사용 ▲] 이 붙는다. 삭제는 '삭제하겠습니까?'.</li>
 * </ul>
 * 원본에만 있는 것: 카드사그룹1 · 2(그룹 마스터가 없다), 원본은 카드사 코드가 거래처코드와 한 이름공간이다.
 */
export default function CardIssuerListPage() {
  const [rows, setRows] = useState<CardIssuer[]>([])
  const [banks, setBanks] = useState<BankAccountRow[]>([])
  const [accounts, setAccounts] = useState<AccountOption[]>([])
  const [error, setError] = useState('')
  const [checked, setChecked] = useState<Set<number>>(new Set())
  const [quick, setQuick] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)

  const [cond, setCond] = useState({ code: '', name: '', bank: '', searchText: '', remark: '', use: 'Y' as 'ALL' | 'Y' | 'N' })

  const [formOpen, setFormOpen] = useState(false)
  const [formError, setFormError] = useState('')
  const [invalid, setInvalid] = useState(false)
  const [editMenu, setEditMenu] = useState(false)
  const blank = { id: null as number | null, code: '', name: '', bank: '', accountId: '', feeRate: '', searchText: '', remark: '', active: true }
  const [f, setF] = useState(blank)

  function load() {
    setError('')
    Promise.all([
      api.get<CardIssuer[]>('/card-issuers'),
      api.get<BankAccountRow[]>('/bank-cards/accounts'),
      api.get<AccountOption[]>('/accounts', { params: { slip: true } }),
    ]).then(([c, b, a]) => { setRows(c.data); setBanks(b.data); setAccounts(a.data) })
      .catch((e) => setError(extractErrorMessage(e)))
  }
  useEffect(() => { load() }, [])

  function openNew() {
    setF(blank); setFormError(''); setInvalid(false); setEditMenu(false); setFormOpen(true)
    /* 원본 신규 창은 [카드사 코드]에 다음 번호를 미리 채운다(2026-10-21 실측 00022 → 저장 뒤 00023). */
    api.get<{ code: string }>('/card-issuers/next-code')
      .then(({ data }) => setF((x) => (x.id == null && !x.code ? { ...x, code: data.code } : x))).catch(() => {})
  }
  function openEdit(c: CardIssuer) {
    setF({ id: c.id, code: c.code, name: c.name, bank: c.depositAccount ?? '', accountId: c.accountId != null ? String(c.accountId) : '',
      feeRate: c.feeRate != null ? String(c.feeRate) : '', searchText: c.searchKeyword ?? '', remark: c.remark ?? '', active: c.active })
    setFormError(''); setInvalid(false); setEditMenu(false); setFormOpen(true)
  }

  function bodyOf(c: CardIssuer) {
    return { name: c.name, feeRate: c.feeRate, remark: c.remark, accountId: c.accountId, depositAccount: c.depositAccount,
      searchKeyword: c.searchKeyword, active: c.active }
  }

  async function save(ev?: React.FormEvent) {
    ev?.preventDefault()
    if (!f.name.trim() || !f.bank || !f.accountId) { setInvalid(true); setFormError(''); return }
    if (!f.id && f.code.trim() && rows.some((r) => r.code === f.code.trim())) { setFormError('이미 등록된 코드입니다.'); return }
    const body = {
      name: f.name.trim(), feeRate: f.feeRate ? Number(f.feeRate) : 0, remark: f.remark.trim(),
      accountId: Number(f.accountId), depositAccount: f.bank, searchKeyword: f.searchText.trim(), active: f.active,
    }
    try {
      if (f.id) await api.put(`/card-issuers/${f.id}`, body)
      else await api.post('/card-issuers', { code: f.code.trim() || undefined, ...body })
      setFormOpen(false)
      load()
    } catch (e) {
      setFormError(extractErrorMessage(e))
    }
  }

  async function apply(ids: number[], op: '사용중단' | '삭제' | '재사용') {
    setMenuOpen(false); setEditMenu(false)
    if (ids.length === 0) { setError('선택된 데이터가 없습니다.'); return }
    if (op === '삭제' && !(await ecConfirm('삭제하겠습니까?'))) return
    try {
      for (const id of ids) {
        const c = rows.find((r) => r.id === id)
        if (!c) continue
        if (op === '삭제') await api.delete(`/card-issuers/${id}`)
        else await api.put(`/card-issuers/${id}`, { ...bodyOf(c), active: op === '재사용' })
      }
      setFormOpen(false)
    } catch (e) {
      if (formOpen) setFormError(extractErrorMessage(e)); else setError(extractErrorMessage(e))
    }
    setChecked(new Set())
    load()
  }

  const has = (v: string | null | undefined, q: string) => !q || (v ?? '').includes(q)
  const accountOf = (c: CardIssuer) => accounts.find((a) => a.id === c.accountId)
  const shownRows = rows
    .filter((c) => cond.use === 'ALL' || (cond.use === 'Y') === c.active)
    .filter((c) => has(c.code, cond.code) && has(c.name, cond.name) && has(c.searchKeyword, cond.searchText)
      && has(c.remark, cond.remark) && (!cond.bank || c.depositAccount === cond.bank))
    .filter((c) => !quick || has(c.code, quick) || has(c.name, quick) || has(c.searchKeyword, quick))
  const sort = useTableSort(shownRows, {
    '카드사 코드': (c) => c.code,
    카드명: (c) => c.name,
    입금계좌코드: (c) => c.depositAccount ?? '',
    수수료율: (c) => Number(c.feeRate ?? 0),
    사용: (c) => (c.active ? 'Yes' : 'No'),
    검색창내용: (c) => c.searchKeyword ?? '',
    적요: (c) => c.remark ?? '',
  })
  const shown = sort.sorted
  const allChecked = shown.length > 0 && shown.every((c) => checked.has(c.id))
  const bankItems = banks.filter((b) => b.active).map((b) => ({ value: b.code ?? b.accountNo, code: b.code ?? b.accountNo, name: b.name ?? b.bankName }))
  const accountItems = accounts.map((a) => ({ value: String(a.id), code: a.code, name: a.name }))
  const editing = rows.find((r) => r.id === f.id)

  return (
    <EcListShell
      title="카드사등록"
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
        <EcCond label="카드사 코드"><input className="ec-input w-full" placeholder="카드사 코드" value={cond.code} onChange={(e) => setCond({ ...cond, code: e.target.value })} /></EcCond>
        <EcCond label="카드사명"><input className="ec-input w-full" placeholder="카드사명" value={cond.name} onChange={(e) => setCond({ ...cond, name: e.target.value })} /></EcCond>
        <EcCond label="입금계좌" pick>
          <CodePickerField label="입금계좌" hideLabel fill placeholder="입금계좌" value={cond.bank} items={bankItems}
                           onChange={(v) => setCond({ ...cond, bank: v })} />
        </EcCond>
        <EcCond label="검색창내용"><input className="ec-input w-full" placeholder="검색창내용" value={cond.searchText} onChange={(e) => setCond({ ...cond, searchText: e.target.value })} /></EcCond>
        <EcCond label="적요"><input className="ec-input w-full" placeholder="적요" value={cond.remark} onChange={(e) => setCond({ ...cond, remark: e.target.value })} /></EcCond>
        <EcCond label="사용구분">
          {([['ALL', '전체'], ['Y', '사용'], ['N', '사용중단']] as const).map(([v, l]) => (
            <label key={v} className="mr-[10px]"><input type="radio" name="issuer-use" checked={cond.use === v} onChange={() => setCond({ ...cond, use: v })} /> {l}</label>
          ))}
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
                     onChange={() => setChecked(allChecked ? new Set() : new Set(shown.map((c) => c.id)))} />
            </th>
            <th className="cursor-pointer" onClick={() => sort.toggle('카드사 코드')}>카드사 코드 {sort.mark('카드사 코드')}</th>
            <th className="cursor-pointer" onClick={() => sort.toggle('카드명')}>카드명 {sort.mark('카드명')}</th>
            <th className="cursor-pointer" onClick={() => sort.toggle('입금계좌코드')}>입금계좌코드 {sort.mark('입금계좌코드')}</th>
            <th>계정명(계정코드)</th>
            <th className="cursor-pointer w-[90px] text-center" onClick={() => sort.toggle('수수료율')}>수수료율 {sort.mark('수수료율')}</th>
            <th className="cursor-pointer w-[90px] text-center" onClick={() => sort.toggle('사용')}>사용 {sort.mark('사용')}</th>
            <th className="cursor-pointer" onClick={() => sort.toggle('검색창내용')}>검색창내용 {sort.mark('검색창내용')}</th>
            <th className="cursor-pointer" onClick={() => sort.toggle('적요')}>적요 {sort.mark('적요')}</th>
          </tr>
        </thead>
        <tbody>
          {shown.length === 0 ? (
            <tr><td colSpan={9} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
          ) : shown.map((c) => {
            const acc = accountOf(c)
            return (
              <tr key={c.id} className={c.active ? undefined : '[&>td]:bg-[var(--ec-bg-row-off)]'}>
                <td className="text-center">
                  <input type="checkbox" aria-label={`${c.code} 선택`} checked={checked.has(c.id)}
                         onChange={() => {
                           const next = new Set(checked)
                           if (next.has(c.id)) next.delete(c.id); else next.add(c.id)
                           setChecked(next)
                         }} />
                </td>
                <td><a href="#" onClick={(e) => { e.preventDefault(); openEdit(c) }}>{c.code}</a></td>
                <td><a href="#" onClick={(e) => { e.preventDefault(); openEdit(c) }}>{c.name}</a></td>
                <td>{c.depositAccount ?? ''}</td>
                <td>{acc ? `${acc.name}(${acc.code})` : (c.accountName ?? '')}</td>
                <td className="text-right">{c.feeRate != null ? `${Math.round(Number(c.feeRate))}%` : ''}</td>
                <td className="text-center">{c.active ? 'Yes' : 'No'}</td>
                <td>{c.searchKeyword ?? ''}</td>
                <td>{c.remark ?? ''}</td>
              </tr>
            )
          })}
        </tbody>
      </table>

      <Modal error={formError} open={formOpen} title={f.id ? '카드사수정' : '카드사등록'} width={780} onClose={() => setFormOpen(false)}>{(
        <form onSubmit={save}>
          <ul className="ec-form">
            <li className="wide">
              <span className="title">카드사 코드</span>
              <div className="form">
                {f.id ? <span>{f.code}</span> : (
                  <input className="ec-input w-full" aria-label="카드사 코드" placeholder="카드사 코드" value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} />
                )}
              </div>
            </li>
            <li className="wide">
              <span className="title">카드사명</span>
              <div className="form">
                <input className={`ec-input w-full ${invalid && !f.name.trim() ? 'border-ec-danger' : ''}`} aria-label="카드사명" placeholder="카드사명" autoFocus
                       value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
              </div>
            </li>
            <li className="wide">
              <span className="title">입금계좌</span>
              <div className={`form ${invalid && !f.bank ? '[&_.ec-input]:border-ec-danger' : ''}`}>
                <CodePickerField label="입금계좌" hideLabel fill placeholder="입금계좌" emptyLabel="선택 해제" value={f.bank} items={bankItems}
                                 onChange={(v) => setF({ ...f, bank: v })} />
              </div>
            </li>
            <li className="wide">
              <span className="title">계정</span>
              <div className={`form ${invalid && !f.accountId ? '[&_.ec-input]:border-ec-danger' : ''}`}>
                <CodePickerField label="계정" hideLabel fill placeholder="계정" emptyLabel="선택 해제" value={f.accountId} items={accountItems}
                                 onChange={(v) => setF({ ...f, accountId: v })} />
              </div>
            </li>
            <li className="wide">
              <span className="title">수수료율</span>
              <div className="form">
                <input className="ec-input w-[120px] text-right" aria-label="수수료율" type="number" step="any" min={0} max={100}
                       value={f.feeRate} onChange={(e) => setF({ ...f, feeRate: e.target.value })} /> %
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
    </EcListShell>
  )
}
