import { useEffect, useState } from 'react'
import EcListShell from '../../components/EcListShell'
import Modal from '../../components/Modal'
import CodePickerField from '../../components/CodePickerField'
import { EcCond } from '../../components/EcStatusPanel'
import { useTableSort } from '../../utils/useTableSort'
import { api, extractErrorMessage } from '../../api/client'
import type { BankAccountRow, PaymentAgency } from '../../types/api'

interface AccountOption { id: number; code: string; name: string }

/** 원본 [결제대행사코드구분] 라디오 — 거래처등록과 같은 셋. */
const REG_KINDS = ['사업자등록번호', '주민등록번호', '외국인']

/**
 * 회계 I &gt; 기초등록 &gt; <b>결제대행사등록</b> (원본 E010114 '결제대행사리스트') — 2026-10-13 loginaa 에서 등록 · 수정 · 삭제 · 검증해 본 그대로.
 *
 * <ul>
 *   <li>격자: 결제대행사코드 · 결제대행사명 · 대표자명 · 계정명(이름만) · 검색창내용 · 수수료율(가운데, 정수 % — 2.5 → 3%) · 사용구분(Yes/No).
 *       버튼 신규(F2) · 사용중단/재사용 ▲(사용중단 · 삭제 · 재사용) · Excel.</li>
 *   <li>[Search(F3)] 조건: 결제대행사코드 · 결제대행사명 · 입금계좌 · 검색창내용 · 적요 · 사용구분(전체 · <b>사용</b> · 사용중단).</li>
 *   <li>신규 창 '결제대행사등록': 비우고 저장하면 <b>결제대행사코드 · 결제대행사명 · 계정</b>이 빨개진다(코드도 필수). 저장하면 안내 없이 닫힌다.</li>
 *   <li>코드를 누르면 '결제대행사수정' — 코드가 잠기고 [사용중단/재사용 ▲] 이 붙는다. 삭제는 '삭제하겠습니까?'.</li>
 * </ul>
 * 원본에만 있는 것: 결제대행사그룹1 · 2 · [이체정보] 열(은행 · 계좌번호 · 예금주 리스트) · 외화거래처의 통화 고르기 · 세무신고거래처의 검색입력 · 직접입력.
 */
