import { useEffect, useRef, useState, type FormEvent } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import EcListShell from '../../components/EcListShell'
import { EcCond } from '../../components/EcStatusPanel'
import Modal from '../../components/Modal'
import EcMonthCalendar from '../../components/EcMonthCalendar'
import CodePickerField from '../../components/CodePickerField'
import { ymd } from '../../components/EcPeriodPicks'
import { useAuth } from '../../features/auth/AuthContext'
import { useShortcut } from '../../utils/useShortcut'
import { openPrintWindow, fillAndPrint } from '../../utils/print'
import { escapeHtml } from '../../utils/escapeHtml'
import { useTableColumnCheck } from '../../utils/assertTableColumns'

/**
 * 그룹웨어 > 사내관리 > 공용품관리 (이카운트 E070204)
 *
 * 이 화면은 공용품 <b>마스터</b>가 아니라 <b>사용/반납 내역</b>이다 — "누가 언제 어떤 공용품을 빌려 쓰고
 * 반납했는가" 를 기간으로 조회한다. 실측 컬럼:
 *   (선택칸 24) 일자 100 · 시작시간 55 · 종료시간 55 · 물품명 160 · 제목 300 · 적요 170 ·
 *   사용자명 160 · 반납여부 160  (합 1184)
 *
 * <p><b>2026-10-03 원본을 직접 써 보며 다시 맞췄다.</b>
 * <ul>
 *   <li>보기 알약 [기본][일간][월간][공용품별]은 제목 <b>아래 한 줄</b>이다. 우리는 왼쪽 세로 칸에 두었다.</li>
 *   <li>조회 기간은 <b>올해 1월 1일 ~ 12월 31일</b>이 기본이고 격자 오른쪽 위에 찍힌다(2026/01/01 ~ 2026/12/31).
 *       우리는 오늘부터 일주일이라 지난 사용 내역이 안 보였다. 조건은 접어 두고 [Search(F3)]로 편다.</li>
 *   <li>[일자]는 '2026/01/23 (금)' 처럼 요일을 붙이고, 일자·제목을 누르면 <b>'공용품관리' 창</b>이 뜬다 —
 *       공용품 · 사용자 · 날짜/시간('2026/01/23 11:00 ~ 12:00') · 제목 · 적요 · 라벨 · 반납여부,
 *       하단 [수정][인쇄][닫기][삭제]. 우리는 이 창이 없어 <b>넣은 내역을 고칠 수 없었다</b>(서버 PUT 은 있었다).</li>
 *   <li>원본 하단은 [신규(F2)][미리보기][라벨변경][인쇄][Excel]이다 — [선택삭제]는 없다. 반납여부 칸을 눌러
 *       바꾸는 것도 원본에 없다(창의 [수정]으로 바꾼다).</li>
 *   <li>신규 '공용품관리등록': 공용품 · 사용자(내가 기본) · 날짜/시간(다음 정각 ~ +1시간) · 종일 · 제목 · <b>적요 · 라벨</b>
 *       · 반납여부(미반납 기본), [저장(F8)][닫기]. 필수는 공용품·제목(빈 채로 저장하면 그 둘만 빨갛다).</li>
 * </ul>
 *
 * 공용품 마스터(품목코드·공용품명·재고)는 원본이 어디서 등록하는지 확인하지 못해 메뉴를 새로 만들지 않고,
 * 등록 폼의 [공용품 관리] 버튼으로 열리는 팝업에 두었다.
 * 원본 하단의 [라벨변경]은 받쳐 줄 것이 없어 넣지 않았다.
 */

type ReturnStatus = 'NOT_RETURNED' | 'RETURNED' | 'UNSPECIFIED'
const RETURN_LABEL: Record<ReturnStatus, string> = {
  NOT_RETURNED: '미반납', RETURNED: '반납', UNSPECIFIED: '미지정',
}

const VIEWS = ['기본', '일간', '월간', '공용품별'] as const
type View = (typeof VIEWS)[number]
const DOW = ['일', '월', '화', '수', '목', '금', '토']

