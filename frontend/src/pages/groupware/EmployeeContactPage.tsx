import { useEffect, useState } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import EcListShell from '../../components/EcListShell'
import { useTableSort } from '../../utils/useTableSort'

interface Contact {
  id: number
  name: string
  department: string
  phone: string | null
  mobile: string | null
  email: string | null
}

/** 원본은 한 쪽에 10명씩 편다(사원 23명 → 1 2 3 / 3, 2026-10-03 실측). */
const PAGE = 10

/**
 * 그룹웨어 > 공유정보 > 사내관리 > 사원연락처 (이카운트 E070202)
 *
 * <p>2026-10-03 원본을 열어 보기 전까지 우리 메뉴에는 '권한없음이라 근거가 없다' 고 적혀 빠져 있었다.
 * 지금은 열린다 — <b>읽기만 하는 화면</b>이다. 등록·수정은 관리 &gt; 사원등록에서 하고, 여기서는
 * 회사 사람들의 연락처를 찾아본다. 그래서 신규·삭제가 없고 하단은 [Excel] 하나다.
 *
 * <p>원본 실측: 머리 [성명▼][부서▼][전화▼][모바일▼][Email▼][생년월일▼] — 전부 눌러 정렬한다. 행번호 칸이 없다.
 * 쪽번호는 표 <b>위</b>에 붙는다(① 2 3 » [ ] / 3). 검색창은 제목 줄 오른쪽 하나뿐이다.
 *
 * <p><b>[생년월일]은 두지 않았다.</b> 우리 사원(hr.Employee)에 생년월일 칸이 없다 — 원본 loginaa 회사도
 * 전부 빈칸이었다. 늘 빈 열을 그려 두면 '값이 없다' 가 아니라 '아직 안 적었다' 로 읽힌다.
 * 사원 칸을 늘리는 것은 관리 모듈 일이라 보드에 적어 두었다.
 */
export default function EmployeeContactPage() {
  const [rows, setRows] = useState<Contact[]>([])
  const [error, setError] = useState('')
  const [keyword, setKeyword] = useState('')
  const [page, setPage] = useState(1)

  useEffect(() => {
    api.get<Contact[]>('/employees')
      .then((r) => setRows(r.data))
      .catch((err) => setError(extractErrorMessage(err)))
  }, [])

  const filtered = rows.filter((r) => !keyword
    || [r.name, r.department, r.phone, r.mobile, r.email].some((v) => (v ?? '').includes(keyword)))
  const sort = useTableSort(filtered, {
    성명: (r) => r.name,
    부서: (r) => r.department,
    전화: (r) => r.phone,
    모바일: (r) => r.mobile,
    Email: (r) => r.email,
  })
  const pages = Math.max(1, Math.ceil(sort.sorted.length / PAGE))
  const cur = Math.min(page, pages)
  const shown = sort.sorted.slice((cur - 1) * PAGE, cur * PAGE)

  useEffect(() => { setPage(1) }, [keyword])

  const th = (k: '성명' | '부서' | '전화' | '모바일' | 'Email') => (
    <th className="cursor-pointer text-ec-navy" onClick={() => sort.toggle(k)}>{k} {sort.mark(k)}</th>
  )

  return (
    <EcListShell
      title="사원연락처"
      search={keyword}
      onSearchChange={setKeyword}
      actions={[{ label: 'Excel' }]}
    >
      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}

      {/* 원본 쪽번호 — 표 위 */}
      <div className="flex items-center gap-[6px] mb-[4px]">
        <div className="ec-paging">
          {Array.from({ length: pages }, (_, i) => i + 1).map((p) => (
            <button key={p} type="button" className={p === cur ? 'active' : ''} onClick={() => setPage(p)}>{p}</button>
          ))}
          {cur < pages && <button type="button" aria-label="다음 쪽" onClick={() => setPage(cur + 1)}>»</button>}
        </div>
        <input className="ec-input w-[40px] text-center" aria-label="쪽 이동" defaultValue=""
               onKeyDown={(e) => {
                 if (e.key !== 'Enter') return
                 const n = Number((e.target as HTMLInputElement).value)
                 if (n >= 1 && n <= pages) setPage(n)
               }} />
        <span className="text-[12px] text-ec-ink">/ {pages}</span>
      </div>

      <table className="w-full text-left table-fixed">
        <thead>
          <tr>{th('성명')}{th('부서')}{th('전화')}{th('모바일')}{th('Email')}</tr>
        </thead>
        <tbody>
          {shown.length === 0 ? (
            <tr><td colSpan={5} className="text-center text-ec-ink">등록된 데이터가 없습니다.</td></tr>
          ) : shown.map((r) => (
            <tr key={r.id}>
              <td>{r.name}</td>
              <td>{r.department}</td>
              <td>{r.phone ?? ''}</td>
              <td>{r.mobile ?? ''}</td>
              <td>{r.email ?? ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </EcListShell>
  )
}
