import { useEffect, useMemo, useState } from 'react'
import EcListShell from '../../components/EcListShell'
import { api, extractErrorMessage } from '../../api/client'
import type { BankAccountRow, NoteStatus, NoteSummary, Partner, PromissoryNote } from '../../types/api'
import { dateText } from '../../utils/dateText'
import CodePickerField from '../../components/CodePickerField'
import { useRequired } from '../../utils/useRequired'
import { useDeptProjectItems } from '../../features/cashquick/useDeptProject'
import Modal from '../../components/Modal'
import { EcCond } from '../../components/EcStatusPanel'
import { useNavigate } from 'react-router-dom'
import { ecAlert, ecConfirm } from '../../components/EcDialog'
import EcDateInput, { EcDateRange } from '../../components/ui/EcDateInput'
import { todayYmd } from '../../utils/periods'

const won = (n: number) => n.toLocaleString('ko-KR')

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
    if (accounts.length === 0) { void ecAlert('등록된 계좌가 없습니다. 회계 I > 계좌/카드에서 먼저 등록하세요.'); return null }
    const picked = window.prompt(
      `${purpose}할 계좌를 선택하세요.\n${accounts.map((a) => `${a.id}: ${a.bankName} ${a.accountNo} (잔액 ${won(a.balance)})`).join('\n')}`,
      String(accounts[0].id),
    )
    if (picked === null) return null
    const id = Number(picked)
    if (!accounts.some((a) => a.id === id)) { void ecAlert('계좌 번호가 올바르지 않습니다.'); return null }
    return id
  }

  async function settle(n: PromissoryNote) {
    const bankAccountId = pickAccount(n.type === 'RECEIVABLE' ? '입금' : '출금')
    if (bankAccountId === null) return
    try {
      await api.post(`/notes/${n.id}/settle`, { bankAccountId, settleDate: todayYmd() })
      flash(`${n.noteNo} 만기결제 — 계좌 잔액과 분개 반영`)
      load()
    } catch (err) { void ecAlert(extractErrorMessage(err)) }
  }

  async function discount(n: PromissoryNote) {
    const feeInput = window.prompt(`${n.noteNo} 할인료(원). 어음 금액 ${won(n.amount)}`, '0')
    if (feeInput === null) return
    const discountFee = Number(feeInput)
    if (!Number.isFinite(discountFee) || discountFee < 0) return ecAlert('할인료를 0 이상 숫자로 입력하세요.')
    const bankAccountId = pickAccount('할인 대금을 입금')
    if (bankAccountId === null) return
    try {
      await api.post(`/notes/${n.id}/discount`, { bankAccountId, discountFee, discountDate: todayYmd() })
      flash(`${n.noteNo} 할인 — 할인료는 매출채권처분손실로 분개`)
      load()
    } catch (err) { void ecAlert(extractErrorMessage(err)) }
  }

  async function remove(n: PromissoryNote) {
    if (!(await ecConfirm(`${n.noteNo} 어음(${won(n.amount)}원)을 지울까요? ${n.type === 'RECEIVABLE' ? '외상매출금' : '외상매입금'}이 되돌아가고 회계전표도 지워집니다.`))) return
    try {
      await api.delete(`/notes/${n.id}`)
      flash(`${n.noteNo} 삭제 — 회계전표도 지웠습니다.`)
      load()
    } catch (err) { void ecAlert(extractErrorMessage(err)) }
  }

  async function dishonor(n: PromissoryNote) {
    if (!(await ecConfirm(`${n.noteNo}을(를) 부도 처리할까요? 어음채권이 외상매출금으로 환원됩니다.`))) return
    try {
      await api.post(`/notes/${n.id}/dishonor`, { dishonorDate: todayYmd() })
      flash(`${n.noteNo} 부도 — 외상매출금으로 환원`)
      load()
    } catch (err) { void ecAlert(extractErrorMessage(err)) }
  }

  return (
    <EcListShell title="어음거래" actions={[
      /* 원본 [오천건이상조회] — 잘려 왔을 때만 눌린다. 안 잘렸는데 붙여 두면 흉내일 뿐이다. */
      { label: '오천건이상조회', onClick: () => load(true), disabled: !summary?.truncated },
      { label: 'Excel' }, { label: '인쇄' },
    ]}>
      <div className="flex items-center gap-[6px] mb-[8px]">
        <button className="ec-btn ec-btn-primary" onClick={() => setShowForm(true)}>+ 어음등록(F2)</button>
        <button className="ec-btn" onClick={() => load()}>새로고침</button>
        <span className="ml-[8px] text-[12px] text-ec-hint">
          수취/발행 → 만기결제 · 할인 · 부도. 결제·할인은 계좌 잔액이 함께 움직입니다.
        </span>
      </div>
      {/* 화면 조건 판의 <b>[기간]</b> — 서버가 이 구간만 준다. 비우면 전 기간이다. */}
      <div className="flex items-center gap-[6px] mb-[8px] text-[12.5px] text-ec-label">
        <span>기간</span>
        <EcDateRange from={{ className: "ec-input", value: pFrom, onChange: (e) => setPFrom(e.target.value) }} to={{ className: "ec-input", value: pTo, onChange: (e) => setPTo(e.target.value) }} />
      </div>


      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
      {notice && <div className="ec-alert ec-alert-info mb-[6px]">{notice}</div>}

      {summary && (
        <div className="flex gap-[8px] mb-[10px]">
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
            <th className="w-[34px]"></th>
            <th>어음번호</th><th>구분</th><th>거래처</th><th>발행일</th><th>만기일</th>
            <th className="text-right">금액</th><th className="text-right">할인료</th>
            <th>발행은행</th><th className="text-center">상태</th><th className="text-center">처리</th>
          </tr>
        </thead>
        <tbody>
          {shown.length === 0 ? (
            <tr><td colSpan={11} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
          ) : shown.map((n, i) => (
            <tr key={n.id}>
              <td className="text-center text-ec-hint">{i + 1}</td>
              <td className="text-ec-blue font-semibold">{n.noteNo}</td>
              <td>{n.typeName}</td>
              <td>{n.partnerName}</td>
              <td>{dateText(n.issueDate)}</td>
              <td style={{ color: n.status === 'HELD' && n.dueDate <= todayYmd() ? 'var(--ec-danger)' : undefined }}>{dateText(n.dueDate)}</td>
              <td className="text-right font-bold">{won(n.amount)}</td>
              <td className="text-right text-ec-hint">{n.discountFee ? won(n.discountFee) : ''}</td>
              <td>{n.bankName ?? ''}</td>
              <td className="text-center"><span style={{ color: statusColor(n.status) }}>{n.statusName}</span></td>
              <td className="text-center">
                {n.status === 'HELD' ? (
                  <div className="inline-flex gap-[3px]">
                    <button className="ec-btn ec-btn-primary" style={{ height: 20, padding: '0 8px' }} onClick={() => settle(n)}>만기결제</button>
                    {/* 할인은 만기 전에만 — 만기가 지났으면 만기결제로 받는다(서버도 거절, QA 57회차). */}
                    {n.type === 'RECEIVABLE' && n.dueDate >= todayYmd() && <button className="ec-btn" style={{ height: 20, padding: '0 8px' }} onClick={() => discount(n)}>할인</button>}
                    {n.type === 'RECEIVABLE' && <button className="ec-btn" style={{ height: 20, padding: '0 8px', color: 'var(--ec-danger)' }} onClick={() => dishonor(n)}>부도</button>}
                    {/* 보유 중일 때만 지운다 — 수취·발행 분개도 같이 지워진다(QA 58회차). */}
                    <button className="ec-btn" style={{ height: 20, padding: '0 8px', color: 'var(--ec-text-hint)' }} onClick={() => remove(n)}>삭제</button>
                  </div>
                ) : (
                  <span className="text-[11px] text-ec-hint">{n.closedDate}</span>
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
      <div className="text-[11.5px] text-ec-hint">{label}</div>
      <div style={{ fontSize: 16, fontWeight: 700, color: strong ? 'var(--ec-blue-dark)' : 'var(--ec-text)' }}>{value}</div>
    </div>
  )
}

/**
 * 어음등록 — 원본 받을어음증가 · 지급어음증가(E010601, 2026-10-13 loginaa 실측) 한 장 입력.
 * 칸: 전표일자 · 회계전표No. · 부서 · 프로젝트 · 거래처 · 어음번호 · 만기일자(기본 오늘) · 금액 · 적요, 단추 [저장(F8)] · [저장/전표(F7)] · [다시 작성].
 * [저장/전표(F7)]는 저장하고 그 분개를 연다(원본: 저장 뒤 폼이 비고 '일반전표' 창에 차) 받을어음 1,000 / 대) 외상매출금 1,000).
 * 우리는 받을 · 지급을 한 창에서 고르므로 맨 위에 [구분]을 둔다. [발행은행]은 원본에 없어 뺐다.
 */
function NoteForm({ partners, onClose, onSaved }: { partners: Partner[]; onClose: () => void; onSaved: (n: PromissoryNote) => void }) {
  const navigate = useNavigate()
  const [type, setType] = useState<'RECEIVABLE' | 'PAYABLE'>('RECEIVABLE')
  const [partnerId, setPartnerId] = useState('')
  const [issueDate, setIssueDate] = useState(todayYmd())
  const [noteNo, setNoteNo] = useState('')
  const [dueDate, setDueDate] = useState(todayYmd())
  const [amount, setAmount] = useState('')
  const [remark, setRemark] = useState('')
  const [dept, setDept] = useState('')
  const [project, setProject] = useState('')
  const deptProject = useDeptProjectItems()
  const req = useRequired()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const candidates = partners.filter((p) => (type === 'RECEIVABLE' ? p.type !== 'SUPPLIER' : p.type !== 'CUSTOMER'))
  const partnerItems = useMemo(() => candidates.map((p) => ({ value: String(p.id), code: p.code, name: p.name })), [candidates])

  function reset() {
    setPartnerId(''); setIssueDate(todayYmd()); setNoteNo(''); setDueDate(todayYmd()); setAmount(''); setRemark(''); setDept(''); setProject(''); setError(''); req.reset()
  }

  async function save(thenSlip: boolean) {
    setError('')
    /* 원본 has-error: 빈 필수칸은 글 알림 없이 칸만 빨간 테두리(공용-디자인-정리 A). */
    if (!req.check({ partner: !!partnerId, dueDate: !!dueDate, amount: Number(amount) > 0 })) return
    setSaving(true)
    try {
      const res = await api.post<PromissoryNote>('/notes', {
        type, partnerId: Number(partnerId), issueDate, dueDate,
        amount: Number(amount), remark: remark || undefined, noteNo: noteNo.trim() || undefined,
        departmentId: dept ? Number(dept) : undefined, projectId: project ? Number(project) : undefined,
      })
      if (thenSlip) {
        /* 이 어음이 만든 분개(출처 NOTE · 어음 id)를 찾아 연다. */
        const j = await api.get<{ rows: { id: number; sourceType: string; sourceId: number | null }[] }>('/journals', { params: { from: issueDate, to: issueDate, all: true } })
        const e = j.data.rows.find((r) => r.sourceType === 'NOTE' && r.sourceId === res.data.id)
        if (e) { navigate(`/accounting/journals?entryId=${e.id}`); return }
      }
      onSaved(res.data)
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open title="어음등록" width={560} error={error} onClose={onClose}>
      <ul className="ec-form mb-[8px]">
        <EcCond label="구분" span={2}>
          <select className="ec-input w-[240px]" aria-label="구분" value={type} onChange={(e) => { setType(e.target.value as 'RECEIVABLE' | 'PAYABLE'); setPartnerId('') }}>
            <option value="RECEIVABLE">받을어음증가</option>
            <option value="PAYABLE">지급어음증가</option>
          </select>
        </EcCond>
        <EcCond label="전표일자" span={2}>
          <EcDateInput className="ec-input w-[150px]" aria-label="전표일자" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} />
        </EcCond>
        <EcCond label="회계전표No." span={2}>
          <input className="ec-input w-full" placeholder="회계전표No." disabled value="" />
        </EcCond>
        <EcCond label="부서" span={2}>
          <CodePickerField label="부서" hideLabel pair fill emptyLabel="" value={dept} onChange={setDept} items={deptProject.departments} />
        </EcCond>
        <EcCond label="프로젝트" span={2}>
          <CodePickerField label="프로젝트" hideLabel pair fill emptyLabel="" value={project} onChange={setProject} items={deptProject.projects} />
        </EcCond>
        <EcCond label="거래처" span={2}>
          <CodePickerField label="거래처" hideLabel pair fill emptyLabel="" value={partnerId} onChange={setPartnerId} items={partnerItems} invalid={req.on('partner', !!partnerId)} />
        </EcCond>
        <EcCond label="어음번호" span={2}>
          <input className="ec-input w-full" placeholder="어음번호" aria-label="어음번호" maxLength={30} value={noteNo} onChange={(e) => setNoteNo(e.target.value)} />
        </EcCond>
        <EcCond label="만기일자" span={2}>
          <span className={`inline-block ${req.cls('dueDate', !!dueDate)}`}><EcDateInput className="ec-input w-[150px]" aria-label="만기일자" value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></span>
        </EcCond>
        <EcCond label="금액" span={2}>
          <div className={`w-full ${req.cls('amount', Number(amount) > 0)}`}><input type="number" className="ec-input w-full text-right" aria-label="금액" placeholder="0" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
        </EcCond>
        <EcCond label="적요" span={2}>
          <input className="ec-input w-full" placeholder="적요" aria-label="적요" maxLength={300} value={remark} onChange={(e) => setRemark(e.target.value)} />
        </EcCond>
      </ul>
      <div className="flex gap-[5px]">
        <button type="button" className="ec-btn ec-btn-primary" onClick={() => void save(false)} disabled={saving}>저장(F8)</button>
        <button type="button" className="ec-btn" onClick={() => void save(true)} disabled={saving}>저장/전표(F7)</button>
        <button type="button" className="ec-btn" onClick={reset}>다시 작성</button>
        <button type="button" className="ec-btn ml-auto" onClick={onClose}>닫기</button>
      </div>
    </Modal>
  )
}
