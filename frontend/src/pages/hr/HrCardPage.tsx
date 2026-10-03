import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import EcListShell from '../../components/EcListShell'
import Modal from '../../components/Modal'
import { useTableSort } from '../../utils/useTableSort'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import { api, extractErrorMessage } from '../../api/client'
import type { EmployeeMaster } from '../../types/api'
import { dateText } from '../../utils/dateText'

type Category = 'EDUCATION' | 'CAREER' | 'LICENSE' | 'FAMILY' | 'LANGUAGE' | 'REWARD' | 'TRAINING' | 'TRIP' | 'MEMO' | 'WORK_STATUS' | 'GUARANTOR'
type DateKey = 'fromDate' | 'toDate' | 'date3' | 'date4'
type TextKey = 'text1' | 'text2' | 'text3' | 'text4' | 'text5' | 'text6' | 'text7' | 'text8' | 'text9' | 'text10'
type Row = Record<DateKey | TextKey, string>
interface Col { label: string; key: DateKey | TextKey; kind?: 'date' | 'select' | 'number' | 'radio'; options?: string[] }
const YN = ['여', '부']

/**
 * 원본 [인사자료] 입력 창의 열 차례(2026-10-03 loginaa 실측, 열한 항목 전부). 서버는 날짜 넷 + 글자 칸 열로 받는다.
 * 원본 가족사항의 동거여부 · 부양여부는 여/부 라디오 — 우리도 라디오(줄마다 이름을 따로 둔다). 숫자 칸(비용 · 일수)은 글자로 담고 오른쪽에 붙인다.
 */
