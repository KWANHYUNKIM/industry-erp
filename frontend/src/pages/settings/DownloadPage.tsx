import EcListShell from '../../components/EcListShell'

/** Self-Customizing > 다운로드 — 프로그램/양식/매뉴얼 자료실 */
interface DL { id: number; category: string; name: string; version: string; size: string; date: string }
const FILES: DL[] = [
  { id: 1, category: '프로그램', name: '제조ERP 전용 클라이언트 (Windows)', version: 'v1.4.2', size: '84.2 MB', date: '2026-07-01' },
  { id: 2, category: '프로그램', name: '바코드 라벨 프린터 드라이버', version: 'v3.0', size: '12.6 MB', date: '2026-05-14' },
  { id: 3, category: '엑셀양식', name: '품목 일괄등록 양식', version: '-', size: '48 KB', date: '2026-06-20' },
  { id: 4, category: '엑셀양식', name: '거래처 일괄등록 양식', version: '-', size: '52 KB', date: '2026-06-20' },
  { id: 5, category: '엑셀양식', name: '기초재고 등록 양식', version: '-', size: '61 KB', date: '2026-06-20' },
  { id: 6, category: '매뉴얼', name: '사용자 매뉴얼 (전체)', version: 'v1.4', size: '9.8 MB', date: '2026-07-02' },
  { id: 7, category: '매뉴얼', name: '전자결재 사용 가이드', version: 'v1.1', size: '2.1 MB', date: '2026-06-28' },
]

const catColor = (c: string) => ({ 프로그램: 'var(--ec-blue)', 엑셀양식: '#1c7c3c', 매뉴얼: '#7a5cc0' }[c] ?? '#5a626e')

export default function DownloadPage() {
  return (
    <EcListShell title="다운로드 자료실" actions={[{ label: '전체 선택 다운로드' }]}>
      <table className="w-full text-left">
        <thead>
          <tr>
            <th style={{ width: 34 }}></th>
            <th style={{ width: 100 }}>분류 ▼</th>
            <th>자료명 ▼</th>
            <th style={{ width: 90 }}>버전</th>
            <th style={{ width: 90, textAlign: 'right' }}>크기</th>
            <th style={{ width: 110 }}>등록일 ▼</th>
            <th style={{ width: 90, textAlign: 'center' }}>다운로드</th>
          </tr>
        </thead>
        <tbody>
          {FILES.map((f, i) => (
            <tr key={f.id}>
              <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
              <td style={{ color: catColor(f.category), fontWeight: 700 }}>{f.category}</td>
              <td>{f.name}</td>
              <td style={{ fontFamily: 'monospace' }}>{f.version}</td>
              <td style={{ textAlign: 'right', color: '#5a626e' }}>{f.size}</td>
              <td>{f.date}</td>
              <td style={{ textAlign: 'center' }}>
                <button className="ec-btn" style={{ height: 20, padding: '0 10px' }} onClick={() => alert(`[${f.name}] 다운로드를 시작합니다. (화면 시연)`)}>⬇ 받기</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </EcListShell>
  )
}
