import { useEffect, useRef, useState } from 'react'
import EcListShell from '../../components/EcListShell'
import Modal from '../../components/Modal'
import CodePickerField from '../../components/CodePickerField'
import { EcCond } from '../../components/EcStatusPanel'
import { useTableSort } from '../../utils/useTableSort'
import { api, extractErrorMessage } from '../../api/client'
import type { BankAccountRow, CardKind, CreditCardRow } from '../../types/api'
import { ecConfirm } from '../../components/EcDialog'

interface AccountOption { id: number; code: string; name: string }

/**
 * 회계 I &gt; 기초등록 &gt; <b>카드등록</b> (원본 E010103, 화면 제목 '카드리스트') — 2026-10-13 loginaa 에서 등록 · 수정 · 사용중단 · 삭제해 본 그대로.
 *
 * <ul>
 *   <li>격자: 카드코드 · 카드명 · 구분(신용카드/체크카드) · 결제계좌명 · 계정명 · 카드관리자 · 검색창내용 · 사용(Yes/No) · 적요.
 *       버튼 신규(F2) · 사용중단/재사용 ▲(사용중단 · 삭제 · 재사용) · Excel · 웹자료올리기.</li>
 *   <li>[Search(F3)] 조건: 카드코드 · 카드명 · 결제계좌 · 검색창내용 · 적요 · 사용구분(전체 · <b>사용</b> · 사용중단).
 *       사용중단한 카드는 기본 목록에서 사라지고, 전체로 찾으면 분홍 줄에 No 로 나온다.</li>
 *   <li>신규 창 '신용카드등록': 카드코드 · 카드명 · 카드구분(신용카드) · 결제계좌 · 사업용 카드 구분(N) · 계정 · 카드관리자 · 검색창내용 · 적요.
 *       비우고 저장하면 카드코드 · 계정 칸이 빨개진다. 체크카드인데 결제계좌가 없으면 결제계좌가 빨개지고
 *       '돈나가는계좌를 선택합니다.' 풍선. 저장하면 안내 없이 창이 닫히고 목록에 붙는다.</li>
 *   <li>코드를 누르면 '신용카드수정' — 카드코드가 잠기고 [사용중단/재사용 ▲] 이 붙는다. 삭제는 '삭제하겠습니까?'.</li>
 * </ul>
 * 흐름: 카드의 [계정]이 카드사용 분개의 대변이 된다(기본 미지급금). 웹자료올리기는 아직 없다.
 */
