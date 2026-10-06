import { useEffect, useState } from 'react'
import EcListShell from '../../components/EcListShell'
import Modal from '../../components/Modal'
import { EcCond } from '../../components/EcStatusPanel'
import { api, extractErrorMessage } from '../../api/client'
import type { CorporateTaxChecklist, CorporateTaxCheckMemo } from '../../types/api'
import { ymd } from '../../components/EcPeriodPicks'
import { EcReportFoot } from '../../components/EcReportFrame'

const won = (n: number | null | undefined) => (n == null ? '' : Number(n).toLocaleString('ko-KR'))
const mm = (m: number) => `${String(m).padStart(2, '0')}월`

/** 원본 항목 4 ~ 15 — 표 없이 확인할 것만 적고 [메모등록]을 단다. 8 은 아래에 세부 넷. */
const CHECK_ITEMS: { no: number; label: string; subs?: string[] }[] = [
  { no: 4, label: '4.자본금의 변동여부 확인' },
  { no: 5, label: '5.주주의 변동여부확인 > 주주변황현황 기입' },
  { no: 6, label: '6.법인명의의 모든 통장 장부계상 확인(잔액확인)' },
  { no: 7, label: '7.중소기업여부' },
  { no: 8, label: '8.결산조정 확인', subs: ['1) 감가상각비 방법 및 적용여부', '2) 퇴직급여충당금 설정', '3) 대손충당금 설정', '4) 재고자산 평가법 및 명세서 받기'] },
  { no: 9, label: '9.가지급(대여금) 인정이자 계상 및 이자비용(이자율확인) 손금불산입 확인' },
  { no: 10, label: '10.현재시재 적정성확인' },
  { no: 11, label: '11.국고보조금 있다면 계약서 확인' },
  { no: 12, label: '12.잡손실종 손금불산입 비용 계상확인' },
  { no: 13, label: '13.접대비 한도계산 확인' },
  { no: 14, label: '14.법인세 중간예납 확인' },
  { no: 15, label: '15.감면세액 확인 및 최저 한세 확인' },
]

/**
 * 법인세Checklist (원본 세무 › 법인세 E030401, 2026-10-04 loginaa 실측).
 *
 * 처음엔 조건 판 [기준연도](올해+1 · 올해 · <b>작년(기본)</b> · 재작년 · 직접입력)만 있고, [검색(F8)]을 누르면
 * 'YYYY년 법인세 CHECK LIST' 가 그려진다.
 * <ol>
 *   <li>부가세신고서 내역 — 저장한 부가세신고서 한 장이 한 행(기준월 = 신고기간 마지막 달). 우리에게는 부가세신고서를
 *       저장하는 화면이 없어 늘 '등록된 데이터가 없습니다.' 다.</li>
 *   <li>손익계산서 매출계정 내역 — 달별 매출액, 분기 끝 달에 분기만집계(석 달 합) · 분기별집계(1월부터 누계),
 *       6 · 12월에 반기별집계(누계), 12월에 합계. 원본 2026: 06월 557,327,000 · 557,327,000 · 557,327,000,
 *       09월 396,450,000 · 953,777,000, 12월 3,930,000 · 957,707,000 · 957,707,000 · 957,707,000.</li>
 *   <li>급여 및 원천세 내역 — 원천세 신고금액 · 차액(= 신고금액 − 급여총액) · 급여대장 일곱 칸 + 합계.</li>
 * </ol>
 * 4 ~ 15 는 확인할 것의 글뿐이다. 항목마다 [메모등록] → 메모리스트([날짜 · 제목 · 작성자], 날짜를 누르면 수정 · 삭제) →
 * [신규등록(F2)] → 메모등록(날짜 · 제목 · 메모, 비우면 '제목을 입력해주세요.' · '메모를 입력해주세요.').
 * 메모는 기준연도마다 따로다.
 */
