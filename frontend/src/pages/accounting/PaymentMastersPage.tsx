import { useEffect, useState, type FormEvent } from 'react'
import { EcCond } from '../../components/EcStatusPanel'
import EcListShell from '../../components/EcListShell'
import Modal from '../../components/Modal'
import { api, extractErrorMessage } from '../../api/client'
import type { Account, CardIssuer, PaymentAgency } from '../../api/types'
import CodePickerField from '../../components/CodePickerField'

/**
 * 재고/회계 기초등록 > 카드사등록(E010109) · 결제대행사등록(E010114)
 * 카드등록의 카드사 선택지 / 온라인 PG 목록이 되는 고립 CRUD 마스터.
 * 백엔드 신규: card_issuers · payment_agencies 테이블 + /api/card-issuers · /api/payment-agencies
 * 트윈 마스터라 한 컴포넌트를 defaultTab prop 으로 두 라우트에서 재사용(PurchaseRequestStatusPage 선례).
 */
type Tab = 'card' | 'agency'

const emptyCard = {
  code: '', name: '', feeRate: '', remark: '',
  accountId: '', depositAccount: '', searchKeyword: '',
}
const emptyAgency = {
  code: '', name: '', ceoName: '', phone: '', email: '', remark: '',
  accountId: '', depositAccount: '', searchKeyword: '', feeRate: '',
  regNoKind: '사업자등록번호', industryKind: '일반',
  bizType: '', bizItem: '', manager: '', taxReport: true,
  postalCode: '', address: '', postalCode2: '', address2: '',
}
/** 원본 [결제대행사코드구분]·[업종별구분]의 값 — 거래처등록과 같은 셋이다. */
const REG_KINDS = ['사업자등록번호', '주민등록번호', '외국인']
const INDUSTRY_KINDS = ['일반', '관세사', '외화거래처']

