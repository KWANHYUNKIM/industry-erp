import { useEffect, useState } from 'react'
import EcListShell from '../../components/EcListShell'
import { api, extractErrorMessage } from '../../api/client'
import type { IncomeType, OtherWithholding, OtherWithholdingSummary, Partner } from '../../api/types'

const won = (n: number) => Math.round(n).toLocaleString('ko-KR')
const thisMonth = () => new Date().toISOString().slice(0, 7)
const today = () => new Date().toISOString().slice(0, 10)

/** 소득구분별 세율. 화면 미리보기용 — 확정 계산은 서버가 한다. */
const TYPES: { value: IncomeType; label: string; rate: number; expenseRate: number; hint: string }[] = [
  { value: 'BUSINESS', label: '사업소득', rate: 0.03, expenseRate: 0, hint: '프리랜서·용역. 3% + 지방세 → 3.3%' },
  { value: 'OTHER', label: '기타소득', rate: 0.20, expenseRate: 0.60, hint: '강연료·원고료. 필요경비 60% 차감 후 20% → 실효 8.8%' },
  { value: 'INTEREST', label: '이자소득', rate: 0.14, expenseRate: 0, hint: '14% + 지방세 → 15.4%' },
  { value: 'DIVIDEND', label: '배당소득', rate: 0.14, expenseRate: 0, hint: '14% + 지방세 → 15.4%' },
]