interface Supply {
  id: number; code: string; name: string
  category: string | null; unit: string | null; stockQty: number; note: string | null
}
interface UserRow { id: number; name: string; username: string }
interface Usage {
  id: number
  supplyItemId: number; supplyItemCode: string; supplyItemName: string
  userId: number; userName: string
  useDate: string; startTime: string | null; endTime: string | null; allDay: boolean
  title: string; remark: string | null; labelText: string | null
  returnStatus: ReturnStatus; returnStatusName: string
}

/** 일간 · 공용품별 시간 줄 — 원본은 AM 08:00 ~ PM 06:00 한 시간 간격이다. */
const HOURS = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18]
const hourText = (h: number) => `${h < 12 ? 'AM' : 'PM'} ${String(h > 12 ? h - 12 : h).padStart(2, '0')}:00`
const toMin = (t: string | null) => { if (!t) return null; const [hh, mm] = t.split(':').map(Number); return hh * 60 + (mm || 0) }
/** 이 시각(h:00~h+1:00)에 걸친 사용인가. 종일이면 모든 칸. */
function overlaps(u: Usage, h: number) {
  if (u.allDay) return true
  const s = toMin(u.startTime) ?? 0
  const e = toMin(u.endTime) ?? s + 60
  return s < (h + 1) * 60 && e > h * 60
}
/** '10/03 (토)' */
const dayHead = (d: Date) => `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')} (${DOW[d.getDay()]})`
/** 그 달 1일이 든 주의 일요일부터 — 마지막 주가 다음 달뿐이면 뺀다. */
function monthWeeks(c: Date): Date[][] {
  const first = new Date(c.getFullYear(), c.getMonth(), 1)
  const start = new Date(first); start.setDate(1 - first.getDay())
  const out: Date[][] = []
  for (let w = 0; w < 6; w++) {
    const week = Array.from({ length: 7 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + w * 7 + i))
    if (w > 0 && week[0].getMonth() !== c.getMonth()) break
    out.push(week)
  }
  return out
}

/** '2026/01/23 (금)' */
const dayText = (d: string) => `${d.replace(/-/g, '/')} (${DOW[new Date(d).getDay()]})`
const pad2 = (n: number) => String(n).padStart(2, '0')

type Form = {
  supply: string; user: string; date: string; start: string; end: string; allDay: boolean
  title: string; remark: string; label: string; ret: ReturnStatus
}

