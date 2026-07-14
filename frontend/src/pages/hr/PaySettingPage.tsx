import { Fragment, useEffect, useState } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import EcListShell from '../../components/EcListShell'
import type {
  BankAccountRow, PayGroup, PayItem, Payslip, PayrollTransfer, PayslipLineKind,
} from '../../api/types'

const today = () => new Date().toISOString().slice(0, 10)
const thisMonth = () => new Date().toISOString().slice(0, 7)
const won = (n: number) => n.toLocaleString('ko-KR')

const TABS = ['수당/공제 항목', '수당/공제 그룹', '급여이체'] as const
type Tab = (typeof TABS)[number]

/**
 * 관리 > 급여 설정 · 급여이체.
 *   항목/그룹 — 매달 똑같이 붙는 수당·공제를 묶어 두면 급여계산에서 한 번에 적용된다.
 *   급여이체 — 확정된 급여명세를 묶어 회사 계좌에서 실지급액을 내보내고 분개를 만든다.
 */
export default function PaySettingPage() {
  const [tab, setTab] = useState<Tab>('수당/공제 항목')
  const [items, setItems] = useState<PayItem[]>([])
  const [groups, setGroups] = useState<PayGroup[]>([])
  const [transfers, setTransfers] = useState<PayrollTransfer[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [showItemForm, setShowItemForm] = useState(false)
  const [editingGroup, setEditingGroup] = useState<PayGroup | 'new' | null>(null)

  const flash = (m: string) => { setNotice(m); window.setTimeout(() => setNotice(''), 3500) }

  async function load() {
    setLoading(true)
    try {
      const [i, g, t] = await Promise.all([
        api.get<PayItem[]>('/pay-settings/items'),
        api.get<PayGroup[]>('/pay-settings/groups'),
        api.get<PayrollTransfer[]>('/pay-settings/transfers'),
      ])
      setItems(i.data)
      setGroups(g.data)
      setTransfers(t.data)
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  async function removeGroup(g: PayGroup) {
    if (!window.confirm(`${g.name} 그룹을 삭제할까요?`)) return
    try {
      await api.delete(`/pay-settings/groups/${g.id}`)
      flash('그룹을 삭제했습니다.')
      await load()
    } catch (err) { setError(extractErrorMessage(err)) }
  }

  return (
    <EcListShell
      title="급여 설정 · 급여이체"
      newLabel={tab === '수당/공제 항목' ? '항목 추가(F2)' : tab === '수당/공제 그룹' ? '그룹 추가(F2)' : undefined}
      onNew={tab === '수당/공제 항목' ? () => setShowItemForm((v) => !v)
        : tab === '수당/공제 그룹' ? () => setEditingGroup('new') : undefined}
      actions={[{ label: '새로고침', onClick: load }, { label: 'Excel' }]}
    >
      <div style={{ display: 'flex', gap: 2, marginBottom: 8, borderBottom: '1px solid var(--ec-border)' }}>
        {TABS.map((t) => (
          <button key={t} onClick={() => { setTab(t); setShowItemForm(false); setEditingGroup(null); setError('') }} className="no-ec" style={{
            padding: '6px 14px', fontSize: 12.5, border: 'none', cursor: 'pointer',
            background: tab === t ? '#fff' : 'transparent', color: tab === t ? 'var(--ec-blue)' : '#5a626e',
            fontWeight: tab === t ? 700 : 400,
            borderBottom: tab === t ? '2px solid var(--ec-blue)' : '2px solid transparent',
          }}>{t} ({t === '수당/공제 항목' ? items.length : t === '수당/공제 그룹' ? groups.length : transfers.length})</button>
        ))}
      </div>

      {error && <p style={{ marginBottom: 8, background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3 }}>{error}</p>}
      {notice && <div style={{ marginBottom: 6, padding: '5px 8px', fontSize: 12, borderRadius: 3, background: '#eef5ff', border: '1px solid #cfe0f5', color: '#2b5b91' }}>{notice}</div>}

      {loading ? <p style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</p>
        : tab === '수당/공제 항목' ? (
          <>
            {showItemForm && (
              <ItemForm onError={setError} onSaved={() => { setShowItemForm(false); flash('항목을 등록했습니다.'); load() }} />
            )}
            <table className="w-full text-left">
              <thead>
                <tr>
                  <th style={{ width: 34 }}></th>
                  <th style={{ width: 120 }}>항목코드</th>
                  <th style={{ width: 160 }}>항목명</th>
                  <th style={{ width: 90, textAlign: 'center' }}>구분</th>
                  <th style={{ width: 90, textAlign: 'center' }}>과세</th>
                  <th style={{ width: 130, textAlign: 'right' }}>기본금액</th>
                  <th style={{ width: 80, textAlign: 'center' }}>사용</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {items.length === 0 ? (
                  <tr><td colSpan={8} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>등록된 항목이 없습니다.</td></tr>
                ) : items.map((i, idx) => (
                  <tr key={i.id}>
                    <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{idx + 1}</td>
                    <td style={{ fontFamily: 'monospace', color: 'var(--ec-blue)', fontWeight: 600 }}>{i.code}</td>
                    <td style={{ fontWeight: 600 }}>{i.name}</td>
                    <td style={{ textAlign: 'center', color: i.kind === 'ALLOWANCE' ? '#1c7c3c' : '#c60a2e' }}>{i.kindName}</td>
                    <td style={{ textAlign: 'center' }}>
                      {i.kind === 'DEDUCTION' ? <span style={{ color: '#c9ced6' }}>-</span>
                        : i.taxable ? '과세' : <b style={{ color: 'var(--ec-blue)' }}>비과세</b>}
                    </td>
                    <td style={{ textAlign: 'right' }}>{won(i.defaultAmount)}</td>
                    <td style={{ textAlign: 'center', color: i.active ? '#1c7c3c' : '#8a929c' }}>{i.active ? '사용' : '중지'}</td>
                    <td style={{ color: '#8a929c', fontSize: 11.5 }}>
                      {i.kind === 'ALLOWANCE' && !i.taxable && '4대보험·소득세 기준에서 빠집니다'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        ) : tab === '수당/공제 그룹' ? (
          <>
            {editingGroup && (
              <GroupForm
                group={editingGroup === 'new' ? null : editingGroup}
                items={items}
                onError={setError}
                onClose={() => setEditingGroup(null)}
                onSaved={(name) => { setEditingGroup(null); flash(`${name} 그룹을 저장했습니다.`); load() }}
              />
            )}
            <table className="w-full text-left">
              <thead>
                <tr>
                  <th style={{ width: 34 }}></th>
                  <th style={{ width: 160 }}>그룹명</th>
                  <th>구성 항목</th>
                  <th style={{ width: 130, textAlign: 'right' }}>수당 합계</th>
                  <th style={{ width: 130, textAlign: 'right' }}>공제 합계</th>
                  <th style={{ width: 80, textAlign: 'center' }}>사용</th>
                  <th style={{ width: 110, textAlign: 'center' }}>처리</th>
                </tr>
              </thead>
              <tbody>
                {groups.length === 0 ? (
                  <tr><td colSpan={7} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>등록된 그룹이 없습니다.</td></tr>
                ) : groups.map((g, i) => (
                  <tr key={g.id}>
                    <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
                    <td style={{ fontWeight: 600 }}>{g.name}</td>
                    <td style={{ fontSize: 12, color: '#5a626e' }}>
                      {g.lines.map((l) => (
                        <span key={l.payItemId} style={{ marginRight: 8 }}>
                          {l.name} {won(l.amount)}
                          {l.kind === 'ALLOWANCE' && !l.taxable && <span style={{ color: 'var(--ec-blue)' }}> (비과세)</span>}
                        </span>
                      ))}
                    </td>
                    <td style={{ textAlign: 'right', color: '#1c7c3c', fontWeight: 600 }}>{won(g.allowanceTotal)}</td>
                    <td style={{ textAlign: 'right', color: '#c60a2e' }}>{won(g.deductionTotal)}</td>
                    <td style={{ textAlign: 'center', color: g.active ? '#1c7c3c' : '#8a929c' }}>{g.active ? '사용' : '중지'}</td>
                    <td style={{ textAlign: 'center' }}>
                      <div style={{ display: 'inline-flex', gap: 3 }}>
                        <button className="ec-btn" style={{ height: 20, padding: '0 8px' }} onClick={() => setEditingGroup(g)}>수정</button>
                        <button className="ec-btn" style={{ height: 20, padding: '0 8px', color: '#c60a2e' }} onClick={() => removeGroup(g)}>삭제</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ marginTop: 8, fontSize: 11.5, color: '#8a929c' }}>
              ※ 급여계산 화면에서 그룹을 고르면 이 항목들이 명세 라인으로 들어갑니다. 비과세 수당은 지급은 되지만 4대보험·소득세 기준에서는 빠집니다.
            </div>
          </>
        ) : (
          <TransferTab transfers={transfers} onError={setError} onDone={(m) => { flash(m); load() }} />
        )}
    </EcListShell>
  )
}

// ── 항목 등록 ───────────────────────────────────────────────────────────

function ItemForm({ onError, onSaved }: { onError: (m: string) => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    code: '', name: '', kind: 'ALLOWANCE' as PayslipLineKind, taxable: true, defaultAmount: '',
  })
  const set = (k: keyof typeof form, v: string | boolean) => setForm((f) => ({ ...f, [k]: v }))

  async function submit() {
    onError('')
    if (!form.code) return onError('항목코드를 입력하세요.')
    if (!form.name) return onError('항목명을 입력하세요.')
    try {
      await api.post('/pay-settings/items', {
        code: form.code.toUpperCase(),
        name: form.name,
        kind: form.kind,
        taxable: form.kind === 'ALLOWANCE' ? form.taxable : true,
        defaultAmount: Number(form.defaultAmount) || 0,
      })
      onSaved()
    } catch (err) {
      onError(extractErrorMessage(err))
    }
  }

  return (
    <div style={{ border: '1px solid var(--ec-border)', background: '#fff', padding: 14, marginBottom: 8 }}>
      <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--ec-blue-dark)', marginBottom: 10 }}>수당·공제 항목 등록</div>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <Field label="항목코드 *">
          <input className="ec-input" value={form.code} onChange={(e) => set('code', e.target.value.toUpperCase())} style={{ width: 130 }} placeholder="MEAL" />
        </Field>
        <Field label="항목명 *">
          <input className="ec-input" value={form.name} onChange={(e) => set('name', e.target.value)} style={{ width: 160 }} placeholder="식대" />
        </Field>
        <Field label="구분 *">
          <select className="ec-input" value={form.kind} onChange={(e) => set('kind', e.target.value)} style={{ width: 100 }}>
            <option value="ALLOWANCE">수당</option>
            <option value="DEDUCTION">공제</option>
          </select>
        </Field>
        {form.kind === 'ALLOWANCE' && (
          <Field label="과세여부">
            <select className="ec-input" value={form.taxable ? '1' : '0'} onChange={(e) => set('taxable', e.target.value === '1')} style={{ width: 110 }}>
              <option value="1">과세</option>
              <option value="0">비과세</option>
            </select>
          </Field>
        )}
        <Field label="기본금액">
          <input className="ec-input" type="number" step="any" value={form.defaultAmount} onChange={(e) => set('defaultAmount', e.target.value)} style={{ width: 130, textAlign: 'right' }} />
        </Field>
        <button className="ec-btn ec-btn-primary" onClick={submit}>등록</button>
      </div>
      <div style={{ marginTop: 8, fontSize: 11.5, color: '#8a929c' }}>
        ※ 비과세 수당(식대·차량유지비 등)은 지급은 되지만 4대보험·소득세 계산 기준(과세소득)에서 빠집니다.
      </div>
    </div>
  )
}

// ── 그룹 편집 ───────────────────────────────────────────────────────────

interface GroupLineForm { payItemId: string; amount: string }

function GroupForm({ group, items, onError, onClose, onSaved }: {
  group: PayGroup | null; items: PayItem[]
  onError: (m: string) => void; onClose: () => void; onSaved: (name: string) => void
}) {
  const usable = items.filter((i) => i.active)
  const [name, setName] = useState(group?.name ?? '')
  const [remark, setRemark] = useState(group?.remark ?? '')
  const [active, setActive] = useState(group?.active ?? true)
  const [lines, setLines] = useState<GroupLineForm[]>(
    group ? group.lines.map((l) => ({ payItemId: String(l.payItemId), amount: String(l.amount) }))
      : [{ payItemId: '', amount: '' }])
  const [saving, setSaving] = useState(false)

  function setLine(i: number, patch: Partial<GroupLineForm>) {
    setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)))
  }

  /** 항목을 고르면 기본금액을 채워 준다 */
  function pickItem(i: number, payItemId: string) {
    const item = usable.find((x) => String(x.id) === payItemId)
    setLine(i, { payItemId, amount: item ? String(item.defaultAmount) : '' })
  }

  async function submit() {
    onError('')
    if (!name) return onError('그룹명을 입력하세요.')
    const payload = lines.filter((l) => l.payItemId).map((l) => ({
      payItemId: Number(l.payItemId),
      amount: l.amount === '' ? undefined : Number(l.amount),
    }))
    if (payload.length === 0) return onError('항목을 1개 이상 넣으세요.')
    setSaving(true)
    try {
      const body = { name, remark: remark || undefined, active, lines: payload }
      if (group) await api.put(`/pay-settings/groups/${group.id}`, body)
      else await api.post('/pay-settings/groups', body)
      onSaved(name)
    } catch (err) {
      onError(extractErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  const total = (kind: PayslipLineKind) => lines.reduce((s, l) => {
    const item = usable.find((x) => String(x.id) === l.payItemId)
    return item && item.kind === kind ? s + (Number(l.amount) || 0) : s
  }, 0)

  return (
    <div style={{ border: '1px solid var(--ec-border)', background: '#fff', padding: 14, marginBottom: 8 }}>
      <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--ec-blue-dark)', marginBottom: 10 }}>
        {group ? `그룹 수정 — ${group.name}` : '그룹 추가'}
      </div>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 10 }}>
        <Field label="그룹명 *">
          <input className="ec-input" value={name} onChange={(e) => setName(e.target.value)} style={{ width: 200 }} placeholder="사무직 기본" />
        </Field>
        <Field label="비고">
          <input className="ec-input" value={remark} onChange={(e) => setRemark(e.target.value)} style={{ width: 260 }} />
        </Field>
        <Field label="사용여부">
          <select className="ec-input" value={active ? '1' : '0'} onChange={(e) => setActive(e.target.value === '1')} style={{ width: 100 }}>
            <option value="1">사용</option>
            <option value="0">중지</option>
          </select>
        </Field>
      </div>

      <table className="w-full text-left">
        <thead>
          <tr>
            <th style={{ width: 34 }}></th>
            <th style={{ width: 260 }}>항목</th>
            <th style={{ width: 90, textAlign: 'center' }}>구분</th>
            <th style={{ width: 90, textAlign: 'center' }}>과세</th>
            <th style={{ width: 140, textAlign: 'right' }}>금액</th>
            <th style={{ width: 40 }}></th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l, i) => {
            const item = usable.find((x) => String(x.id) === l.payItemId)
            return (
              <tr key={i}>
                <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
                <td>
                  <select className="ec-input" value={l.payItemId} onChange={(e) => pickItem(i, e.target.value)} style={{ width: '100%' }}>
                    <option value="">항목 선택</option>
                    {usable.map((x) => <option key={x.id} value={x.id}>{x.code} {x.name}</option>)}
                  </select>
                </td>
                <td style={{ textAlign: 'center', color: item?.kind === 'DEDUCTION' ? '#c60a2e' : '#1c7c3c' }}>{item?.kindName ?? ''}</td>
                <td style={{ textAlign: 'center' }}>
                  {!item || item.kind === 'DEDUCTION' ? <span style={{ color: '#c9ced6' }}>-</span>
                    : item.taxable ? '과세' : <b style={{ color: 'var(--ec-blue)' }}>비과세</b>}
                </td>
                <td>
                  <input className="ec-input" type="number" step="any" value={l.amount} onChange={(e) => setLine(i, { amount: e.target.value })} style={{ width: '100%', textAlign: 'right' }} />
                </td>
                <td style={{ textAlign: 'center' }}>
                  {lines.length > 1 && <button className="ec-btn" onClick={() => setLines((ls) => ls.filter((_, idx) => idx !== i))}>×</button>}
                </td>
              </tr>
            )
          })}
        </tbody>
        <tfoot>
          <tr style={{ fontWeight: 700, background: '#f7f9fb' }}>
            <td colSpan={4} style={{ textAlign: 'right' }}>수당 / 공제 합계</td>
            <td style={{ textAlign: 'right' }}>
              <span style={{ color: '#1c7c3c' }}>{won(total('ALLOWANCE'))}</span>
              <span style={{ color: '#c9ced6' }}> / </span>
              <span style={{ color: '#c60a2e' }}>{won(total('DEDUCTION'))}</span>
            </td>
            <td></td>
          </tr>
        </tfoot>
      </table>

      <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
        <button className="ec-btn" onClick={() => setLines((ls) => [...ls, { payItemId: '', amount: '' }])}>+ 항목 추가</button>
        <button className="ec-btn ec-btn-primary" onClick={submit} disabled={saving}>{saving ? '저장 중…' : '저장(F8)'}</button>
        <button className="ec-btn" style={{ marginLeft: 'auto' }} onClick={onClose}>닫기</button>
      </div>
    </div>
  )
}

