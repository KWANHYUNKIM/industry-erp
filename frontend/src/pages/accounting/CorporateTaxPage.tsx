import { useEffect, useState } from 'react'
import EcListShell from '../../components/EcListShell'
import { api, extractErrorMessage } from '../../api/client'
import type { TaxAdjustmentType, TaxReturn } from '../../types/api'

const won = (n: number) => Math.round(n).toLocaleString('ko-KR')
const thisYear = () => new Date().getFullYear()

/**
 * 세무 > 법인세 — 결산서상 당기순이익에서 세무조정을 거쳐 과세표준·산출세액을 낸다.
 * 세율: 2억 이하 9% / 200억 이하 19% / 3,000억 이하 21% / 초과 24% (구간별 누진).
 */
export default function CorporateTaxPage() {
  const [returns, setReturns] = useState<TaxReturn[]>([])
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const flash = (m: string) => { setNotice(m); window.setTimeout(() => setNotice(''), 2500) }
  const selected = returns.find((r) => r.id === selectedId) ?? null

  async function load(keep = true) {
    setError('')
    try {
      const r = await api.get<TaxReturn[]>('/corporate-tax')
      setReturns(r.data)
      if (!keep || !r.data.some((x) => x.id === selectedId)) {
        setSelectedId(r.data[0]?.id ?? null)
      }
    } catch (err) {
      setError(extractErrorMessage(err))
    }
  }

  useEffect(() => { load(false) }, [])

  async function act(path: string, msg: string) {
    try {
      await api.post(`/corporate-tax/${selectedId}${path}`)
      flash(msg)
      load()
    } catch (err) { alert(extractErrorMessage(err)) }
  }

  async function removeReturn(r: TaxReturn) {
    if (!window.confirm(`${r.fiscalYear}년 신고서를 삭제할까요?`)) return
    try {
      await api.delete(`/corporate-tax/${r.id}`)
      flash('신고서를 삭제했습니다.')
      load(false)
    } catch (err) { alert(extractErrorMessage(err)) }
  }

  async function removeAdjustment(adjId: number) {
    try {
      await api.delete(`/corporate-tax/${selectedId}/adjustments/${adjId}`)
      load()
    } catch (err) { alert(extractErrorMessage(err)) }
  }

  return (
    <EcListShell title="법인세" actions={[{ label: '새로고침', onClick: () => load() }, { label: 'Excel' }, { label: '인쇄' }]}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        <button className="ec-btn ec-btn-primary" onClick={() => setShowForm(true)}>+ 사업연도 신고서(F2)</button>
        <span style={{ fontSize: 12, color: 'var(--ec-text-hint)' }}>
          당기순이익은 손익계산서에서 자동으로 가져옵니다. 세율 2억 이하 9% / 200억 이하 19% / 3,000억 이하 21% / 초과 24%.
        </span>
      </div>

      {error && <p style={{ background: 'var(--ec-danger-bg)', color: 'var(--ec-danger)', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}
      {notice && <div style={{ marginBottom: 6, padding: '5px 8px', fontSize: 12, borderRadius: 3, background: 'var(--ec-blue-wash)', border: '1px solid var(--ec-info-line)', color: 'var(--ec-navy)' }}>{notice}</div>}

      <table className="w-full text-left" style={{ marginBottom: 12 }}>
        <thead>
          <tr>
            <th style={{ width: 34 }}></th>
            <th>사업연도</th>
            <th>기간</th>
            <th style={{ textAlign: 'right' }}>당기순이익</th>
            <th style={{ textAlign: 'right' }}>과세표준</th>
            <th style={{ textAlign: 'right' }}>산출세액</th>
            <th style={{ textAlign: 'right' }}>총부담세액</th>
            <th style={{ textAlign: 'right' }}>차감납부세액</th>
            <th style={{ textAlign: 'center' }}>상태</th>
            <th style={{ textAlign: 'center', width: 120 }}>처리</th>
          </tr>
        </thead>
        <tbody>
          {returns.length === 0 ? (
            <tr><td colSpan={10} style={{ textAlign: 'center', color: 'var(--ec-text-hint)', padding: 20 }}>등록된 데이터가 없습니다.</td></tr>
          ) : returns.map((r, i) => (
            <tr
              key={r.id}
              onClick={() => setSelectedId(r.id)}
              style={{ cursor: 'pointer', background: selectedId === r.id ? 'var(--ec-blue-wash)' : undefined }}
            >
              <td style={{ textAlign: 'center', color: 'var(--ec-text-hint)' }}>{i + 1}</td>
              <td style={{ fontWeight: 700 }}>{r.fiscalYear}년</td>
              <td style={{ color: 'var(--ec-label)' }}>{r.periodFrom} ~ {r.periodTo}</td>
              <td style={{ textAlign: 'right', color: r.netIncome < 0 ? 'var(--ec-danger)' : undefined }}>{won(r.netIncome)}</td>
              <td style={{ textAlign: 'right' }}>{won(r.taxBase)}</td>
              <td style={{ textAlign: 'right' }}>{won(r.calculatedTax)}</td>
              <td style={{ textAlign: 'right', fontWeight: 600 }}>{won(r.totalTax)}</td>
              <td style={{ textAlign: 'right', fontWeight: 700, color: r.payableTax < 0 ? '#2f8401' : 'var(--ec-blue-dark)' }}>
                {won(r.payableTax)}{r.payableTax < 0 && <span style={{ fontSize: 11 }}> (환급)</span>}
              </td>
              <td style={{ textAlign: 'center' }}>
                <span style={{ color: r.status === 'CONFIRMED' ? 'var(--ec-success)' : 'var(--ec-label)' }}>{r.statusName}</span>
              </td>
              <td style={{ textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
                <div style={{ display: 'inline-flex', gap: 3 }}>
                  {r.status === 'DRAFT' && (
                    <>
                      <button className="ec-btn ec-btn-primary" style={{ height: 20, padding: '0 8px' }}
                        onClick={() => { setSelectedId(r.id); act('/confirm', `${r.fiscalYear}년 신고서 확정`) }}>확정</button>
                      <button className="ec-btn" style={{ height: 20, padding: '0 8px', color: 'var(--ec-danger)' }} onClick={() => removeReturn(r)}>삭제</button>
                    </>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {selected && (
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          {/* 좌: 계산 흐름 */}
          <div style={{ flex: '0 0 44%' }}>
            <div style={{ padding: '6px 8px', background: 'var(--ec-bg-page)', border: '1px solid var(--ec-border)', borderBottom: 'none', fontSize: 12.5, fontWeight: 700, color: 'var(--ec-blue-dark)' }}>
              {selected.fiscalYear}년 세액 계산
            </div>
            <table className="w-full text-left">
              <tbody>
                <Row label="결산서상 당기순이익" value={selected.netIncome} />
                <Row label="(+) 익금산입·손금불산입" value={selected.additions} sign="add" />
                <Row label="(−) 손금산입·익금불산입" value={selected.deductions} sign="sub" />
                <Row label="= 각 사업연도 소득" value={selected.incomeForYear} bold />
                <Row label="(−) 이월결손금" value={selected.lossCarryforward} sign="sub" />
                <Row label="= 과세표준" value={selected.taxBase} bold />
                <Row label="× 누진세율 → 산출세액" value={selected.calculatedTax} bold />
                <Row label="(−) 세액공제·감면" value={selected.taxCredit} sign="sub" />
                <Row label="(+) 가산세" value={selected.penaltyTax} sign="add" />
                <Row label="= 총부담세액" value={selected.totalTax} bold />
                <Row label="(−) 기납부세액(중간예납 등)" value={selected.prepaidTax} sign="sub" />
                <Row label="= 차감납부할세액" value={selected.payableTax} bold highlight />
                <Row label="법인지방소득세 (산출세액의 10%)" value={selected.localIncomeTax} />
              </tbody>
            </table>
            {selected.status === 'DRAFT' && (
              <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                <button className="ec-btn" onClick={() => act('/refresh', '손익계산서에서 당기순이익을 다시 가져왔습니다.')}>
                  당기순이익 다시 가져오기
                </button>
                <EditAmounts taxReturn={selected} onSaved={() => { flash('저장했습니다.'); load() }} />
              </div>
            )}
          </div>

          {/* 우: 세무조정 명세 */}
          <div style={{ flex: 1 }}>
            <div style={{ padding: '6px 8px', background: 'var(--ec-bg-page)', border: '1px solid var(--ec-border)', borderBottom: 'none', fontSize: 12.5, fontWeight: 700, color: 'var(--ec-blue-dark)' }}>
              세무조정 명세 ({selected.adjustments.length}건)
            </div>
            <table className="w-full text-left">
              <thead>
                <tr>
                  <th style={{ width: 34 }}></th>
                  <th style={{ width: 150 }}>구분</th>
                  <th>항목</th>
                  <th style={{ textAlign: 'right' }}>금액</th>
                  <th style={{ textAlign: 'center', width: 50 }}></th>
                </tr>
              </thead>
              <tbody>
                {selected.adjustments.length === 0 ? (
                  <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--ec-text-hint)', padding: 16 }}>등록된 데이터가 없습니다.</td></tr>
                ) : selected.adjustments.map((a, i) => (
                  <tr key={a.id}>
                    <td style={{ textAlign: 'center', color: 'var(--ec-text-hint)' }}>{i + 1}</td>
                    <td style={{ color: a.type === 'ADD' ? 'var(--ec-danger)' : '#2f8401' }}>{a.typeName}</td>
                    <td>{a.name}</td>
                    <td style={{ textAlign: 'right', fontWeight: 600 }}>{won(a.amount)}</td>
                    <td style={{ textAlign: 'center' }}>
                      {selected.status === 'DRAFT' && (
                        <button className="ec-btn" style={{ height: 20, padding: '0 6px', color: 'var(--ec-danger)' }} onClick={() => removeAdjustment(a.id)}>×</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {selected.status === 'DRAFT' && (
              <AdjustmentForm returnId={selected.id} onSaved={() => { flash('조정 항목을 추가했습니다.'); load() }} />
            )}
          </div>
        </div>
      )}

      {showForm && <ReturnForm onClose={() => setShowForm(false)} onSaved={() => { setShowForm(false); flash('신고서를 만들었습니다.'); load(false) }} />}
    </EcListShell>
  )
}

function Row({ label, value, sign, bold, highlight }: {
  label: string; value: number; sign?: 'add' | 'sub'; bold?: boolean; highlight?: boolean
}) {
  return (
    <tr style={{ background: highlight ? 'var(--ec-blue-wash)' : undefined }}>
      <th style={{ background: 'var(--ec-bg-page)', fontWeight: bold ? 700 : 400 }}>{label}</th>
      <td style={{
        textAlign: 'right',
        fontWeight: bold ? 800 : 400,
        color: highlight ? (value < 0 ? '#2f8401' : 'var(--ec-blue-dark)')
          : sign === 'add' ? 'var(--ec-danger)' : sign === 'sub' ? '#2f8401' : undefined,
      }}>
        {won(value)}
      </td>
    </tr>
  )
}

function AdjustmentForm({ returnId, onSaved }: { returnId: number; onSaved: () => void }) {
  const [type, setType] = useState<TaxAdjustmentType>('ADD')
  const [name, setName] = useState('')
  const [amount, setAmount] = useState('')
  const [saving, setSaving] = useState(false)

  async function add() {
    if (!name.trim() || !(Number(amount) > 0)) {
      alert('항목명과 0보다 큰 금액을 입력하세요.')
      return
    }
    setSaving(true)
    try {
      await api.post(`/corporate-tax/${returnId}/adjustments`, {
        type, name: name.trim(), amount: Number(amount),
      })
      setName('')
      setAmount('')
      onSaved()
    } catch (err) {
      alert(extractErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ display: 'flex', gap: 4, marginTop: 6, alignItems: 'center' }}>
      <select className="ec-input" value={type} onChange={(e) => setType(e.target.value as TaxAdjustmentType)} style={{ width: 160 }}>
        <option value="ADD">익금산입·손금불산입</option>
        <option value="DEDUCT">손금산입·익금불산입</option>
      </select>
      <input className="ec-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="예: 접대비 한도초과액" style={{ flex: 1 }} />
      <input className="ec-input" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="금액" style={{ width: 130, textAlign: 'right' }} />
      <button className="ec-btn ec-btn-primary" onClick={add} disabled={saving}>+ 추가</button>
    </div>
  )
}

function EditAmounts({ taxReturn, onSaved }: { taxReturn: TaxReturn; onSaved: () => void }) {
  const [open, setOpen] = useState(false)
  const [lossCarryforward, setLoss] = useState(String(taxReturn.lossCarryforward))
  const [taxCredit, setCredit] = useState(String(taxReturn.taxCredit))
  const [penaltyTax, setPenalty] = useState(String(taxReturn.penaltyTax))
  const [prepaidTax, setPrepaid] = useState(String(taxReturn.prepaidTax))
  const [saving, setSaving] = useState(false)

  async function save() {
    setSaving(true)
    try {
      await api.put(`/corporate-tax/${taxReturn.id}`, {
        lossCarryforward: Number(lossCarryforward) || 0,
        taxCredit: Number(taxCredit) || 0,
        penaltyTax: Number(penaltyTax) || 0,
        prepaidTax: Number(prepaidTax) || 0,
        remark: taxReturn.remark,
      })
      setOpen(false)
      onSaved()
    } catch (err) {
      alert(extractErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  if (!open) return <button className="ec-btn" onClick={() => setOpen(true)}>결손금·공제·기납부 수정</button>

  return (
    <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(20,36,68,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', width: 440, border: '1px solid var(--ec-border)', borderRadius: 4 }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--ec-border)', background: 'var(--ec-bg-page)', fontWeight: 800, color: 'var(--ec-blue-dark)' }}>
          {taxReturn.fiscalYear}년 — 결손금·세액공제·기납부세액
        </div>
        <div style={{ padding: 16 }}>
          <table className="w-full text-left">
            <tbody>
              <tr>
                <th style={{ width: 130, background: 'var(--ec-bg-page)' }}>이월결손금</th>
                <td><input className="ec-input" type="number" value={lossCarryforward} onChange={(e) => setLoss(e.target.value)} style={{ width: 160, textAlign: 'right' }} /></td>
              </tr>
              <tr>
                <th style={{ background: 'var(--ec-bg-page)' }}>세액공제·감면</th>
                <td><input className="ec-input" type="number" value={taxCredit} onChange={(e) => setCredit(e.target.value)} style={{ width: 160, textAlign: 'right' }} /></td>
              </tr>
              <tr>
                <th style={{ background: 'var(--ec-bg-page)' }}>가산세</th>
                <td><input className="ec-input" type="number" value={penaltyTax} onChange={(e) => setPenalty(e.target.value)} style={{ width: 160, textAlign: 'right' }} /></td>
              </tr>
              <tr>
                <th style={{ background: 'var(--ec-bg-page)' }}>기납부세액</th>
                <td><input className="ec-input" type="number" value={prepaidTax} onChange={(e) => setPrepaid(e.target.value)} style={{ width: 160, textAlign: 'right' }} /></td>
              </tr>
            </tbody>
          </table>
        </div>
        <div style={{ display: 'flex', gap: 6, padding: '10px 16px', borderTop: '1px solid var(--ec-border)' }}>
          <button className="ec-btn ec-btn-primary" onClick={save} disabled={saving}>{saving ? '저장 중…' : '저장'}</button>
          <button className="ec-btn" style={{ marginLeft: 'auto' }} onClick={() => setOpen(false)}>닫기</button>
        </div>
      </div>
    </div>
  )
}

function ReturnForm({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [fiscalYear, setFiscalYear] = useState(String(thisYear()))
  const [lossCarryforward, setLoss] = useState('0')
  const [prepaidTax, setPrepaid] = useState('0')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function save() {
    setError('')
    setSaving(true)
    try {
      await api.post('/corporate-tax', {
        fiscalYear: Number(fiscalYear),
        lossCarryforward: Number(lossCarryforward) || 0,
        prepaidTax: Number(prepaidTax) || 0,
      })
      onSaved()
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(20,36,68,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', width: 460, border: '1px solid var(--ec-border)', borderRadius: 4 }}>
        <div style={{ display: 'flex', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid var(--ec-border)', background: 'var(--ec-bg-page)' }}>
          <span style={{ fontWeight: 800, color: 'var(--ec-blue-dark)' }}>사업연도 신고서 작성</span>
          <span onClick={onClose} style={{ marginLeft: 'auto', cursor: 'pointer', fontSize: 18, color: 'var(--ec-text-hint)' }}>×</span>
        </div>
        <div style={{ padding: 16 }}>
          {error && <p style={{ background: 'var(--ec-danger-bg)', color: 'var(--ec-danger)', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}
          <table className="w-full text-left">
            <tbody>
              <tr>
                <th style={{ width: 120, background: 'var(--ec-bg-page)' }}>사업연도<span style={{ color: 'var(--ec-danger)' }}>*</span></th>
                <td>
                  <input className="ec-input" type="number" value={fiscalYear} onChange={(e) => setFiscalYear(e.target.value)} style={{ width: 100, textAlign: 'right' }} />
                  <span style={{ marginLeft: 6, fontSize: 11.5, color: 'var(--ec-text-hint)' }}>1/1 ~ 12/31 기준</span>
                </td>
              </tr>
              <tr>
                <th style={{ background: 'var(--ec-bg-page)' }}>이월결손금</th>
                <td><input className="ec-input" type="number" value={lossCarryforward} onChange={(e) => setLoss(e.target.value)} style={{ width: 160, textAlign: 'right' }} /></td>
              </tr>
              <tr>
                <th style={{ background: 'var(--ec-bg-page)' }}>기납부세액</th>
                <td><input className="ec-input" type="number" value={prepaidTax} onChange={(e) => setPrepaid(e.target.value)} style={{ width: 160, textAlign: 'right' }} /></td>
              </tr>
            </tbody>
          </table>
          <p style={{ marginTop: 10, fontSize: 11.5, color: 'var(--ec-text-hint)' }}>
            결산서상 당기순이익은 해당 기간 손익계산서에서 자동으로 가져옵니다. 세무조정 항목은 만든 뒤에 추가합니다.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 6, padding: '10px 16px', borderTop: '1px solid var(--ec-border)' }}>
          <button className="ec-btn ec-btn-primary" onClick={save} disabled={saving}>{saving ? '저장 중…' : '저장(F8)'}</button>
          <button className="ec-btn" style={{ marginLeft: 'auto' }} onClick={onClose}>닫기</button>
        </div>
      </div>
    </div>
  )
}