export default function CardListPage() {
  const [rows, setRows] = useState<CreditCardRow[]>([])
  const [banks, setBanks] = useState<BankAccountRow[]>([])
  const [accounts, setAccounts] = useState<AccountOption[]>([])
  const [error, setError] = useState('')
  const [checked, setChecked] = useState<Set<number>>(new Set())
  const [quick, setQuick] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)
  const tableRef = useRef<HTMLTableElement>(null)

  /* 조회 조건 — 받아 둔 줄을 그 자리에서 거른다(서버를 다시 부르지 않는다) */
  const [cond, setCond] = useState({ code: '', name: '', bankId: '', searchText: '', remark: '', use: 'Y' as 'ALL' | 'Y' | 'N' })

  /* 신규 · 수정 창 */
  const [formOpen, setFormOpen] = useState(false)
  const [formError, setFormError] = useState('')
  const [invalid, setInvalid] = useState(false)
  const [editMenu, setEditMenu] = useState(false)
  const blank = { id: null as number | null, code: '', cardName: '', cardKind: 'CREDIT' as CardKind, settlementAccountId: '',
    businessUse: false, glAccountId: '', manager: '', searchText: '', remark: '', active: true }
  const [f, setF] = useState(blank)

  function load() {
    setError('')
    Promise.all([
      api.get<CreditCardRow[]>('/bank-cards/cards'),
      api.get<BankAccountRow[]>('/bank-cards/accounts'),
      api.get<AccountOption[]>('/accounts', { params: { slip: true } }),
    ]).then(([c, b, a]) => { setRows(c.data); setBanks(b.data); setAccounts(a.data) })
      .catch((e) => setError(extractErrorMessage(e)))
  }
  useEffect(() => { load() }, [])

  function openNew() {
    setF(blank); setFormError(''); setInvalid(false); setEditMenu(false); setFormOpen(true)
  }
  function openEdit(c: CreditCardRow) {
    setF({ id: c.id, code: c.code ?? c.cardNo, cardName: c.cardName, cardKind: c.cardKind,
      settlementAccountId: c.settlementAccountId ? String(c.settlementAccountId) : '', businessUse: c.businessUse,
      glAccountId: c.glAccountId ? String(c.glAccountId) : '', manager: c.manager ?? '', searchText: c.searchText ?? '',
      remark: c.remark ?? '', active: c.active })
    setFormError(''); setInvalid(false); setEditMenu(false); setFormOpen(true)
  }

  const needBank = f.cardKind === 'CHECK' && !f.settlementAccountId
  async function save(ev?: React.FormEvent) {
    ev?.preventDefault()
    if (!f.code.trim() || !f.glAccountId || needBank) {
      setInvalid(true)
      setFormError(needBank && f.code.trim() && f.glAccountId ? '돈나가는계좌를 선택합니다. 회계>기초등록>통장계좌등록에서 등록가능합니다.' : '')
      return
    }
    const old = rows.find((r) => r.id === f.id)
    const body = {
      code: f.code.trim(), cardName: f.cardName.trim(), cardKind: f.cardKind,
      settlementAccountId: f.settlementAccountId ? Number(f.settlementAccountId) : null,
      businessUse: f.businessUse, glAccountId: Number(f.glAccountId),
      manager: f.manager.trim(), searchText: f.searchText.trim(), remark: f.remark.trim(), active: f.active,
      // 원본 창에 없는 칸(카드사 · 카드번호 · 법인/개인 · 명의자 · 결제일)은 이미 있던 값을 그대로 보낸다.
      cardCompany: old?.cardCompany, cardNo: old?.cardNo, type: old?.type, ownerName: old?.ownerName, settlementDay: old?.settlementDay,
    }
    try {
      if (f.id) await api.put(`/bank-cards/cards/${f.id}`, body)
      else await api.post('/bank-cards/cards', body)
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
        if (op === '삭제') await api.delete(`/bank-cards/cards/${id}`)
        else await api.put(`/bank-cards/cards/${id}`, {
          code: c.code, cardName: c.cardName, cardCompany: c.cardCompany, cardNo: c.cardNo, type: c.type, ownerName: c.ownerName,
          settlementAccountId: c.settlementAccountId, settlementDay: c.settlementDay, remark: c.remark, active: op === '재사용',
        })
      }
      setFormOpen(false)
    } catch (e) {
      if (formOpen) setFormError(extractErrorMessage(e)); else setError(extractErrorMessage(e))
    }
    setChecked(new Set())
    load()
  }

  const has = (v: string | null | undefined, q: string) => !q || (v ?? '').includes(q)
  const shownRows = rows
    .filter((c) => cond.use === 'ALL' || (cond.use === 'Y') === c.active)
    .filter((c) => has(c.code ?? c.cardNo, cond.code) && has(c.cardName, cond.name) && has(c.searchText, cond.searchText)
      && has(c.remark, cond.remark) && (!cond.bankId || String(c.settlementAccountId) === cond.bankId))
    .filter((c) => !quick || has(c.code ?? c.cardNo, quick) || has(c.cardName, quick) || has(c.searchText, quick))
    .sort((a, b) => (a.code ?? a.cardNo).localeCompare(b.code ?? b.cardNo))
  const sort = useTableSort(shownRows, {
    카드코드: (c) => c.code ?? c.cardNo,
    카드명: (c) => c.cardName,
    구분: (c) => c.cardKindName,
    결제계좌명: (c) => c.settlementAccountName ?? '',
    카드관리자: (c) => c.manager ?? '',
    검색창내용: (c) => c.searchText ?? '',
    사용: (c) => (c.active ? 'Yes' : 'No'),
    적요: (c) => c.remark ?? '',
  })
  const shown = sort.sorted
  const allChecked = shown.length > 0 && shown.every((c) => checked.has(c.id))
  const bankItems = banks.filter((b) => b.active).map((b) => ({ value: String(b.id), code: b.code ?? b.accountNo, name: b.name ?? b.bankName }))
  const accountItems = accounts.map((a) => ({ value: String(a.id), code: a.code, name: a.name }))

  return (
    <EcListShell
      title="카드리스트"
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
        <EcCond label="카드코드"><input className="ec-input w-full" placeholder="카드코드" value={cond.code} onChange={(e) => setCond({ ...cond, code: e.target.value })} /></EcCond>
        <EcCond label="카드명"><input className="ec-input w-full" placeholder="카드명" value={cond.name} onChange={(e) => setCond({ ...cond, name: e.target.value })} /></EcCond>
        <EcCond label="결제계좌" pick>
          <CodePickerField label="결제계좌" hideLabel fill placeholder="결제계좌" value={cond.bankId} items={bankItems}
                           onChange={(v) => setCond({ ...cond, bankId: v })} />
        </EcCond>
        <EcCond label="검색창내용"><input className="ec-input w-full" placeholder="검색창내용" value={cond.searchText} onChange={(e) => setCond({ ...cond, searchText: e.target.value })} /></EcCond>
        <EcCond label="적요"><input className="ec-input w-full" placeholder="적요" value={cond.remark} onChange={(e) => setCond({ ...cond, remark: e.target.value })} /></EcCond>
        <EcCond label="사용구분">
          {([['ALL', '전체'], ['Y', '사용'], ['N', '사용중단']] as const).map(([v, l]) => (
            <label key={v} className="mr-[10px]"><input type="radio" name="card-use" checked={cond.use === v} onChange={() => setCond({ ...cond, use: v })} /> {l}</label>
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

      <table ref={tableRef} className="w-full text-left">
        <thead>
          <tr>
            <th className="w-[34px] text-center">
              <input type="checkbox" aria-label="전체 선택" checked={allChecked}
                     onChange={() => setChecked(allChecked ? new Set() : new Set(shown.map((c) => c.id)))} />
            </th>
            <th className="cursor-pointer" onClick={() => sort.toggle('카드코드')}>카드코드 {sort.mark('카드코드')}</th>
            <th className="cursor-pointer" onClick={() => sort.toggle('카드명')}>카드명 {sort.mark('카드명')}</th>
            <th className="cursor-pointer w-[100px] text-center" onClick={() => sort.toggle('구분')}>구분 {sort.mark('구분')}</th>
            <th className="cursor-pointer" onClick={() => sort.toggle('결제계좌명')}>결제계좌명 {sort.mark('결제계좌명')}</th>
            <th>계정명</th>
            <th className="cursor-pointer" onClick={() => sort.toggle('카드관리자')}>카드관리자 {sort.mark('카드관리자')}</th>
            <th className="cursor-pointer" onClick={() => sort.toggle('검색창내용')}>검색창내용 {sort.mark('검색창내용')}</th>
            <th className="cursor-pointer w-[90px] text-center" onClick={() => sort.toggle('사용')}>사용 {sort.mark('사용')}</th>
            <th className="cursor-pointer" onClick={() => sort.toggle('적요')}>적요 {sort.mark('적요')}</th>
          </tr>
        </thead>
        <tbody>
          {shown.length === 0 ? (
            <tr><td colSpan={10} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
          ) : shown.map((c) => (
            <tr key={c.id} className={c.active ? undefined : '[&>td]:bg-[var(--ec-bg-row-off)]'}>
              <td className="text-center">
                <input type="checkbox" aria-label={`${c.code ?? c.cardNo} 선택`} checked={checked.has(c.id)}
                       onChange={() => {
                         const next = new Set(checked)
                         if (next.has(c.id)) next.delete(c.id); else next.add(c.id)
                         setChecked(next)
                       }} />
              </td>
              <td><a href="#" onClick={(e) => { e.preventDefault(); openEdit(c) }}>{c.code ?? c.cardNo}</a></td>
              <td><a href="#" onClick={(e) => { e.preventDefault(); openEdit(c) }}>{c.cardName}</a></td>
              <td className="text-center">{c.cardKindName}</td>
              <td>{c.settlementAccountName ?? ''}</td>
              <td>{c.glAccountName ?? ''}</td>
              <td>{c.manager ?? ''}</td>
              <td>{c.searchText ?? ''}</td>
              <td className="text-center">{c.active ? 'Yes' : 'No'}</td>
              <td>{c.remark ?? ''}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <Modal error={formError} open={formOpen} title={f.id ? '신용카드수정' : '신용카드등록'} width={780} onClose={() => setFormOpen(false)}>{(
        <form onSubmit={save}>
          <ul className="ec-form">
            <li className="wide">
              <span className="title">카드코드</span>
              <div className="form">
                {f.id ? <span>{f.code}</span> : (
                  <input className={`ec-input w-full ${invalid && !f.code.trim() ? 'border-ec-danger' : ''}`} aria-label="카드코드" placeholder="카드코드" autoFocus
                         value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} />
                )}
              </div>
            </li>
            <li className="wide">
              <span className="title">카드명</span>
              <div className="form"><input className="ec-input w-full" aria-label="카드명" placeholder="카드명" value={f.cardName} onChange={(e) => setF({ ...f, cardName: e.target.value })} /></div>
            </li>
            <li className="wide">
              <span className="title">카드구분</span>
              <div className="form">
                {([['CREDIT', '신용카드'], ['CHECK', '체크카드']] as const).map(([v, l]) => (
                  <label key={v} className="mr-[10px]"><input type="radio" name="card-kind" checked={f.cardKind === v} onChange={() => setF({ ...f, cardKind: v })} /> {l}</label>
                ))}
              </div>
            </li>
            <li className="wide">
              <span className="title">결제계좌</span>
              <div className={`form ${invalid && needBank ? '[&_.ec-input]:border-ec-danger' : ''}`}>
                <CodePickerField label="결제계좌" hideLabel fill pair placeholder="결제계좌" emptyLabel="선택 해제" value={f.settlementAccountId} items={bankItems}
                                 onChange={(v) => setF({ ...f, settlementAccountId: v })} />
              </div>
            </li>
            <li className="wide">
              <span className="title">사업용 카드 구분</span>
              <div className="form">
                {([[true, 'Y'], [false, 'N']] as const).map(([v, l]) => (
                  <label key={l} className="mr-[10px]"><input type="radio" name="card-biz" checked={f.businessUse === v} onChange={() => setF({ ...f, businessUse: v })} /> {l}</label>
                ))}
              </div>
            </li>
            <li className="wide">
              <span className="title">계정</span>
              <div className={`form ${invalid && !f.glAccountId ? '[&_.ec-input]:border-ec-danger' : ''}`}>
                <CodePickerField label="계정" hideLabel fill placeholder="계정" emptyLabel="선택 해제" value={f.glAccountId} items={accountItems}
                                 onChange={(v) => setF({ ...f, glAccountId: v })} />
              </div>
            </li>
            <li className="wide">
              <span className="title">카드관리자</span>
              <div className="form"><input className="ec-input w-full" aria-label="카드관리자" placeholder="카드관리자" value={f.manager} onChange={(e) => setF({ ...f, manager: e.target.value })} /></div>
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
            <button type="button" className="ec-btn"
                    onClick={() => { const c = rows.find((x) => x.id === f.id); if (c) openEdit(c); else openNew() }}>다시 작성</button>
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
