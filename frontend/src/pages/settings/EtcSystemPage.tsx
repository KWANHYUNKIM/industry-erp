import EcListShell from '../../components/EcListShell'

/** Self-Customizing > 기타관리시스템 — 부가 관리 기능 바로가기 */
interface Sys { id: number; name: string; desc: string; state: '사용중' | '미사용' }
const SYSTEMS: Sys[] = [
  { id: 1, name: '전자세금계산서 연동', desc: '국세청 홈택스 세금계산서 발행/수집 연동', state: '사용중' },
  { id: 2, name: '바코드/QR 발행', desc: '품목·로트 라벨 바코드 생성 및 프린터 연동', state: '사용중' },
  { id: 3, name: 'SMS/알림톡 발송', desc: '주문·배송 상태 고객 알림 발송', state: '사용중' },
  { id: 4, name: '문서 결재선 템플릿', desc: '전자결재 결재선 사전 정의 관리', state: '사용중' },
  { id: 5, name: '외부 회계 프로그램 연계', desc: '더존/세무사 프로그램 데이터 연계', state: '미사용' },
  { id: 6, name: 'API 액세스 키 관리', desc: '외부 시스템 연동용 API 키 발급/폐기', state: '미사용' },
]

export default function EtcSystemPage() {
  return (
    <EcListShell title="기타관리시스템" actions={[{ label: '연동 설정' }]}>
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
                <button className="ec-btn" style={{ height: 20, padding: '0 10px' }} onClick={() => alert(`[${s.name}] 설정 화면 (화면 시연)`)}>설정</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </EcListShell>
  )
}
