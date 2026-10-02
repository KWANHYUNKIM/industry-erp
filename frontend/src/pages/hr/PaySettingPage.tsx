import { Fragment, useEffect, useState, useRef} from 'react'
import { api, extractErrorMessage } from '../../api/client'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import EcListShell from '../../components/EcListShell'
import type {
  BankAccountRow, PayGroup, PayItem, Payslip, PayrollTransfer, PayslipLineKind,
} from '../../types/api'
import { ymd } from '../../components/EcPeriodPicks'
import { dateText } from '../../utils/dateText'

const today = () => ymd(new Date())
const thisMonth = () => ymd(new Date()).slice(0, 7)
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


  /* 칸이 자료 따라 변하는 격자라 정적으로 못 센다 — 렌더된 표를 직접 잰다. */
  const tableRef = useRef<HTMLTableElement>(null)
  useTableColumnCheck(tableRef, '급여설정', [])

  return (
    <EcListShell
      title="급여 설정 · 급여이체"
      newLabel={tab === '수당/공제 항목' ? '항목 추가(F2)' : tab === '수당/공제 그룹' ? '그룹 추가(F2)' : undefined}
      onNew={tab === '수당/공제 항목' ? () => setShowItemForm((v) => !v)
        : tab === '수당/공제 그룹' ? () => setEditingGroup('new') : undefined}
      actions={[{ label: '새로고침', onClick: load }, { label: 'Excel' }]}
    >
      <div className="flex gap-[2px] mb-[8px] border-b border-b-ec-line border-solid">
        {TABS.map((t) => (
          <button key={t} onClick={() => { setTab(t); setShowItemForm(false); setEditingGroup(null); setError('') }} className="no-ec" style={{
            padding: '6px 14px', fontSize: 12.5, border: 'none', cursor: 'pointer',
            background: tab === t ? '#fff' : 'transparent', color: tab === t ? 'var(--ec-blue)' : 'var(--ec-label)',
            fontWeight: tab === t ? 700 : 400,
            borderBottom: tab === t ? '2px solid var(--ec-blue)' : '2px solid transparent',
          }}>{t} ({t === '수당/공제 항목' ? items.length : t === '수당/공제 그룹' ? groups.length : transfers.length})</button>
        ))}
      </div>

      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
      {notice && <div className="ec-alert ec-alert-info mb-[6px]">{notice}</div>}

      {loading ? <p className="ec-empty">불러오는 중…</p>
        : tab === '수당/공제 항목' ? (
          <>
            {showItemForm && (
              <ItemForm onError={setError} onSaved={() => { setShowItemForm(false); flash('항목을 등록했습니다.'); load() }} />
            )}
            <table className="w-full text-left">
              <thead>
                <tr>
                  <th className="w-[34px]"></th>
                  <th className="w-[120px]">항목코드</th>
                  <th className="w-[160px]">항목명</th>
                  <th className="w-[90px] text-center">구분</th>
                  <th className="w-[90px] text-center">과세</th>
                  <th className="w-[130px] text-right">기본금액</th>
                  <th className="w-[80px] text-center">사용</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {items.length === 0 ? (
                  <tr><td colSpan={8} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
                ) : items.map((i, idx) => (
                  <tr key={i.id}>
                    <td className="text-center text-ec-hint">{idx + 1}</td>
                    <td className="text-ec-blue font-semibold">{i.code}</td>
                    <td className="font-semibold">{i.name}</td>
                    <td style={{ textAlign: 'center', color: i.kind === 'ALLOWANCE' ? 'var(--ec-success)' : 'var(--ec-danger)' }}>{i.kindName}</td>
                    <td className="text-center">
                      {i.kind === 'DEDUCTION' ? <span className="text-ec-off">-</span>
                        : i.taxable ? '과세' : <b className="text-ec-blue">비과세</b>}
                    </td>
                    <td className="text-right">{won(i.defaultAmount)}</td>
                    <td style={{ textAlign: 'center', color: i.active ? 'var(--ec-success)' : 'var(--ec-text-hint)' }}>{i.active ? '사용' : '중지'}</td>
                    <td className="text-ec-hint text-[11.5px]">
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
            <table ref={tableRef} className="w-full text-left">
              <thead>
                <tr>
                  <th className="w-[34px]"></th>
                  <th className="w-[160px]">그룹명</th>
                  <th>구성 항목</th>
                  <th className="w-[130px] text-right">수당 합계</th>
                  <th className="w-[130px] text-right">공제 합계</th>
                  <th className="w-[80px] text-center">사용</th>
                  <th className="w-[110px] text-center">처리</th>
                </tr>
              </thead>
              <tbody>
                {groups.length === 0 ? (
                  <tr><td colSpan={7} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
                ) : groups.map((g, i) => (
                  <tr key={g.id}>
                    <td className="text-center text-ec-hint">{i + 1}</td>
                    <td className="font-semibold">{g.name}</td>
                    <td className="text-[12px] text-ec-label">
                      {g.lines.map((l) => (
                        <span key={l.payItemId} className="mr-[8px]">
                          {l.name} {won(l.amount)}
                          {l.kind === 'ALLOWANCE' && !l.taxable && <span className="text-ec-blue"> (비과세)</span>}
                        </span>
                      ))}
                    </td>
                    <td className="text-right text-ec-success font-semibold">{won(g.allowanceTotal)}</td>
                    <td className="text-right text-ec-danger">{won(g.deductionTotal)}</td>
                    <td style={{ textAlign: 'center', color: g.active ? 'var(--ec-success)' : 'var(--ec-text-hint)' }}>{g.active ? '사용' : '중지'}</td>
                    <td className="text-center">
                      <div className="inline-flex gap-[3px]">
                        <button className="ec-btn" style={{ height: 20, padding: '0 8px' }} onClick={() => setEditingGroup(g)}>수정</button>
                        <button className="ec-btn" style={{ height: 20, padding: '0 8px', color: 'var(--ec-danger)' }} onClick={() => removeGroup(g)}>삭제</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mt-[8px] text-[11.5px] text-ec-hint">
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
    <div className="border border-ec-line border-solid bg-white p-[14px] mb-[8px]">
      <div className="text-[13px] font-extrabold text-ec-navy mb-[10px]">수당·공제 항목 등록</div>
      <div className="flex gap-[12px] flex-wrap items-end">
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
      <div className="mt-[8px] text-[11.5px] text-ec-hint">
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
    <div className="border border-ec-line border-solid bg-white p-[14px] mb-[8px]">
      <div className="text-[13px] font-extrabold text-ec-navy mb-[10px]">
        {group ? `그룹 수정 — ${group.name}` : '그룹 추가'}
      </div>
      <div className="flex gap-[12px] flex-wrap items-end mb-[10px]">
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
            <th className="w-[34px]"></th>
            <th className="w-[260px]">항목</th>
            <th className="w-[90px] text-center">구분</th>
            <th className="w-[90px] text-center">과세</th>
            <th className="w-[140px] text-right">금액</th>
            <th className="w-[40px]"></th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l, i) => {
            const item = usable.find((x) => String(x.id) === l.payItemId)
            return (
              <tr key={i}>
                <td className="text-center text-ec-hint">{i + 1}</td>
                <td>
                  <select className="ec-input" value={l.payItemId} onChange={(e) => pickItem(i, e.target.value)} style={{ width: '100%' }}>
                    <option value="">항목 선택</option>
                    {usable.map((x) => <option key={x.id} value={x.id}>{x.code} {x.name}</option>)}
                  </select>
                </td>
                <td style={{ textAlign: 'center', color: item?.kind === 'DEDUCTION' ? 'var(--ec-danger)' : 'var(--ec-success)' }}>{item?.kindName ?? ''}</td>
                <td className="text-center">
                  {!item || item.kind === 'DEDUCTION' ? <span className="text-ec-off">-</span>
                    : item.taxable ? '과세' : <b className="text-ec-blue">비과세</b>}
                </td>
                <td>
                  <input className="ec-input" type="number" step="any" value={l.amount} onChange={(e) => setLine(i, { amount: e.target.value })} style={{ width: '100%', textAlign: 'right' }} />
                </td>
                <td className="text-center">
                  {lines.length > 1 && <button className="ec-btn" onClick={() => setLines((ls) => ls.filter((_, idx) => idx !== i))}>×</button>}
                </td>
              </tr>
            )
          })}
        </tbody>
        <tfoot>
          <tr className="font-bold bg-ec-page">
            <td colSpan={4} className="text-right">수당 / 공제 합계</td>
            <td className="text-right">
              <span className="text-ec-success">{won(total('ALLOWANCE'))}</span>
              <span className="text-ec-off"> / </span>
              <span className="text-ec-danger">{won(total('DEDUCTION'))}</span>
            </td>
            <td></td>
          </tr>
        </tfoot>
      </table>

      <div className="flex gap-[6px] mt-[8px]">
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
      <div className="border border-ec-line border-solid bg-white p-[12px] mb-[8px]">
        <div className="flex gap-[12px] flex-wrap items-end">
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
          <div className="text-[12.5px] pb-[5px]">
            대상 <b>{pending.length}건</b> · 지급총액 {won(totalPay)} · 공제 {won(totalDeduction)} ·
            실지급 <b className="text-ec-navy">{won(totalNet)}</b>
          </div>
        </div>
        <div className="mt-[8px] text-[11.5px] text-ec-hint">
          ※ 확정된 급여명세만 이체합니다. 분개는 차)급여 지급총액 / 대)예수금 공제합계·예금 실지급액이며, 계좌 잔액과 입출금 내역도 함께 움직입니다. 같은 명세는 두 번 이체되지 않습니다.
        </div>
      </div>

      {pending.length > 0 && (
        <table className="w-full text-left mb-[12px]">
          <thead>
            <tr>
              <th className="w-[34px]"></th>
              <th className="w-[140px]">사원</th>
              <th className="w-[140px]">부서</th>
              <th className="w-[130px] text-right">지급총액</th>
              <th className="w-[130px] text-right">공제합계</th>
              <th className="w-[130px] text-right">실지급액</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {pending.map((p, i) => (
              <tr key={p.id}>
                <td className="text-center text-ec-hint">{i + 1}</td>
                <td className="font-semibold">{p.employeeName}</td>
                <td className="text-ec-label">{p.department ?? ''}</td>
                <td className="text-right">{won(p.baseSalary + p.allowanceTotal)}</td>
                <td className="text-right text-ec-danger">{won(p.deductionTotal)}</td>
                <td className="text-right font-bold">{won(p.netPay)}</td>
                <td></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div className="text-[13px] font-extrabold text-ec-navy mb-[6px]">이체 내역</div>
      <table className="w-full text-left">
        <thead>
          <tr>
            <th className="w-[34px]"></th>
            <th className="w-[130px]">이체번호</th>
            <th className="w-[90px]">귀속월</th>
            <th className="w-[100px]">이체일</th>
            <th className="w-[180px]">출금 계좌</th>
            <th className="w-[70px] text-center">인원</th>
            <th className="w-[130px] text-right">지급총액</th>
            <th className="w-[130px] text-right">공제합계</th>
            <th className="w-[130px] text-right">실지급액</th>
            <th className="w-[140px]">회계전표</th>
          </tr>
        </thead>
        <tbody>
          {transfers.length === 0 ? (
            <tr><td colSpan={10} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
          ) : transfers.map((t, i) => (
            <Fragment key={t.id}>
              <tr onClick={() => setOpenId(openId === t.id ? null : t.id)} className="cursor-pointer">
                <td className="text-center text-ec-hint">{i + 1}</td>
                <td className="text-ec-blue font-semibold">
                  {openId === t.id ? '▾ ' : '▸ '}{t.transferNo}
                </td>
                <td>{t.payMonth}</td>
                <td>{dateText(t.transferDate)}</td>
                <td className="text-ec-label">{t.bankAccountName}</td>
                <td className="text-center">{t.lines.length}명</td>
                <td className="text-right">{won(t.totalPay)}</td>
                <td className="text-right text-ec-danger">{won(t.totalDeduction)}</td>
                <td className="text-right font-bold">{won(t.netPay)}</td>
                <td className="text-ec-blue">{t.journalDocNo ?? ''}</td>
              </tr>
              {openId === t.id && (
                <tr className="no-ec">
                  <td colSpan={10} className="p-0 bg-ec-page">
                    <table className="w-full text-left my-[4px] mx-0">
                      <thead>
                        <tr>
                          <th className="w-[34px]"></th>
                          <th className="w-[160px]">사원</th>
                          <th className="w-[160px]">부서</th>
                          <th className="w-[140px] text-right">실지급액</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {t.lines.map((l, idx) => (
                          <tr key={l.payslipId}>
                            <td className="text-center text-ec-hint">{idx + 1}</td>
                            <td>{l.employeeName}</td>
                            <td className="text-ec-label">{l.department ?? ''}</td>
                            <td className="text-right font-semibold">{won(l.netPay)}</td>
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
    <label className="text-[12.5px]">
      <div className="text-ec-label mb-[3px]">{label}</div>
      {children}
    </label>
  )
}
