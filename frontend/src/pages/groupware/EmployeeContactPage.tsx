import { useEffect, useState } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import EcListShell from '../../components/EcListShell'
import { EcCond } from '../../components/EcStatusPanel'
import { useTableSort } from '../../utils/useTableSort'

interface Contact {
  id: number
  name: string
  department: string
  phone: string | null
  mobile: string | null
  email: string | null
  jobTitle: string
  resignDate: string | null
  /** 원본 [생년월일] — 우리 사원에 칸이 없어 지금은 늘 비어 온다(원본 loginaa 도 전부 빈칸). */
  birthDate?: string | null
}

/** 원본 [생년월일] 조건 처음 값 — 이번 달 1일 ~ 말일, [사용] 꺼짐(2026-10-14 E070202 실측). */
function monthRange() {
  const d = new Date()
  const y = String(d.getFullYear())
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const last = String(new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate())
  return { fy: y, fm: m, fd: '01', ty: y, tm: m, td: last }
}
type BirthCond = ReturnType<typeof monthRange>
const YEARS = Array.from({ length: 100 }, (_, i) => String(new Date().getFullYear() - i))
const MONTHS = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0'))

/** 원본 조건 [사원구분] — 전체 · 재직자 · 퇴사자, 처음엔 재직자(2026-10-13 E070202 실측). */
type EmpKind = 'ALL' | 'ACTIVE' | 'RESIGNED'
const EMP_KINDS: [EmpKind, string][] = [['ALL', '전체'], ['ACTIVE', '재직자'], ['RESIGNED', '퇴사자']]

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
 * <p><b>[생년월일]</b>(2026-10-14) — 원본 loginaa 는 열이 있고 전부 빈칸이다. 우리도 열을 그리고 응답의 birthDate 를 찍는다
 * (우리 사원 hr.Employee 에는 아직 칸이 없어 늘 빈칸 — 사원 칸을 늘리는 것은 관리 모듈 몫). 조건 [생년월일] 은
 * 년 ▾ / 월 ▾ / 일 ~ 년 ▾ / 월 ▾ / 일 ☐사용 — 처음엔 이번 달 1일 ~ 말일, [사용] 꺼짐. 켜면 그 기간에 든 사람만
 * (생년월일이 빈 사람은 빠진다 — 원본도 켜고 검색하면 '등록된 데이터가 없습니다.').
 *
 * <p><b>2026-10-13 조건 판.</b> 원본 [Search(F3)] 를 누르면 조건이 내려온다 — 성명 · 부서 · 직위/직급 · 전화 · 모바일 ·
 * Email · 생년월일(사용) · 사원구분(전체 · <b>재직자</b> · 퇴사자). 처음엔 재직자만 보인다.
 */
