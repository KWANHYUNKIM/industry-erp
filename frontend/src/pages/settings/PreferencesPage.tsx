import { useState } from 'react'

/** Self-Customizing > 환경설정 — 시스템 전반 사용 옵션 */
interface Toggle { key: string; label: string; desc: string }
const TOGGLES: Toggle[] = [
  { key: 'negativeStock', label: '재고 마이너스 허용', desc: '현재고보다 많은 수량의 출고/판매 입력을 허용합니다.' },
  { key: 'autoDocNo', label: '전표번호 자동채번', desc: '판매/구매 입력 시 전표번호를 자동으로 부여합니다.' },
  { key: 'lotUse', label: '로트/시리얼 관리 사용', desc: '입출고 시 로트No.를 필수 입력받습니다.' },
  { key: 'approvalRequired', label: '판매/구매 결재 필수', desc: '전표 확정 전 전자결재 승인을 요구합니다.' },
  { key: 'priceHide', label: '단가 열람 권한 제한', desc: '권한이 없는 사용자에게 단가/원가를 숨깁니다.' },
]

export default function PreferencesPage() {
  const [values, setValues] = useState<Record<string, boolean>>({
    negativeStock: false, autoDocNo: true, lotUse: true, approvalRequired: false, priceHide: true,
  })
  const [fiscalStart, setFiscalStart] = useState('01')
  const [currency, setCurrency] = useState('KRW')
  const [decimals, setDecimals] = useState('0')

  const toggle = (k: string) => setValues((v) => ({ ...v, [k]: !v[k] }))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ color: '#f5b301', fontSize: 14, marginRight: 4 }}>☆</span>
        <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--ec-text)' }}>환경설정</span>
      </div>

      <div style={{ fontWeight: 700, fontSize: 12.5, color: 'var(--ec-blue-dark)', margin: '6px 0 4px' }}>기본 설정</div>
      <div style={{ display: 'flex', gap: 24, alignItems: 'center', padding: '8px 10px', border: '1px solid var(--ec-border)', borderRadius: 3, marginBottom: 14, maxWidth: 760, flexWrap: 'wrap' }}>
        <label style={{ fontSize: 12.5 }}>회계연도 시작월&nbsp;
          <select className="ec-input" value={fiscalStart} onChange={(e) => setFiscalStart(e.target.value)}>
            {Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0')).map((m) => <option key={m}>{m}</option>)}
          </select>월
        </label>
        <label style={{ fontSize: 12.5 }}>기준통화&nbsp;
          <select className="ec-input" value={currency} onChange={(e) => setCurrency(e.target.value)}>
            <option>KRW</option><option>USD</option><option>EUR</option><option>JPY</option>
          </select>
        </label>
        <label style={{ fontSize: 12.5 }}>금액 소수자리&nbsp;
          <select className="ec-input" value={decimals} onChange={(e) => setDecimals(e.target.value)}>
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
                    background: values[t.key] ? 'var(--ec-blue)' : '#c9cfd7', transition: 'background .15s',
                  }}
                >
                  <span style={{
                    position: 'absolute', top: 2, left: values[t.key] ? 26 : 2, width: 18, height: 18,
                    borderRadius: '50%', background: '#fff', transition: 'left .15s',
                  }} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{ display: 'flex', gap: 6, marginTop: 14 }}>
        <button className="ec-btn ec-btn-primary" onClick={() => alert('환경설정이 저장되었습니다. (화면 시연)')}>저장(F8)</button>
        <button className="ec-btn" onClick={() => alert('기본값으로 초기화되었습니다. (화면 시연)')}>기본값 복원</button>
      </div>
    </div>
  )
}