export default function PaymentMastersPage({ defaultTab = 'card' }: { defaultTab?: Tab }) {
  const [tab, setTab] = useState<Tab>(defaultTab)
  const [cards, setCards] = useState<CardIssuer[]>([])
  const [agencies, setAgencies] = useState<PaymentAgency[]>([])
  /** 원본 [계정]의 코드도움 후보. 화면이 지어내지 않고 서버가 주는 것을 쓴다. */
  const [accounts, setAccounts] = useState<Account[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<number | null>(null)
  const [cardForm, setCardForm] = useState(emptyCard)
  const [agencyForm, setAgencyForm] = useState(emptyAgency)

  /*
   * <b>조건 판이 통째로 없었다.</b> 원본 카드사등록·결제대행사등록에는 코드·이름·사용구분으로
   * 좁히는 자리가 있는데, 우리 화면은 표만 있어서 카드사가 스무 개만 넘어도 눈으로 찾아야 했다.
   *
   * <p>원본 조건은 스물 남짓이지만 대부분 우리에게 없는 값이다(그룹1·2 · 업태·종목 ·
   * 주소·우편번호 · 세무신고거래처 · 외화거래처). <b>값이 실제로 있는 셋</b>만 만든다 —
   * 코드 · 이름 · 사용구분. 두 탭이 같은 조건을 쓰므로 한 벌로 둔다.
   */
  const [cond, setCond] = useState({ code: '', name: '', use: '전체' as '전체' | '사용' | '중지' })
  const setC = (patch: Partial<typeof cond>) => setCond((c) => ({ ...c, ...patch }))
  const narrow = <T extends { code: string; name: string; active: boolean }>(rows: T[]) => rows
    .filter((r) => !cond.code || r.code.includes(cond.code))
    .filter((r) => !cond.name || r.name.includes(cond.name))
    .filter((r) => cond.use === '전체' || (r.active ? '사용' : '중지') === cond.use)
  const shownCards = narrow(cards)
  const shownAgencies = narrow(agencies)

  useEffect(() => { setTab(defaultTab) }, [defaultTab])

  async function load() {
    setLoading(true); setError('')
    try {
      const [c, a, ac] = await Promise.all([
        api.get<CardIssuer[]>('/card-issuers'),
        api.get<PaymentAgency[]>('/payment-agencies'),
        api.get<Account[]>('/accounts'),
      ])
      setCards(c.data); setAgencies(a.data); setAccounts(ac.data)
    } catch (err) { setError(extractErrorMessage(err)) }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  function openNew() {
    setEditId(null); setCardForm(emptyCard); setAgencyForm(emptyAgency); setShowForm(true)
  }
  function openEditCard(c: CardIssuer) {
    setEditId(c.id)
    setCardForm({
      code: c.code, name: c.name, feeRate: c.feeRate?.toString() ?? '', remark: c.remark ?? '',
      accountId: c.accountId?.toString() ?? '', depositAccount: c.depositAccount ?? '',
      searchKeyword: c.searchKeyword ?? '',
    })
    setShowForm(true)
  }
  function openEditAgency(a: PaymentAgency) {
    setEditId(a.id)
    setAgencyForm({
      code: a.code, name: a.name, ceoName: a.ceoName ?? '', phone: a.phone ?? '',
      email: a.email ?? '', remark: a.remark ?? '',
      accountId: a.accountId?.toString() ?? '', depositAccount: a.depositAccount ?? '',
      searchKeyword: a.searchKeyword ?? '', feeRate: a.feeRate?.toString() ?? '',
      regNoKind: a.regNoKind, industryKind: a.industryKind,
      bizType: a.bizType ?? '', bizItem: a.bizItem ?? '', manager: a.manager ?? '',
      taxReport: a.taxReport,
      postalCode: a.postalCode ?? '', address: a.address ?? '',
      postalCode2: a.postalCode2 ?? '', address2: a.address2 ?? '',
    })
    setShowForm(true)
  }

  async function submit(e: FormEvent) {
    e.preventDefault(); setError(''); setOk('')
    try {
      if (tab === 'card') {
        const body = {
          name: cardForm.name, feeRate: cardForm.feeRate ? Number(cardForm.feeRate) : 0,
          remark: cardForm.remark || undefined,
          accountId: cardForm.accountId ? Number(cardForm.accountId) : undefined,
          depositAccount: cardForm.depositAccount || undefined,
          searchKeyword: cardForm.searchKeyword || undefined,
        }
        if (editId) await api.put(`/card-issuers/${editId}`, body)
        else await api.post('/card-issuers', { code: cardForm.code || undefined, ...body })
        setOk(editId ? '카드사를 수정했습니다.' : '카드사를 등록했습니다.')
      } else {
        const body = {
          name: agencyForm.name, ceoName: agencyForm.ceoName || undefined,
          phone: agencyForm.phone || undefined, email: agencyForm.email || undefined,
          remark: agencyForm.remark || undefined,
          accountId: agencyForm.accountId ? Number(agencyForm.accountId) : undefined,
          depositAccount: agencyForm.depositAccount || undefined,
          searchKeyword: agencyForm.searchKeyword || undefined,
          feeRate: agencyForm.feeRate ? Number(agencyForm.feeRate) : 0,
          regNoKind: agencyForm.regNoKind, industryKind: agencyForm.industryKind,
          bizType: agencyForm.bizType || undefined, bizItem: agencyForm.bizItem || undefined,
          manager: agencyForm.manager || undefined, taxReport: agencyForm.taxReport,
          postalCode: agencyForm.postalCode || undefined, address: agencyForm.address || undefined,
          postalCode2: agencyForm.postalCode2 || undefined, address2: agencyForm.address2 || undefined,
        }
        if (editId) await api.put(`/payment-agencies/${editId}`, body)
        else await api.post('/payment-agencies', { code: agencyForm.code || undefined, ...body })
        setOk(editId ? '결제대행사를 수정했습니다.' : '결제대행사를 등록했습니다.')
      }
      setShowForm(false); load()
    } catch (err) { setError(extractErrorMessage(err)) }
  }

  async function toggleActive(kind: Tab, row: CardIssuer | PaymentAgency) {
    setError(''); setOk('')
    try {
      /*
       * <b>수정은 통째로 덮어쓴다</b> — 안 보낸 칸은 비게 된다. 예전에는 이름·적요만
       * 보내도 그것이 전부였는데 칸이 늘면서 <b>[사용] 을 꺼다 켜면 주소·계정이 지워지는</b>
       * 꼴이 된다. 그래서 지금 줄에 있는 값을 그대로 되돌려 보내고 active 만 뒤집는다.
       */
      if (kind === 'card') {
        const c = row as CardIssuer
        await api.put(`/card-issuers/${c.id}`, {
          name: c.name, feeRate: c.feeRate ?? 0, remark: c.remark, accountId: c.accountId,
          depositAccount: c.depositAccount, searchKeyword: c.searchKeyword, active: !c.active,
        })
      } else {
        const a = row as PaymentAgency
        await api.put(`/payment-agencies/${a.id}`, {
          name: a.name, ceoName: a.ceoName, phone: a.phone, email: a.email, remark: a.remark,
          accountId: a.accountId, depositAccount: a.depositAccount, searchKeyword: a.searchKeyword,
          feeRate: a.feeRate ?? 0, regNoKind: a.regNoKind, industryKind: a.industryKind,
          bizType: a.bizType, bizItem: a.bizItem, manager: a.manager, taxReport: a.taxReport,
          postalCode: a.postalCode, address: a.address,
          postalCode2: a.postalCode2, address2: a.address2, active: !a.active,
        })
      }
      load()
    } catch (err) { setError(extractErrorMessage(err)) }
  }

  async function remove(kind: Tab, id: number) {
    if (!confirm('삭제할까요?')) return
    setError(''); setOk('')
    try { await api.delete(`/${kind === 'card' ? 'card-issuers' : 'payment-agencies'}/${id}`); load() }
    catch (err) { setError(extractErrorMessage(err)) }
  }

  const inputCls = 'ec-input'
  const setCard = (k: keyof typeof cardForm, v: string) => setCardForm((f) => ({ ...f, [k]: v }))
  const setAgency = (k: keyof typeof agencyForm, v: string | boolean) => setAgencyForm((f) => ({ ...f, [k]: v }))
  /** 계정 코드도움 후보 — 코드와 이름을 같이 보여 준다(전표 화면과 같은 모양). */
  const accountItems = accounts.map((a) => ({ value: String(a.id), code: a.code, name: a.name }))

  return (
    <EcListShell
      title={tab === 'card' ? '카드사등록' : '결제대행사등록'}
      onNew={openNew}
      actions={[{ label: '새로고침', onClick: load }, { label: 'Excel' }, { label: '인쇄' }]}
    >
      <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
        <button className={`ec-btn ${tab === 'card' ? 'ec-btn-primary' : ''}`} onClick={() => setTab('card')}>카드사</button>
        <button className={`ec-btn ${tab === 'agency' ? 'ec-btn-primary' : ''}`} onClick={() => setTab('agency')}>결제대행사</button>
      </div>

      {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}
      {ok && <p style={{ background: '#eaf6ec', color: '#1c7c3c', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{ok}</p>}

      <Modal open={showForm} title={`${tab === 'card' ? '카드사' : '결제대행사'} ${editId ? '수정' : '등록'}`} onClose={() => setShowForm(false)}>{(
        <form onSubmit={submit} style={{ border: '1px solid var(--ec-border)', background: '#fff', padding: 14, marginTop: 8, marginBottom: 8 }}>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            {tab === 'card' ? (
              <>
                <label style={{ fontSize: 12.5 }}><div style={{ color: '#5a626e', marginBottom: 3 }}>코드</div>
                  <input className={inputCls} value={cardForm.code} disabled={!!editId} placeholder="미입력 시 자동" onChange={(e) => setCard('code', e.target.value)} style={{ width: 120 }} /></label>
                <label style={{ fontSize: 12.5 }}><div style={{ color: '#5a626e', marginBottom: 3 }}>카드사명 *</div>
                  <input className={inputCls} value={cardForm.name} onChange={(e) => setCard('name', e.target.value)} style={{ width: 200 }} /></label>
{/* 원본은 이 칸을 <b>[수수료율]</b> 이라 부른다(사본 실측) — '(%)' 는 우리가 붙인 것이다. */}
                <label style={{ fontSize: 12.5 }}><div style={{ color: '#5a626e', marginBottom: 3 }}>수수료율</div>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                    <input className={`${inputCls} text-right`} type="number" step="any" value={cardForm.feeRate} onChange={(e) => setCard('feeRate', e.target.value)} style={{ width: 90 }} />
                    <span style={{ color: '#8a929c' }}>%</span>
                  </span></label>
                {/* 원본 폼의 [계정]·[입금계좌]·[검색창내용] — 담을 데가 없어 못 그리던 칸이다. */}
                <label style={{ fontSize: 12.5 }}><div style={{ color: '#5a626e', marginBottom: 3 }}>계정</div>
                  <CodePickerField label="계정" hideLabel width={190} emptyLabel="선택 안 함"
                                   value={cardForm.accountId} onChange={(v) => setCard('accountId', v)}
                                   items={accountItems} /></label>
                <label style={{ fontSize: 12.5 }}><div style={{ color: '#5a626e', marginBottom: 3 }}>입금계좌</div>
                  <input className={inputCls} value={cardForm.depositAccount} onChange={(e) => setCard('depositAccount', e.target.value)} style={{ width: 180 }} /></label>
                <label style={{ fontSize: 12.5 }}><div style={{ color: '#5a626e', marginBottom: 3 }}>검색창내용</div>
                  <input className={inputCls} value={cardForm.searchKeyword} onChange={(e) => setCard('searchKeyword', e.target.value)} style={{ width: 150 }} /></label>
                <label style={{ fontSize: 12.5, flex: 1, minWidth: 160 }}><div style={{ color: '#5a626e', marginBottom: 3 }}>적요</div>
                  <input className={inputCls} value={cardForm.remark} onChange={(e) => setCard('remark', e.target.value)} style={{ width: '100%' }} /></label>
              </>
            ) : (
              <>
                <label style={{ fontSize: 12.5 }}><div style={{ color: '#5a626e', marginBottom: 3 }}>코드</div>
                  <input className={inputCls} value={agencyForm.code} disabled={!!editId} placeholder="미입력 시 자동" onChange={(e) => setAgency('code', e.target.value)} style={{ width: 120 }} /></label>
                <label style={{ fontSize: 12.5 }}><div style={{ color: '#5a626e', marginBottom: 3 }}>결제대행사명 *</div>
                  <input className={inputCls} value={agencyForm.name} onChange={(e) => setAgency('name', e.target.value)} style={{ width: 200 }} /></label>
                <label style={{ fontSize: 12.5 }}><div style={{ color: '#5a626e', marginBottom: 3 }}>대표자명</div>
                  <input className={inputCls} value={agencyForm.ceoName} onChange={(e) => setAgency('ceoName', e.target.value)} style={{ width: 120 }} /></label>
                <label style={{ fontSize: 12.5 }}><div style={{ color: '#5a626e', marginBottom: 3 }}>전화</div>
                  <input className={inputCls} value={agencyForm.phone} onChange={(e) => setAgency('phone', e.target.value)} style={{ width: 130 }} /></label>
                <label style={{ fontSize: 12.5 }}><div style={{ color: '#5a626e', marginBottom: 3 }}>Email</div>
                  <input className={inputCls} value={agencyForm.email} onChange={(e) => setAgency('email', e.target.value)} style={{ width: 180 }} /></label>
{/*
                  원본 E010114 폼의 나머지 칸들. 담을 데가 아예 없어서 그리지 못하던 것이다 —
                  대행사도 거래처처럼 <b>세금계산서가 오가는 상대</b>라 업태·종목·주소가 필요하다.
                */}
                <label style={{ fontSize: 12.5 }}><div style={{ color: '#5a626e', marginBottom: 3 }}>결제대행사코드구분</div>
                  <select className={inputCls} value={agencyForm.regNoKind} onChange={(e) => setAgency('regNoKind', e.target.value)} style={{ width: 150 }}>
                    {REG_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
                  </select></label>
                {/* 원본 [업종별구분]의 값 중 하나가 <b>외화거래처</b>다 — 따로 있는 칸이 아니다. */}
                <label style={{ fontSize: 12.5 }}><div style={{ color: '#5a626e', marginBottom: 3 }}>외화거래처</div>
                  <select className={inputCls} value={agencyForm.industryKind} onChange={(e) => setAgency('industryKind', e.target.value)} style={{ width: 130 }}>
                    {INDUSTRY_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
                  </select></label>
                <label style={{ fontSize: 12.5 }}><div style={{ color: '#5a626e', marginBottom: 3 }}>업태</div>
                  <input className={inputCls} value={agencyForm.bizType} onChange={(e) => setAgency('bizType', e.target.value)} style={{ width: 150 }} /></label>
                <label style={{ fontSize: 12.5 }}><div style={{ color: '#5a626e', marginBottom: 3 }}>종목</div>
                  <input className={inputCls} value={agencyForm.bizItem} onChange={(e) => setAgency('bizItem', e.target.value)} style={{ width: 150 }} /></label>
                <label style={{ fontSize: 12.5 }}><div style={{ color: '#5a626e', marginBottom: 3 }}>담당자</div>
                  <input className={inputCls} value={agencyForm.manager} onChange={(e) => setAgency('manager', e.target.value)} style={{ width: 110 }} /></label>
                <label style={{ fontSize: 12.5 }}><div style={{ color: '#5a626e', marginBottom: 3 }}>수수료율</div>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                    <input className={`${inputCls} text-right`} type="number" step="any" value={agencyForm.feeRate} onChange={(e) => setAgency('feeRate', e.target.value)} style={{ width: 90 }} />
                    <span style={{ color: '#8a929c' }}>%</span>
                  </span></label>
                <label style={{ fontSize: 12.5 }}><div style={{ color: '#5a626e', marginBottom: 3 }}>계정</div>
                  <CodePickerField label="계정" hideLabel width={190} emptyLabel="선택 안 함"
                                   value={agencyForm.accountId} onChange={(v) => setAgency('accountId', v)}
                                   items={accountItems} /></label>
                <label style={{ fontSize: 12.5 }}><div style={{ color: '#5a626e', marginBottom: 3 }}>입금계좌</div>
                  <input className={inputCls} value={agencyForm.depositAccount} onChange={(e) => setAgency('depositAccount', e.target.value)} style={{ width: 180 }} /></label>
                <label style={{ fontSize: 12.5 }}><div style={{ color: '#5a626e', marginBottom: 3 }}>우편번호1</div>
                  <input className={inputCls} value={agencyForm.postalCode} onChange={(e) => setAgency('postalCode', e.target.value)} style={{ width: 100 }} /></label>
                <label style={{ fontSize: 12.5 }}><div style={{ color: '#5a626e', marginBottom: 3 }}>주소1</div>
                  <input className={inputCls} value={agencyForm.address} onChange={(e) => setAgency('address', e.target.value)} style={{ width: 260 }} /></label>
                <label style={{ fontSize: 12.5 }}><div style={{ color: '#5a626e', marginBottom: 3 }}>우편번호2</div>
                  <input className={inputCls} value={agencyForm.postalCode2} onChange={(e) => setAgency('postalCode2', e.target.value)} style={{ width: 100 }} /></label>
                <label style={{ fontSize: 12.5 }}><div style={{ color: '#5a626e', marginBottom: 3 }}>주소2</div>
                  <input className={inputCls} value={agencyForm.address2} onChange={(e) => setAgency('address2', e.target.value)} style={{ width: 260 }} /></label>
                <label style={{ fontSize: 12.5 }}><div style={{ color: '#5a626e', marginBottom: 3 }}>검색창내용</div>
                  <input className={inputCls} value={agencyForm.searchKeyword} onChange={(e) => setAgency('searchKeyword', e.target.value)} style={{ width: 150 }} /></label>
                <label style={{ fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 4, alignSelf: 'flex-end', paddingBottom: 5 }}>
                  <input type="checkbox" checked={agencyForm.taxReport} onChange={(e) => setAgency('taxReport', e.target.checked)} />
                  세무신고거래처
                </label>
                <label style={{ fontSize: 12.5, flex: 1, minWidth: 140 }}><div style={{ color: '#5a626e', marginBottom: 3 }}>적요</div>
                  <input className={inputCls} value={agencyForm.remark} onChange={(e) => setAgency('remark', e.target.value)} style={{ width: '100%' }} /></label>
              </>
            )}
            <button type="submit" className="ec-btn ec-btn-primary">{editId ? '수정' : '저장'}</button>
          </div>
        </form>
      )}</Modal>

      {/* 원본 조건 차례: 코드 · 이름 · … · 사용구분 (사본 실측). 두 탭이 같은 조건을 쓴다. */}
      <ul className="ec-cond" style={{ marginBottom: 8 }}>
        <EcCond label={tab === 'card' ? '카드사 코드' : '결제대행사코드'}>
          <input className="ec-input" value={cond.code}
                 onChange={(e) => setC({ code: e.target.value })} style={{ width: 120 }} />
        </EcCond>
        <EcCond label={tab === 'card' ? '카드사명' : '결제대행사명'}>
          <input className="ec-input" value={cond.name}
                 onChange={(e) => setC({ name: e.target.value })} style={{ width: 160 }} />
        </EcCond>
        <EcCond label="사용구분">
          <select className="ec-input" value={cond.use} style={{ width: 100 }}
                  onChange={(e) => setC({ use: e.target.value as typeof cond.use })}>
            <option>전체</option><option>사용</option><option>중지</option>
          </select>
        </EcCond>
      </ul>

      {tab === 'card' ? (
        <table className="w-full text-left">
          <thead><tr>
            <th style={{ width: 34 }}></th><th style={{ width: 90 }}>코드</th><th>카드사명</th>
            <th style={{ textAlign: 'right', width: 100 }}>수수료율</th><th>적요</th>
            <th style={{ textAlign: 'center', width: 80 }}>사용</th><th style={{ textAlign: 'center', width: 90 }}>관리</th>
          </tr></thead>
          <tbody>
            {loading ? <tr><td colSpan={7} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
            : cards.length === 0 ? <tr><td colSpan={7} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>등록된 데이터가 없습니다.</td></tr>
            : shownCards.map((c, i) => (
              <tr key={c.id} style={{ opacity: c.active ? 1 : 0.5 }}>
                <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
                <td style={{ fontFamily: 'monospace', color: '#8a929c' }}>{c.code}</td>
                <td>{c.name}</td>
                <td style={{ textAlign: 'right' }}>{c.feeRate != null ? `${c.feeRate}%` : ''}</td>
                <td style={{ color: '#6b7280' }}>{c.remark ?? ''}</td>
                <td style={{ textAlign: 'center' }}>
                  <button className="no-ec" onClick={() => toggleActive('card', c)} style={{ border: '1px solid var(--ec-border)', background: c.active ? '#eaf6ec' : '#f2f3f5', color: c.active ? '#1c7c3c' : '#8a929c', cursor: 'pointer', fontSize: 11.5, padding: '2px 8px', borderRadius: 3 }}>{c.active ? '사용' : '중단'}</button>
                </td>
                <td style={{ textAlign: 'center' }}>
                  <button className="no-ec" onClick={() => openEditCard(c)} style={{ border: 'none', background: 'none', color: 'var(--ec-blue)', cursor: 'pointer', fontSize: 12, marginRight: 6 }}>수정</button>
                  <button className="no-ec" onClick={() => remove('card', c.id)} style={{ border: 'none', background: 'none', color: '#c60a2e', cursor: 'pointer', fontSize: 12 }}>삭제</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <table className="w-full text-left">
          <thead><tr>
            <th style={{ width: 34 }}></th><th style={{ width: 90 }}>코드</th><th>결제대행사명</th>
            <th>대표자</th><th>전화</th><th>Email</th>
            <th style={{ textAlign: 'center', width: 80 }}>사용</th><th style={{ textAlign: 'center', width: 90 }}>관리</th>
          </tr></thead>
          <tbody>
            {loading ? <tr><td colSpan={8} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
            : agencies.length === 0 ? <tr><td colSpan={8} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>등록된 데이터가 없습니다.</td></tr>
            : shownAgencies.map((a, i) => (
              <tr key={a.id} style={{ opacity: a.active ? 1 : 0.5 }}>
                <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
                <td style={{ fontFamily: 'monospace', color: '#8a929c' }}>{a.code}</td>
                <td>{a.name}</td>
                <td>{a.ceoName ?? ''}</td>
                <td style={{ color: '#6b7280' }}>{a.phone ?? ''}</td>
                <td style={{ color: '#6b7280' }}>{a.email ?? ''}</td>
                <td style={{ textAlign: 'center' }}>
                  <button className="no-ec" onClick={() => toggleActive('agency', a)} style={{ border: '1px solid var(--ec-border)', background: a.active ? '#eaf6ec' : '#f2f3f5', color: a.active ? '#1c7c3c' : '#8a929c', cursor: 'pointer', fontSize: 11.5, padding: '2px 8px', borderRadius: 3 }}>{a.active ? '사용' : '중단'}</button>
                </td>
                <td style={{ textAlign: 'center' }}>
                  <button className="no-ec" onClick={() => openEditAgency(a)} style={{ border: 'none', background: 'none', color: 'var(--ec-blue)', cursor: 'pointer', fontSize: 12, marginRight: 6 }}>수정</button>
                  <button className="no-ec" onClick={() => remove('agency', a.id)} style={{ border: 'none', background: 'none', color: '#c60a2e', cursor: 'pointer', fontSize: 12 }}>삭제</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </EcListShell>
  )
}