// ── 급여이체 ────────────────────────────────────────────────────────────

function TransferTab({ transfers, onError, onDone }: {
  transfers: PayrollTransfer[]; onError: (m: string) => void; onDone: (m: string) => void
}) {
  const [payMonth, setPayMonth] = useState(thisMonth())
  const [transferDate, setTransferDate] = useState(today())
  const [bankAccountId, setBankAccountId] = useState('')
  const [banks, setBanks] = useState<BankAccountRow[]>([])
  const [pending, setPending] = useState<Payslip[]>([])
  const [openId, setOpenId] = useState<number | null>(null)
  const [running, setRunning] = useState(false)

  useEffect(() => {
    api.get<BankAccountRow[]>('/bank-cards/accounts')
      .then((r) => {
        const usable = r.data.filter((b) => b.active)
        setBanks(usable)
        if (usable[0]) setBankAccountId(String(usable[0].id))
      })
      .catch(() => {})
  }, [])

  /** 이 달의 확정·미이체 급여명세 = 이체 대상 */
  async function loadPending(month: string) {
    onError('')
    try {
      const [slips, transferred] = await Promise.all([
        api.get<Payslip[]>('/payslips', { params: { month } }),
        api.get<number[]>('/pay-settings/transfers/transferred-payslips'),
      ])
      const done = new Set(transferred.data)
      setPending(slips.data.filter((p) => p.status === 'CONFIRMED' && !done.has(p.id)))
    } catch (err) {
      onError(extractErrorMessage(err))
    }
  }

  useEffect(() => { loadPending(payMonth) }, [payMonth])   // eslint-disable-line react-hooks/exhaustive-deps

  const totalNet = pending.reduce((s, p) => s + p.netPay, 0)
  const totalDeduction = pending.reduce((s, p) => s + p.deductionTotal, 0)
  const totalPay = pending.reduce((s, p) => s + p.baseSalary + p.allowanceTotal, 0)

  async function run() {
    onError('')
    if (!bankAccountId) return onError('출금할 회사 계좌를 선택하세요.')
    if (pending.length === 0) return onError('이체할 확정 급여명세가 없습니다.')
    if (!window.confirm(`${payMonth} 급여 ${pending.length}건 · 실지급액 ${won(totalNet)}원을 이체할까요?`)) return
    setRunning(true)
    try {
      const { data } = await api.post<PayrollTransfer>('/pay-settings/transfers', {
        payMonth, bankAccountId: Number(bankAccountId), transferDate,
      })
      onDone(`${data.transferNo} 이체 완료 — 실지급 ${won(data.netPay)}원 (회계전표 ${data.journalDocNo})`)
      await loadPending(payMonth)
    } catch (err) {
      onError(extractErrorMessage(err))
    } finally {
      setRunning(false)
    }
  }

  return (
    <>
      <div style={{ border: '1px solid var(--ec-border)', background: '#fff', padding: 12, marginBottom: 8 }}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <Field label="귀속월">
            <input className="ec-input" type="month" value={payMonth} onChange={(e) => setPayMonth(e.target.value)} style={{ width: 140 }} />
          </Field>
          <Field label="이체일">
            <input className="ec-input" type="date" value={transferDate} onChange={(e) => setTransferDate(e.target.value)} style={{ width: 140 }} />
          </Field>
          <Field label="출금 계좌 *">
            <select className="ec-input" value={bankAccountId} onChange={(e) => setBankAccountId(e.target.value)} style={{ width: 240 }}>
              <option value="">선택하세요</option>
              {banks.map((b) => <option key={b.id} value={b.id}>{b.bankName} {b.accountNo} (잔액 {won(b.balance)})</option>)}
            </select>
          </Field>
          <button className="ec-btn ec-btn-primary" onClick={run} disabled={running}>{running ? '이체 중…' : '급여이체 실행'}</button>
          <div style={{ fontSize: 12.5, paddingBottom: 5 }}>
            대상 <b>{pending.length}건</b> · 지급총액 {won(totalPay)} · 공제 {won(totalDeduction)} ·
            실지급 <b style={{ color: 'var(--ec-blue-dark)' }}>{won(totalNet)}</b>
          </div>
        </div>
        <div style={{ marginTop: 8, fontSize: 11.5, color: '#8a929c' }}>
          ※ 확정된 급여명세만 이체합니다. 분개는 차)급여 지급총액 / 대)예수금 공제합계·예금 실지급액이며, 계좌 잔액과 입출금 내역도 함께 움직입니다. 같은 명세는 두 번 이체되지 않습니다.
        </div>
      </div>

      {pending.length > 0 && (
        <table className="w-full text-left" style={{ marginBottom: 12 }}>
          <thead>
            <tr>
              <th style={{ width: 34 }}></th>
              <th style={{ width: 140 }}>사원</th>
              <th style={{ width: 140 }}>부서</th>
              <th style={{ width: 130, textAlign: 'right' }}>지급총액</th>
              <th style={{ width: 130, textAlign: 'right' }}>공제합계</th>
              <th style={{ width: 130, textAlign: 'right' }}>실지급액</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {pending.map((p, i) => (
              <tr key={p.id}>
                <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
                <td style={{ fontWeight: 600 }}>{p.employeeName}</td>
                <td style={{ color: '#5a626e' }}>{p.department ?? ''}</td>
                <td style={{ textAlign: 'right' }}>{won(p.baseSalary + p.allowanceTotal)}</td>
                <td style={{ textAlign: 'right', color: '#c60a2e' }}>{won(p.deductionTotal)}</td>
                <td style={{ textAlign: 'right', fontWeight: 700 }}>{won(p.netPay)}</td>
                <td></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--ec-blue-dark)', marginBottom: 6 }}>이체 내역</div>
      <table className="w-full text-left">
        <thead>
          <tr>
            <th style={{ width: 34 }}></th>
            <th style={{ width: 130 }}>이체번호</th>
            <th style={{ width: 90 }}>귀속월</th>
            <th style={{ width: 100 }}>이체일</th>
            <th style={{ width: 180 }}>출금 계좌</th>
            <th style={{ width: 70, textAlign: 'center' }}>인원</th>
            <th style={{ width: 130, textAlign: 'right' }}>지급총액</th>
            <th style={{ width: 130, textAlign: 'right' }}>공제합계</th>
            <th style={{ width: 130, textAlign: 'right' }}>실지급액</th>
            <th style={{ width: 140 }}>회계전표</th>
          </tr>
        </thead>
        <tbody>
          {transfers.length === 0 ? (
            <tr><td colSpan={10} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>이체 내역이 없습니다.</td></tr>
          ) : transfers.map((t, i) => (
            <Fragment key={t.id}>
              <tr onClick={() => setOpenId(openId === t.id ? null : t.id)} style={{ cursor: 'pointer' }}>
                <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
                <td style={{ fontFamily: 'monospace', color: 'var(--ec-blue)', fontWeight: 600 }}>
                  {openId === t.id ? '▾ ' : '▸ '}{t.transferNo}
                </td>
                <td>{t.payMonth}</td>
                <td>{t.transferDate}</td>
                <td style={{ color: '#5a626e' }}>{t.bankAccountName}</td>
                <td style={{ textAlign: 'center' }}>{t.lines.length}명</td>
                <td style={{ textAlign: 'right' }}>{won(t.totalPay)}</td>
                <td style={{ textAlign: 'right', color: '#c60a2e' }}>{won(t.totalDeduction)}</td>
                <td style={{ textAlign: 'right', fontWeight: 700 }}>{won(t.netPay)}</td>
                <td style={{ fontFamily: 'monospace', color: 'var(--ec-blue)' }}>{t.journalDocNo ?? ''}</td>
              </tr>
              {openId === t.id && (
                <tr className="no-ec">
                  <td colSpan={10} style={{ padding: 0, background: '#fafbfc' }}>
                    <table className="w-full text-left" style={{ margin: '4px 0' }}>
                      <thead>
                        <tr>
                          <th style={{ width: 34 }}></th>
                          <th style={{ width: 160 }}>사원</th>
                          <th style={{ width: 160 }}>부서</th>
                          <th style={{ width: 140, textAlign: 'right' }}>실지급액</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {t.lines.map((l, idx) => (
                          <tr key={l.payslipId}>
                            <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{idx + 1}</td>
                            <td>{l.employeeName}</td>
                            <td style={{ color: '#5a626e' }}>{l.department ?? ''}</td>
                            <td style={{ textAlign: 'right', fontWeight: 600 }}>{won(l.netPay)}</td>
                            <td></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
        </tbody>
      </table>
    </>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ fontSize: 12.5 }}>
      <div style={{ color: '#5a626e', marginBottom: 3 }}>{label}</div>
      {children}
    </label>
  )
}