export default function SuppliesPage() {
  const { user: me } = useAuth()
  const [rows, setRows] = useState<Usage[]>([])
  const [supplies, setSupplies] = useState<Supply[]>([])
  const [users, setUsers] = useState<UserRow[]>([])
  const [error, setError] = useState('')
  const [view, setView] = useState<View>('기본')
  const [keyword, setKeyword] = useState('')
  /*
   * 원본 공용품관리 조건 차례: 기준일자 · 시간 · 사용자 · 공용물품 · 라벨 · 제목 · 적요 · 반납여부 · 전체시간표시.
   * [전체시간표시]는 꺼진 채로 열린다(사본 실측) — 종일 잡힌 줄은 켜야 보인다.
   */
  const [timeCond, setTimeCond] = useState('')
  const [itemCond, setItemCond] = useState('')
  const [allDayCond, setAllDayCond] = useState(false)
  const [titleCond, setTitleCond] = useState('')
  const [remarkCond, setRemarkCond] = useState('')
  const [returnCond, setReturnCond] = useState('')

  /** 원본 기본 기간: 올해 1월 1일 ~ 12월 31일. */
  const year = new Date().getFullYear()
  const [from, setFrom] = useState(`${year}-01-01`)
  const [to, setTo] = useState(`${year}-12-31`)

  const newForm = (): Form => {
    const h = Math.min(new Date().getHours() + 1, 23)
    const mine = users.find((u) => u.username === me?.username)
    return {
      supply: '', user: mine ? String(mine.id) : '', date: ymd(new Date()),
      start: `${pad2(h)}:00`, end: `${pad2(h + 1)}:00`, allDay: false,
      title: '', remark: '', label: '', ret: 'NOT_RETURNED',
    }
  }
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<number | null>(null)
  const [form, setForm] = useState<Form>(newForm)
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }))
  /** '공용품관리' 조회 창에 띄운 내역. */
  const [viewing, setViewing] = useState<Usage | null>(null)

  // 공용품 마스터 관리 팝업
  const [showMaster, setShowMaster] = useState(false)
  const [mCode, setMCode] = useState('')
  const [mName, setMName] = useState('')
  const [mCategory, setMCategory] = useState('사무용품')
  const [mUnit, setMUnit] = useState('개')

  async function load() {
    setError('')
    try {
      setRows((await api.get<Usage[]>('/supply-usages', { params: { from, to } })).data)
    } catch (err) { setError(extractErrorMessage(err)) }
  }
  useEffect(() => { void load() }, [from, to])

  useEffect(() => {
    api.get<Supply[]>('/supplies').then((r) => setSupplies(r.data)).catch(() => {})
    api.get<UserRow[]>('/users').then((r) => setUsers(r.data)).catch(() => {})
  }, [])

  function openNew() {
    setEditId(null)
    setForm(newForm())
    setError('')
    setShowForm(true)
  }

  /** 조회 창의 [수정] — 같은 입력 창을 그 내역으로 채워 띄운다. */
  function openEdit(u: Usage) {
    setViewing(null)
    setEditId(u.id)
    setForm({
      supply: String(u.supplyItemId), user: String(u.userId), date: u.useDate,
      start: u.startTime ?? '', end: u.endTime ?? '', allDay: u.allDay,
      title: u.title, remark: u.remark ?? '', label: u.labelText ?? '', ret: u.returnStatus,
    })
    setError('')
    setShowForm(true)
  }

  useShortcut('F2', openNew, !showForm && !viewing && !showMaster)
  useShortcut('F8', () => void submit(), showForm)

  async function submit(e?: FormEvent) {
    e?.preventDefault()
    setError('')
    if (!form.supply) return setError('공용품을 선택하세요.')
    if (!form.user) return setError('사용자를 선택하세요.')
    if (!form.title.trim()) return setError('제목을 입력하세요.')
    const body = {
      supplyItemId: Number(form.supply), userId: Number(form.user), useDate: form.date,
      startTime: form.allDay ? undefined : form.start, endTime: form.allDay ? undefined : form.end,
      allDay: form.allDay, title: form.title, remark: form.remark,
      labelText: form.label, returnStatus: form.ret,
    }
    try {
      if (editId != null) await api.put(`/supply-usages/${editId}`, body)
      else await api.post<Usage>('/supply-usages', { ...body, remark: form.remark || undefined, labelText: form.label || undefined })
      setShowForm(false)
      setEditId(null)
      void load()
    } catch (err) { setError(extractErrorMessage(err)) }
  }

  async function removeOne(id: number) {
    if (!confirm('삭제하겠습니까?')) return
    try {
      await api.delete(`/supply-usages/${id}`)
      setViewing(null)
      void load()
    } catch (err) { setError(extractErrorMessage(err)) }
  }

  async function addSupply(e: FormEvent) {
    e.preventDefault()
    setError('')
    if (!mCode.trim() || !mName.trim()) return setError('품목코드와 공용품명을 입력하세요.')
    try {
      await api.post('/supplies', { code: mCode, name: mName, category: mCategory, unit: mUnit, stockQty: 0 })
      setMCode(''); setMName('')
      setSupplies((await api.get<Supply[]>('/supplies')).data)
    } catch (err) { setError(extractErrorMessage(err)) }
  }

  async function removeSupply(s: Supply) {
    if (!confirm(`[${s.name}] 공용품을 삭제할까요?`)) return
    try {
      await api.delete(`/supplies/${s.id}`)
      setSupplies((await api.get<Supply[]>('/supplies')).data)
    } catch (err) { alert(extractErrorMessage(err)) }
  }

  const timeText = (u: Usage) =>
    `${u.useDate.replace(/-/g, '/')} ${u.allDay ? '종일' : `${u.startTime ?? ''} ~ ${u.endTime ?? ''}`}`

  function printOne(u: Usage) {
    const win = openPrintWindow()
    if (!win) return
    const line = (k: string, v: string | null) => `<tr><th>${k}</th><td>${escapeHtml(v ?? '')}</td></tr>`
    fillAndPrint(win, `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>공용품관리</title>
<style>body{font-family:sans-serif;font-size:12px;padding:24px}table{border-collapse:collapse;width:100%}
th,td{border:1px solid;padding:4px 6px;text-align:left}th{width:90px}</style></head><body><h1>공용품관리</h1><table>
${line('공용품', u.supplyItemName)}${line('사용자', u.userName)}${line('날짜/시간', timeText(u))}${line('제목', u.title)}
${line('적요', u.remark)}${line('라벨', u.labelText)}${line('반납여부', RETURN_LABEL[u.returnStatus])}</table></body></html>`)
  }

  const shown = rows
    .filter((r) => !timeCond || r.allDay
      || ((r.startTime ?? '') <= timeCond && timeCond <= (r.endTime ?? '23:59')))
    .filter((r) => !itemCond || r.supplyItemName === itemCond)
    .filter((r) => allDayCond || !r.allDay)
    .filter((r) => !titleCond || r.title.includes(titleCond))
    .filter((r) => !remarkCond || (r.remark ?? '').includes(remarkCond))
    .filter((r) => !returnCond || r.returnStatusName === returnCond)
    .filter((r) => !keyword
    || r.title.includes(keyword)
    || r.supplyItemName.includes(keyword)
    || r.userName.includes(keyword)
    || (r.remark ?? '').includes(keyword))
    /*
     * 원본 기본 목록은 <b>오래된 날부터</b>(2026/01/23 → 10/23, 같은 날은 시작시간 차례)다 — 원본 사용 20건을 우리 화면으로
     * 똑같이 넣어 견주다 알았다(2026-10-03). 서버는 최근 날부터 준다(일간 · 월간이 같이 쓰는 차례라 서버는 그대로 둔다).
     */
    .sort((a, b) => (a.useDate !== b.useDate ? (a.useDate < b.useDate ? -1 : 1)
      : (a.startTime ?? '') !== (b.startTime ?? '') ? ((a.startTime ?? '') < (b.startTime ?? '') ? -1 : 1) : a.id - b.id))

  /** 일간 · 월간 · 공용품별 — 원본은 묶은 목록이 아니라 시간표 · 달력 · 공용품×시간 표다(2026-10-03 실측). */
  const [cursor, setCursor] = useState(() => new Date())
  const [calRows, setCalRows] = useState<Usage[]>([])
  /** 원본 일간 · 월간 · 공용품별의 [다음 ›] 옆 달력 단추 — 누르면 작은 달력이 떠 날을 고른다(2026-10-03 실측). */
  const [pickOpen, setPickOpen] = useState(false)
  const step = (n: number) => setCursor((c) => view === '월간'
    ? new Date(c.getFullYear(), c.getMonth() + n, 1)
    : new Date(c.getFullYear(), c.getMonth(), c.getDate() + n))
  useEffect(() => {
    if (view === '기본') return
    const f = view === '월간' ? ymd(new Date(cursor.getFullYear(), cursor.getMonth(), 1)) : ymd(cursor)
    const t = view === '월간' ? ymd(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0)) : ymd(cursor)
    api.get<Usage[]>('/supply-usages', { params: { from: f, to: t } })
      .then((r) => setCalRows(r.data)).catch((err) => setError(extractErrorMessage(err)))
  }, [view, cursor])
  /* 달력 · 공용품×시간 표는 칸을 만들어 내므로 정적으로 못 센다 — 렌더된 표를 직접 잰다. */
  const monthRef = useRef<HTMLTableElement>(null)
  const supplyRef = useRef<HTMLTableElement>(null)
  useTableColumnCheck(monthRef, '공용품관리 월간', [view, cursor.getTime(), calRows.length])
  useTableColumnCheck(supplyRef, '공용품관리 공용품별', [view, cursor.getTime(), calRows.length])
  const bySupply = (() => {
    const m = new Map<string, Usage[]>()
    for (const u of calRows.filter((x) => x.useDate === ymd(cursor))) {
      const l = m.get(u.supplyItemName); if (l) l.push(u); else m.set(u.supplyItemName, [u])
    }
    return [...m.entries()]
  })()

  const linkCls = 'no-ec bg-transparent border-0 p-0 cursor-pointer text-left text-ec-navy'

  return (
    <EcListShell
      title="공용품관리"
      search={keyword}
      onSearchChange={setKeyword}
      onNew={openNew}
      collapseConditions
      // 원본 하단: 기본 [미리보기][인쇄][Excel] · 일간 [인쇄][Excel] · 월간 · 공용품별 [인쇄]
      actions={view === '기본' ? [{ label: '미리보기' }, { label: '인쇄' }, { label: 'Excel' }]
        : view === '일간' ? [{ label: '인쇄' }, { label: 'Excel' }] : [{ label: '인쇄' }]}
    >
      {/* 원본 '공용품관리등록' 창 — 항목이 한 줄에 하나씩 */}
      <Modal error={error} open={showForm} title="공용품관리등록" width={780} onClose={() => setShowForm(false)}>
        <form onSubmit={(e) => void submit(e)}>
          <ul className="ec-form mb-[10px]">
            <li className="wide">
              <div className="title">공용품</div>
              <div className="form">
                <CodePickerField
                  label="공용품" hideLabel value={form.supply} onChange={(v) => set('supply', v)} emptyLabel="선택 안 함"
                  items={supplies.map((s) => ({ value: String(s.id), code: s.code, name: s.name, sub: s.category }))}
                />
                <button type="button" className="ec-btn ec-btn-sm" onClick={() => setShowMaster(true)}>공용품 관리</button>
              </div>
            </li>
            <li className="wide">
              <div className="title">사용자</div>
              <div className="form">
                <CodePickerField
                  label="사용자" hideLabel value={form.user} onChange={(v) => set('user', v)} emptyLabel="선택 안 함"
                  items={users.map((u) => ({ value: String(u.id), code: u.username, name: u.name }))}
                />
              </div>
            </li>
            <li className="wide">
              <div className="title">날짜/시간</div>
              <div className="form">
                <input type="date" className="ec-input w-[150px]" value={form.date} onChange={(e) => set('date', e.target.value)} />
                <input type="time" className="ec-input w-[110px]" value={form.start} disabled={form.allDay}
                       onChange={(e) => set('start', e.target.value)} />
                <span className="text-ec-label">~</span>
                <input type="time" className="ec-input w-[110px]" value={form.end} disabled={form.allDay}
                       onChange={(e) => set('end', e.target.value)} />
                <label className="ml-[10px] text-[12px] inline-flex items-center gap-[4px]">
                  <input type="checkbox" checked={form.allDay} onChange={(e) => set('allDay', e.target.checked)} /> 종일
                </label>
              </div>
            </li>
            <li className="wide">
              <div className="title">제목</div>
              <div className="form"><input className="ec-input w-full" placeholder="제목" value={form.title}
                                           onChange={(e) => set('title', e.target.value)} /></div>
            </li>
            {/* 원본 차례: 제목 · 적요 · 라벨 · 반납여부 (2026-10-03 실측) */}
            <li className="wide">
              <div className="title">적요</div>
              <div className="form"><input className="ec-input w-full" placeholder="적요" value={form.remark}
                                           onChange={(e) => set('remark', e.target.value)} /></div>
            </li>
            <li className="wide">
              <div className="title">라벨</div>
              <div className="form"><input className="ec-input w-full" placeholder="라벨" value={form.label}
                                           onChange={(e) => set('label', e.target.value)} /></div>
            </li>
            <li className="wide">
              <div className="title">반납여부</div>
              <div className="form">
                {(['NOT_RETURNED', 'RETURNED', 'UNSPECIFIED'] as ReturnStatus[]).map((s) => (
                  <label key={s} className="mr-[10px] text-[12px] inline-flex items-center gap-[4px]">
                    <input type="radio" name="ret" checked={form.ret === s} onChange={() => set('ret', s)} /> {RETURN_LABEL[s]}
                  </label>
                ))}
              </div>
            </li>
          </ul>
          <div className="flex gap-[6px]">
            <button type="submit" className="ec-btn ec-btn-primary">저장(F8)</button>
            <button type="button" className="ec-btn" onClick={() => setShowForm(false)}>닫기</button>
          </div>
        </form>
      </Modal>

      {/* 원본 '공용품관리' 조회 창 */}
      <Modal error={error} open={!!viewing} title="공용품관리" width={780} onClose={() => setViewing(null)}>
        {viewing && (
          <>
            <table className="w-full text-left mb-[10px]">
              <tbody>
                {([
                  ['공용품', viewing.supplyItemName], ['사용자', viewing.userName], ['날짜/시간', timeText(viewing)],
                  ['제목', viewing.title], ['적요', viewing.remark ?? ''], ['라벨', viewing.labelText ?? ''],
                  ['반납여부', RETURN_LABEL[viewing.returnStatus]],
                ] as const).map(([k, v]) => (
                  <tr key={k}><th className="w-[160px] bg-ec-page">{k}</th><td>{v}</td></tr>
                ))}
              </tbody>
            </table>
            <div className="flex gap-[6px]">
              <button className="ec-btn ec-btn-primary" onClick={() => openEdit(viewing)}>수정</button>
              <button className="ec-btn" onClick={() => printOne(viewing)}>인쇄</button>
              <button className="ec-btn" onClick={() => setViewing(null)}>닫기</button>
              <button className="ec-btn" onClick={() => void removeOne(viewing.id)}>삭제</button>
            </div>
          </>
        )}
      </Modal>

      <Modal error={error} open={showMaster} title="공용품 등록·관리" width={560} onClose={() => setShowMaster(false)}>
        <div>
          <form onSubmit={addSupply} className="flex gap-[4px] mb-[8px]">
            <input className="ec-input w-[110px]" placeholder="품목코드" value={mCode} onChange={(e) => setMCode(e.target.value)} />
            <input className="ec-input flex-1" placeholder="공용품명" value={mName} onChange={(e) => setMName(e.target.value)} />
            <input className="ec-input w-[100px]" placeholder="분류" value={mCategory} onChange={(e) => setMCategory(e.target.value)} />
            <input className="ec-input w-[60px]" placeholder="단위" value={mUnit} onChange={(e) => setMUnit(e.target.value)} />
            <button type="submit" className="ec-btn ec-btn-primary">추가</button>
          </form>
          <table className="w-full text-left">
            <thead><tr><th className="w-[110px]">품목코드</th><th>공용품명</th><th className="w-[100px]">분류</th><th className="text-center w-[60px]">단위</th><th className="w-[60px]"></th></tr></thead>
            <tbody>
              {supplies.length === 0 ? (
                <tr><td colSpan={5} className="text-center text-ec-ink">등록된 데이터가 없습니다.</td></tr>
              ) : supplies.map((s) => (
                <tr key={s.id}>
                  <td>{s.code}</td><td>{s.name}</td><td>{s.category ?? ''}</td><td className="text-center">{s.unit ?? ''}</td>
                  <td className="text-center">
                    <button className="ec-btn ec-btn-sm text-ec-danger" onClick={() => void removeSupply(s)}>삭제</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Modal>

      {error && !showForm && !viewing && !showMaster && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}

      {/* 원본 보기 알약 — 제목 아래 한 줄 */}
      <div className="ec-pills mb-[8px]">
        {VIEWS.map((v) => (
          <button key={v} type="button" className={`ec-pill no-ec${view === v ? ' active' : ''}`} onClick={() => setView(v)}>
            {v}
          </button>
        ))}
      </div>

      {view === '기본' ? (
        <>
      {/* 원본 차례: 기준일자 · 시간 · 사용자 · 공용물품 · 라벨 · 제목 · 적요 · 반납여부 · 전체시간표시 — 접어 두고 [Search(F3)] 로 편다 */}
      <ul className="ec-cond mb-[6px]">
        <EcCond label="기준일자">
          <input type="date" className="ec-input w-[130px]" value={from} onChange={(e) => setFrom(e.target.value)} />
          <span className="text-ec-label">~</span>
          <input type="date" className="ec-input w-[130px]" value={to} onChange={(e) => setTo(e.target.value)} />
        </EcCond>
        <EcCond label="시간">
          <input type="time" className="ec-input w-[110px]" value={timeCond} onChange={(e) => setTimeCond(e.target.value)} />
        </EcCond>
        <EcCond label="공용물품" pick>
          <CodePickerField label="공용물품" hideLabel width={170} emptyLabel="전체"
                           value={itemCond} onChange={setItemCond}
                           items={supplies.map((x) => ({ value: x.name, code: x.code, name: x.name }))} />
        </EcCond>
        <EcCond label="제목">
          <input className="ec-input w-[140px]" value={titleCond} placeholder="제목" onChange={(e) => setTitleCond(e.target.value)} />
        </EcCond>
        <EcCond label="적요">
          <input className="ec-input w-[140px]" value={remarkCond} placeholder="적요" onChange={(e) => setRemarkCond(e.target.value)} />
        </EcCond>
        <EcCond label="반납여부">
          <select className="ec-input w-[100px]" value={returnCond} onChange={(e) => setReturnCond(e.target.value)}>
            <option value="">전체</option>
            {[...new Set(rows.map((r) => r.returnStatusName))].map((n) => <option key={n}>{n}</option>)}
          </select>
        </EcCond>
        <EcCond label="전체시간표시">
          <label className="text-[12px] text-ec-label flex items-center gap-[4px]">
            <input type="checkbox" checked={allDayCond} onChange={(e) => setAllDayCond(e.target.checked)} />
            종일 잡힌 것도
          </label>
        </EcCond>
      </ul>

      {/* 원본은 격자 오른쪽 위에 조회 기간을 찍는다 */}
      <div className="text-right text-[12px] text-ec-ink mb-[4px]">{from.replace(/-/g, '/')} ~ {to.replace(/-/g, '/')}</div>

      <table className="w-full text-left table-fixed">
        <thead>
          <tr>
            <th className="w-[2%]"></th>
            <th className="w-[8.5%]">일자</th>
            <th className="w-[4.6%] text-center">시작시간</th>
            <th className="w-[4.6%] text-center">종료시간</th>
            <th className="w-[13.5%]">물품명</th>
            <th className="w-[25.3%]">제목</th>
            <th className="w-[14.4%]">적요</th>
            <th className="w-[13.5%]">사용자명</th>
            <th className="w-[13.5%]">반납여부</th>
          </tr>
        </thead>
        <tbody>
          {shown.length === 0 ? (
            <tr><td colSpan={9} className="text-center text-ec-ink">등록된 데이터가 없습니다.</td></tr>
          ) : shown.map((r, i) => (
            <tr key={r.id}>
              <td className="text-center bg-ec-stripe text-ec-hint">{i + 1}</td>
              <td><button type="button" className={linkCls} onClick={() => setViewing(r)}>{dayText(r.useDate)}</button></td>
              <td className="text-center">{r.allDay ? '종일' : (r.startTime ?? '')}</td>
              <td className="text-center">{r.allDay ? '' : (r.endTime ?? '')}</td>
              <td>{r.supplyItemName}</td>
              <td><button type="button" className={linkCls} onClick={() => setViewing(r)}>{r.title}</button></td>
              <td>{r.remark ?? ''}</td>
              <td>{r.userName}</td>
              <td>{RETURN_LABEL[r.returnStatus]}</td>
            </tr>
          ))}
        </tbody>
      </table>
        </>
      ) : (
        <>
          {/* 원본 일간 · 월간 · 공용품별: ‹ 이전 · 오늘 · 다음 › 으로 날(월간은 달)을 넘긴다 */}
          <div className="flex items-center gap-[4px] mb-[6px]">
            <button type="button" className="ec-btn ec-btn-sm" onClick={() => step(-1)}>‹ 이전</button>
            <button type="button" className="ec-btn ec-btn-sm" onClick={() => setCursor(new Date())}>오늘</button>
            <button type="button" className="ec-btn ec-btn-sm" onClick={() => step(1)}>다음 ›</button>
            {/* 일간 · 월간 · 공용품별 셋 다 있다(실측) */}
            <span className="relative">
              <button type="button" className="ec-btn ec-btn-sm" aria-label="날짜 고르기" onClick={() => setPickOpen((o) => !o)}>📅</button>
              {pickOpen && (
                <span className="absolute top-full left-0 z-30 mt-[4px] shadow-lg">
                  <EcMonthCalendar value={ymd(cursor)}
                                   onPick={(d) => { if (d) setCursor(new Date(`${d}T00:00:00`)); setPickOpen(false) }} />
                </span>
              )}
            </span>
            <span className="ml-auto text-[12px] text-ec-ink">
              {view === '월간' ? `${cursor.getFullYear()}년 ${pad2(cursor.getMonth() + 1)}월` : view === '공용품별' ? dayText(ymd(cursor)) : ''}
            </span>
          </div>

          {view === '일간' && (
            <table className="w-[612px] max-w-full text-left">
              <thead><tr><th className="w-[64px] text-center">시간</th><th className="text-center">{dayHead(cursor)}</th></tr></thead>
              <tbody>
                {HOURS.map((h) => (
                  <tr key={h}>
                    <td className="text-center">{hourText(h)}</td>
                    <td>
                      {calRows.filter((u) => u.useDate === ymd(cursor) && overlaps(u, h)).map((u) => (
                        <button key={u.id} type="button" className={`${linkCls} mr-[8px]`} onClick={() => setViewing(u)}>{u.title}</button>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {view === '월간' && (
            <table ref={monthRef} className="w-[612px] max-w-full table-fixed">
              <thead><tr>{DOW.map((d) => <th key={d} className="text-center">{d}</th>)}</tr></thead>
              <tbody>
                {monthWeeks(cursor).map((week, wi) => (
                  <tr key={wi}>
                    {week.map((d) => {
                      const key = ymd(d)
                      const inMonth = d.getMonth() === cursor.getMonth()
                      return (
                        <td key={key} className={`align-top h-[64px] p-[2.7px] ${!inMonth ? 'bg-ec-disabled' : key === ymd(new Date()) ? 'bg-ec-blue-wash' : ''}`}>
                          {inMonth && (
                            <>
                              <div className={`text-right ${key === ymd(new Date()) ? 'font-bold' : ''}`}>{d.getDate()}</div>
                              {calRows.filter((u) => u.useDate === key).map((u) => (
                                <button key={u.id} type="button" className={`${linkCls} block truncate w-full`} onClick={() => setViewing(u)}>{u.title}</button>
                              ))}
                            </>
                          )}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {view === '공용품별' && (
            <table ref={supplyRef} className="w-full text-left table-fixed">
              <thead>
                <tr>
                  <th rowSpan={2} className="w-[120px] text-center">공용품관리</th>
                  <th colSpan={HOURS.length} className="text-center">{dayHead(cursor)}</th>
                </tr>
                <tr>{HOURS.map((h) => <th key={h} className="text-center">{hourText(h)}</th>)}</tr>
              </thead>
              <tbody>
                {bySupply.length === 0 ? (
                  <tr><td colSpan={HOURS.length + 1} className="text-center text-ec-ink">등록된 데이터가 없습니다.</td></tr>
                ) : bySupply.map(([name, list]) => (
                  <tr key={name}>
                    <td>{name}</td>
                    {HOURS.map((h) => (
                      <td key={h}>
                        {list.filter((u) => overlaps(u, h)).map((u) => (
                          <button key={u.id} type="button" className={`${linkCls} block truncate w-full`} onClick={() => setViewing(u)}>{u.title}</button>
                        ))}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </EcListShell>
  )
}
