import { useState } from 'react'
import EcListShell from '../../components/EcListShell'

/** Self-Customizing > 기타관리시스템 — 부가 관리 기능 바로가기 */
// 실제 외부 연동/저장 백엔드가 아직 없어 목록은 표본 데이터다. (백엔드 미연동)
interface Sys { id: number; name: string; desc: string; state: '사용중' | '미사용' }
const SYSTEMS: Sys[] = [
  { id: 1, name: '전자세금계산서 연동', desc: '국세청 홈택스 세금계산서 발행/수집 연동', state: '사용중' },
  { id: 2, name: '바코드/QR 발행', desc: '품목·로트 라벨 바코드 생성 및 프린터 연동', state: '사용중' },
  { id: 3, name: 'SMS/알림톡 발송', desc: '주문·배송 상태 고객 알림 발송', state: '사용중' },
  { id: 4, name: '문서 결재선 템플릿', desc: '전자결재 결재선 사전 정의 관리', state: '사용중' },
  { id: 5, name: '외부 회계 프로그램 연계', desc: '더존/세무사 프로그램 데이터 연계', state: '미사용' },
  { id: 6, name: 'API 액세스 키 관리', desc: '외부 시스템 연동용 API 키 발급/폐기', state: '미사용' },
]

// 연동 설정 폼 (로컬 상태). 저장할 백엔드가 아직 없어 화면에만 유지된다.
interface IntegrationForm { enabled: boolean; endpoint: string; apiKey: string; note: string }
const EMPTY_FORM: IntegrationForm = { enabled: true, endpoint: '', apiKey: '', note: '' }

export default function EtcSystemPage() {
  const [target, setTarget] = useState<Sys | null>(null)
  const [form, setForm] = useState<IntegrationForm>(EMPTY_FORM)
  const [saved, setSaved] = useState('')

  function openConfig(s: Sys) {
    setTarget(s)
    setForm({ ...EMPTY_FORM, enabled: s.state === '사용중' })
    setSaved('')
  }
  function close() { setTarget(null); setSaved('') }
  const set = <K extends keyof IntegrationForm>(k: K, v: IntegrationForm[K]) => setForm((f) => ({ ...f, [k]: v }))

  // 저장: 아직 백엔드가 없음을 정직하게 알린다.
  function save() {
    setSaved('입력값은 이 화면에만 유지됩니다. 연동 설정 저장 백엔드가 아직 없습니다. (백엔드 미연동)')
  }

  return (
    <>
      <EcListShell
        title="기타관리시스템"
        actions={[{ label: '연동 설정', onClick: () => openConfig(SYSTEMS[0]) }]}
      >
        <div style={{ marginBottom: 6, fontSize: 12, color: '#9aa1ab' }}>
          ※ 아래 기능들은 표본 목록입니다. 실제 외부 연동/저장은 아직 연결되지 않았습니다. (백엔드 미연동)
        </div>
        <table className="w-full text-left">
          <thead>
            <tr>
              <th style={{ width: 34 }}></th>
              <th style={{ width: 200 }}>기능 ▼</th>
              <th>설명</th>
              <th style={{ width: 90, textAlign: 'center' }}>상태 ▼</th>
              <th style={{ width: 100, textAlign: 'center' }}>설정</th>
            </tr>
          </thead>
          <tbody>
            {SYSTEMS.map((s, i) => (
              <tr key={s.id}>
                <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
                <td style={{ fontWeight: 600 }}>{s.name}</td>
                <td style={{ color: '#5a626e' }}>{s.desc}</td>
                <td style={{ textAlign: 'center', color: s.state === '사용중' ? '#1c7c3c' : '#8a929c', fontWeight: 700 }}>{s.state}</td>
                <td style={{ textAlign: 'center' }}>
                  <button className="ec-btn" style={{ height: 20, padding: '0 10px' }} onClick={() => openConfig(s)}>설정</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </EcListShell>

      {/* 연동 설정 모달 (로컬 상태) */}
      {target && (
        <div
          onClick={close}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.35)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: 4, width: 460, maxWidth: '92vw', boxShadow: '0 10px 30px rgba(0,0,0,.2)' }}>
            <div style={{ padding: '10px 14px', borderBottom: '1px solid #e6eaef', fontWeight: 800, fontSize: 14, display: 'flex', alignItems: 'center' }}>
              <span>{target.name} · 연동 설정</span>
              <button className="ec-btn" style={{ marginLeft: 'auto' }} onClick={close}>닫기</button>
            </div>
            <div style={{ padding: 14, fontSize: 12.5, lineHeight: 1.7, color: '#3c4553' }}>
              <p style={{ margin: '0 0 10px', color: '#5a626e' }}>{target.desc}</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <label style={{ cursor: 'pointer' }}>
                  <input type="checkbox" checked={form.enabled} onChange={(e) => set('enabled', e.target.checked)} style={{ marginRight: 6, verticalAlign: 'middle' }} />
                  이 연동 사용
                </label>
                <label>연동 서버 주소(Endpoint)<br />
                  <input className="ec-input" value={form.endpoint} onChange={(e) => set('endpoint', e.target.value)} placeholder="https://" style={{ width: '100%', marginTop: 2 }} />
                </label>
                <label>API 키<br />
                  <input className="ec-input" value={form.apiKey} onChange={(e) => set('apiKey', e.target.value)} placeholder="발급받은 API 키" style={{ width: '100%', marginTop: 2 }} />
                </label>
                <label>메모<br />
                  <input className="ec-input" value={form.note} onChange={(e) => set('note', e.target.value)} style={{ width: '100%', marginTop: 2 }} />
                </label>
              </div>
              {saved && (
                <p style={{ marginTop: 10, background: '#fff6e5', color: '#8a5a00', padding: '6px 10px', borderRadius: 3, fontSize: 12 }}>{saved}</p>
              )}
            </div>
            <div style={{ padding: '10px 14px', borderTop: '1px solid #e6eaef', display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
              <button className="ec-btn ec-btn-primary" onClick={save}>저장</button>
              <button className="ec-btn" onClick={close}>취소</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