const CATEGORIES: { key: Category; label: string; cols: Col[] }[] = [
  {
    key: 'EDUCATION', label: '학력사항', cols: [
      { label: '학력', key: 'text1' }, { label: '학교명', key: 'text2' },
      { label: '입학일자', key: 'fromDate', kind: 'date' }, { label: '졸업일자', key: 'toDate', kind: 'date' },
      { label: '주야구분', key: 'text3', kind: 'select', options: ['주간', '야간'] }, { label: '전공명', key: 'text4' },
      { label: '소재지', key: 'text5' }, { label: '기타', key: 'text6' },
      { label: '졸업구분', key: 'text7', kind: 'select', options: ['졸업', '수료', '중퇴', '재학', '휴학'] },
    ],
  },
  {
    key: 'CAREER', label: '경력사항', cols: [
      { label: '입사일자', key: 'fromDate', kind: 'date' }, { label: '퇴사일자', key: 'toDate', kind: 'date' },
      { label: '회사명', key: 'text1' }, { label: '직위', key: 'text2' },
      { label: '담당업무(부서)', key: 'text3' }, { label: '퇴사사유', key: 'text4' },
    ],
  },
  {
    key: 'LICENSE', label: '자격ㆍ면허', cols: [
      { label: '자격/면허코드', key: 'text1' }, { label: '자격/면허번호', key: 'text2' }, { label: '자격/면허발행기관', key: 'text3' },
      { label: '취득일자', key: 'fromDate', kind: 'date' }, { label: '만기일자', key: 'toDate', kind: 'date' },
      { label: '갱신일자', key: 'date3', kind: 'date' }, { label: '말소일자', key: 'date4', kind: 'date' },
      { label: '말소사유', key: 'text4' },
    ],
  },
  {
    key: 'FAMILY', label: '가족사항', cols: [
      { label: '주민등록번호', key: 'text1' }, { label: '성명', key: 'text2' }, { label: '관계', key: 'text3' },
      { label: '최종학력', key: 'text4' }, { label: '직업', key: 'text5' }, { label: '회사명', key: 'text6' }, { label: '직위', key: 'text7' },
      { label: '동거여부', key: 'text8', kind: 'radio', options: YN }, { label: '부양여부', key: 'text9', kind: 'radio', options: YN },
    ],
  },
  {
    key: 'LANGUAGE', label: '외국어', cols: [
      { label: '외국어명', key: 'text1' }, { label: '독해', key: 'text2' }, { label: '작문', key: 'text3' },
      { label: '회화', key: 'text4' }, { label: '자격증', key: 'text5' },
    ],
  },
  {
    key: 'REWARD', label: '상벌사항', cols: [
      { label: '기간', key: 'fromDate', kind: 'date' }, { label: '상벌구분', key: 'text1' }, { label: '사유', key: 'text2' },
      { label: '시행처', key: 'text3' },
    ],
  },
  {
    key: 'TRAINING', label: '교육사항', cols: [
      { label: '교육코드', key: 'text1' }, { label: '시작일자', key: 'fromDate', kind: 'date' }, { label: '종료일자', key: 'toDate', kind: 'date' },
      { label: '교육기관', key: 'text2' }, { label: '교육내용', key: 'text3' }, { label: '교육비용', key: 'text4', kind: 'number' },
      { label: '교육결과', key: 'text5' }, { label: '적요', key: 'text6' },
    ],
  },
  {
    key: 'TRIP', label: '출장사항', cols: [
      { label: '출장국', key: 'text1' }, { label: '출장비용', key: 'text2', kind: 'number' }, { label: '출장내역', key: 'text3' },
      { label: '출장시작일', key: 'fromDate', kind: 'date' }, { label: '출장종료일', key: 'toDate', kind: 'date' },
    ],
  },
  {
    key: 'MEMO', label: '메모사항', cols: [
      { label: '작성일자', key: 'fromDate', kind: 'date' }, { label: '내용', key: 'text1' },
    ],
  },
  {
    key: 'WORK_STATUS', label: '근무실태', cols: [
      { label: '연도', key: 'text1', kind: 'number' }, { label: '총휴가일수', key: 'text2', kind: 'number' },
      { label: '사용휴가일수', key: 'text3', kind: 'number' }, { label: '연가', key: 'text4', kind: 'number' },
      { label: '경조', key: 'text5', kind: 'number' }, { label: '특별', key: 'text6', kind: 'number' },
      { label: '병가', key: 'text7', kind: 'number' }, { label: '조퇴', key: 'text8', kind: 'number' },
      { label: '기타', key: 'text9', kind: 'number' }, { label: '적요', key: 'text10' },
    ],
  },
  {
    key: 'GUARANTOR', label: '보증인', cols: [
      { label: '성명', key: 'text1' }, { label: '주민등록번호', key: 'text2' }, { label: '회사', key: 'text3' },
      { label: '직위', key: 'text4' }, { label: '관계', key: 'text5' }, { label: '전화번호', key: 'text6' },
      { label: '우편번호', key: 'text7' }, { label: '주소', key: 'text8' },
      { label: '보증기간 시작일', key: 'fromDate', kind: 'date' }, { label: '보증기간 종료일', key: 'toDate', kind: 'date' },
    ],
  },
]
const blank = (): Row => ({
  fromDate: '', toDate: '', date3: '', date4: '',
  text1: '', text2: '', text3: '', text4: '', text5: '', text6: '', text7: '', text8: '', text9: '', text10: '',
})

/**
 * 관리 &gt; 인사관리 &gt; <b>인사카드등록</b> (원본 C001001).
 *
 * <p>2026-10-03 loginaa 실측: 목록 입사일자 · 사원번호 · 성명 · 부서명 · 직위/직급명 · 전화번호 · Email · 인쇄,
 * 버튼 신규(F2) · 인쇄 · SMS · 선택삭제 · Excel · 웹자료올리기 · 이력조회. 사원등록과 같은 사원이고, 성명을 누르면
 * '인사카드등록' 창(탭 기본 · 사원정보 · 추가정보 · 신상정보 · 인사자료 · 기타설정)이 열린다.
 * [인사자료]의 항목마다 [입력]을 누르면 줄 입력 창(저장(F8) · 삭제 · 닫기)이 뜨고, 자료가 있는 항목은 [입력]이 칠해진다.
 *
 * <p>여기서는 [인사자료] 열한 항목을 만들었다. 기본 정보는 사원등록에서 고친다([신규(F2)]도 사원등록으로 간다).
 * 신상정보 · 기타설정 탭, 인쇄 · SMS · 선택삭제 · 웹자료올리기 · 이력조회는 아직 없다.
 */
