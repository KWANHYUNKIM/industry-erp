import { useEffect, useState } from 'react'
import EcListShell from '../../components/EcListShell'
import { useTableSort } from '../../utils/useTableSort'
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

  /*
   * 두 칸에 <b>▼ 만 그려 놓고</b> 정렬은 없었다.
   * 자르는 것이 먼저다 — <b>펼치기 전 목록을 정렬하면 '최근 N건' 이 최근이 아니게 된다.</b>
   * 그래서 이미 잘라 낸 것만 세운다.
   */
  const sort = useTableSort(visibleLogs, {
    접속일시: (l) => l.time,
    결과: (l) => l.result,
  })

  return (
    <div className="flex flex-col min-h-[100%]">
      <div className="flex items-center mb-[8px]">
        <span className="text-ec-star text-[14px] mr-[4px]">☆</span>
        <span className="text-[15px] font-extrabold text-ec-text">보안관리</span>
      </div>

      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
      {ok && <p className="ec-alert ec-alert-success mb-[8px]">{ok}</p>}

      <div className="font-bold text-[12.5px] text-ec-navy mt-[6px] mx-0 mb-[4px]">비밀번호 / 접속 정책</div>
      {/*
        QA 20회차: 이 정책들은 저장만 되고 아무 데서도 쓰지 않았다 — 화면은 지키는 것처럼 보였다.
        최소 비밀번호 길이는 이제 사용자 등록·비밀번호 변경에서 지킨다. 나머지는 적용 전이라 (미적용) 으로 밝힌다.
      */}
      <p className="mt-0 mx-0 mb-[6px] text-[11.5px] text-ec-hint">최소 비밀번호 길이는 사용자 등록·비밀번호 변경에 적용됩니다. <b className="text-ec-warn">(미적용)</b> 항목은 저장만 되고 아직 로그인·세션에 반영되지 않습니다.</p>
      {loading ? (
        <p className="text-ec-hint p-[20px]">불러오는 중…</p>
      ) : (
        <div className="flex gap-[20px] flex-wrap py-[10px] px-[12px] border border-ec-line border-solid rounded-[3px] mb-[14px] max-w-[820px]">
          <label className="text-[12.5px]">최소 비밀번호 길이&nbsp;
            <input className="ec-input" value={policy.pwLength} onChange={(e) => set('pwLength', e.target.value)} style={{ width: 50 }} /> 자
          </label>
          <label className="text-[12.5px]">비밀번호 변경주기&nbsp;
            <input className="ec-input" value={policy.pwCycleDays} onChange={(e) => set('pwCycleDays', e.target.value)} style={{ width: 50 }} /> 일<span className="ml-[4px] text-[11px] text-ec-warn" title="저장은 되지만 아직 로그인·세션에 적용하지 않습니다.">(미적용)</span>
          </label>
          <label className="text-[12.5px]">로그인 실패 잠금&nbsp;
            <input className="ec-input" value={policy.loginFailLimit} onChange={(e) => set('loginFailLimit', e.target.value)} style={{ width: 50 }} /> 회<span className="ml-[4px] text-[11px] text-ec-warn" title="저장은 되지만 아직 로그인·세션에 적용하지 않습니다.">(미적용)</span>
          </label>
          <label className="text-[12.5px]">세션 자동종료&nbsp;
            <input className="ec-input" value={policy.sessionTimeout} onChange={(e) => set('sessionTimeout', e.target.value)} style={{ width: 50 }} /> 분<span className="ml-[4px] text-[11px] text-ec-warn" title="저장은 되지만 아직 로그인·세션에 적용하지 않습니다.">(미적용)</span>
          </label>
          <label className="text-[12.5px] cursor-pointer">
            <input type="checkbox" checked={policy.ipRestrict} onChange={(e) => set('ipRestrict', e.target.checked)} style={{ marginRight: 4, verticalAlign: 'middle' }} />
            허용 IP 대역 제한<span className="ml-[4px] text-[11px] text-ec-warn" title="저장은 되지만 아직 로그인·세션에 적용하지 않습니다.">(미적용)</span>
          </label>
          <label className="text-[12.5px] cursor-pointer">
            <input type="checkbox" checked={policy.twoFactor} onChange={(e) => set('twoFactor', e.target.checked)} style={{ marginRight: 4, verticalAlign: 'middle' }} />
            2단계 인증(OTP) 사용<span className="ml-[4px] text-[11px] text-ec-warn" title="저장은 되지만 아직 로그인·세션에 적용하지 않습니다.">(미적용)</span>
          </label>
          <button className="ec-btn ec-btn-primary" onClick={save} disabled={saving}>{saving ? '저장 중…' : '정책 저장'}</button>
        </div>
      )}

      <div className="font-bold text-[12.5px] text-ec-navy mt-[6px] mx-0 mb-[4px]">
        최근 접속 이력 <span className="font-normal text-ec-hint">(표본 데이터 · 백엔드 미연동)</span>
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
              <th className="w-[34px]"></th>
              <th className="w-[160px] cursor-pointer" onClick={() => sort.toggle('접속일시')}>접속일시 {sort.mark('접속일시')}</th>
              <th className="w-[120px]">사용자</th>
              <th className="w-[140px]">IP</th>
              <th>기기 / 브라우저</th>
              <th className="w-[80px] text-center cursor-pointer" onClick={() => sort.toggle('결과')}>결과 {sort.mark('결과')}</th>
            </tr>
          </thead>
          <tbody>
            {sort.sorted.map((l, i) => (
              <tr key={l.id}>
                <td className="text-center text-ec-hint">{i + 1}</td>
                <td>{l.time}</td>
                <td>{l.user}</td>
                <td>{l.ip}</td>
                <td>{l.device}</td>
                <td style={{ textAlign: 'center', color: l.result === '실패' ? 'var(--ec-danger)' : 'var(--ec-success)', fontWeight: 700 }}>{l.result}</td>
              </tr>
            ))}
            <tr>
              <td colSpan={6} className="text-center text-ec-hint text-[12px]">
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
