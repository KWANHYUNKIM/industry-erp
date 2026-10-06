import { useEffect, useState } from 'react'
import CodePickerField from '../../components/CodePickerField'
import { api, extractErrorMessage } from '../../api/client'
import EcListShell from '../../components/EcListShell'
import { useTableSort } from '../../utils/useTableSort'
import Modal from '../../components/Modal'
import type { BankAccountRow, BankCheck, CheckType, Partner } from '../../types/api'
import { partnerCodeItems } from '../../utils/codeItems'
import { periodOf, ymd } from '../../components/EcPeriodPicks'
import { dateText } from '../../utils/dateText'

const today = () => ymd(new Date())
const won = (n: number) => n.toLocaleString('ko-KR')

const TABS: { label: string; type: CheckType }[] = [
  { label: '받은수표', type: 'RECEIVED' },
  { label: '발행수표', type: 'ISSUED' },
]

const STATUS_COLOR: Record<BankCheck['status'], string> = {
  HELD: 'var(--ec-blue)',
  DEPOSITED: 'var(--ec-success)',
  PAID: 'var(--ec-success)',
  DISHONORED: 'var(--ec-danger)',
}

/**
 * 회계 II > 수표관리.
 *   받은수표 — 수취(보유) → 계좌 입금 또는 부도
 *   발행수표 — 당좌계좌에서 발행(그 순간 예금이 빠진다) → 은행 인출 확인
 */
