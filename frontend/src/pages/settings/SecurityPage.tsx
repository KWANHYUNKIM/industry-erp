import { useEffect, useState } from 'react'
import EcListShell from '../../components/EcListShell'
import { api, extractErrorMessage } from '../../api/client'

/** Self-Customizing > 보안관리 — 접속 정책(실제 연동) + 접속 이력(표본 데이터) */
interface Log { id: number; time: string; user: string; ip: string; device: string; result: '성공' | '실패' }
// 실제 접속 로그 데이터 소스가 아직 없어 표본 데이터를 그대로 사용한다. (백엔드 미연동)
const LOGS: Log[] = [
  { id: 1, time: '2026-07-07 09:02:11', user: 'admin', ip: '210.94.x.12', device: 'Chrome / Windows', result: '성공' },
  { id: 2, time: '2026-07-07 08:58:40', user: 'kim', ip: '221.150.x.88', device: 'Edge / Windows', result: '성공' },
  { id: 3, time: '2026-07-06 22:14:05', user: 'unknown', ip: '45.61.x.203', device: 'curl', result: '실패' },
  { id: 4, time: '2026-07-06 18:31:22', user: 'lee', ip: '211.36.x.7', device: 'Safari / macOS', result: '성공' },
]
// 기본 표시 건수. "전체 로그 조회" 를 누르면 전체를 펼친다.
const PREVIEW_COUNT = 3

// 백엔드는 숫자, 화면 입력은 문자열로 다룬다.
interface Policy {
  pwLength: string
  pwCycleDays: string
  loginFailLimit: string
  sessionTimeout: string
  ipRestrict: boolean
  twoFactor: boolean
}
const DEFAULT_POLICY: Policy = {
  pwLength: '8', pwCycleDays: '90', loginFailLimit: '5', sessionTimeout: '30', ipRestrict: false, twoFactor: false,
}

// 백엔드 응답(숫자)
interface PolicyResponse {
  pwLength: number; pwCycleDays: number; loginFailLimit: number; sessionTimeout: number
  ipRestrict: boolean; twoFactor: boolean
}

export default function SecurityPage() {
  const [policy, setPolicy] = useState<Policy>(DEFAULT_POLICY)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')
  const [showAllLogs, setShowAllLogs] = useState(false)

  const set = (k: keyof Policy, v: string | boolean) => { setPolicy((p) => ({ ...p, [k]: v })); setOk('') }

  async function load() {
    setLoading(true)
    try {
      const r = await api.get<PolicyResponse | null>('/security-policy')
      if (r.data) {
        setPolicy({
          pwLength: String(r.data.pwLength),
          pwCycleDays: String(r.data.pwCycleDays),
          loginFailLimit: String(r.data.loginFailLimit),
          sessionTimeout: String(r.data.sessionTimeout),
          ipRestrict: r.data.ipRestrict,
          twoFactor: r.data.twoFactor,
        })
      }
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  async function save() {
    setError(''); setOk('')
    // 숫자 필드 검증
    const nums: (keyof Policy)[] = ['pwLength', 'pwCycleDays', 'loginFailLimit', 'sessionTimeout']
    for (const k of nums) {
      const n = Number(policy[k])
      if (!Number.isFinite(n) || n < 0 || String(policy[k]).trim() === '') {
        setError('접속 정책의 숫자 항목을 올바르게 입력하세요.'); return
      }
    }
    setSaving(true)
    try {
      await api.put('/security-policy', {
        pwLength: Number(policy.pwLength),
        pwCycleDays: Number(policy.pwCycleDays),
        loginFailLimit: Number(policy.loginFailLimit),
        sessionTimeout: Number(policy.sessionTimeout),
        ipRestrict: policy.ipRestrict,
        twoFactor: policy.twoFactor,
      })
      await load()
      setOk('보안정책이 저장되었습니다.')
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  const visibleLogs = showAllLogs ? LOGS : LOGS.slice(0, PREVIEW_COUNT)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ color: '#f5b301', fontSize: 14, marginRight: 4 }}>☆</span>
        <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--ec-text)' }}>보안관리</span>
      </div>

      {error && <p style={{ marginBottom: 8, background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3 }}>{error}</p>}
      {ok && <p style={{ marginBottom: 8, background: '#eaf6ec', color: '#1c7c3c', padding: '6px 10px', fontSize: 12.5, borderRadius: 3 }}>{ok}</p>}

      <div style={{ fontWeight: 700, fontSize: 12.5, color: 'var(--ec-blue-dark)', margin: '6px 0 4px' }}>비밀번호 / 접속 정책</div>
      {loading ? (
        <p style={{ color: '#9aa1ab', padding: 20 }}>불러오는 중…</p>
      ) : (
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
          <button className="ec-btn ec-btn-primary" onClick={save} disabled={saving}>{saving ? '저장 중…' : '정책 저장'}</button>
        </div>
      )}

      <div style={{ fontWeight: 700, fontSize: 12.5, color: 'var(--ec-blue-dark)', margin: '6px 0 4px' }}>
        최근 접속 이력 <span style={{ fontWeight: 400, color: '#9aa1ab' }}>(표본 데이터 · 백엔드 미연동)</span>
      </div>
      <EcListShell
        title="접속 이력"
        actions={[
          { label: showAllLogs ? '접힘' : '전체 로그 조회', onClick: () => setShowAllLogs((v) => !v) },
          { label: 'Excel' },
        ]}
      >
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
            {visibleLogs.map((l, i) => (
              <tr key={l.id}>
                <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
                <td>{l.time}</td>
                <td>{l.user}</td>
                <td style={{ fontFamily: 'monospace' }}>{l.ip}</td>
                <td>{l.device}</td>
                <td style={{ textAlign: 'center', color: l.result === '실패' ? '#c60a2e' : '#1c7c3c', fontWeight: 700 }}>{l.result}</td>
              </tr>
            ))}
            <tr>
              <td colSpan={6} style={{ textAlign: 'center', color: '#9aa1ab', fontSize: 12 }}>
                {showAllLogs
                  ? `전체 접속 이력 ${LOGS.length}건 표시 (표본 데이터)`
                  : `최근 ${visibleLogs.length}건 표시 · 전체 ${LOGS.length}건 — "전체 로그 조회"로 펼치기`}
              </td>
            </tr>
          </tbody>
        </table>
      </EcListShell>
    </div>
  )
}