export default function PaymentAgencyListPage() {
  const [rows, setRows] = useState<PaymentAgency[]>([])
  const [banks, setBanks] = useState<BankAccountRow[]>([])
  const [accounts, setAccounts] = useState<AccountOption[]>([])
  const [error, setError] = useState('')
  const [checked, setChecked] = useState<Set<number>>(new Set())
  const [quick, setQuick] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)

  const [cond, setCond] = useState({ code: '', name: '', bank: '', searchText: '', remark: '', use: 'Y' as 'ALL' | 'Y' | 'N' })
  /** 원본 조건 판의 [상세] 탭 — 거래처처럼 대표자 · 연락처 · 주소로 좁힌다(ecount-form-fields 결제대행사등록). */
  const [detail, setDetail] = useState({ ceoName: '', phone: '', email: '', bizType: '', bizItem: '', manager: '', postalCode: '', address: '', postalCode2: '', address2: '' })

  const [formOpen, setFormOpen] = useState(false)
  const [formError, setFormError] = useState('')
  const [invalid, setInvalid] = useState(false)
  const [editMenu, setEditMenu] = useState(false)
  const blank = {
    id: null as number | null, code: '', name: '', regNoKind: '사업자등록번호', ceoName: '', phone: '', email: '',
    bizType: '', bizItem: '', manager: '', foreignCurrency: false, accountId: '', bank: '', feeRate: '', searchText: '',
    postalCode: '', address: '', postalCode2: '', address2: '', taxReport: true, remark: '', active: true,
  }
  const [f, setF] = useState(blank)
  const set = <K extends keyof typeof blank>(k: K, v: (typeof blank)[K]) => setF((o) => ({ ...o, [k]: v }))

  function load() {
    setError('')
    Promise.all([
      api.get<PaymentAgency[]>('/payment-agencies'),
      api.get<BankAccountRow[]>('/bank-cards/accounts'),
      api.get<AccountOption[]>('/accounts'),
    ]).then(([p, b, a]) => { setRows(p.data); setBanks(b.data); setAccounts(a.data) })
      .catch((e) => setError(extractErrorMessage(e)))
  }
  useEffect(() => { load() }, [])

  function openNew() {
    setF(blank); setFormError(''); setInvalid(false); setEditMenu(false); setFormOpen(true)
  }
  function openEdit(a: PaymentAgency) {
    setF({
      id: a.id, code: a.code, name: a.name, regNoKind: a.regNoKind || '사업자등록번호', ceoName: a.ceoName ?? '', phone: a.phone ?? '',
      email: a.email ?? '', bizType: a.bizType ?? '', bizItem: a.bizItem ?? '', manager: a.manager ?? '', foreignCurrency: a.foreignCurrency,
      accountId: a.accountId != null ? String(a.accountId) : '', bank: a.depositAccount ?? '', feeRate: a.feeRate != null ? String(a.feeRate) : '',
      searchText: a.searchKeyword ?? '', postalCode: a.postalCode ?? '', address: a.address ?? '', postalCode2: a.postalCode2 ?? '',
      address2: a.address2 ?? '', taxReport: a.taxReport, remark: a.remark ?? '', active: a.active,
    })
    setFormError(''); setInvalid(false); setEditMenu(false); setFormOpen(true)
  }

  const opt = (v: string | null | undefined) => (v && v.trim()) || undefined
  function bodyOf(a: PaymentAgency) {
    return {
      name: a.name, ceoName: a.ceoName, phone: a.phone, email: a.email, remark: a.remark, accountId: a.accountId,
      depositAccount: a.depositAccount, searchKeyword: a.searchKeyword, feeRate: a.feeRate, regNoKind: a.regNoKind,
      foreignCurrency: a.foreignCurrency, bizType: a.bizType, bizItem: a.bizItem, manager: a.manager, taxReport: a.taxReport,
      postalCode: a.postalCode, address: a.address, postalCode2: a.postalCode2, address2: a.address2, active: a.active,
    }
  }

  async function save(ev?: React.FormEvent) {
    ev?.preventDefault()
    if ((!f.id && !f.code.trim()) || !f.name.trim() || !f.accountId) { setInvalid(true); setFormError(''); return }
    if (!f.id && rows.some((r) => r.code === f.code.trim())) { setFormError('이미 등록된 코드입니다.'); return }
    const body = {
      name: f.name.trim(), ceoName: opt(f.ceoName), phone: opt(f.phone), email: opt(f.email), remark: opt(f.remark),
      accountId: Number(f.accountId), depositAccount: opt(f.bank), searchKeyword: opt(f.searchText),
      feeRate: f.feeRate ? Number(f.feeRate) : 0, regNoKind: f.regNoKind, foreignCurrency: f.foreignCurrency,
      bizType: opt(f.bizType), bizItem: opt(f.bizItem), manager: opt(f.manager), taxReport: f.taxReport,
      postalCode: opt(f.postalCode), address: opt(f.address), postalCode2: opt(f.postalCode2), address2: opt(f.address2),
    }
    try {
      if (f.id) await api.put(`/payment-agencies/${f.id}`, { ...body, active: f.active })
      else await api.post('/payment-agencies', { code: f.code.trim(), ...body })
      setFormOpen(false)
      load()
    } catch (e) {
      setFormError(extractErrorMessage(e))
    }
  }

  async function apply(ids: number[], op: '사용중단' | '삭제' | '재사용') {
    setMenuOpen(false); setEditMenu(false)
    if (ids.length === 0) { setError('선택된 데이터가 없습니다.'); return }
    if (op === '삭제' && !window.confirm('삭제하겠습니까?')) return
    try {
      for (const id of ids) {
        const a = rows.find((r) => r.id === id)
        if (!a) continue
        if (op === '삭제') await api.delete(`/payment-agencies/${id}`)
        else await api.put(`/payment-agencies/${id}`, { ...bodyOf(a), active: op === '재사용' })
      }
      setFormOpen(false)
    } catch (e) {
      if (formOpen) setFormError(extractErrorMessage(e)); else setError(extractErrorMessage(e))
    }
    setChecked(new Set())
    load()
  }

  const has = (v: string | null | undefined, q: string) => !q || (v ?? '').includes(q)
  const accountOf = (a: PaymentAgency) => accounts.find((x) => x.id === a.accountId)
  const shownRows = rows
    .filter((a) => cond.use === 'ALL' || (cond.use === 'Y') === a.active)
    .filter((a) => has(a.code, cond.code) && has(a.name, cond.name) && has(a.searchKeyword, cond.searchText)
      && has(a.remark, cond.remark) && (!cond.bank || a.depositAccount === cond.bank))
    .filter((a) => has(a.ceoName, detail.ceoName) && has(a.phone, detail.phone) && has(a.email, detail.email)
      && has(a.bizType, detail.bizType) && has(a.bizItem, detail.bizItem) && (!detail.manager || a.manager === detail.manager)
      && has(a.postalCode, detail.postalCode) && has(a.address, detail.address)
      && has(a.postalCode2, detail.postalCode2) && has(a.address2, detail.address2))
    .filter((a) => !quick || has(a.code, quick) || has(a.name, quick) || has(a.searchKeyword, quick))
  const sort = useTableSort(shownRows, {
    결제대행사코드: (a) => a.code,
    결제대행사명: (a) => a.name,
    대표자명: (a) => a.ceoName ?? '',
    검색창내용: (a) => a.searchKeyword ?? '',
    수수료율: (a) => Number(a.feeRate ?? 0),
    사용구분: (a) => (a.active ? 'Yes' : 'No'),
  })
  const shown = sort.sorted
  const allChecked = shown.length > 0 && shown.every((a) => checked.has(a.id))
  const bankItems = banks.filter((b) => b.active).map((b) => ({ value: b.code ?? b.accountNo, code: b.code ?? b.accountNo, name: b.name ?? b.bankName }))
  const accountItems = accounts.map((a) => ({ value: String(a.id), code: a.code, name: a.name }))
  const editing = rows.find((r) => r.id === f.id)
  const red = (bad: boolean) => (invalid && bad ? 'border-ec-danger' : '')
  const text = (label: string, k: 'ceoName' | 'phone' | 'email' | 'bizType' | 'bizItem' | 'manager' | 'searchText' | 'postalCode' | 'address' | 'postalCode2' | 'address2') => (
    <li className="wide">
      <span className="title">{label}</span>
      <div className="form"><input className="ec-input w-full" aria-label={label} placeholder={label} value={f[k]} onChange={(e) => set(k, e.target.value)} /></div>
    </li>
  )

  return (
    <EcListShell
      title="결제대행사리스트"
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
        <EcCond label="결제대행사코드"><input className="ec-input w-full" placeholder="결제대행사코드" value={cond.code} onChange={(e) => setCond({ ...cond, code: e.target.value })} /></EcCond>
        <EcCond label="결제대행사명"><input className="ec-input w-full" placeholder="결제대행사명" value={cond.name} onChange={(e) => setCond({ ...cond, name: e.target.value })} /></EcCond>
        <EcCond label="입금계좌" pick>
          <CodePickerField label="입금계좌" hideLabel fill placeholder="입금계좌" value={cond.bank} items={bankItems}
                           onChange={(v) => setCond({ ...cond, bank: v })} />
        </EcCond>
        <EcCond label="검색창내용"><input className="ec-input w-full" placeholder="검색창내용" value={cond.searchText} onChange={(e) => setCond({ ...cond, searchText: e.target.value })} /></EcCond>
        <EcCond label="적요"><input className="ec-input w-full" placeholder="적요" value={cond.remark} onChange={(e) => setCond({ ...cond, remark: e.target.value })} /></EcCond>
        <EcCond label="사용구분">
          {([['ALL', '전체'], ['Y', '사용'], ['N', '사용중단']] as const).map(([v, l]) => (
            <label key={v} className="mr-[10px]"><input type="radio" name="agency-use" checked={cond.use === v} onChange={() => setCond({ ...cond, use: v })} /> {l}</label>
          ))}
        </EcCond>
        <EcCond label="대표자명"><input className="ec-input w-full" placeholder="대표자명" value={detail.ceoName} onChange={(e) => setDetail({ ...detail, ceoName: e.target.value })} /></EcCond>
        <EcCond label="전화"><input className="ec-input w-full" placeholder="전화" value={detail.phone} onChange={(e) => setDetail({ ...detail, phone: e.target.value })} /></EcCond>
        <EcCond label="Email"><input className="ec-input w-full" placeholder="Email" value={detail.email} onChange={(e) => setDetail({ ...detail, email: e.target.value })} /></EcCond>
        <EcCond label="업태"><input className="ec-input w-full" placeholder="업태" value={detail.bizType} onChange={(e) => setDetail({ ...detail, bizType: e.target.value })} /></EcCond>
        <EcCond label="종목"><input className="ec-input w-full" placeholder="종목" value={detail.bizItem} onChange={(e) => setDetail({ ...detail, bizItem: e.target.value })} /></EcCond>
        <EcCond label="담당자" pick>
          <CodePickerField label="담당자" hideLabel fill placeholder="담당자" emptyLabel="전체" value={detail.manager}
                           onChange={(v) => setDetail({ ...detail, manager: v })}
                           items={[...new Set(rows.map((a) => a.manager).filter(Boolean) as string[])].sort().map((n) => ({ value: n, name: n }))} />
        </EcCond>
        <EcCond label="우편번호1"><input className="ec-input w-full" placeholder="우편번호1" value={detail.postalCode} onChange={(e) => setDetail({ ...detail, postalCode: e.target.value })} /></EcCond>
        <EcCond label="주소1"><input className="ec-input w-full" placeholder="주소1" value={detail.address} onChange={(e) => setDetail({ ...detail, address: e.target.value })} /></EcCond>
        <EcCond label="우편번호2"><input className="ec-input w-full" placeholder="우편번호2" value={detail.postalCode2} onChange={(e) => setDetail({ ...detail, postalCode2: e.target.value })} /></EcCond>
        <EcCond label="주소2"><input className="ec-input w-full" placeholder="주소2" value={detail.address2} onChange={(e) => setDetail({ ...detail, address2: e.target.value })} /></EcCond>
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

      {/* 원본 격자 머리는 굵지 않다(12px 400 — 2026-10-13 실측) */}
      <table className="w-full text-left [&_th]:font-normal">
        <thead>
          <tr>
            <th className="w-[34px] text-center">
              <input type="checkbox" aria-label="전체 선택" checked={allChecked}
                     onChange={() => setChecked(allChecked ? new Set() : new Set(shown.map((a) => a.id)))} />
            </th>
            <th className="cursor-pointer" onClick={() => sort.toggle('결제대행사코드')}>결제대행사코드 {sort.mark('결제대행사코드')}</th>
            <th className="cursor-pointer" onClick={() => sort.toggle('결제대행사명')}>결제대행사명 {sort.mark('결제대행사명')}</th>
            <th className="cursor-pointer text-center" onClick={() => sort.toggle('대표자명')}>대표자명 {sort.mark('대표자명')}</th>
            <th>계정명</th>
            <th className="cursor-pointer" onClick={() => sort.toggle('검색창내용')}>검색창내용 {sort.mark('검색창내용')}</th>
            <th className="cursor-pointer w-[90px] text-center" onClick={() => sort.toggle('수수료율')}>수수료율 {sort.mark('수수료율')}</th>
            <th className="cursor-pointer w-[90px] text-center" onClick={() => sort.toggle('사용구분')}>사용구분 {sort.mark('사용구분')}</th>
          </tr>
        </thead>
        <tbody>
          {shown.length === 0 ? (
            <tr><td colSpan={8} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
          ) : shown.map((a) => (
            <tr key={a.id} className={a.active ? undefined : '[&>td]:bg-[var(--ec-bg-row-off)]'}>
              <td className="text-center">
                <input type="checkbox" aria-label={`${a.code} 선택`} checked={checked.has(a.id)}
                       onChange={() => {
                         const next = new Set(checked)
                         if (next.has(a.id)) next.delete(a.id); else next.add(a.id)
                         setChecked(next)
                       }} />
              </td>
              <td><a href="#" onClick={(e) => { e.preventDefault(); openEdit(a) }}>{a.code}</a></td>
              <td><a href="#" onClick={(e) => { e.preventDefault(); openEdit(a) }}>{a.name}</a></td>
              <td className="text-center">{a.ceoName ?? ''}</td>
              <td>{accountOf(a)?.name ?? a.accountName ?? ''}</td>
              <td>{a.searchKeyword ?? ''}</td>
              <td className="text-center">{a.feeRate != null ? `${Math.round(Number(a.feeRate))}%` : ''}</td>
              <td className="text-center">{a.active ? 'Yes' : 'No'}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <Modal error={formError} open={formOpen} title={f.id ? '결제대행사수정' : '결제대행사등록'} width={780} onClose={() => setFormOpen(false)}>{(
        <form onSubmit={save}>
          <ul className="ec-form">
            <li className="wide">
              <span className="title">결제대행사코드</span>
              <div className="form">
                {f.id ? <span>{f.code}</span> : (
                  <input className={`ec-input w-full ${red(!f.code.trim())}`} aria-label="결제대행사코드" placeholder="결제대행사코드" value={f.code} onChange={(e) => set('code', e.target.value)} />
                )}
              </div>
            </li>
            <li className="wide">
              <span className="title">결제대행사명</span>
              <div className="form">
                <input className={`ec-input w-full ${red(!f.name.trim())}`} aria-label="결제대행사명" placeholder="결제대행사명" autoFocus
                       value={f.name} onChange={(e) => set('name', e.target.value)} />
              </div>
            </li>
            <li className="wide">
              <span className="title">결제대행사코드구분</span>
              <div className="form">
                {REG_KINDS.map((k) => (
                  <label key={k} className="mr-[10px]"><input type="radio" name="agency-regkind" checked={f.regNoKind === k} onChange={() => set('regNoKind', k)} /> {k}</label>
                ))}
              </div>
            </li>
            {text('대표자명', 'ceoName')}
            {text('전화', 'phone')}
            {text('Email', 'email')}
            {text('업태', 'bizType')}
            {text('종목', 'bizItem')}
            {text('담당자', 'manager')}
            <li className="wide">
              <span className="title">외화거래처</span>
              <div className="form">
                <select className="ec-input w-full" aria-label="외화거래처" value={f.foreignCurrency ? 'Y' : 'N'} onChange={(e) => set('foreignCurrency', e.target.value === 'Y')}>
                  <option value="N">내자</option><option value="Y">외화</option>
                </select>
              </div>
            </li>
            <li className="wide">
              <span className="title">계정</span>
              <div className={`form ${invalid && !f.accountId ? '[&_.ec-input]:border-ec-danger' : ''}`}>
                <CodePickerField label="계정" hideLabel fill placeholder="계정" emptyLabel="선택 해제" value={f.accountId} items={accountItems}
                                 onChange={(v) => set('accountId', v)} />
              </div>
            </li>
            <li className="wide">
              <span className="title">입금계좌</span>
              <div className="form">
                <CodePickerField label="입금계좌" hideLabel fill placeholder="입금계좌" emptyLabel="선택 해제" value={f.bank} items={bankItems}
                                 onChange={(v) => set('bank', v)} />
              </div>
            </li>
            <li className="wide">
              <span className="title">수수료율</span>
              <div className="form">
                <input className="ec-input w-[120px] text-right" aria-label="수수료율" type="number" step="any" min={0} max={100}
                       value={f.feeRate} onChange={(e) => set('feeRate', e.target.value)} /> %
              </div>
            </li>
            {text('검색창내용', 'searchText')}
            {text('주소1 우편번호', 'postalCode')}
            {text('주소1', 'address')}
            {text('주소2 우편번호', 'postalCode2')}
            {text('주소2', 'address2')}
            <li className="wide">
              <span className="title">세무신고거래처</span>
              <div className="form">
                <label><input type="checkbox" aria-label="세무신고거래처" checked={f.taxReport} onChange={(e) => set('taxReport', e.target.checked)} /> 거래처코드동일</label>
              </div>
            </li>
            <li className="wide">
              <span className="title">적요</span>
              <div className="form"><textarea className="ec-input w-full" aria-label="적요" rows={2} placeholder="적요" value={f.remark} onChange={(e) => set('remark', e.target.value)} /></div>
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