export default function CheckPage() {
  const [type, setType] = useState<CheckType>('RECEIVED')
  const [rows, setRows] = useState<BankCheck[]>([])
  const [banks, setBanks] = useState<BankAccountRow[]>([])
  const [partners, setPartners] = useState<Partner[]>([])
  /**
   * 화면 조건 판의 <b>[기간]</b>. 서버가 이제 이 구간만 준다(전에는 전 기간을 통째로 받았다).
   *
   * <p>기본은 <b>비워</b> 둔다 — 미결제 수표·어음은 <b>오래된 것이 살아 있다</b>.
   * 금월로 잘라 놓으면 지난달에 끊어 아직 안 돌아온 건이 화면에서 사라진다.
   */
  /*
   * <b>기간 기본값이 비어 있었다</b> — 그래서 화면을 열면 전 기간을 받았다.
   * 2026-09-10 에 브라우저로 재 보니 이 화면 하나가 열자마자 받는 양이 <b>2,383KB</b> 였다.
   * 다른 현황 화면들이 쓰는 <b>금월(~오늘)</b> 로 맞춘다(사용자가 정했다).
   * 이전 자료는 기간을 넓히면 그대로 보인다.
   */
  const [from2, setFrom2] = useState(periodOf('금월(~오늘)')!.from)
  const [to2, setTo2] = useState(periodOf('금월(~오늘)')!.to)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [showForm, setShowForm] = useState(false)

  const flash = (m: string) => { setNotice(m); window.setTimeout(() => setNotice(''), 3000) }

  async function load() {
    setLoading(true)
    try {
      const [c, b, p] = await Promise.all([
        api.get<BankCheck[]>('/checks', { params: { from: from2 || undefined, to: to2 || undefined } }),
        api.get<BankAccountRow[]>('/bank-cards/accounts'),
        api.get<Partner[]>('/partners'),
      ])
      setRows(c.data)
      setBanks(b.data)
      setPartners(p.data)
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [from2, to2])

  async function deposit(c: BankCheck) {
    const usable = banks.filter((b) => b.active)
    if (usable.length === 0) return setError('입금할 계좌가 없습니다. 계좌를 먼저 등록하세요.')
    const list = usable.map((b, i) => `${i + 1}. ${b.bankName} ${b.accountNo}`).join('\n')
    const pick = window.prompt(`${c.checkNo} (${won(c.amount)}원) 입금할 계좌 번호를 고르세요.\n\n${list}`, '1')
    if (pick === null) return
    const bank = usable[Number(pick) - 1]
    if (!bank) return setError('계좌 선택이 올바르지 않습니다.')
    try {
      await api.post(`/checks/${c.id}/deposit`, { bankAccountId: bank.id, depositDate: today() })
      flash(`${c.checkNo} → ${bank.bankName} 입금 (계좌 잔액 +${won(c.amount)})`)
      await load()
    } catch (err) {
      setError(extractErrorMessage(err))
    }
  }

  async function act(c: BankCheck, path: 'dishonor' | 'settle', message: string) {
    if (!window.confirm(`${c.checkNo} (${won(c.amount)}원) — ${message}할까요?`)) return
    try {
      await api.post(`/checks/${c.id}/${path}`, { settledDate: today() })
      flash(`${c.checkNo} ${message} 처리`)
      await load()
    } catch (err) {
      setError(extractErrorMessage(err))
    }
  }

  const shown = rows.filter((r) => r.type === type)
  const count = (t: CheckType) => rows.filter((r) => r.type === t).length
  const held = shown.filter((r) => r.status === 'HELD')
  const heldTotal = held.reduce((s, r) => s + r.amount, 0)


  /*
   * 이 칸의 이름은 탭에 따라 [수취일]/[발행일]로 바뀌지만 <b>같은 칸</b>이다(issueDate).
   * 그래서 정렬 열쇠는 하나로 둔다 — 탭을 옮겼다고 정렬이 풀리면 이상하다.
   */
  const sort = useTableSort(shown, {
    일자: (c) => c.issueDate,
  })

  return (
    <EcListShell
      title="수표관리"
      newLabel={showForm ? '입력닫기' : `${type === 'RECEIVED' ? '수표 수취' : '수표 발행'}(F2)`}
      onNew={() => setShowForm(true)}
      actions={[{ label: '새로고침', onClick: load }, { label: 'Excel' }, { label: '인쇄' }]}
    >
      <div className="flex gap-[2px] mb-[8px] border-b border-b-ec-line border-solid">
        {TABS.map((t) => (
          <button key={t.type} onClick={() => { setType(t.type); setShowForm(false); setError('') }} className="no-ec" style={{
            padding: '6px 14px', fontSize: 12.5, border: 'none', cursor: 'pointer',
            background: type === t.type ? '#fff' : 'transparent', color: type === t.type ? 'var(--ec-blue)' : 'var(--ec-label)',
            fontWeight: type === t.type ? 700 : 400,
            borderBottom: type === t.type ? '2px solid var(--ec-blue)' : '2px solid transparent',
          }}>{t.label} ({count(t.type)})</button>
        ))}
        <span style={{ marginLeft: 'auto', alignSelf: 'center', fontSize: 12, color: 'var(--ec-label)' }}>
          미처리 {held.length}건 · <b className="text-ec-navy">{won(heldTotal)}</b>
        </span>
      </div>

      {/*
        화면 조건 판의 <b>[기간]</b>. 서버가 이 구간만 준다 — 전에는 전 기간을 통째로 받았다.
        비워 두면 전 기간이다(미결제 건은 오래된 것이 살아 있어 기본으로 자르지 않는다).
      */}
      <div className="flex items-center gap-[6px] mb-[8px] text-[12.5px] text-ec-label">
        <span>기간</span>
        <input type="date" className="ec-input" value={from2}
               onChange={(e) => setFrom2(e.target.value)} style={{ width: 140 }} />
        <span className="text-ec-label">~</span>
        <input type="date" className="ec-input" value={to2}
               onChange={(e) => setTo2(e.target.value)} style={{ width: 140 }} />
      </div>

      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
      {notice && <div className="ec-alert ec-alert-info mb-[6px]">{notice}</div>}

      <Modal error={error} open={showForm} title="수표 등록" onClose={() => setShowForm(false)}>{(
        <CheckForm
          type={type} banks={banks} partners={partners} onError={setError}
          onSaved={(c) => { setShowForm(false); flash(`${c.checkNo} 등록`); load() }}
        />
      )}</Modal>

      <table className="w-full text-left">
        <thead>
          <tr>
            <th className="w-[34px]"></th>
            <th className="w-[130px]">수표번호</th>
            <th className="w-[100px] cursor-pointer" onClick={() => sort.toggle('일자')}>{type === 'RECEIVED' ? '수취일' : '발행일'} {sort.mark('일자')}</th>
            <th className="w-[120px] text-right">금액</th>
            <th className="w-[110px]">은행</th>
            <th className="w-[130px]">거래처</th>
            <th className="w-[170px]">{type === 'RECEIVED' ? '입금계좌' : '발행계좌'}</th>
            <th className="w-[100px] text-center">상태</th>
            <th className="w-[100px]">처리일</th>
            <th className="w-[140px] text-center">처리</th>
            <th>비고</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={11} className="ec-empty">불러오는 중…</td></tr>
          ) : shown.length === 0 ? (
            <tr><td colSpan={11} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
          ) : sort.sorted.map((c, i) => (
            <tr key={c.id}>
              <td className="text-center text-ec-hint">{i + 1}</td>
              <td className="font-semibold">{c.checkNo}</td>
              <td>{dateText(c.issueDate)}</td>
              <td className="text-right font-bold">{won(c.amount)}</td>
              <td>{c.bankName ?? ''}</td>
              <td>{c.partnerName ?? ''}</td>
              <td className="text-ec-label">{c.bankAccountName ?? ''}</td>
              <td style={{ textAlign: 'center', color: STATUS_COLOR[c.status], fontWeight: 600 }}>{c.statusName}</td>
              <td>{dateText(c.settledDate) || ''}</td>
              <td className="text-center">
                {c.status === 'HELD' && (
                  <div className="inline-flex gap-[3px]">
                    {c.type === 'RECEIVED' ? (
                      <>
                        <button className="ec-btn ec-btn-primary" style={{ height: 20, padding: '0 8px' }} onClick={() => deposit(c)}>입금</button>
                        <button className="ec-btn" style={{ height: 20, padding: '0 8px', color: 'var(--ec-danger)' }} onClick={() => act(c, 'dishonor', '부도')}>부도</button>
                      </>
                    ) : (
                      <button className="ec-btn ec-btn-primary" style={{ height: 20, padding: '0 8px' }} onClick={() => act(c, 'settle', '결제 확인')}>결제확인</button>
                    )}
                  </div>
                )}
              </td>
              <td className="text-ec-label">{c.remark ?? ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </EcListShell>
  )
}

function CheckForm({ type, banks, partners, onError, onSaved }: {
  type: CheckType; banks: BankAccountRow[]; partners: Partner[]
  onError: (m: string) => void; onSaved: (c: BankCheck) => void
}) {
  const usable = banks.filter((b) => b.active)
  const [form, setForm] = useState({
    checkNo: '', amount: '', issueDate: today(), bankName: '',
    partnerId: '', bankAccountId: usable[0] ? String(usable[0].id) : '', remark: '',
  })
  const [saving, setSaving] = useState(false)
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }))
  const isIssued = type === 'ISSUED'

  async function submit() {
    onError('')
    if (!form.checkNo) return onError('수표번호를 입력하세요.')
    if (!(Number(form.amount) > 0)) return onError('금액을 입력하세요.')
    if (isIssued && !form.bankAccountId) return onError('발행할 당좌계좌를 선택하세요.')
    setSaving(true)
    try {
      const { data } = await api.post<BankCheck>('/checks', {
        type,
        checkNo: form.checkNo,
        amount: Number(form.amount),
        issueDate: form.issueDate,
        bankName: form.bankName || undefined,
        partnerId: form.partnerId ? Number(form.partnerId) : undefined,
        bankAccountId: isIssued ? Number(form.bankAccountId) : undefined,
        remark: form.remark || undefined,
      })
      onSaved(data)
    } catch (err) {
      onError(extractErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="border border-ec-line border-solid bg-white p-[14px] mb-[8px]">
      <div className="text-[13px] font-extrabold text-ec-navy mb-[10px]">
        {isIssued ? '수표 발행' : '수표 수취'}
      </div>
      <div className="flex gap-[12px] flex-wrap items-end">
        <Field label="수표번호 *">
          <input className="ec-input" value={form.checkNo} onChange={(e) => set('checkNo', e.target.value)} style={{ width: 150 }} placeholder="가12345678" />
        </Field>
        <Field label={isIssued ? '발행일' : '수취일'}>
          <input className="ec-input" type="date" value={form.issueDate} onChange={(e) => set('issueDate', e.target.value)} style={{ width: 140 }} />
        </Field>
        <Field label="금액 *">
          <input className="ec-input" type="number" step="any" value={form.amount} onChange={(e) => set('amount', e.target.value)} style={{ width: 130, textAlign: 'right' }} />
        </Field>
        <Field label="은행">
          <input className="ec-input" value={form.bankName} onChange={(e) => set('bankName', e.target.value)} style={{ width: 110 }} placeholder="국민은행" />
        </Field>
        <Field label="거래처">
          <CodePickerField label="거래처" hideLabel width={150} emptyLabel="선택 안 함" placeholder="선택 안함"
                           value={form.partnerId} onChange={(v) => set('partnerId', v)}
                           items={partnerCodeItems(partners)} />
        </Field>
        {isIssued && (
          <Field label="발행계좌(당좌) *">
            <select className="ec-input" value={form.bankAccountId} onChange={(e) => set('bankAccountId', e.target.value)} style={{ width: 210 }}>
              <option value="">선택하세요</option>
              {usable.map((b) => <option key={b.id} value={b.id}>{b.bankName} {b.accountNo} (잔액 {won(b.balance)})</option>)}
            </select>
          </Field>
        )}
        <Field label="비고">
          <input className="ec-input" value={form.remark} onChange={(e) => set('remark', e.target.value)} style={{ width: 160 }} />
        </Field>
        <button className="ec-btn ec-btn-primary" onClick={submit} disabled={saving}>{saving ? '저장 중…' : '저장(F8)'}</button>
      </div>
      <div className="mt-[8px] text-[11.5px] text-ec-hint">
        {isIssued
          ? '※ 차)외상매입금 / 대)발행계좌의 예금계정으로 분개되고, 발행하는 순간 계좌 잔액이 줄어듭니다. 나중에 은행 인출이 확인되면 결제확인만 누르면 됩니다(회계는 이미 반영).'
          : '※ 차)받을수표 / 대)외상매출금으로 분개됩니다. 나중에 계좌에 입금하면 예금이 늘고 받을수표가 없어집니다. 부도가 나면 현금 없이 외상매출금으로 되돌아갑니다.'}
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="text-[12.5px]">
      <div className="text-ec-label mb-[3px]">{label}</div>
      {children}
    </label>
  )
}
