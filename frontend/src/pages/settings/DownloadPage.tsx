import { useState } from 'react'
import EcListShell from '../../components/EcListShell'

/** Self-Customizing > 다운로드 — 프로그램/양식/매뉴얼 자료실 */
// 실제 내려받을 파일/저장소가 아직 없어 목록은 표본 데이터다. (백엔드 미연동)
interface DL { id: number; category: string; name: string; version: string; size: string; date: string; guide: string }
const FILES: DL[] = [
  { id: 1, category: '프로그램', name: '제조ERP 전용 클라이언트 (Windows)', version: 'v1.4.2', size: '84.2 MB', date: '2026-07-01', guide: '내려받은 설치 파일을 실행한 뒤 안내에 따라 설치하고, 서버 주소와 발급받은 계정으로 로그인하세요.' },
  { id: 2, category: '프로그램', name: '바코드 라벨 프린터 드라이버', version: 'v3.0', size: '12.6 MB', date: '2026-05-14', guide: '프린터를 USB로 연결한 상태에서 드라이버를 설치하고, 라벨 크기를 프린터 환경설정에서 지정하세요.' },
  { id: 3, category: '엑셀양식', name: '품목 일괄등록 양식', version: '-', size: '48 KB', date: '2026-06-20', guide: '양식의 헤더 행은 그대로 두고 각 열에 맞춰 품목 정보를 입력한 뒤, 품목관리 화면의 [일괄등록]에서 업로드하세요.' },
  { id: 4, category: '엑셀양식', name: '거래처 일괄등록 양식', version: '-', size: '52 KB', date: '2026-06-20', guide: '양식에 거래처 정보를 입력한 뒤 거래처관리 화면의 [일괄등록]에서 업로드하세요.' },
  { id: 5, category: '엑셀양식', name: '기초재고 등록 양식', version: '-', size: '61 KB', date: '2026-06-20', guide: '창고·품목·수량을 입력한 뒤 재고관리 화면의 [기초재고 업로드]에서 업로드하세요.' },
  { id: 6, category: '매뉴얼', name: '사용자 매뉴얼 (전체)', version: 'v1.4', size: '9.8 MB', date: '2026-07-02', guide: 'PDF 뷰어로 열람할 수 있으며, 목차에서 원하는 모듈로 바로 이동할 수 있습니다.' },
  { id: 7, category: '매뉴얼', name: '전자결재 사용 가이드', version: 'v1.1', size: '2.1 MB', date: '2026-06-28', guide: '기안서 작성부터 결재선 지정, 승인/반려 처리까지의 절차를 담고 있습니다.' },
]

const catColor = (c: string) => ({ 프로그램: 'var(--ec-blue)', 엑셀양식: '#1c7c3c', 매뉴얼: '#7a5cc0' }[c] ?? '#5a626e')

export default function DownloadPage() {
  const [target, setTarget] = useState<DL | null>(null)
  const [notice, setNotice] = useState('')

  // ⬇ 받기: 실제 파일이 없으므로 정직하게 안내하고 설치 가이드를 보여준다.
  function openGuide(f: DL) { setTarget(f) }
  function close() { setTarget(null) }

  // 전체 선택 다운로드: 내려받을 실제 파일이 없음을 알린다.
  function downloadAll() {
    setNotice(`내려받을 수 있는 실제 파일이 아직 없습니다. 자료실 저장소가 연결되면 ${FILES.length}건을 일괄 내려받을 수 있습니다. (백엔드 미연동)`)
    window.setTimeout(() => setNotice(''), 4000)
  }

  return (
    <>
      <EcListShell
        title="다운로드 자료실"
        actions={[{ label: '전체 선택 다운로드', onClick: downloadAll }]}
      >
        <div style={{ marginBottom: 6, fontSize: 12, color: '#9aa1ab' }}>
          ※ 아래는 표본 목록입니다. 실제 파일 저장소는 아직 연결되지 않았습니다. (백엔드 미연동)
        </div>
        {notice && (
          <div style={{ marginBottom: 6, padding: '5px 8px', fontSize: 12, borderRadius: 3, background: '#fff6e5', border: '1px solid #f0dcae', color: '#8a5a00' }}>
            {notice}
          </div>
        )}
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
                  <button className="ec-btn" style={{ height: 20, padding: '0 10px' }} onClick={() => openGuide(f)}>⬇ 받기</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </EcListShell>

      {/* 받기 안내 모달: 실제 파일이 없음을 정직하게 알리고 설치/사용 안내를 보여준다 */}
      {target && (
        <div
          onClick={close}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.35)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: 4, width: 460, maxWidth: '92vw', boxShadow: '0 10px 30px rgba(0,0,0,.2)' }}>
            <div style={{ padding: '10px 14px', borderBottom: '1px solid #e6eaef', fontWeight: 800, fontSize: 14, display: 'flex', alignItems: 'center' }}>
              <span>{target.name}</span>
              <button className="ec-btn" style={{ marginLeft: 'auto' }} onClick={close}>닫기</button>
            </div>
            <div style={{ padding: 14, fontSize: 12.5, lineHeight: 1.7, color: '#3c4553' }}>
              <p style={{ margin: '0 0 10px', background: '#fff6e5', color: '#8a5a00', padding: '6px 10px', borderRadius: 3 }}>
                내려받을 수 있는 실제 파일이 아직 없습니다. 자료실 저장소가 연결되면 이 자료를 내려받을 수 있습니다. (백엔드 미연동)
              </p>
              <div style={{ fontSize: 12, color: '#9aa1ab', marginBottom: 6 }}>
                분류 {target.category} · 버전 {target.version} · 크기 {target.size} · 등록일 {target.date}
              </div>
              <div style={{ fontWeight: 700, color: 'var(--ec-blue-dark)', marginBottom: 2 }}>설치 / 사용 안내</div>
              <p style={{ margin: 0 }}>{target.guide}</p>
            </div>
            <div style={{ padding: '10px 14px', borderTop: '1px solid #e6eaef', display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
              <button className="ec-btn" onClick={close}>확인</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