export default function HrCardPage() {
  const nav = useNavigate()
  const [rows, setRows] = useState<EmployeeMaster[]>([])
  const [error, setError] = useState('')
  const [quick, setQuick] = useState('')
  const tableRef = useRef<HTMLTableElement>(null)

  const [card, setCard] = useState<EmployeeMaster | null>(null)
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [detail, setDetail] = useState<{ cat: typeof CATEGORIES[number]; rows: Row[] } | null>(null)
  const [detailError, setDetailError] = useState('')

  useEffect(() => {
    api.get<EmployeeMaster[]>('/employees/all').then((r) => setRows(r.data)).catch((e) => setError(extractErrorMessage(e)))
  }, [])

  async function openCard(e: EmployeeMaster) {
    setCard(e)
    try { setCounts((await api.get<Record<string, number>>(`/employees/${e.id}/hr-details`)).data) } catch { setCounts({}) }
  }

  async function openDetail(cat: typeof CATEGORIES[number]) {
    if (!card) return
    setDetailError('')
    try {
      const got = (await api.get<Partial<Row>[]>(`/employees/${card.id}/hr-details/${cat.key}`)).data
        .map((r) => ({ ...blank(), ...Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v ?? ''])) }) as Row)
      setDetail({ cat, rows: [...got, ...Array.from({ length: Math.max(1, 3 - got.length) }, blank)] })
    } catch (err) {
      setDetailError(extractErrorMessage(err))
    }
  }

  async function saveDetail() {
    if (!card || !detail) return
    const body = detail.rows.map((r) => ({ ...r, fromDate: r.fromDate || null, toDate: r.toDate || null, date3: r.date3 || null, date4: r.date4 || null }))
    try {
      await api.put(`/employees/${card.id}/hr-details/${detail.cat.key}`, body)
      setDetail(null)
      openCard(card)
    } catch (err) {
      setDetailError(extractErrorMessage(err))
    }
  }

  async function deleteDetail() {
    if (!card || !detail || !window.confirm('한번 지워진 자료는 복구될 수 없습니다.\n\n삭제하겠습니까?')) return
    try {
      await api.delete(`/employees/${card.id}/hr-details/${detail.cat.key}`)
      setDetail(null)
      openCard(card)
    } catch (err) {
      setDetailError(extractErrorMessage(err))
    }
  }

  const shownRows = rows
    .filter((e) => !e.resignDate)
    .filter((e) => !quick || e.code.includes(quick) || e.name.includes(quick))
    .sort((a, b) => (a.hireDate ?? '').localeCompare(b.hireDate ?? '') || a.code.localeCompare(b.code))
  const sort = useTableSort(shownRows, {
    입사일자: (e) => e.hireDate ?? '', 사원번호: (e) => e.code, 성명: (e) => e.name, 부서명: (e) => e.department,
    '직위/직급명': (e) => e.jobTitle, 전화번호: (e) => e.phone ?? '', Email: (e) => e.email ?? '',
  })
  const shown = sort.sorted
  useTableColumnCheck(tableRef, '인사카드등록', [shown.length])

  return (
    <EcListShell title="인사카드등록" search={quick} onSearchChange={setQuick} onSearch={() => undefined}
                 onNew={() => nav('/hr/employees')} actions={[{ label: 'Excel' }]}>
      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
      <table ref={tableRef} className="w-full text-left">
        <thead>
          <tr>
            <th className="cursor-pointer" onClick={() => sort.toggle('입사일자')}>입사일자 {sort.mark('입사일자')}</th>
            <th className="cursor-pointer" onClick={() => sort.toggle('사원번호')}>사원번호 {sort.mark('사원번호')}</th>
            <th className="cursor-pointer" onClick={() => sort.toggle('성명')}>성명 {sort.mark('성명')}</th>
            <th className="cursor-pointer" onClick={() => sort.toggle('부서명')}>부서명 {sort.mark('부서명')}</th>
            <th className="cursor-pointer" onClick={() => sort.toggle('직위/직급명')}>직위/직급명 {sort.mark('직위/직급명')}</th>
            <th className="cursor-pointer" onClick={() => sort.toggle('전화번호')}>전화번호 {sort.mark('전화번호')}</th>
            <th className="cursor-pointer" onClick={() => sort.toggle('Email')}>Email {sort.mark('Email')}</th>
          </tr>
        </thead>
        <tbody>
          {shown.length === 0 ? (
            <tr><td colSpan={7} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
          ) : shown.map((e) => (
            <tr key={e.id}>
              <td className="text-center">{dateText(e.hireDate) || ''}</td>
              <td><a href="#" onClick={(ev) => { ev.preventDefault(); openCard(e) }}>{e.code}</a></td>
              <td><a href="#" onClick={(ev) => { ev.preventDefault(); openCard(e) }}>{e.name}</a></td>
              <td>{e.department}</td>
              <td>{e.jobTitle}</td>
              <td>{e.phone}</td>
              <td>{e.email}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <Modal error={detail ? null : detailError} open={!!card} title="인사카드등록" width={640} onClose={() => setCard(null)}>{(
        <>
          <div className="ec-pills mb-[8px]"><span className="ec-pill active">인사자료</span></div>
          <ul className="ec-form">
            <li><span className="title">사원번호</span><div className="form">{card?.code}</div></li>
            <li><span className="title">성명</span><div className="form">{card?.name}</div></li>
            {CATEGORIES.map((c) => (
              <li key={c.key} className="wide">
                <span className="title">{c.label}</span>
                <div className="form">
                  <button type="button" className={`ec-btn ec-btn-sm${counts[c.key] ? ' ec-btn-primary' : ''}`} onClick={() => openDetail(c)}>입력</button>
                </div>
              </li>
            ))}
          </ul>
          <div className="flex gap-[6px] mt-[12px]">
            <button type="button" className="ec-btn" onClick={() => setCard(null)}>닫기</button>
          </div>
        </>
      )}</Modal>

      <Modal error={detailError} open={!!detail} title={detail?.cat.label ?? ''} width={980} onClose={() => setDetail(null)}>{(
        detail && (
          <>
            <div className="overflow-x-auto">
              <table className="w-full whitespace-nowrap">
                <thead>
                  <tr>
                    <th className="w-[34px]"></th>
                    {detail.cat.cols.map((c) => <th key={c.label}>{c.label}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {detail.rows.map((r, i) => (
                    <tr key={i}>
                      <td className="text-center text-ec-hint">{i + 1}</td>
                      {detail.cat.cols.map((c) => {
                        const set = (v: string) => {
                          const next = detail.rows.map((x, j) => (j === i ? { ...x, [c.key]: v } : x))
                          const last = next[next.length - 1]
                          setDetail({ ...detail, rows: Object.values(last).some(Boolean) ? [...next, blank()] : next })
                        }
                        return (
                          <td key={c.label}>
                            {c.kind === 'date' ? <input type="date" className="ec-input w-full" value={r[c.key]} onChange={(ev) => set(ev.target.value)} />
                              : c.kind === 'select' ? (
                                <select className="ec-input w-full" value={r[c.key]} onChange={(ev) => set(ev.target.value)}>
                                  <option value=""></option>
                                  {c.options!.map((o) => <option key={o}>{o}</option>)}
                                </select>
                              ) : c.kind === 'radio' ? (
                                <span className="inline-flex gap-[8px] whitespace-nowrap">
                                  {c.options!.map((o) => (
                                    <label key={o} className="inline-flex items-center gap-[3px]">
                                      <input type="radio" name={`hr-${detail.cat.key}-${c.key}-${i}`} checked={r[c.key] === o} onChange={() => set(o)} /> {o}
                                    </label>
                                  ))}
                                </span>
                              ) : c.kind === 'number' ? (
                                <input className="ec-input w-full text-right" inputMode="decimal" value={r[c.key]}
                                       onChange={(ev) => set(ev.target.value.replace(/[^0-9.]/g, ''))} />
                              ) : <input className="ec-input w-full" value={r[c.key]} onChange={(ev) => set(ev.target.value)} />}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex gap-[6px] mt-[12px]">
              <button type="button" className="ec-btn ec-btn-primary" onClick={saveDetail}>저장(F8)</button>
              <button type="button" className="ec-btn" onClick={deleteDetail}>삭제</button>
              <button type="button" className="ec-btn" onClick={() => setDetail(null)}>닫기</button>
            </div>
          </>
        )
      )}</Modal>
    </EcListShell>
  )
}
