import { Link } from 'react-router-dom'

/**
 * Self-Customizing > 다운로드 > 엑셀자료올리기기능 (원본 E000129).
 *
 * <p>원본은 안내 화면이다 — "자료를 일괄 업로드하는 기능으로 [엑셀자료올리기]와 [웹 자료올리기] 두 가지 방식이
 * 있습니다." 아래 두 방식을 견준 표(지원 엑셀 버전 · 전송 방법 · 설치 여부)와 [내용 | 다운로드 | 비고] 표
 * (엑셀자료올리기 설치 프로그램 · 동영상강좌)가 있다.
 *
 * <p>우리에게 엑셀 안에서 보내는 설치 프로그램은 없다 — <b>웹자료올리기만 있고, 그것도 파일을 골라 형식을
 * 미리 보는 데까지다</b>(서버 일괄등록 API 가 없다 — ItemsPage 등의 [웹자료올리기] 창). 엑셀서식내려받기도 없다.
 * 옛 화면은 '다운로드 자료실' 이라는 이름으로 지어낸 파일 일곱 줄(클라이언트 · 드라이버 · 매뉴얼 …)을 보여 줬다.
 * 내려받을 파일이 하나도 없었으므로 그 표는 뺐다.
 */
const SCREENS = [
  { name: '품목등록', to: '/inventory/items', note: '품목 대량 등록' },
  { name: '거래처등록', to: '/sales/partners', note: '거래처 대량 등록' },
  { name: '창고등록', to: '/inventory/warehouses', note: '창고 대량 등록' },
]

export default function DownloadPage() {
  return (
    <div className="flex flex-col min-h-[100%]">
      <div className="ec-page-head">
        <h1 className="ec-page-title off">엑셀자료올리기기능</h1>
      </div>

      <p className="mb-[10px]">자료를 일괄 업로드하는 기능으로 [웹자료올리기] 방식이 있습니다. 지금은 파일 형식을 미리 확인하는 데까지이고, 서버로 올려 등록하는 것은 아직 안 됩니다.</p>

      <table className="w-full max-w-[900px] mb-[16px]">
        <thead>
          <tr><th>웹자료올리기</th></tr>
        </thead>
        <tbody>
          <tr><td>엑셀 · CSV 파일</td></tr>
          <tr><td>각 메뉴 [웹자료올리기] 에서 파일을 고르거나 끌어다 놓기</td></tr>
          <tr><td>데이터 행 수 · 머리글을 미리 확인 (등록은 아직 안 됨)</td></tr>
        </tbody>
      </table>

      <table className="w-full max-w-[900px]">
        <thead>
          <tr>
            <th className="w-[200px]">메뉴</th>
            <th className="w-[120px] text-center">바로가기</th>
            <th>비고</th>
          </tr>
        </thead>
        <tbody>
          {SCREENS.map((s) => (
            <tr key={s.to}>
              <td>{s.name}</td>
              <td className="text-center"><Link className="text-ec-navy" to={s.to}>바로가기</Link></td>
              <td>{s.note}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