export default function EmployeeContactPage() {
  const [rows, setRows] = useState<Contact[]>([])
  const [error, setError] = useState('')
  const [keyword, setKeyword] = useState('')
  const [page, setPage] = useState(1)
  const [nameCond, setNameCond] = useState('')
  const [deptCond, setDeptCond] = useState('')
  const [titleCond, setTitleCond] = useState('')
  const [phoneCond, setPhoneCond] = useState('')
  const [mobileCond, setMobileCond] = useState('')
  const [emailCond, setEmailCond] = useState('')
  const [kind, setKind] = useState<EmpKind>('ACTIVE')
  const [birth, setBirth] = useState<BirthCond>(monthRange)
  const [birthOn, setBirthOn] = useState(false)
  const setB = (k: keyof BirthCond, v: string) => setBirth((b) => ({ ...b, [k]: v }))
  const day2 = (d: string) => (d.trim() || '1').padStart(2, '0')
  const birthFrom = `${birth.fy}-${birth.fm}-${day2(birth.fd)}`
  const birthTo = `${birth.ty}-${birth.tm}-${day2(birth.td)}`

  useEffect(() => {
    api.get<Contact[]>('/employees')
      .then((r) => setRows(r.data))
      .catch((err) => setError(extractErrorMessage(err)))
  }, [])

  const has = (v: string | null, q: string) => !q || (v ?? '').includes(q)
  const filtered = rows
    .filter((r) => !keyword
      || [r.name, r.department, r.phone, r.mobile, r.email].some((v) => (v ?? '').includes(keyword)))
    .filter((r) => has(r.name, nameCond) && (!deptCond || r.department === deptCond)
      && (!titleCond || r.jobTitle === titleCond) && has(r.phone, phoneCond)
      && has(r.mobile, mobileCond) && has(r.email, emailCond))
    .filter((r) => kind === 'ALL' || (kind === 'ACTIVE' ? !r.resignDate : !!r.resignDate))
    .filter((r) => !birthOn || (!!r.birthDate && r.birthDate >= birthFrom && r.birthDate <= birthTo))
  const uniq = (vs: string[]) => [...new Set(vs.filter(Boolean))].sort()
  const sort = useTableSort(filtered, {
    성명: (r) => r.name,
    부서: (r) => r.department,
    전화: (r) => r.phone,
    모바일: (r) => r.mobile,
    Email: (r) => r.email,
    생년월일: (r) => r.birthDate ?? '',
  })
  const pages = Math.max(1, Math.ceil(sort.sorted.length / PAGE))
  const cur = Math.min(page, pages)
  const shown = sort.sorted.slice((cur - 1) * PAGE, cur * PAGE)

  useEffect(() => { setPage(1) }, [keyword, nameCond, deptCond, titleCond, phoneCond, mobileCond, emailCond, kind, birthOn, birthFrom, birthTo])

  const th = (k: '성명' | '부서' | '전화' | '모바일' | 'Email' | '생년월일') => (
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

      {/* 원본 차례: 성명 · 부서 · 직위/직급 · 전화 · 모바일 · Email · 생년월일 · 사원구분 — 접어 두고 [Search(F3)] 로 편다 */}
      <ul className="ec-cond mb-[6px]">
        <EcCond label="성명">
          <input className="ec-input w-[140px]" aria-label="성명" value={nameCond} onChange={(e) => setNameCond(e.target.value)} />
        </EcCond>
        <EcCond label="부서" pick>
          <select className="ec-input w-[140px]" aria-label="부서" value={deptCond} onChange={(e) => setDeptCond(e.target.value)}>
            <option value="">선택</option>
            {uniq(rows.map((r) => r.department)).map((d) => <option key={d}>{d}</option>)}
          </select>
        </EcCond>
        <EcCond label="직위/직급" pick>
          <select className="ec-input w-[140px]" aria-label="직위/직급" value={titleCond} onChange={(e) => setTitleCond(e.target.value)}>
            <option value="">선택</option>
            {uniq(rows.map((r) => r.jobTitle)).map((d) => <option key={d}>{d}</option>)}
          </select>
        </EcCond>
        <EcCond label="전화">
          <input className="ec-input w-[140px]" aria-label="전화" value={phoneCond} onChange={(e) => setPhoneCond(e.target.value)} />
        </EcCond>
        <EcCond label="모바일">
          <input className="ec-input w-[140px]" aria-label="모바일" value={mobileCond} onChange={(e) => setMobileCond(e.target.value)} />
        </EcCond>
        <EcCond label="Email">
          <input className="ec-input w-[140px]" aria-label="Email" value={emailCond} onChange={(e) => setEmailCond(e.target.value)} />
        </EcCond>
        <EcCond label="생년월일">
          <div className="flex items-center gap-[4px] text-[12px] text-ec-label">
            {(['f', 't'] as const).map((side, i) => (
              <span key={side} className="flex items-center gap-[4px]">
                {i === 1 && <span>~</span>}
                <select className="ec-input w-[70px]" aria-label={`생년월일 ${i ? '끝' : '시작'} 년`} value={birth[`${side}y`]}
                        onChange={(e) => setB(`${side}y`, e.target.value)}>
                  {YEARS.map((y) => <option key={y}>{y}</option>)}
                </select>
                <span>/</span>
                <select className="ec-input w-[54px]" aria-label={`생년월일 ${i ? '끝' : '시작'} 월`} value={birth[`${side}m`]}
                        onChange={(e) => setB(`${side}m`, e.target.value)}>
                  {MONTHS.map((m) => <option key={m}>{m}</option>)}
                </select>
                <span>/</span>
                <input className="ec-input w-[36px] text-center" aria-label={`생년월일 ${i ? '끝' : '시작'} 일`} maxLength={2}
                       value={birth[`${side}d`]} onChange={(e) => setB(`${side}d`, e.target.value.replace(/\D/g, ''))} />
              </span>
            ))}
            <label className="flex items-center gap-[4px] ml-[6px]">
              <input type="checkbox" aria-label="생년월일 사용" checked={birthOn} onChange={(e) => setBirthOn(e.target.checked)} /> 사용
            </label>
          </div>
        </EcCond>
        <EcCond label="사원구분">
          <div className="flex items-center gap-[10px] text-[12px] text-ec-label">
            {EMP_KINDS.map(([k, label]) => (
              <label key={k} className="flex items-center gap-[4px]">
                <input type="radio" name="emp-kind" checked={kind === k} onChange={() => setKind(k)} /> {label}
              </label>
            ))}
          </div>
        </EcCond>
      </ul>

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
          <tr>{th('성명')}{th('부서')}{th('전화')}{th('모바일')}{th('Email')}{th('생년월일')}</tr>
        </thead>
        <tbody>
          {shown.length === 0 ? (
            <tr><td colSpan={6} className="text-center text-ec-ink">등록된 데이터가 없습니다.</td></tr>
          ) : shown.map((r) => (
            <tr key={r.id}>
              <td>{r.name}</td>
              <td>{r.department}</td>
              <td>{r.phone ?? ''}</td>
              <td>{r.mobile ?? ''}</td>
              <td>{r.email ?? ''}</td>
              <td>{r.birthDate ? r.birthDate.replace(/-/g, '/') : ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </EcListShell>
  )
}
