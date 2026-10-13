import { useEffect, useState } from 'react'
import Modal from '../../../components/Modal'
import { api, extractErrorMessage } from '../../../api/client'

interface InsuranceRate {
  year: number
  custom: boolean
  pensionRate: number
  healthRate: number
  longTermCareRate: number
  employmentRate: number
}

type Key = 'pensionRate' | 'healthRate' | 'longTermCareRate' | 'employmentRate'

const FIELDS: [Key, string, string][] = [
  ['pensionRate', '국민연금', '기준소득월액 × 율'],
  ['healthRate', '건강보험', '과세급여 × 율'],
  ['longTermCareRate', '장기요양', '건강보험 산출액 × 율'],
  ['employmentRate', '고용보험', '과세급여 × 율'],
]

/** 0.045 → '4.5' (%) — 소수 넷째 자리까지 그대로 */
const toPct = (v: number) => String(Number((v * 100).toFixed(4)))
const fromPct = (s: string) => Number((Number(s) / 100).toFixed(6))

/**
 * 원본 공제항목등록 Option › <b>세율/세액등록</b> — 연도마다 4대보험 근로자 부담 요율을 회사가 정한다.
 * 원본 창은 권한(회사 마스터)이 없어 열어 보지 못했다(2026-10-13 '(공제항목) 업무 권한이 없습니다.').
 * 원본 loginaa 는 2026/10 급여에도 2025 요율(4.5 · 3.545 · 12.95 %)로 공제한다 — 여기서 그 해 요율을 넣으면 같아진다.
 * 그 해 줄이 없으면 급여계산은 법정 요율(2026: 4.75 · 3.595 · 13.14 · 0.9 %)을 쓴다. [법정요율로] 는 회사 줄을 지운다.
 */
export default function InsuranceRateModal({ onClose }: { onClose: () => void }) {
  const [year, setYear] = useState(new Date().getFullYear())
  const [rate, setRate] = useState<InsuranceRate | null>(null)
  const [form, setForm] = useState<Record<Key, string>>({ pensionRate: '', healthRate: '', longTermCareRate: '', employmentRate: '' })
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const show = (r: InsuranceRate) => {
    setRate(r)
    setForm({ pensionRate: toPct(r.pensionRate), healthRate: toPct(r.healthRate),
              longTermCareRate: toPct(r.longTermCareRate), employmentRate: toPct(r.employmentRate) })
  }

  useEffect(() => {
    setError('')
    setNotice('')
    api.get<InsuranceRate>(`/pay-settings/insurance-rates/${year}`).then((r) => show(r.data))
      .catch((e) => setError(extractErrorMessage(e)))
  }, [year])

  async function save() {
    setError('')
    setNotice('')
    const bad = FIELDS.find(([k]) => form[k].trim() === '' || Number.isNaN(Number(form[k])) || Number(form[k]) < 0)
    if (bad) { setError(`${bad[1]} 요율을 입력 바랍니다.`); return }
    try {
      const body = Object.fromEntries(FIELDS.map(([k]) => [k, fromPct(form[k])]))
      show((await api.put<InsuranceRate>(`/pay-settings/insurance-rates/${year}`, body)).data)
      setNotice('저장되었습니다.')
    } catch (e) { setError(extractErrorMessage(e)) }
  }

  async function reset() {
    setError('')
    setNotice('')
    try {
      show((await api.delete<InsuranceRate>(`/pay-settings/insurance-rates/${year}`)).data)
      setNotice('법정 요율로 되돌렸습니다.')
    } catch (e) { setError(extractErrorMessage(e)) }
  }

  return (
    <Modal open title="세율/세액등록" onClose={onClose} width={520} error={error}>
      <div className="ec-form">
        <div className="flex items-center gap-[6px] mb-[8px]">
          <label htmlFor="ins-year" className="w-[93px]">적용연도</label>
          <input id="ins-year" className="ec-input w-[90px]" type="number" value={year}
                 onChange={(e) => setYear(Number(e.target.value) || year)} />
          <span className="text-ec-hint">{rate && (rate.custom ? '회사 설정' : '법정 요율')}</span>
        </div>
        <table className="w-full">
          <thead>
            <tr><th>보험</th><th className="text-right w-[120px]">근로자 요율(%)</th><th>산출방법</th></tr>
          </thead>
          <tbody>
            {FIELDS.map(([k, label, how]) => (
              <tr key={k}>
                <td>{label}</td>
                <td><input aria-label={`${label} 요율`} className="ec-input w-full text-right" value={form[k]}
                           onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.value }))} /></td>
                <td>{how}, 10원 미만 버림</td>
              </tr>
            ))}
          </tbody>
        </table>
        {notice && <p className="ec-alert mt-[8px]">{notice}</p>}
      </div>
      <div className="flex gap-[4px] mt-[8px]">
        <button type="button" className="ec-btn ec-btn-primary" onClick={save}>저장(F8)</button>
        <button type="button" className="ec-btn" onClick={reset} disabled={!rate?.custom}>법정요율로</button>
        <button type="button" className="ec-btn" onClick={onClose}>닫기</button>
      </div>
    </Modal>
  )
}