export default function CorporateTaxChecklistPage() {
  const lastYear = new Date().getFullYear() - 1
  const [year, setYear] = useState(String(lastYear))
  const [direct, setDirect] = useState(false)
  const [data, setData] = useState<CorporateTaxChecklist | null>(null)
  const [error, setError] = useState('')
  const [memoSection, setMemoSection] = useState<number | null>(null)

  async function search() {
    setError('')
    if (!/^\d{4}$/.test(year)) { setError('기준연도를 입력해주세요.'); return }
    try {
      setData((await api.get<CorporateTaxChecklist>('/corporate-tax/checklist', { params: { year } })).data)
    } catch (e) {
      setError(extractErrorMessage(e))
    }
  }

  const years = [lastYear + 2, lastYear + 1, lastYear, lastYear - 1]
  const memoLink = (section: number) => (
    <button className="ec-link" onClick={() => setMemoSection(section)}>메모등록</button>
  )
  const payroll = data?.payroll ?? []
  const sum = (k: keyof CorporateTaxChecklist['payroll'][number]) => payroll.reduce((t, r) => t + Number(r[k]), 0)

  return (
    <EcListShell title="법인세Checklist" onSearch={search} option={false} collapseConditions={data !== null}
                 actions={data ? [{ label: '인쇄', primary: true }, { label: 'Excel' }] : []}>
      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}

      <ul className="ec-cond mb-[8px]">
        <EcCond label="기준연도">
          {direct ? (
            <input className="ec-input w-[80px]" value={year} maxLength={4} autoFocus
                   onChange={(e) => setYear(e.target.value.replace(/\D/g, ''))} />
          ) : (
            <select className="ec-input w-[80px]" value={year}
                    onChange={(e) => (e.target.value === '직접입력' ? setDirect(true) : setYear(e.target.value))}>
              {years.map((y) => <option key={y} value={y}>{y}</option>)}
              <option value="직접입력">직접입력</option>
            </select>
          )}
        </EcCond>
        {data === null && (
          <li className="full">
            <div className="form"><button className="ec-btn ec-btn-primary" onClick={search}>검색(F8)</button></div>
          </li>
        )}
      </ul>

      {data && (
        <div className="w-[750px] max-w-full">
          <div className="ec-report-title underline">{data.year}년 법인세 CHECK LIST</div>

          <div className="flex justify-end gap-[12px] mb-[4px]"><span>{data.year}년</span>{memoLink(1)}</div>
          <p className="mb-[4px]">1. 부가세신고서 내역</p>
          <table className="w-full ec-report ec-report-head400 mb-[24px]">
            <thead>
              <tr>
                <th rowSpan={2} title="신고기간 마지막월이 표시됩니다">기준월</th>
                <th colSpan={2}>과세</th><th colSpan={2}>영세율</th>
                <th rowSpan={2}>예정누락</th><th rowSpan={2}>면세</th><th rowSpan={2}>매출합계</th>
              </tr>
              <tr><th>세금계산서</th><th>기타</th><th>세금계산서</th><th>기타</th></tr>
            </thead>
            <tbody>
              <tr><td colSpan={8} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
            </tbody>
          </table>

          <div className="flex justify-between mb-[4px]"><span>2. 손익계산서 매출계정 내역</span>{memoLink(2)}</div>
          <table className="w-full ec-report ec-report-head400 mb-[24px]">
            <thead>
              <tr><th>기준월</th><th className="text-right">매출액</th><th className="text-right">분기만집계</th><th className="text-right">분기별집계</th><th className="text-right">반기별집계</th><th className="text-right">합계</th></tr>
            </thead>
            <tbody>
              {data.sales.map((r) => (
                <tr key={r.month}>
                  <td>{mm(r.month)}</td>
                  <td className="text-right">{won(r.sales)}</td>
                  <td className="text-right">{won(r.quarterOnly)}</td>
                  <td className="text-right">{won(r.quarterCumulative)}</td>
                  <td className="text-right">{won(r.halfCumulative)}</td>
                  <td className="text-right">{won(r.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="flex justify-between mb-[4px]"><span>3. 급여 및 원천세 내역</span>{memoLink(3)}</div>
          <table className="w-full ec-report ec-report-head400 mb-[24px]">
            <thead>
              <tr>
                <th rowSpan={2}>기준월</th><th rowSpan={2}>원천세<br />신고금액</th>
                <th rowSpan={2} title={'신고서금액과 급여총액의 차이입니다.\n미제출 비과세 금액이 표시될 수 있습니다.'}>차액</th>
                <th colSpan={7}>급여대장</th>
              </tr>
              <tr><th>급여총액</th><th>상여총액</th><th>소득세</th><th>주민세</th><th>국민연금</th><th>건강보험</th><th>고용보험</th></tr>
            </thead>
            <tbody>
              {payroll.length === 0 ? (
                <tr><td colSpan={10} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
              ) : payroll.map((r) => (
                <tr key={r.month}>
                  <td>{mm(r.month)}</td>
                  <td className="text-right">{won(r.reported)}</td>
                  <td className="text-right">{won(r.difference)}</td>
                  <td className="text-right">{won(r.salary)}</td>
                  <td className="text-right">{won(r.bonus)}</td>
                  <td className="text-right">{won(r.incomeTax)}</td>
                  <td className="text-right">{won(r.localIncomeTax)}</td>
                  <td className="text-right">{won(r.pension)}</td>
                  <td className="text-right">{won(r.health)}</td>
                  <td className="text-right">{won(r.employment)}</td>
                </tr>
              ))}
            </tbody>
            {payroll.length > 0 && (
              <tfoot>
                <tr className="font-bold">
                  <td>합계</td>
                  <td className="text-right">{won(sum('reported'))}</td>
                  <td className="text-right">{won(sum('difference'))}</td>
                  <td className="text-right">{won(sum('salary'))}</td>
                  <td className="text-right">{won(sum('bonus'))}</td>
                  <td className="text-right">{won(sum('incomeTax'))}</td>
                  <td className="text-right">{won(sum('localIncomeTax'))}</td>
                  <td className="text-right">{won(sum('pension'))}</td>
                  <td className="text-right">{won(sum('health'))}</td>
                  <td className="text-right">{won(sum('employment'))}</td>
                </tr>
              </tfoot>
            )}
          </table>

          {CHECK_ITEMS.map((it) => (
            <div key={it.no} className="mb-[6px]">
              <div className="flex justify-between"><span>{it.label}</span>{memoLink(it.no)}</div>
              {it.subs?.map((s) => <div key={s}>{s}</div>)}
            </div>
          ))}
          <EcReportFoot page={false} />
        </div>
      )}

      {memoSection !== null && data && (
        <MemoListModal year={data.year} section={memoSection} onClose={() => setMemoSection(null)} />
      )}
    </EcListShell>
  )
}

/** 원본 [메모등록] → '메모리스트' 창. 날짜를 누르면 그 메모의 수정 창. */
function MemoListModal({ year, section, onClose }: { year: number; section: number; onClose: () => void }) {
  const [memos, setMemos] = useState<CorporateTaxCheckMemo[]>([])
  const [q, setQ] = useState('')
  const [editing, setEditing] = useState<CorporateTaxCheckMemo | 'new' | null>(null)

  const load = () => api.get<CorporateTaxCheckMemo[]>('/corporate-tax/checklist/memos', { params: { year, section } })
    .then((r) => setMemos(r.data)).catch(() => setMemos([]))
  useEffect(() => { void load() }, [year, section])   // eslint-disable-line react-hooks/exhaustive-deps

  const shown = memos.filter((m) => !q.trim() || `${m.title} ${m.writer ?? ''}`.includes(q.trim()))

  if (editing) {
    return <MemoFormModal year={year} section={section} memo={editing === 'new' ? null : editing}
                          onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void load() }} />
  }
  return (
    <Modal open title="메모리스트" width={540} onClose={onClose}>
      <div className="flex justify-between items-center mb-[8px]">
        <b>메모리스트</b>
        <input className="ec-input w-[134px]" placeholder="입력 후 [Enter]" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <table className="w-full text-center">
        <thead><tr><th>날짜</th><th>제목</th><th>작성자</th></tr></thead>
        <tbody>
          {shown.length === 0 ? (
            <tr><td colSpan={3} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
          ) : shown.map((m) => (
            <tr key={m.id}>
              <td><button className="ec-link" onClick={() => setEditing(m)}>{m.memoDate.replace(/-/g, '/')}</button></td>
              <td>{m.title}</td>
              <td>{m.writer}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex gap-[6px] mt-[12px]">
        <button className="ec-btn ec-btn-primary" onClick={() => setEditing('new')}>신규등록 (F2)</button>
        <button className="ec-btn" onClick={onClose}>닫기</button>
      </div>
    </Modal>
  )
}

/** 원본 '메모등록' 창 — 날짜(오늘) · 제목 · 메모. 수정이면 [삭제]가 더 붙는다. */
function MemoFormModal({ year, section, memo, onClose, onSaved }: {
  year: number; section: number; memo: CorporateTaxCheckMemo | null; onClose: () => void; onSaved: () => void
}) {
  const blank = { memoDate: ymd(new Date()), title: '', content: '' }
  const [form, setForm] = useState(memo ? { memoDate: memo.memoDate, title: memo.title, content: memo.content } : blank)
  const [error, setError] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)

  async function save() {
    if (!form.title.trim()) { setError('제목을 입력해주세요.'); return }
    if (!form.content.trim()) { setError('메모를 입력해주세요.'); return }
    try {
      const body = { year, section, memoDate: form.memoDate, title: form.title, content: form.content }
      if (memo) await api.put(`/corporate-tax/checklist/memos/${memo.id}`, body)
      else await api.post('/corporate-tax/checklist/memos', body)
      onSaved()
    } catch (e) {
      setError(extractErrorMessage(e))
    }
  }

  async function remove() {
    if (!memo) return
    try {
      await api.delete(`/corporate-tax/checklist/memos/${memo.id}`)
      onSaved()
    } catch (e) {
      setConfirmDelete(false); setError(extractErrorMessage(e))
    }
  }

  return (
    <Modal open title="메모등록" width={540} onClose={onClose} error={error}>
      <ul className="ec-form">
        <EcCond label="날짜">
          <input type="date" className="ec-input w-[150px]" value={form.memoDate}
                 onChange={(e) => setForm({ ...form, memoDate: e.target.value })} />
        </EcCond>
        <EcCond label="제목" span="full">
          <input className="ec-input w-full" placeholder="제목" value={form.title} autoFocus
                 onChange={(e) => setForm({ ...form, title: e.target.value })} />
        </EcCond>
        <EcCond label="메모" span="full">
          <textarea className="ec-input w-full h-[190px]" placeholder="메모" value={form.content}
                    onChange={(e) => setForm({ ...form, content: e.target.value })} />
        </EcCond>
      </ul>
      <div className="flex gap-[6px] mt-[12px]">
        <button className="ec-btn ec-btn-primary" onClick={save}>저장(F8)</button>
        <button className="ec-btn" onClick={() => { setForm(blank); setError('') }}>다시작성</button>
        <button className="ec-btn" onClick={onClose}>닫기</button>
        {memo && <button className="ec-btn" onClick={() => setConfirmDelete(true)}>삭제</button>}
      </div>
      {confirmDelete && (
        <Modal open title="알림" width={320} error={error} onClose={() => setConfirmDelete(false)}>
          <p className="mb-[12px]">삭제하시겠습니까?</p>
          <div className="flex gap-[6px]">
            <button className="ec-btn ec-btn-primary" onClick={remove}>확인</button>
            <button className="ec-btn" onClick={() => setConfirmDelete(false)}>취소</button>
          </div>
        </Modal>
      )}
    </Modal>
  )
}
