import { useEffect, useState } from 'react'
import EcListShell from '../../components/EcListShell'
import CodePickerField from '../../components/CodePickerField'
import Modal from '../../components/Modal'
import { api, extractErrorMessage } from '../../api/client'
import type { IncomeType, OtherWithholding, OtherWithholdingSummary, Partner } from '../../types/api'
import { ymd } from '../../components/EcPeriodPicks'
import { dateText } from '../../utils/dateText'

const won = (n: number) => Math.round(n).toLocaleString('ko-KR')
const thisMonth = () => ymd(new Date()).slice(0, 7)
const today = () => ymd(new Date())

/** 소득구분별 세율. 화면 미리보기용 — 확정 계산은 서버가 한다. */
/** 원본 [업종구분코드](사업소득) · [소득코드](기타 · 이자배당) — loginaa 기타원천세에서 쓰인 것(2026-10-04). 소득코드 60 은 필요경비가 없다. */
const CODES: Record<IncomeType, { code: string; name: string }[]> = {
  BUSINESS: [{ code: '940903', name: '학원강사' }, { code: '940909', name: '기타자영업' }],
  OTHER: [{ code: '60', name: '필요경비 없음' }, { code: '62', name: '' }, { code: '76', name: '' }, { code: '79', name: '' }],
  INTEREST: [{ code: '22', name: '' }],
  DIVIDEND: [{ code: '22', name: '' }],
}

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
      <div className="flex items-center gap-[6px] mb-[8px]">
        <label className="text-[12.5px]">귀속월</label>
        <input type="month" className="ec-input" value={month} onChange={(e) => setMonth(e.target.value)} style={{ width: 140 }} />
        <button className="ec-btn ec-btn-primary" onClick={() => setShowForm(true)}>+ 지급 등록(F2)</button>
        <span className="ml-[4px] text-[12px] text-ec-hint">
          근로소득 외의 지급에 붙는 원천징수입니다. 급여는 「관리 &gt; 급여관리」에서 처리합니다.
        </span>
      </div>

      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
      {notice && <div className="ec-alert ec-alert-info mb-[6px]">{notice}</div>}

      <div className="flex gap-[10px] mb-[10px]">
        <Box label="지급 건수" value={`${data?.count ?? 0} 건`} color="var(--ec-blue-dark)" bg="var(--ec-bg-page)" />
        <Box label="지급액 합계" value={`${won(data?.totalGross ?? 0)} 원`} color="var(--ec-blue)" bg="var(--ec-blue-wash)" />
        <Box label="원천징수 (소득세+지방세)" value={`${won((data?.totalIncomeTax ?? 0) + (data?.totalLocalIncomeTax ?? 0))} 원`} color="var(--ec-danger)" bg="var(--ec-danger-bg)" />
        <Box label="실지급액" value={`${won(data?.totalNet ?? 0)} 원`} color="#2f8401" bg="var(--ec-success-bg)" />
      </div>

      {/* 소득구분별 집계 — 원천징수이행상황신고서의 기타원천세 부분 */}
      {(data?.byIncomeType.length ?? 0) > 0 && (
        <>
          <div style={{ padding: '6px 8px', background: 'var(--ec-bg-page)', border: '1px solid var(--ec-border)', borderBottom: 'none', fontSize: 12.5, fontWeight: 700, color: 'var(--ec-blue-dark)' }}>
            소득구분별 집계 ({month})
          </div>
          <table className="w-full text-left mb-[12px]">
            <thead>
              <tr>
                <th>소득구분</th>
                <th className="text-right">인원(건)</th>
                <th className="text-right">지급액</th>
                <th className="text-right">소득세</th>
                <th className="text-right">지방소득세</th>
                <th className="text-right">징수 합계</th>
              </tr>
            </thead>
            <tbody>
              {data!.byIncomeType.map((s) => (
                <tr key={s.incomeType}>
                  <td className="font-semibold">{s.incomeTypeName}</td>
                  <td className="text-right">{s.count}</td>
                  <td className="text-right">{won(s.grossAmount)}</td>
                  <td className="text-right text-ec-danger">{won(s.incomeTax)}</td>
                  <td className="text-right text-ec-danger">{won(s.localIncomeTax)}</td>
                  <td className="text-right font-bold">{won(s.incomeTax + s.localIncomeTax)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      <table className="w-full text-left">
        <thead>
          <tr>
            <th className="w-[34px]"></th>
            <th>지급번호</th>
            <th>지급일</th>
            <th className="w-[80px]">소득구분</th>
            <th>지급받는 자</th>
            <th>등록번호</th>
            <th className="text-right">지급액</th>
            <th className="text-right">필요경비</th>
            <th className="text-right">과세대상</th>
            <th className="text-right">소득세</th>
            <th className="text-right">지방세</th>
            <th className="text-right">실지급액</th>
            <th className="text-center w-[50px]"></th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={13} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
          ) : rows.map((r, i) => (
            <tr key={r.id}>
              <td className="text-center text-ec-hint">{i + 1}</td>
              <td className="text-ec-blue">{r.docNo}</td>
              <td>{dateText(r.payDate)}</td>
              <td>{r.incomeTypeName}</td>
              <td className="font-semibold">{r.payeeName}</td>
              <td className="text-ec-hint">{r.payeeRegNo ?? ''}</td>
              <td className="text-right">{won(r.grossAmount)}</td>
              <td style={{ textAlign: 'right', color: r.expenseAmount > 0 ? 'var(--ec-label)' : 'var(--ec-text-off)' }}>{won(r.expenseAmount)}</td>
              <td className="text-right">{won(r.taxableAmount)}</td>
              <td className="text-right text-ec-danger">{won(r.incomeTax)}</td>
              <td className="text-right text-ec-danger">{won(r.localIncomeTax)}</td>
              <td className="text-right font-bold">{won(r.netAmount)}</td>
              <td className="text-center">
                <button className="ec-btn" style={{ height: 20, padding: '0 8px', color: 'var(--ec-danger)' }} onClick={() => remove(r)}>삭제</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <Modal error={error} open={showForm} title="기타원천세 등록" onClose={() => setShowForm(false)}>{(
        <WithholdingForm
          partners={partners}
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); flash('지급을 등록했습니다.'); load() }}
        />
      )}</Modal>
    </EcListShell>
  )
}

function Box({ label, value, color, bg }: { label: string; value: string; color: string; bg: string }) {
  return (
    <div style={{ flex: 1, border: '1px solid var(--ec-border)', background: bg, padding: '10px 14px' }}>
      <div className="text-[12px] text-ec-label">{label}</div>
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
  const [incomeCode, setIncomeCode] = useState('')
  const [attributionMonth, setAttributionMonth] = useState('')
  const [grossAmount, setGrossAmount] = useState('')
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const spec = TYPES.find((t) => t.value === incomeType)!
  const gross = Number(grossAmount) || 0
  const expenseRate = incomeType === 'OTHER' && incomeCode === '60' ? 0 : spec.expenseRate
  const expense = Math.floor(gross * expenseRate)
  const taxable = gross - expense
  // 서버와 같게 소득세 · 지방소득세 모두 10원 미만 버림(원본 1,231,234 × 3% = 36,930)
  const incomeTax = Math.floor(Math.floor(taxable * spec.rate) / 10) * 10
  const localTax = Math.floor(Math.floor(incomeTax * 0.1) / 10) * 10
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
        incomeCode: incomeCode || null,
        attributionMonth: attributionMonth || null,
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
        <div className="flex items-center py-[12px] px-[16px] border-b border-b-ec-line border-solid bg-ec-page">
          <span className="font-extrabold text-ec-navy">기타원천세 지급 등록</span>
          <span onClick={onClose} className="ml-auto cursor-pointer text-[18px] text-ec-hint">×</span>
        </div>
        <div className="p-[16px]">
          {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
          <table className="w-full text-left">
            <tbody>
              <tr>
                <th className="w-[100px] bg-ec-page">소득구분</th>
                <td colSpan={3}>
                  <select className="ec-input" value={incomeType} onChange={(e) => { setIncomeType(e.target.value as IncomeType); setIncomeCode('') }} style={{ width: 130 }}>
                    {TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                  <span className="ml-[8px] text-[11.5px] text-ec-hint">{spec.hint}</span>
                </td>
              </tr>
              <tr>
                <th className="bg-ec-page">지급일</th>
                <td><input type="date" className="ec-input" value={payDate} onChange={(e) => setPayDate(e.target.value)} style={{ width: 150 }} /></td>
                <th className="w-[80px] bg-ec-page">지급액<span className="text-ec-danger">*</span></th>
                <td><input className="ec-input" type="number" value={grossAmount} onChange={(e) => setGrossAmount(e.target.value)} style={{ width: 130, textAlign: 'right' }} /></td>
              </tr>
              <tr>
                <th className="bg-ec-page">{incomeType === 'BUSINESS' ? '업종구분코드' : '소득코드'}</th>
                <td>
                  <select className="ec-input w-[150px]" value={incomeCode} onChange={(e) => setIncomeCode(e.target.value)}>
                    <option value="">(선택 안 함)</option>
                    {CODES[incomeType].map((c) => <option key={c.code} value={c.code}>{c.code}{c.name ? ` ${c.name}` : ''}</option>)}
                  </select>
                </td>
                <th className="bg-ec-page">귀속연월</th>
                <td><input type="month" className="ec-input w-[130px]" value={attributionMonth} onChange={(e) => setAttributionMonth(e.target.value)} title="비우면 지급일의 연월" /></td>
              </tr>
              <tr>
                <th className="bg-ec-page">거래처</th>
                <td colSpan={3}>
                {/* 코드 마스터를 고르는 칸은 드롭다운이 아니라 <b>코드도움</b>이다 —
                    거래처가 몇백 개가 되면 이름으로도 코드로도 못 찾는다. */}
                <CodePickerField label="거래처" hideLabel width={240} emptyLabel="(거래처 없이 개인에게 지급)"
                                 value={partnerId} onChange={pickPartner}
                                 items={partners.map((x) => ({ value: String(x.id), code: x.code, name: x.name }))} />
                </td>
              </tr>
              <tr>
                <th className="bg-ec-page">지급받는 자<span className="text-ec-danger">*</span></th>
                <td><input className="ec-input" value={payeeName} onChange={(e) => setPayeeName(e.target.value)} placeholder="성명 또는 상호" style={{ width: 150 }} /></td>
                <th className="bg-ec-page">등록번호</th>
                <td><input className="ec-input" value={payeeRegNo} onChange={(e) => setPayeeRegNo(e.target.value)} placeholder="사업자/주민번호" style={{ width: 130 }} /></td>
              </tr>
              <tr>
                <th className="bg-ec-page">적요</th>
                <td colSpan={3}><input className="ec-input" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="예: 7월 외주 용역비" style={{ width: '100%' }} /></td>
              </tr>
            </tbody>
          </table>

          <div className="mt-[10px] p-[10px] bg-ec-page border border-ec-line border-solid text-[12.5px]">
            {expenseRate > 0 && (
              <div className="flex justify-between text-ec-label">
                <span>필요경비 ({expenseRate * 100}%)</span><span>{won(expense)} 원</span>
              </div>
            )}
            <div className="flex justify-between">
              <span>과세대상</span><span>{won(taxable)} 원</span>
            </div>
            <div className="flex justify-between text-ec-danger">
              <span>소득세 ({spec.rate * 100}%)</span><span>− {won(incomeTax)} 원</span>
            </div>
            <div className="flex justify-between text-ec-danger">
              <span>지방소득세 (소득세의 10%)</span><span>− {won(localTax)} 원</span>
            </div>
            <div className="flex justify-between font-extrabold border-t border-t-ec-line border-solid mt-[6px] pt-[6px]">
              <span>실지급액</span><span className="text-ec-navy">{won(net)} 원</span>
            </div>
          </div>
        </div>
        <div className="flex gap-[6px] py-[10px] px-[16px] border-t border-t-ec-line border-solid">
          <button className="ec-btn ec-btn-primary" onClick={save} disabled={saving}>{saving ? '저장 중…' : '저장(F8)'}</button>
          <button className="ec-btn" style={{ marginLeft: 'auto' }} onClick={onClose}>닫기</button>
        </div>
      </div>
    </div>
  )
}
