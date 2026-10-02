import { useState } from 'react'
import EcListShell from '../../components/EcListShell'
import { useTableSort } from '../../utils/useTableSort'
import { dateText } from '../../utils/dateText'

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

const catColor = (c: string) => ({ 프로그램: 'var(--ec-blue)', 엑셀양식: 'var(--ec-success)', 매뉴얼: '#7a5cc0' }[c] ?? 'var(--ec-label)')

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

  /*
   * 세 칸에 <b>▼ 만 그려 놓고</b> 정렬은 없었다. [크기]는 '2.4 MB' 처럼 단위가 붙은
   * 글자라 그대로 세우면 <b>900 KB 가 2 MB 보다 커진다</b> — 원본도 크기에는 정렬
   * 표시를 안 달았으므로 그 칸은 걸지 않았다.
   */
  const sort = useTableSort(FILES, {
    분류: (f) => f.category,
    자료명: (f) => f.name,
    등록일: (f) => f.date,
  })

  return (
    <>
      <EcListShell
        title="다운로드 자료실"
        actions={[{ label: '전체 선택 다운로드', onClick: downloadAll }]}
      >
        <div className="mb-[6px] text-[12px] text-ec-hint">
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
              <th className="w-[34px]"></th>
              <th className="w-[100px] cursor-pointer" onClick={() => sort.toggle('분류')}>분류 {sort.mark('분류')}</th>
              <th className="cursor-pointer" onClick={() => sort.toggle('자료명')}>자료명 {sort.mark('자료명')}</th>
              <th className="w-[90px]">버전</th>
              <th className="w-[90px] text-right">크기</th>
              <th className="w-[110px] cursor-pointer" onClick={() => sort.toggle('등록일')}>등록일 {sort.mark('등록일')}</th>
              <th className="w-[90px] text-center">다운로드</th>
            </tr>
          </thead>
          <tbody>
            {sort.sorted.map((f, i) => (
              <tr key={f.id}>
                <td className="text-center text-ec-hint">{i + 1}</td>
                <td style={{ color: catColor(f.category), fontWeight: 700 }}>{f.category}</td>
                <td>{f.name}</td>
                <td>{f.version}</td>
                <td className="text-right text-ec-label">{f.size}</td>
                <td>{dateText(f.date)}</td>
                <td className="text-center">
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
            <div className="py-[10px] px-[14px] border-b border-b-ec-line-soft border-solid font-extrabold text-[14px] flex items-center">
              <span>{target.name}</span>
              <button className="ec-btn" style={{ marginLeft: 'auto' }} onClick={close}>닫기</button>
            </div>
            <div className="p-[14px] text-[12.5px] leading-[1.7] text-ec-text">
              <p style={{ margin: '0 0 10px', background: '#fff6e5', color: '#8a5a00', padding: '6px 10px', borderRadius: 3 }}>
                내려받을 수 있는 실제 파일이 아직 없습니다. 자료실 저장소가 연결되면 이 자료를 내려받을 수 있습니다. (백엔드 미연동)
              </p>
              <div className="text-[12px] text-ec-hint mb-[6px]">
                분류 {target.category} · 버전 {target.version} · 크기 {target.size} · 등록일 {target.date}
              </div>
              <div className="font-bold text-ec-navy mb-[2px]">설치 / 사용 안내</div>
              <p className="m-0">{target.guide}</p>
            </div>
            <div className="py-[10px] px-[14px] border-t border-t-ec-line-soft border-solid flex gap-[6px] justify-end">
              <button className="ec-btn" onClick={close}>확인</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
