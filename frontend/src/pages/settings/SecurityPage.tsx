import { useState } from 'react'
import EcListShell from '../../components/EcListShell'

/** Self-Customizing > 보안관리 — 접속 정책 + 접속 이력 */
interface Log { id: number; time: string; user: string; ip: string; device: string; result: '성공' | '실패' }
const LOGS: Log[] = [
  { id: 1, time: '2026-07-07 09:02:11', user: 'admin', ip: '210.94.x.12', device: 'Chrome / Windows', result: '성공' },
  { id: 2, time: '2026-07-07 08:58:40', user: 'kim', ip: '221.150.x.88', device: 'Edge / Windows', result: '성공' },
  { id: 3, time: '2026-07-06 22:14:05', user: 'unknown', ip: '45.61.x.203', device: 'curl', result: '실패' },
  { id: 4, time: '2026-07-06 18:31:22', user: 'lee', ip: '211.36.x.7', device: 'Safari / macOS', result: '성공' },
]

export default function SecurityPage() {
  const [policy, setPolicy] = useState({
    pwLength: '8',
    pwCycleDays: '90',
    loginFailLimit: '5',
    sessionTimeout: '30',
    ipRestrict: false,
    twoFactor: false,
  })
  const set = (k: keyof typeof policy, v: string | boolean) => setPolicy((p) => ({ ...p, [k]: v }))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ color: '#f5b301', fontSize: 14, marginRight: 4 }}>☆</span>
        <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--ec-text)' }}>보안관리</span>
      </div>

      <div style={{ fontWeight: 700, fontSize: 12.5, color: 'var(--ec-blue-dark)', margin: '6px 0 4px' }}>비밀번호 / 접속 정책</div>
      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', padding: '10px 12px', border: '1px solid var(--ec-border)', borderRadius: 3, marginBottom: 14, maxWidth: 820 }}>
        <label style={{ fontSize: 12.5 }}>최소 비밀번호 길이&nbsp;
          <input className="ec-input" value={policy.pwLength} onChange={(e) => set('pwLength', e.target.value)} style={{ width: 50 }} /> 자
        </label>
        <label style={{ fontSize: 12.5 }}>비밀번호 변경주기&nbsp;
          <input className="ec-input" value={policy.pwCycleDays} onChange={(e) => set('pwCycleDays', e.target.value)} style={{ width: 50 }} /> 일
        </label>
        <label style={{ fontSize: 12.5 }}>로그인 실패 잠금&nbsp;
          <input className="ec-input" value={policy.loginFailLimit} onChange={(e) => set('loginFailLimit', e.target.value)} style={{ width: 50 }} /> 회
        </label>
        <label style={{ fontSize: 12.5 }}>세션 자동종료&nbsp;
          <input className="ec-input" value={policy.sessionTimeout} onChange={(e) => set('sessionTimeout', e.target.value)} style={{ width: 50 }} /> 분
        </label>
        <label style={{ fontSize: 12.5, cursor: 'pointer' }}>
          <input type="checkbox" checked={policy.ipRestrict} onChange={(e) => set('ipRestrict', e.target.checked)} style={{ marginRight: 4, verticalAlign: 'middle' }} />
          허용 IP 대역 제한
        </label>
        <label style={{ fontSize: 12.5, cursor: 'pointer' }}>
          <input type="checkbox" checked={policy.twoFactor} onChange={(e) => set('twoFactor', e.target.checked)} style={{ marginRight: 4, verticalAlign: 'middle' }} />
          2단계 인증(OTP) 사용
        </label>
        <button className="ec-btn ec-btn-primary" onClick={() => alert('보안정책이 저장되었습니다. (화면 시연)')}>정책 저장</button>
      </div>

      <div style={{ fontWeight: 700, fontSize: 12.5, color: 'var(--ec-blue-dark)', margin: '6px 0 4px' }}>최근 접속 이력</div>
      <EcListShell title="접속 이력" actions={[{ label: '전체 로그 조회' }, { label: 'Excel' }]}>
        <table className="w-full text-left">
          <thead>
            <tr>
              <th style={{ width: 34 }}></th>
              <th style={{ width: 160 }}>접속일시 ▼</th>
              <th style={{ width: 120 }}>사용자</th>
              <th style={{ width: 140 }}>IP</th>
              <th>기기 / 브라우저</th>
              <th style={{ width: 80, textAlign: 'center' }}>결과 ▼</th>
            </tr>
          </thead>
          <tbody>
            {LOGS.map((l, i) => (
              <tr key={l.id}>
                <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
                <td>{l.time}</td>
                <td>{l.user}</td>
                <td style={{ fontFamily: 'monospace' }}>{l.ip}</td>
                <td>{l.device}</td>
                <td style={{ textAlign: 'center', color: l.result === '실패' ? '#c60a2e' : '#1c7c3c', fontWeight: 700 }}>{l.result}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </EcListShell>
    </div>
  )
}