/** 세무 > 기타원천세 — 근로소득 외 지급(사업·기타·이자·배당)의 원천징수 */
export default function OtherWithholdingPage() {
  const [month, setMonth] = useState(thisMonth())
  const [data, setData] = useState<OtherWithholdingSummary | null>(null)
  const [partners, setPartners] = useState<Partner[]>([])
  const [showForm, setShowForm] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const flash = (m: string) => { setNotice(m); window.setTimeout(() => setNotice(''), 2500) }

  async function load(m = month) {
    setError('')
    try {
      const [w, p] = await Promise.all([
        api.get<OtherWithholdingSummary>('/other-withholdings', { params: { month: m } }),
        api.get<Partner[]>('/partners'),
      ])
      setData(w.data)
      setPartners(p.data)
    } catch (err) {
      setError(extractErrorMessage(err))
    }
  }

  useEffect(() => { load(month) }, [month])

  async function remove(r: OtherWithholding) {
    if (!window.confirm(`${r.docNo} (${r.payeeName}) 지급 기록을 삭제할까요?`)) return
    try {
      await api.delete(`/other-withholdings/${r.id}`)
      flash('지급 기록을 삭제했습니다.')
      load()
    } catch (err) { alert(extractErrorMessage(err)) }
  }

  const rows = data?.rows ?? []

  return (
    <EcListShell title="기타원천세" actions={[{ label: '새로고침', onClick: () => load() }, { label: 'Excel' }, { label: '인쇄' }]}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        <label style={{ fontSize: 12.5 }}>귀속월</label>
        <input type="month" className="ec-input" value={month} onChange={(e) => setMonth(e.target.value)} style={{ width: 140 }} />
        <button className="ec-btn ec-btn-primary" onClick={() => setShowForm(true)}>+ 지급 등록(F2)</button>
        <span style={{ marginLeft: 4, fontSize: 12, color: '#9aa1ab' }}>
          근로소득 외의 지급에 붙는 원천징수입니다. 급여는 「관리 &gt; 급여관리」에서 처리합니다.
        </span>
      </div>

      {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}
      {notice && <div style={{ marginBottom: 6, padding: '5px 8px', fontSize: 12, borderRadius: 3, background: '#eef5ff', border: '1px solid #cfe0f5', color: '#2b5b91' }}>{notice}</div>}

      <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
        <Box label="지급 건수" value={`${data?.count ?? 0} 건`} color="var(--ec-blue-dark)" bg="#f7f9fb" />
        <Box label="지급액 합계" value={`${won(data?.totalGross ?? 0)} 원`} color="var(--ec-blue)" bg="#f7f9ff" />
        <Box label="원천징수 (소득세+지방세)" value={`${won((data?.totalIncomeTax ?? 0) + (data?.totalLocalIncomeTax ?? 0))} 원`} color="#c60a2e" bg="#fdf6f6" />
        <Box label="실지급액" value={`${won(data?.totalNet ?? 0)} 원`} color="#2f8401" bg="#f4faf5" />
      </div>

      {/* 소득구분별 집계 — 원천징수이행상황신고서의 기타원천세 부분 */}
      {(data?.byIncomeType.length ?? 0) > 0 && (
        <>
          <div style={{ padding: '6px 8px', background: '#f5f7fa', border: '1px solid var(--ec-border)', borderBottom: 'none', fontSize: 12.5, fontWeight: 700, color: 'var(--ec-blue-dark)' }}>
            소득구분별 집계 ({month})
          </div>
          <table className="w-full text-left" style={{ marginBottom: 12 }}>
            <thead>
              <tr>
                <th>소득구분</th>
                <th style={{ textAlign: 'right' }}>인원(건)</th>
                <th style={{ textAlign: 'right' }}>지급액</th>
                <th style={{ textAlign: 'right' }}>소득세</th>
                <th style={{ textAlign: 'right' }}>지방소득세</th>
                <th style={{ textAlign: 'right' }}>징수 합계</th>
              </tr>
            </thead>
            <tbody>
              {data!.byIncomeType.map((s) => (
                <tr key={s.incomeType}>
                  <td style={{ fontWeight: 600 }}>{s.incomeTypeName}</td>
                  <td style={{ textAlign: 'right' }}>{s.count}</td>
                  <td style={{ textAlign: 'right' }}>{won(s.grossAmount)}</td>
                  <td style={{ textAlign: 'right', color: '#c60a2e' }}>{won(s.incomeTax)}</td>
                  <td style={{ textAlign: 'right', color: '#c60a2e' }}>{won(s.localIncomeTax)}</td>
                  <td style={{ textAlign: 'right', fontWeight: 700 }}>{won(s.incomeTax + s.localIncomeTax)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      <table className="w-full text-left">
        <thead>
          <tr>
            <th style={{ width: 34 }}></th>
            <th>지급번호</th>
            <th>지급일</th>
            <th style={{ width: 80 }}>소득구분</th>
            <th>지급받는 자</th>
            <th>등록번호</th>
            <th style={{ textAlign: 'right' }}>지급액</th>
            <th style={{ textAlign: 'right' }}>필요경비</th>
            <th style={{ textAlign: 'right' }}>과세대상</th>
            <th style={{ textAlign: 'right' }}>소득세</th>
            <th style={{ textAlign: 'right' }}>지방세</th>
            <th style={{ textAlign: 'right' }}>실지급액</th>
            <th style={{ textAlign: 'center', width: 50 }}></th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={13} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>{month} 지급 기록이 없습니다.</td></tr>
          ) : rows.map((r, i) => (
            <tr key={r.id}>
              <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
              <td style={{ fontFamily: 'monospace', color: 'var(--ec-blue)' }}>{r.docNo}</td>
              <td>{r.payDate}</td>
              <td>{r.incomeTypeName}</td>
              <td style={{ fontWeight: 600 }}>{r.payeeName}</td>
              <td style={{ color: '#8a929c' }}>{r.payeeRegNo ?? '-'}</td>
              <td style={{ textAlign: 'right' }}>{won(r.grossAmount)}</td>
              <td style={{ textAlign: 'right', color: r.expenseAmount > 0 ? '#5a626e' : '#c3c8cf' }}>{won(r.expenseAmount)}</td>
              <td style={{ textAlign: 'right' }}>{won(r.taxableAmount)}</td>
              <td style={{ textAlign: 'right', color: '#c60a2e' }}>{won(r.incomeTax)}</td>
              <td style={{ textAlign: 'right', color: '#c60a2e' }}>{won(r.localIncomeTax)}</td>
              <td style={{ textAlign: 'right', fontWeight: 700 }}>{won(r.netAmount)}</td>
              <td style={{ textAlign: 'center' }}>
                <button className="ec-btn" style={{ height: 20, padding: '0 8px', color: '#c60a2e' }} onClick={() => remove(r)}>삭제</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {showForm && (
        <WithholdingForm
          partners={partners}
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); flash('지급을 등록했습니다.'); load() }}
        />
      )}
    </EcListShell>
  )
}

function Box({ label, value, color, bg }: { label: string; value: string; color: string; bg: string }) {
  return (
    <div style={{ flex: 1, border: '1px solid var(--ec-border)', background: bg, padding: '10px 14px' }}>
      <div style={{ fontSize: 12, color: '#5a626e' }}>{label}</div>
      <div style={{ fontSize: 19, fontWeight: 800, color }}>{value}</div>
    </div>
  )
}

function WithholdingForm({ partners, onClose, onSaved }: {
  partners: Partner[]
  onClose: () => void
  onSaved: () => void
}) {
  const [payDate, setPayDate] = useState(today())
  const [incomeType, setIncomeType] = useState<IncomeType>('BUSINESS')
  const [partnerId, setPartnerId] = useState('')
  const [payeeName, setPayeeName] = useState('')
  const [payeeRegNo, setPayeeRegNo] = useState('')
  const [grossAmount, setGrossAmount] = useState('')
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const spec = TYPES.find((t) => t.value === incomeType)!
  const gross = Number(grossAmount) || 0
  const expense = Math.floor(gross * spec.expenseRate)
  const taxable = gross - expense
  const incomeTax = Math.floor(taxable * spec.rate)
  const localTax = Math.floor(incomeTax * 0.1)
  const net = gross - incomeTax - localTax

  function pickPartner(id: string) {
    setPartnerId(id)
    const p = partners.find((x) => String(x.id) === id)
    if (p) {
      setPayeeName(p.name)
      setPayeeRegNo(p.bizRegNo ?? '')
    }
  }

  async function save() {
    setError('')
    if (!partnerId && !payeeName.trim()) return setError('거래처를 선택하거나 지급받는 사람 이름을 입력하세요.')
    if (gross <= 0) return setError('지급액을 입력하세요.')
    setSaving(true)
    try {
      await api.post('/other-withholdings', {
        payDate,
        incomeType,
        partnerId: partnerId ? Number(partnerId) : null,
        payeeName: payeeName.trim() || null,
        payeeRegNo: payeeRegNo.trim() || null,
        grossAmount: gross,
        description: description.trim() || null,
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
      <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', width: 560, maxWidth: '94vw', border: '1px solid var(--ec-border)', borderRadius: 4, boxShadow: '0 10px 40px rgba(20,36,68,0.3)' }}>
        <div style={{ display: 'flex', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid var(--ec-border)', background: '#f5f7fa' }}>
          <span style={{ fontWeight: 800, color: 'var(--ec-blue-dark)' }}>기타원천세 지급 등록</span>
          <span onClick={onClose} style={{ marginLeft: 'auto', cursor: 'pointer', fontSize: 18, color: '#8a929c' }}>×</span>
        </div>
        <div style={{ padding: 16 }}>
          {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}
          <table className="w-full text-left">
            <tbody>
              <tr>
                <th style={{ width: 100, background: '#f5f7fa' }}>소득구분</th>
                <td colSpan={3}>
                  <select className="ec-input" value={incomeType} onChange={(e) => setIncomeType(e.target.value as IncomeType)} style={{ width: 130 }}>
                    {TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                  <span style={{ marginLeft: 8, fontSize: 11.5, color: '#9aa1ab' }}>{spec.hint}</span>
                </td>
              </tr>
              <tr>
                <th style={{ background: '#f5f7fa' }}>지급일</th>
                <td><input type="date" className="ec-input" value={payDate} onChange={(e) => setPayDate(e.target.value)} style={{ width: 150 }} /></td>
                <th style={{ width: 80, background: '#f5f7fa' }}>지급액<span style={{ color: '#c60a2e' }}>*</span></th>
                <td><input className="ec-input" type="number" value={grossAmount} onChange={(e) => setGrossAmount(e.target.value)} style={{ width: 130, textAlign: 'right' }} /></td>
              </tr>
              <tr>
                <th style={{ background: '#f5f7fa' }}>거래처</th>
                <td colSpan={3}>
                  <select className="ec-input" value={partnerId} onChange={(e) => pickPartner(e.target.value)} style={{ width: 240 }}>
                    <option value="">(거래처 없이 개인에게 지급)</option>
                    {partners.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </td>
              </tr>
              <tr>
                <th style={{ background: '#f5f7fa' }}>지급받는 자<span style={{ color: '#c60a2e' }}>*</span></th>
                <td><input className="ec-input" value={payeeName} onChange={(e) => setPayeeName(e.target.value)} placeholder="성명 또는 상호" style={{ width: 150 }} /></td>
                <th style={{ background: '#f5f7fa' }}>등록번호</th>
                <td><input className="ec-input" value={payeeRegNo} onChange={(e) => setPayeeRegNo(e.target.value)} placeholder="사업자/주민번호" style={{ width: 130 }} /></td>
              </tr>
              <tr>
                <th style={{ background: '#f5f7fa' }}>적요</th>
                <td colSpan={3}><input className="ec-input" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="예: 7월 외주 용역비" style={{ width: '100%' }} /></td>
              </tr>
            </tbody>
          </table>

          <div style={{ marginTop: 10, padding: 10, background: '#f7f9fb', border: '1px solid var(--ec-border)', fontSize: 12.5 }}>
            {spec.expenseRate > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#5a626e' }}>
                <span>필요경비 ({spec.expenseRate * 100}%)</span><span>{won(expense)} 원</span>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>과세대상</span><span>{won(taxable)} 원</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', color: '#c60a2e' }}>
              <span>소득세 ({spec.rate * 100}%)</span><span>− {won(incomeTax)} 원</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', color: '#c60a2e' }}>
              <span>지방소득세 (소득세의 10%)</span><span>− {won(localTax)} 원</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800, borderTop: '1px solid var(--ec-border)', marginTop: 6, paddingTop: 6 }}>
              <span>실지급액</span><span style={{ color: 'var(--ec-blue-dark)' }}>{won(net)} 원</span>
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, padding: '10px 16px', borderTop: '1px solid var(--ec-border)' }}>
          <button className="ec-btn ec-btn-primary" onClick={save} disabled={saving}>{saving ? '저장 중…' : '저장(F8)'}</button>
          <button className="ec-btn" style={{ marginLeft: 'auto' }} onClick={onClose}>닫기</button>
        </div>
      </div>
    </div>
  )
}
