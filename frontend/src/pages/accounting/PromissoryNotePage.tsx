import { useEffect, useMemo, useState } from 'react'
import EcListShell from '../../components/EcListShell'
import { api, extractErrorMessage } from '../../api/client'
import type { BankAccountRow, NoteStatus, NoteSummary, Partner, PromissoryNote } from '../../types/api'
import { ymd } from '../../components/EcPeriodPicks'
import { dateText } from '../../utils/dateText'

const won = (n: number) => n.toLocaleString('ko-KR')
const today = () => ymd(new Date())

const TABS = ['전체', '보유', '결제완료', '할인', '부도'] as const
type Tab = (typeof TABS)[number]
const TAB_STATUS: Record<Exclude<Tab, '전체'>, NoteStatus> = {
  보유: 'HELD', 결제완료: 'SETTLED', 할인: 'DISCOUNTED', 부도: 'DISHONORED',
}
const statusColor = (s: NoteStatus) =>
  s === 'SETTLED' ? 'var(--ec-success)' : s === 'DISHONORED' ? 'var(--ec-danger)' : s === 'DISCOUNTED' ? 'var(--ec-warn)' : 'var(--ec-blue)'

/** 어음거래 — 받을어음 수취 / 지급어음 발행 → 만기결제·할인·부도. 모든 단계가 분개를 남긴다. */
export default function PromissoryNotePage() {
  /**
   * 화면 조건 판의 <b>[기간]</b>. 서버가 이 구간만 준다 — 전에는 전 기간을 통째로 받았다.
   *
   * <p>기본은 <b>비워</b> 둔다 — 미결제 어음은 <b>오래된 것이 살아 있다</b> — 기본으로 자르면 지난달에 받아 아직 안 돌아온 건이 사라진다.
   */
  const [pFrom, setPFrom] = useState('')
  const [pTo, setPTo] = useState('')
  const [summary, setSummary] = useState<NoteSummary | null>(null)
  const [partners, setPartners] = useState<Partner[]>([])
  const [accounts, setAccounts] = useState<BankAccountRow[]>([])
  const [tab, setTab] = useState<Tab>('전체')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [showForm, setShowForm] = useState(false)

  /* 짧은 안내는 2.5초 뒤 지운다 — 그사이 다른 안내로 바뀌었으면 그대로 둔다 */
  const flash = (m: string) => { setNotice(m); window.setTimeout(() => setNotice((cur) => (cur === m ? '' : cur)), 2500) }

  /*
   * <b>넓게 물으면 앞 5천 장만 받는다.</b> 어음이 쌓이면 목록이 통째로 내려와 몇 MB 가 된다 —
   * 실제로 5,006장에서 걸렸다. 원본도 큰 결과를 그냥 주지 않는다: 조회 화면에
   * <b>[오천건이상조회]</b> 를 두고 그 위로는 눌러야 가게 한다. 자른 것은 숨기지 않는다.
   *
   * <p>화면 위의 <b>잔액 넷은 자르기 전 기간 전체</b>로 낸다 — 서버가 그렇게 준다.
   * 자른 몫만 더하면 보유잔액이 조용히 줄어든다.
   */
  function load(all = false) {
    setError('')
    const params: Record<string, string | boolean> = {}
    if (pFrom) params.from = pFrom
    if (pTo) params.to = pTo
    if (all) params.all = true
    api.get<NoteSummary>('/notes', { params }).then((r) => setSummary(r.data)).catch((e) => setError(extractErrorMessage(e)))
  }

  useEffect(() => {
    load()
    api.get<Partner[]>('/partners').then((r) => setPartners(r.data)).catch(() => {})
    api.get<BankAccountRow[]>('/bank-cards/accounts').then((r) => setAccounts(r.data)).catch(() => {})
    /* 기간을 바꾸면 어음만 다시 물어본다 — 거래처·계좌는 기간과 상관없다. */
  }, [])

  useEffect(() => { load() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [pFrom, pTo])

  const notes = summary?.notes ?? []
  const shown = useMemo(() => notes.filter((n) => tab === '전체' || n.status === TAB_STATUS[tab]), [notes, tab])
  const tabCount = (t: Tab) => notes.filter((n) => t === '전체' || n.status === TAB_STATUS[t]).length

  function pickAccount(purpose: string): number | null {
    if (accounts.length === 0) { alert('등록된 계좌가 없습니다. 회계 I > 계좌/카드에서 먼저 등록하세요.'); return null }
    const picked = window.prompt(
      `${purpose}할 계좌를 선택하세요.\n${accounts.map((a) => `${a.id}: ${a.bankName} ${a.accountNo} (잔액 ${won(a.balance)})`).join('\n')}`,
      String(accounts[0].id),
    )
    if (picked === null) return null
    const id = Number(picked)
    if (!accounts.some((a) => a.id === id)) { alert('계좌 번호가 올바르지 않습니다.'); return null }
    return id
  }

  async function settle(n: PromissoryNote) {
    const bankAccountId = pickAccount(n.type === 'RECEIVABLE' ? '입금' : '출금')
    if (bankAccountId === null) return
    try {
      await api.post(`/notes/${n.id}/settle`, { bankAccountId, settleDate: today() })
      flash(`${n.noteNo} 만기결제 — 계좌 잔액과 분개 반영`)
      load()
    } catch (err) { alert(extractErrorMessage(err)) }
  }

  async function discount(n: PromissoryNote) {
    const feeInput = window.prompt(`${n.noteNo} 할인료(원). 어음 금액 ${won(n.amount)}`, '0')
    if (feeInput === null) return
    const discountFee = Number(feeInput)
    if (!Number.isFinite(discountFee) || discountFee < 0) return alert('할인료를 0 이상 숫자로 입력하세요.')
    const bankAccountId = pickAccount('할인 대금을 입금')
    if (bankAccountId === null) return
    try {
      await api.post(`/notes/${n.id}/discount`, { bankAccountId, discountFee, discountDate: today() })
      flash(`${n.noteNo} 할인 — 할인료는 매출채권처분손실로 분개`)
      load()
    } catch (err) { alert(extractErrorMessage(err)) }
  }

  async function remove(n: PromissoryNote) {
    if (!window.confirm(`${n.noteNo} 어음(${won(n.amount)}원)을 지울까요? ${n.type === 'RECEIVABLE' ? '외상매출금' : '외상매입금'}이 되돌아가고 회계전표도 지워집니다.`)) return
    try {
      await api.delete(`/notes/${n.id}`)
      flash(`${n.noteNo} 삭제 — 회계전표도 지웠습니다.`)
      load()
    } catch (err) { alert(extractErrorMessage(err)) }
  }

  async function dishonor(n: PromissoryNote) {
    if (!window.confirm(`${n.noteNo}을(를) 부도 처리할까요? 어음채권이 외상매출금으로 환원됩니다.`)) return
    try {
      await api.post(`/notes/${n.id}/dishonor`, { dishonorDate: today() })
      flash(`${n.noteNo} 부도 — 외상매출금으로 환원`)
      load()
    } catch (err) { alert(extractErrorMessage(err)) }
  }

  return (
    <EcListShell title="어음거래" actions={[
      /* 원본 [오천건이상조회] — 잘려 왔을 때만 눌린다. 안 잘렸는데 붙여 두면 흉내일 뿐이다. */
      { label: '오천건이상조회', onClick: () => load(true), disabled: !summary?.truncated },
      { label: 'Excel' }, { label: '인쇄' },
    ]}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        <button className="ec-btn ec-btn-primary" onClick={() => setShowForm(true)}>+ 어음등록(F2)</button>
        <button className="ec-btn" onClick={() => load()}>새로고침</button>
        <span style={{ marginLeft: 8, fontSize: 12, color: 'var(--ec-text-hint)' }}>
          수취/발행 → 만기결제 · 할인 · 부도. 결제·할인은 계좌 잔액이 함께 움직입니다.
        </span>
      </div>
      {/* 화면 조건 판의 <b>[기간]</b> — 서버가 이 구간만 준다. 비우면 전 기간이다. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, fontSize: 12.5, color: 'var(--ec-label)' }}>
        <span>기간</span>
        <input type="date" className="ec-input" value={pFrom}
               onChange={(e) => setPFrom(e.target.value)} style={{ width: 140 }} />
        <span style={{ color: 'var(--ec-label)' }}>~</span>
        <input type="date" className="ec-input" value={pTo}
               onChange={(e) => setPTo(e.target.value)} style={{ width: 140 }} />
      </div>


      {error && <p style={{ background: 'var(--ec-danger-bg)', color: 'var(--ec-danger)', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}
      {notice && <div style={{ marginBottom: 6, padding: '5px 8px', fontSize: 12, borderRadius: 3, background: 'var(--ec-blue-wash)', border: '1px solid var(--ec-info-line)', color: 'var(--ec-navy)' }}>{notice}</div>}

      {summary && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
          <Tile label="받을어음 보유" value={won(summary.receivableHeld)} />
          <Tile label="30일 내 만기(받을)" value={won(summary.receivableDueSoon)} />
          <Tile label="지급어음 보유" value={won(summary.payableHeld)} />
          <Tile label="30일 내 만기(지급)" value={won(summary.payableDueSoon)} strong />
        </div>
      )}

      {/* 상태 필터는 원본에서 알약(pill)이다 — 선택된 것만 파란 알약으로 채워진다. */}
      <div className="ec-pills" style={{ marginBottom: 6 }}>
        {TABS.map((t) => (
          <button
            key={t} type="button" onClick={() => setTab(t)}
            className={`ec-pill no-ec${tab === t ? ' active' : ''}`}
          >
            {t} ({tabCount(t)})
          </button>
        ))}
      </div>

      <table className="w-full text-left">
        <thead>
          <tr>
            <th style={{ width: 34 }}></th>
            <th>어음번호</th><th>구분</th><th>거래처</th><th>발행일</th><th>만기일</th>
            <th style={{ textAlign: 'right' }}>금액</th><th style={{ textAlign: 'right' }}>할인료</th>
            <th>발행은행</th><th style={{ textAlign: 'center' }}>상태</th><th style={{ textAlign: 'center' }}>처리</th>
          </tr>
        </thead>
        <tbody>
          {shown.length === 0 ? (
            <tr><td colSpan={11} style={{ textAlign: 'center', color: 'var(--ec-text-hint)', padding: 20 }}>등록된 데이터가 없습니다.</td></tr>
          ) : shown.map((n, i) => (
            <tr key={n.id}>
              <td style={{ textAlign: 'center', color: 'var(--ec-text-hint)' }}>{i + 1}</td>
              <td style={{ fontFamily: 'monospace', color: 'var(--ec-blue)', fontWeight: 600 }}>{n.noteNo}</td>
              <td>{n.typeName}</td>
              <td>{n.partnerName}</td>
              <td>{dateText(n.issueDate)}</td>
              <td style={{ color: n.status === 'HELD' && n.dueDate <= today() ? 'var(--ec-danger)' : undefined }}>{dateText(n.dueDate)}</td>
              <td style={{ textAlign: 'right', fontWeight: 700 }}>{won(n.amount)}</td>
              <td style={{ textAlign: 'right', color: 'var(--ec-text-hint)' }}>{n.discountFee ? won(n.discountFee) : ''}</td>
              <td>{n.bankName ?? ''}</td>
              <td style={{ textAlign: 'center' }}><span style={{ color: statusColor(n.status) }}>{n.statusName}</span></td>
              <td style={{ textAlign: 'center' }}>
                {n.status === 'HELD' ? (
                  <div style={{ display: 'inline-flex', gap: 3 }}>
                    <button className="ec-btn ec-btn-primary" style={{ height: 20, padding: '0 8px' }} onClick={() => settle(n)}>만기결제</button>
                    {/* 할인은 만기 전에만 — 만기가 지났으면 만기결제로 받는다(서버도 거절, QA 57회차). */}
                    {n.type === 'RECEIVABLE' && n.dueDate >= today() && <button className="ec-btn" style={{ height: 20, padding: '0 8px' }} onClick={() => discount(n)}>할인</button>}
                    {n.type === 'RECEIVABLE' && <button className="ec-btn" style={{ height: 20, padding: '0 8px', color: 'var(--ec-danger)' }} onClick={() => dishonor(n)}>부도</button>}
                    {/* 보유 중일 때만 지운다 — 수취·발행 분개도 같이 지워진다(QA 58회차). */}
                    <button className="ec-btn" style={{ height: 20, padding: '0 8px', color: 'var(--ec-text-hint)' }} onClick={() => remove(n)}>삭제</button>
                  </div>
                ) : (
                  <span style={{ fontSize: 11, color: 'var(--ec-text-hint)' }}>{n.closedDate}</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {showForm && <NoteForm partners={partners} onClose={() => setShowForm(false)} onSaved={(n) => { setShowForm(false); setNotice(`${n.noteNo} 어음 등록 완료 · ${n.typeName} · ${n.partnerName} · ${won(n.amount)}원 — 분개 생성`); load() }} />}
    </EcListShell>
  )
}

function Tile({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div style={{ flex: 1, border: '1px solid var(--ec-border)', borderRadius: 3, padding: '8px 10px', background: strong ? 'var(--ec-blue-wash)' : '#fff' }}>
      <div style={{ fontSize: 11.5, color: 'var(--ec-text-hint)' }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 700, color: strong ? 'var(--ec-blue-dark)' : 'var(--ec-text)' }}>{value}</div>
    </div>
  )
}

function NoteForm({ partners, onClose, onSaved }: { partners: Partner[]; onClose: () => void; onSaved: (n: PromissoryNote) => void }) {
  const [type, setType] = useState<'RECEIVABLE' | 'PAYABLE'>('RECEIVABLE')
  const [partnerId, setPartnerId] = useState('')
  const [issueDate, setIssueDate] = useState(today())
  const [dueDate, setDueDate] = useState('')
  const [amount, setAmount] = useState('')
  const [bankName, setBankName] = useState('')
  const [remark, setRemark] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const candidates = partners.filter((p) => (type === 'RECEIVABLE' ? p.type !== 'SUPPLIER' : p.type !== 'CUSTOMER'))

  async function save() {
    setError('')
    if (!partnerId) return setError('거래처를 선택하세요.')
    if (!dueDate) return setError('만기일을 입력하세요.')
    if (!(Number(amount) > 0)) return setError('어음 금액을 입력하세요.')
    setSaving(true)
    try {
      const res = await api.post<PromissoryNote>('/notes', {
        type, partnerId: Number(partnerId), issueDate, dueDate,
        amount: Number(amount), bankName: bankName || undefined, remark: remark || undefined,
      })
      onSaved(res.data)
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(20,36,68,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', width: 560, maxWidth: '94vw', border: '1px solid var(--ec-border)', borderRadius: 4, boxShadow: '0 10px 40px rgba(20,36,68,0.3)' }}>
        <div style={{ display: 'flex', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid var(--ec-border)', background: 'var(--ec-bg-page)' }}>
          <span style={{ fontWeight: 800, color: 'var(--ec-blue-dark)' }}>어음등록</span>
          <span onClick={onClose} style={{ marginLeft: 'auto', cursor: 'pointer', fontSize: 18, color: 'var(--ec-text-hint)' }}>×</span>
        </div>
        <div style={{ padding: 16 }}>
          {error && <p style={{ background: 'var(--ec-danger-bg)', color: 'var(--ec-danger)', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}
          <table className="w-full text-left">
            <tbody>
              <tr>
                <th style={{ width: 90, background: 'var(--ec-bg-page)' }}>구분<span style={{ color: 'var(--ec-danger)' }}>*</span></th>
                <td colSpan={3}>
                  <select className="ec-input" value={type} onChange={(e) => { setType(e.target.value as 'RECEIVABLE' | 'PAYABLE'); setPartnerId('') }} style={{ width: 200 }}>
                    <option value="RECEIVABLE">받을어음 (매출대금 수취)</option>
                    <option value="PAYABLE">지급어음 (매입대금 발행)</option>
                  </select>
                  <span style={{ marginLeft: 8, fontSize: 12, color: 'var(--ec-text-hint)' }}>
                    {type === 'RECEIVABLE' ? '차)받을어음 / 대)외상매출금' : '차)외상매입금 / 대)지급어음'}
                  </span>
                </td>
              </tr>
              <tr>
                <th style={{ background: 'var(--ec-bg-page)' }}>거래처<span style={{ color: 'var(--ec-danger)' }}>*</span></th>
                <td colSpan={3}>
                  <select className="ec-input" value={partnerId} onChange={(e) => setPartnerId(e.target.value)} style={{ width: 240 }}>
                    <option value="">거래처 선택</option>
                    {candidates.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </td>
              </tr>
              <tr>
                <th style={{ background: 'var(--ec-bg-page)' }}>발행일</th>
                <td><input type="date" className="ec-input" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} style={{ width: 150 }} /></td>
                <th style={{ width: 70, background: 'var(--ec-bg-page)' }}>만기일<span style={{ color: 'var(--ec-danger)' }}>*</span></th>
                <td><input type="date" className="ec-input" value={dueDate} onChange={(e) => setDueDate(e.target.value)} style={{ width: 150 }} /></td>
              </tr>
              <tr>
                <th style={{ background: 'var(--ec-bg-page)' }}>금액<span style={{ color: 'var(--ec-danger)' }}>*</span></th>
                <td><input type="number" className="ec-input" value={amount} onChange={(e) => setAmount(e.target.value)} style={{ width: 150, textAlign: 'right' }} /></td>
                <th style={{ background: 'var(--ec-bg-page)' }}>발행은행</th>
                <td><input className="ec-input" value={bankName} onChange={(e) => setBankName(e.target.value)} style={{ width: 150 }} /></td>
              </tr>
              <tr>
                <th style={{ background: 'var(--ec-bg-page)' }}>비고</th>
                <td colSpan={3}><input className="ec-input" value={remark} onChange={(e) => setRemark(e.target.value)} style={{ width: '100%' }} /></td>
              </tr>
            </tbody>
          </table>
        </div>
        <div style={{ display: 'flex', gap: 6, padding: '10px 16px', borderTop: '1px solid var(--ec-border)' }}>
          <button className="ec-btn ec-btn-primary" onClick={save} disabled={saving}>{saving ? '저장 중…' : '저장(F8)'}</button>
          <button className="ec-btn" style={{ marginLeft: 'auto' }} onClick={onClose}>닫기</button>
        </div>
      </div>
    </div>
  )
}
