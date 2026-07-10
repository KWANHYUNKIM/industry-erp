import { useEffect, useState } from 'react'
import { api, extractErrorMessage } from '../../api/client'

/** Self-Customizing > 환경설정 — 시스템 전반 사용 옵션 (실제 연동, 단일 레코드 upsert) */
interface Toggle { key: BoolKey; label: string; desc: string }
type BoolKey = 'negativeStock' | 'autoDocNo' | 'lotUse' | 'approvalRequired' | 'priceHide'
const TOGGLES: Toggle[] = [
  { key: 'negativeStock', label: '재고 마이너스 허용', desc: '현재고보다 많은 수량의 출고/판매 입력을 허용합니다.' },
  { key: 'autoDocNo', label: '전표번호 자동채번', desc: '판매/구매 입력 시 전표번호를 자동으로 부여합니다.' },
  { key: 'lotUse', label: '로트/시리얼 관리 사용', desc: '입출고 시 로트No.를 필수 입력받습니다.' },
  { key: 'approvalRequired', label: '판매/구매 결재 필수', desc: '전표 확정 전 전자결재 승인을 요구합니다.' },
  { key: 'priceHide', label: '단가 열람 권한 제한', desc: '권한이 없는 사용자에게 단가/원가를 숨깁니다.' },
]

interface Preference {
  fiscalStart: string
  currency: string
  decimals: number
  negativeStock: boolean
  autoDocNo: boolean
  lotUse: boolean
  approvalRequired: boolean
  priceHide: boolean
}

// 백엔드 엔티티 기본값과 동일 (기본값 복원 시 사용)
const DEFAULTS: Preference = {
  fiscalStart: '01', currency: 'KRW', decimals: 0,
  negativeStock: false, autoDocNo: true, lotUse: true, approvalRequired: false, priceHide: true,
}

export default function PreferencesPage() {
  const [form, setForm] = useState<Preference>(DEFAULTS)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')

  async function load() {
    setLoading(true)
    try {
      const r = await api.get<Preference | null>('/preferences')
      if (r.data) setForm({ ...DEFAULTS, ...r.data })
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const toggle = (k: BoolKey) => { setForm((f) => ({ ...f, [k]: !f[k] })); setOk('') }
  const setField = <K extends keyof Preference>(k: K, v: Preference[K]) => { setForm((f) => ({ ...f, [k]: v })); setOk('') }

  async function save() {
    setError(''); setOk('')
    setSaving(true)
    try {
      await api.put('/preferences', form)
      await load()
      setOk('환경설정이 저장되었습니다.')
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  // 기본값 복원: 로컬 폼만 기본값으로 되돌린다. 저장(F8) 을 눌러야 실제 반영된다.
  function restoreDefaults() {
    setForm(DEFAULTS); setOk(''); setError('')
    setOk('기본값으로 되돌렸습니다. 저장(F8)을 눌러야 반영됩니다.')
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ color: '#f5b301', fontSize: 14, marginRight: 4 }}>☆</span>
        <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--ec-text)' }}>환경설정</span>
      </div>

      {error && <p style={{ marginBottom: 8, background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3 }}>{error}</p>}
      {ok && <p style={{ marginBottom: 8, background: '#eaf6ec', color: '#1c7c3c', padding: '6px 10px', fontSize: 12.5, borderRadius: 3 }}>{ok}</p>}

      {loading ? (
        <p style={{ color: '#9aa1ab', padding: 20 }}>불러오는 중…</p>
      ) : (
        <>
          <div style={{ fontWeight: 700, fontSize: 12.5, color: 'var(--ec-blue-dark)', margin: '6px 0 4px' }}>기본 설정</div>
          <div style={{ display: 'flex', gap: 24, alignItems: 'center', padding: '8px 10px', border: '1px solid var(--ec-border)', borderRadius: 3, marginBottom: 14, maxWidth: 760, flexWrap: 'wrap' }}>
            <label style={{ fontSize: 12.5 }}>회계연도 시작월&nbsp;
              <select className="ec-input" value={form.fiscalStart} onChange={(e) => setField('fiscalStart', e.target.value)}>
                {Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0')).map((m) => <option key={m}>{m}</option>)}
              </select>월
            </label>
            <label style={{ fontSize: 12.5 }}>기준통화&nbsp;
              <select className="ec-input" value={form.currency} onChange={(e) => setField('currency', e.target.value)}>
                <option>KRW</option><option>USD</option><option>EUR</option><option>JPY</option>
              </select>
            </label>
            <label style={{ fontSize: 12.5 }}>금액 소수자리&nbsp;
              <select className="ec-input" value={String(form.decimals)} onChange={(e) => setField('decimals', Number(e.target.value))}>
                <option>0</option><option>1</option><option>2</option>
              </select>
            </label>
          </div>

          <div style={{ fontWeight: 700, fontSize: 12.5, color: 'var(--ec-blue-dark)', margin: '6px 0 4px' }}>사용 옵션</div>
          <table className="w-full text-left" style={{ maxWidth: 760 }}>
            <thead>
              <tr>
                <th style={{ width: 200 }}>항목</th>
                <th>설명</th>
                <th style={{ width: 90, textAlign: 'center' }}>사용</th>
              </tr>
            </thead>
            <tbody>
              {TOGGLES.map((t) => (
                <tr key={t.key}>
                  <td style={{ fontWeight: 600 }}>{t.label}</td>
                  <td style={{ color: '#5a626e' }}>{t.desc}</td>
                  <td style={{ textAlign: 'center' }}>
                    <button
                      onClick={() => toggle(t.key)}
                      className="no-ec"
                      style={{
                        width: 46, height: 22, borderRadius: 11, border: 'none', cursor: 'pointer', position: 'relative',
                        background: form[t.key] ? 'var(--ec-blue)' : '#c9cfd7', transition: 'background .15s',
                      }}
                    >
                      <span style={{
                        position: 'absolute', top: 2, left: form[t.key] ? 26 : 2, width: 18, height: 18,
                        borderRadius: '50%', background: '#fff', transition: 'left .15s',
                      }} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div style={{ display: 'flex', gap: 6, marginTop: 14 }}>
            <button className="ec-btn ec-btn-primary" onClick={save} disabled={saving}>{saving ? '저장 중…' : '저장(F8)'}</button>
            <button className="ec-btn" onClick={restoreDefaults} disabled={saving}>기본값 복원</button>
          </div>
        </>
      )}
    </div>
  )
}
