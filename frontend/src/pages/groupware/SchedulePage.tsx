import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, extractErrorMessage } from '../../api/client'
import EcListShell from '../../components/EcListShell'
import { EcCond } from '../../components/EcStatusPanel'
import Modal from '../../components/Modal'
import EcMonthCalendar from '../../components/EcMonthCalendar'
import { ymd } from '../../components/EcPeriodPicks'
import { useAuth } from '../../features/auth/AuthContext'
import { useShortcut } from '../../utils/useShortcut'
import { openPrintWindow, fillAndPrint } from '../../utils/print'
import { escapeHtml } from '../../utils/escapeHtml'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import { defaultRepeat, repeatSummary, type RepeatRule } from '../../utils/scheduleRepeat'
import RepeatModal from '../../features/schedule/components/RepeatModal'
import RepeatScopeModal, { type RepeatScope } from '../../features/schedule/components/RepeatScopeModal'
import LabelMasterModal from '../../features/board/components/LabelMasterModal'
import LabelChip from '../../features/board/components/LabelChip'
import { viewLabelLight } from '../../features/board/labels'
import LabelFilter from '../../features/schedule/components/LabelFilter'
import ScheduleCategoryModal, { type ScheduleCategory } from '../../features/schedule/components/ScheduleCategoryModal'
import NameChips from '../../features/schedule/components/NameChips'
import { EcHistoryModal } from '../../components/EcHistory'
import { ecAlert, ecConfirm } from '../../components/EcDialog'
import EcIcon from '../../components/ui/EcIcon'
import EcDateInput, { EcDateRange } from '../../components/ui/EcDateInput'

interface ScheduleEvent {
  id: number
  eventDate: string
  startTime: string | null
  endTime: string | null
  title: string
  category: string | null
  owner: string | null
  location: string | null
  attendees: string | null
  /**
   * 원본 [라벨] — 라벨 마스터의 코드로 붙고(labelCode), 이름 · 색은 서버가 마스터에서 붙여 준다.
   * 라벨수정에서 이름 · 색을 바꾸면 이미 넣은 일정의 칩도 따라 바뀐다(2026-10-30 실측).
   */
  labelCode?: string | null
  labelText: string | null
  labelColor?: string | null
  remark: string | null
  createdBy: string | null
  /** 원본 [공유자] — 이름 콤마 구분 또는 '전체'. */
  sharers?: string | null
  /** 원본 [반복설정] 으로 만든 묶음 · 요약보기 글. */
  repeatGroup?: string | null
  repeatRule?: string | null
  /** 원본 [권한] 게시글권한. */
  permAttendeeEdit?: boolean
  permSharerEdit?: boolean
  permOthersView?: boolean
  /** 원본 [캘린더] — true 면 [기본] 공유일정캘린더, false 면 개인일정캘린더(만든 사람만 본다). */
  shared?: boolean
}

/** 원본 '라벨검색'(라벨코드 · 라벨명 · 색상) 한 줄 — 달력 칸의 칩 색. */
interface ScheduleLabel { id: number; code: string; name: string; color: string; active: boolean }

/**
 * 원본 왼쪽 캘린더(2026-10-13 E070201 실측) — 내 캘린더: [기본] 공유일정캘린더(켬) · 개인일정캘린더,
 * 다른 캘린더: 휴가확인용 캘린더 · 납기일자확인용 캘린더. 체크박스라 여럿을 함께 켠다. 색은 tokens.css.
 */
type CalKey = 'SHARED' | 'PERSONAL' | 'LEAVE' | 'DUE'
const MY_CALS: [CalKey, string][] = [['SHARED', '[기본] 공유일정캘린더'], ['PERSONAL', '개인일정캘린더']]
const OTHER_CALS: [CalKey, string][] = [['LEAVE', '휴가확인용 캘린더'], ['DUE', '납기일자확인용 캘린더']]
const CAL_COLOR: Record<CalKey, string> = {
  SHARED: 'var(--ec-bg-calendar)', PERSONAL: 'var(--ec-cal-personal)', LEAVE: 'var(--ec-cal-leave)', DUE: 'var(--ec-cal-due)',
}
/** 색은 캘린더마다 다르다 — 토큰 이름만 넘겨 그린다(화면 코드에 색 값을 쓰지 않는다). */
const paint = (color: string) => (el: HTMLElement | null) => { if (el) el.style.backgroundColor = color }
/** 다른 캘린더(휴가 · 납기)의 막대 하나 — 일정이 아니라 다른 화면의 자료다. */
interface ExtraBar { key: string; date: string; text: string; cal: CalKey; orderId?: number }
interface VacationLite { id: number; empName: string; type: string; startDate: string; endDate: string | null; status?: string }
interface OrderLite { id: number; partnerName: string; dueDate: string | null; warehouseName: string | null; lines: { lineId: number; itemName: string }[] }

/*
 * 원본 [일정구분]은 코드도움이다 — [코드 칸][🔍][이름 칸]. 🔍 은 '일정구분검색'(일정구분 마스터: 001 외부인미팅 · 002 회의 …,
 * 2026-10-13 실측)을 띄우고, 고르면 코드 · 이름이 찬다. 코드 칸에 코드를 치면 이름이 따라 붙는다. 일정에는 이름으로 남는다.
 */
const DOW = ['일', '월', '화', '수', '목', '금', '토']

/**
 * 원본 [양식] 고르기. '월간양식' 은 달력 칸(일정구분 칩), '월간' 은 같은 달력에서 칩 없이 제목만, '기본(수정불가)' 는 일정 목록, '일간' 은 하루의 시간 줄,
 * '사용자별' 은 사람 × 시간 표다(2026-10-03 실측 — 원본 고르기 차례는 월간양식 · 기본(수정불가) · 일간 · 월간 · 사용자별).
 */
const VIEWS = ['월간양식', '기본(수정불가)', '일간', '월간', '사용자별'] as const
type View = typeof VIEWS[number]

type Form = {
  eventDate: string; startTime: string; endTime: string; title: string; category: string
  owner: string; location: string; labelText: string; attendees: string; remark: string
  /** 원본 [공유자] — 선택(이름 콤마 구분) / 전체. */
  sharers: string; sharersAll: boolean
  /** 원본 [권한] 게시글권한 — 참석자 · 공유자 수정/삭제, 이외사용자 조회. */
  permAttendeeEdit: boolean; permSharerEdit: boolean; permOthersView: boolean
  /** 원본 [캘린더] — 공유일정캘린더(true) · 개인일정캘린더(false). */
  shared: boolean
}

/** 원본 [권한] '게시글권한' 을 누르면 펴지는 표(2026-10-13 실측). 조회는 참석자 · 공유자가 늘 켜져 있다. */
function PermissionPopover({ form, onChange }: {
  form: Form
  onChange: (patch: Partial<Form>) => void
}) {
  const [open, setOpen] = useState(false)
  return (
    <span className="relative">
      <button type="button" className="no-ec bg-transparent border-0 p-0 cursor-pointer text-ec-navy" onClick={() => setOpen((v) => !v)}>게시글권한</button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <table className="absolute left-0 top-full mt-[2px] z-[41] w-[270px] bg-ec-panel" aria-label="게시글권한">
            <thead><tr><th className="text-center">조회가능자</th><th className="text-center">조회</th><th className="text-center">수정/삭제</th></tr></thead>
            <tbody>
              <tr>
                <td className="text-center">참석자</td>
                <td className="text-center"><input type="checkbox" checked disabled aria-label="참석자 조회" /></td>
                <td className="text-center"><input type="checkbox" aria-label="참석자 수정/삭제" checked={form.permAttendeeEdit}
                                                   onChange={(e) => onChange({ permAttendeeEdit: e.target.checked })} /></td>
              </tr>
              <tr>
                <td className="text-center">공유자</td>
                <td className="text-center"><input type="checkbox" checked disabled aria-label="공유자 조회" /></td>
                <td className="text-center"><input type="checkbox" aria-label="공유자 수정/삭제" checked={form.permSharerEdit}
                                                   onChange={(e) => onChange({ permSharerEdit: e.target.checked })} /></td>
              </tr>
              <tr>
                <td className="text-center">이외사용자</td>
                <td className="text-center"><input type="checkbox" aria-label="이외사용자 조회" checked={form.permOthersView}
                                                   onChange={(e) => onChange({ permOthersView: e.target.checked })} /></td>
                <td className="text-center"><input type="checkbox" disabled aria-label="이외사용자 수정/삭제" checked={false} readOnly /></td>
              </tr>
            </tbody>
          </table>
        </>
      )}
    </span>
  )
}

const pad2 = (n: number) => String(n).padStart(2, '0')

/** 일간 · 사용자별 의 시간 줄 — 원본은 AM 08:00 ~ PM 06:00 이다. */
const HOURS = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18]
const hourText = (h: number) => `${h < 12 ? 'AM' : 'PM'} ${pad2(h > 12 ? h - 12 : h)}:00`
const dayHead = (date: string) => {
  const d = new Date(`${date}T00:00:00`)
  return `${pad2(d.getMonth() + 1)}/${pad2(d.getDate())} (${DOW[d.getDay()]})`
}
/** 일정이 놓이는 시간 줄 — 시작 시각의 '시'. 시간이 없으면 null. */
const startHour = (r: { startTime: string | null }) => (r.startTime ? Number(r.startTime.slice(0, 2)) : null)
/** 원본 일간 줄의 글: '제목/10/03 (토) 10:00 ~ 11:00/장소/참석자'. */
const lineText = (r: ScheduleEvent) =>
  `${r.title}/${dayHead(r.eventDate)} ${r.startTime ?? ''}${r.endTime ? ` ~ ${r.endTime}` : ''}/${r.location ?? ''}/${r.attendees ?? ''}`

/**
 * 원본 신규 폼의 기본 시간 — <b>다음 정각부터 한 시간</b>이다(13:37 에 열면 14:00 ~ 15:00, 2026-10-03 실측).
 * 23시 이후면 날을 넘기지 않고 23:00 ~ 24:00 으로 둔다.
 */
function defaultTimes(now = new Date()) {
  const h = Math.min(now.getHours() + 1, 23)
  return { startTime: `${pad2(h)}:00`, endTime: `${pad2(h + 1)}:00` }
}

/**
 * 그룹웨어 > 사내관리 > 일정관리 (이카운트 E070201)
 *
 * <p><b>원본은 양식이 둘이다(2026-10-03 직접 써 보며 확인).</b> 오른쪽 위 양식 고르기에서
 * <b>[월간]</b>은 한 달 달력 칸에 일정을 얹고(칸마다 일정구분 칩 + 굵은 제목), <b>[기본(수정불가)]</b>은
 * 왼쪽 작은 달력 + 일정 목록이다. 우리는 기본 양식 하나만 있었다 — 일정관리를 열면 달력이 아니라 표가 떴다.
 * loginaa 회사가 열어 두는 양식이 달력이라 [월간]으로 시작한다.
 *
 * <p>월간 양식 왼쪽은 연도 넘기기 + 1~12월 단추 + [오늘], 그 아래 캘린더 고르기다. 칸 실측: 머리 12px 700 ·
 * 바탕 --ec-bg-page · 높이 25.7 / 날 칸 높이 76 · 여백 2.7 · 머리카락 선 · 날짜는 오른쪽 위 · 오늘 칸 바탕
 * --ec-blue-wash · 그 달 밖의 칸 --ec-bg-disabled · 일정구분 칩 둥글기 10(.ec-label-chip).
 * 시간 없는(종일) 일정은 캘린더 색 막대(여백 3.6 0.9, 높이 25.5), 시간 있는 일정은 그 색 점 + 칩 + 굵은 제목.
 *
 * <p>일정을 누르면 <b>'일정조회'</b> 창이 뜬다 — 제목 · 일정구분 · 장소 · 라벨 · 날짜/시간('2026/10/03 14:00 ~ 15:00')
 * · 참석자 · 본문, 하단 [수정][인쇄][닫기][삭제]. [삭제]는 '선택한 일정이 삭제 됩니다. 한번 지워진 자료는 복구 될 수
 * 없습니다. 계속 진행 하겠습니까?' 를 묻는다. 우리는 조회·수정 창이 없어 <b>한 번 넣은 일정을 고칠 수 없었다</b>
 * (서버에는 PATCH 가 진작 있었다).
 *
 * <p><b>[일간]</b>은 왼쪽 작은 달력에서 고른 날의 시간 줄(맨 위 AM 00:00 + AM 08:00 ~ PM 06:00)에, <b>[사용자별]</b>은
 * 사원 × 시간 칸에 일정을 얹는다(참석자로 가른다). 일정이 든 칸은 캘린더 색(--ec-bg-calendar) — 원본 [기본] 공유일정캘린더의 노랑.
 * 줄 글은 '제목/10/03 (토) 10:00 ~ 11:00/장소/참석자' 다.
 *
 * <p>신규 폼 '일정관리등록' 의 시간은 다음 정각부터 한 시간이 기본이고, 참석자에는 나를 넣어 둔다(원본 실측).
 * [공유자](선택 / 전체) · [권한](게시글권한 표) · [반복설정](반복설정 창 → 주황 요약 글) 은 2026-10-13 원본을 재서 붙였다.
 * 반복 일정은 날마다 한 줄씩 들어가고, [수정] · [삭제] 는 먼저 '반복일정삭제' 창(이번 일정만 · 향후 모든 일정 · 전체 반복일정)을 띄운다.
 * 원본 [일정알림] 은 데모에서 '데모에서는 해당 기능이 제한되어 있습니다.' 만 떠 재지 못했다 — 두지 않는다.
 *
 * <p>기본 양식 목록 컬럼은 (선택칸 25) 일자(요일) 100 · 시작시간 55 · 종료시간 55 · 참석자성명 160 · 제목 300 · 장소 170 이다.
 *
 * <p><b>2026-10-13 캘린더 · 라벨 · 권한.</b> 왼쪽은 체크박스 넷 — 내 캘린더([기본] 공유일정캘린더 · 개인일정캘린더),
 * 다른 캘린더(휴가확인용 = 휴가 '사원/휴가종류', 납기일자확인용 = 주문서 '[거래처] 품목 창고'). 입력 창의 [캘린더]는
 * 내 캘린더 둘 중 하나(개인일정은 만든 사람만 본다). 달력 칸의 둥근 칩은 일정구분이 아니라 <b>라벨</b>이다 —
 * '라벨검색'(라벨코드 · 라벨명 · 색상)에서 고른 색. [권한] 게시글권한은 서버가 보기를 거르고 수정/삭제를 막는다.
 */
interface UserRow { id: number; name: string }

/**
 * {@code popup} — MyPage 일정관리 위젯이 이 화면을 숨긴 채(features/mypage/PopupHost) 창 하나만 띄울 때.
 * viewId 가 없으면 원본 펜(새 글)처럼 '일정관리등록', 있으면 그 일정의 '일정조회'.
 */
export default function SchedulePage({ popup }: { popup?: { viewId?: number } } = {}) {
  const { user, isAdmin } = useAuth()
  const [view, setView] = useState<View>('월간양식')
  /** 달력 칸을 쓰는 두 양식 — 월간양식은 일정구분 칩을 붙이고, 월간은 붙이지 않는다(2026-10-03 실측). */
  const isMonth = view === '월간양식' || view === '월간'
  /** 월간 양식이 보는 달(그 달 1일). */
  const [month, setMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1) })
  /** 일간 · 사용자별 이 보는 날. */
  const [day, setDay] = useState(() => ymd(new Date()))
  const [users, setUsers] = useState<UserRow[]>([])
  /** 켜 둔 캘린더 — 원본 첫 화면은 [기본] 공유일정캘린더만 켜져 있다. */
  const [cals, setCals] = useState<Set<CalKey>>(() => new Set<CalKey>(['SHARED']))
  const [labels, setLabels] = useState<ScheduleLabel[]>([])
  const [showLabels, setShowLabels] = useState(false)
  /** 원본 [일정구분] 🔍 '일정구분검색' 과 그 마스터. 코드 칸은 폼 밖에 둔다(일정에는 이름만 남는다). */
  const [showCategories, setShowCategories] = useState(false)
  const [categories, setCategories] = useState<ScheduleCategory[]>([])
  const [categoryCode, setCategoryCode] = useState('')
  const loadCategories = () => api.get<ScheduleCategory[]>('/schedule-categories').then((r) => setCategories(r.data)).catch(() => {})
  const [extras, setExtras] = useState<ExtraBar[]>([])
  const navigate = useNavigate()
  const [rows, setRows] = useState<ScheduleEvent[]>([])
  const [error, setError] = useState('')
  /** 입력 창. editId 가 있으면 고치는 중. */
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<number | null>(null)
  /** '일정조회' 창에 띄운 일정. */
  const [viewing, setViewing] = useState<ScheduleEvent | null>(null)
  /** 원본 '일정조회' [H] → '이력'. */
  const [history, setHistory] = useState<ScheduleEvent | null>(null)
  const [keyword, setKeyword] = useState('')
  /*
   * 원본 일정관리(기본 양식) 조건 차례: 기준일자 · 참석자 · 제목 · 장소 · 일정구분 · 라벨 · 기타 · 본문.
   */
  const [kindCond, setKindCond] = useState('')
  const [bodyCond, setBodyCond] = useState('')
  const [titleCond, setTitleCond] = useState('')
  const [placeCond, setPlaceCond] = useState('')
  const [labelCond, setLabelCond] = useState('')
  /** 캘린더에서 고른 날. 빈 문자열이면 고른 날 없음 = 전체 보기. */
  const [pickedDate, setPickedDate] = useState('')
  /** 원본 [기준일자] 구간. 비워 두고 시작한다. */
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  /** 원본 하단 [선택삭제] 는 고른 행을 한꺼번에 지운다. 고르는 방식은 회색 행번호 칸 클릭 — 다른 목록과 같다. */
  const [selected, setSelected] = useState<Set<number>>(new Set())

  const emptyForm = (date = ymd(new Date())): Form => ({
    eventDate: date, ...defaultTimes(), title: '', category: '', owner: '',
    location: '', labelText: '', attendees: user?.name ?? '', remark: '',
    sharers: '', sharersAll: false, permAttendeeEdit: true, permSharerEdit: true, permOthersView: false,
    // 원본 신규 창 [캘린더] 처음 값은 '개인일정캘린더'(2026-10-14 E070201 실측) — 그래서 새 일정은 처음 체크(공유만)에서 안 보인다.
    shared: false,
  })
  /** 신규 창의 [반복설정] — 적용하면 주황 요약 글이 그 자리에 선다. 고칠 때는 일정에 적힌 요약 글만 보인다. */
  const [repeat, setRepeat] = useState<RepeatRule | null>(null)
  const [showRepeat, setShowRepeat] = useState(false)
  /** 반복 일정의 [수정] · [삭제] 가 먼저 띄우는 '반복일정삭제' 창과, 고칠 때 고른 범위. */
  const [askScope, setAskScope] = useState<{ action: 'edit' | 'delete'; ev: ScheduleEvent } | null>(null)
  const [editScope, setEditScope] = useState<RepeatScope>('ONE')
  const [editing, setEditing] = useState<ScheduleEvent | null>(null)
  const [form, setForm] = useState<Form>(() => emptyForm())
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }))

  async function load() {
    try { setRows((await api.get<ScheduleEvent[]>('/schedule-events')).data) }
    catch (err) { setError(extractErrorMessage(err)) }
  }
  useEffect(() => { void load() }, [])
  /* MyPage 위젯에서 부른 창 — 처음 한 번만 연다 */
  const popupDone = useRef(false)
  useEffect(() => {
    if (!popup || popupDone.current) return
    if (popup.viewId == null) { popupDone.current = true; openNew(); return }
    const ev = rows.find((r) => r.id === popup.viewId)
    if (ev) { popupDone.current = true; setViewing(ev) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows])
  const loadLabels = () => api.get<ScheduleLabel[]>('/schedule-labels').then((r) => setLabels(r.data)).catch(() => {})
  useEffect(() => { void loadLabels(); void loadCategories() }, [])
  /**
   * 머리 [라벨] 거르기 — 원본 quickLabel(2026-10-30 실측). 펼치면 [전체] + 라벨없음 · 라벨마다(칩) 체크, 아래 [↵ 적용][+ 라벨조회][× 닫기].
   * 처음엔 아무것도 안 걸려 다 보인다. 하나도 안 고르고 적용하면 '1개 이상 선택해야 합니다.'. 고른 코드('' = 라벨없음)만 달력에 남는다.
   */
  const [labelPick, setLabelPick] = useState<Set<string> | null>(null)

  /**
   * 다른 캘린더 — 휴가확인용은 휴가(근태)를 '사원/휴가종류' 로 시작일~종료일 날마다(원본 '신문섭/예비군' 사흘),
   * 납기일자확인용은 주문서 줄을 '[거래처] 품목 창고' 로 납기일자에(원본 '[(주)진로어패럴] 울트라 스킨 본사창고').
   */
  useEffect(() => {
    const out: ExtraBar[] = []
    const jobs: Promise<unknown>[] = []
    if (cals.has('LEAVE')) jobs.push(api.get<VacationLite[]>('/hr/vacations', { params: { year: month.getFullYear() } }).then((r) => {
      for (const v of r.data) {
        const end = v.endDate ?? v.startDate
        for (let d = new Date(v.startDate); ymd(d) <= end; d.setDate(d.getDate() + 1)) {
          out.push({ key: `L${v.id}-${ymd(d)}`, date: ymd(d), text: `${v.empName}/${v.type}`, cal: 'LEAVE' })
        }
      }
    }))
    if (cals.has('DUE')) jobs.push(api.get<OrderLite[]>('/sales-orders').then((r) => {
      for (const o of r.data) {
        if (!o.dueDate) continue
        for (const l of o.lines) out.push({ key: `D${l.lineId}`, date: o.dueDate, text: `[${o.partnerName}] ${l.itemName} ${o.warehouseName ?? ''}`.trim(), cal: 'DUE', orderId: o.id })
      }
    }))
    Promise.all(jobs).then(() => setExtras(out)).catch((err) => setError(extractErrorMessage(err)))
  }, [cals, month])
  useEffect(() => { api.get<UserRow[]>('/users').then((r) => setUsers(r.data)).catch(() => {}) }, [])

  function openNew(date?: string) {
    setEditId(null)
    setEditing(null)
    setRepeat(null)
    setForm(emptyForm(date))
    setCategoryCode('')
    setError('')
    setShowForm(true)
  }

  /** '일정조회' 의 [수정] — 같은 입력 창을 그 일정으로 채워 띄운다. */
  function openEdit(r: ScheduleEvent, scope: RepeatScope = 'ONE') {
    setViewing(null)
    setEditId(r.id)
    setEditing(r)
    setEditScope(scope)
    setRepeat(null)
    setForm({
      eventDate: r.eventDate, startTime: r.startTime ?? '', endTime: r.endTime ?? '', title: r.title,
      category: r.category ?? '', owner: r.owner ?? '', location: r.location ?? '',
      labelText: r.labelText ?? '', attendees: r.attendees ?? '', remark: r.remark ?? '',
      sharers: r.sharers === '전체' ? '' : (r.sharers ?? ''), sharersAll: r.sharers === '전체',
      permAttendeeEdit: r.permAttendeeEdit ?? true, permSharerEdit: r.permSharerEdit ?? true, permOthersView: r.permOthersView ?? false,
      shared: r.shared !== false,
    })
    setCategoryCode(categories.find((c) => c.name === r.category)?.code ?? '')
    setError('')
    setShowForm(true)
  }

  /** 원본 '일정조회' [수정] — 반복 일정이면 범위부터 묻는다. */
  const askEdit = (r: ScheduleEvent) => (r.repeatGroup ? setAskScope({ action: 'edit', ev: r }) : openEdit(r))
  /** 원본 [복사] — 같은 내용으로 '일정관리등록' 을 연다. */
  function copyOf(r: ScheduleEvent) {
    openEdit(r)
    setEditId(null)
    setEditing(null)
  }

  useShortcut('F2', () => openNew(), !showForm && !viewing && !askScope)
  useShortcut('F8', () => void submit(), showForm && !showRepeat)

  async function submit() {
    setError('')
    if (!form.title.trim()) return setError('일정 제목을 입력하세요.')
    if (form.startTime && form.endTime && form.endTime < form.startTime) return setError('종료시간이 시작시간보다 빠릅니다.')
    const { sharersAll, labelText, ...rest } = form
    // 일정에는 라벨코드로 붙는다 — 칸에 적힌 라벨명을 마스터에서 찾아 코드로 보낸다(빈 칸이면 라벨 없음).
    const labelCode = labelText.trim() ? labels.find((l) => l.name === labelText.trim())?.code : ''
    if (labelCode == null) return setError('라벨을 찾을 수 없습니다. [라벨] 🔍 에서 고르세요.')
    const body = { ...rest, labelCode, sharers: sharersAll ? '전체' : form.sharers }
    // 원본: 참석자에게 같은 시간 일정이 이미 있으면 'OO님의 공유일정이 존재합니다. 저장 하겠습니까?' 를 묻는다.
    const clash = attendeeClash()
    if (clash && !(await ecConfirm(`${clash}님의 공유일정이 존재합니다.\n저장 하겠습니까?`))) return
    try {
      if (editId != null) {
        // PATCH 는 null 을 '그대로 둠' 으로 읽는다 — 지운 칸은 빈 글자로 보내야 비워진다.
        await api.patch(`/schedule-events/${editId}`, { ...body, scope: editScope })
      } else {
        await api.post<ScheduleEvent>('/schedule-events', {
          ...body,
          startTime: form.startTime || undefined, endTime: form.endTime || undefined,
          owner: form.owner || undefined, location: form.location || undefined,
          attendees: form.attendees || undefined, labelCode: labelCode || undefined,
          remark: form.remark || undefined, sharers: body.sharers || undefined,
          repeat: repeat ? { ...repeat, summary: repeatSummary(repeat) } : undefined,
        })
      }
      setShowForm(false)
      setEditId(null)
      void load()
    } catch (err) { setError(extractErrorMessage(err)) }
  }

  /**
   * 저장하려는 일정과 같은 날 · 겹치는 시간에 참석자의 다른 일정이 있으면 그 사람 이름(처음 한 명).
   * 반복이면 펼쳐질 날을 다 보지 않고 첫날만 본다. 시간이 없는(종일) 일정은 하루 전체와 겹친다.
   */
  function attendeeClash(): string | null {
    const names = form.attendees.split(',').map((x) => x.trim()).filter(Boolean)
    const overlaps = (a: ScheduleEvent) => {
      if (!form.startTime || !a.startTime) return true
      return (a.startTime < (form.endTime || '24:00')) && (form.startTime < (a.endTime || '24:00'))
    }
    for (const n of names) {
      const hit = rows.find((r) => r.id !== editId && r.eventDate === form.eventDate && overlaps(r)
        && (r.attendees ?? '').split(',').map((x) => x.trim()).includes(n))
      if (hit) return n
    }
    return null
  }

  /** 원본 '일정조회' 의 [삭제] 문구 그대로. */
  const DELETE_ASK = '선택한 일정이 삭제 됩니다.\n한번 지워진 자료는 복구 될 수 없습니다.\n\n계속 진행 하겠습니까?'

  async function removeOne(id: number, scope?: RepeatScope) {
    if (!(await ecConfirm(DELETE_ASK))) return
    try {
      await api.delete(`/schedule-events/${id}`, scope ? { params: { scope } } : undefined)
      setViewing(null)
      setShowForm(false)
      setEditId(null)
      void load()
    } catch (err) { setError(extractErrorMessage(err)) }
  }
  /** 반복 일정이면 범위('반복일정삭제')부터 묻는다. 고치는 중이면 이미 고른 범위로 지운다. */
  const askRemove = (r: ScheduleEvent) => (r.repeatGroup ? setAskScope({ action: 'delete', ev: r }) : void removeOne(r.id))

  async function removeSelected() {
    const targets = shown.filter((r) => selected.has(r.id))
    if (targets.length === 0) return ecAlert('지울 일정을 고르세요. (왼쪽 회색 번호 칸을 누릅니다)')
    if (!(await ecConfirm(DELETE_ASK))) return
    const failed: string[] = []
    for (const r of targets) {
      try { await api.delete(`/schedule-events/${r.id}`) }
      catch (err) { failed.push(`${r.title}: ${extractErrorMessage(err)}`) }
    }
    setSelected(new Set())
    void load()
    if (failed.length) void ecAlert(`지우지 못한 일정 ${failed.length}건 — ${failed.join(' / ')}`)
  }

  const toggle = (id: number) =>
    setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })

  /**
   * 원본 [권한] 게시글권한의 수정/삭제 — 만든 사람, 켜져 있으면 참석자 · 공유자(서버도 같은 규칙으로 막는다).
   * 볼 수 없는 일정은 서버가 아예 내려 보내지 않는다.
   */
  const names = (s: string | null | undefined) => (s ?? '').split(',').map((x) => x.trim()).filter(Boolean)
  const me = (n: string) => n === user?.name || n === user?.username
  const canEdit = (r: ScheduleEvent) => {
    if (!r.createdBy || r.createdBy === user?.username) return true
    if (r.shared === false) return false
    if (isAdmin) return true
    return (r.permAttendeeEdit !== false && names(r.attendees).some(me))
      || (r.permSharerEdit !== false && ((r.sharers ?? '').trim() === '전체' || names(r.sharers).some(me)))
  }

  /** 캘린더 고르기와 검색창 — 두 양식이 같이 쓴다. */
  const inCalendar = rows
    .filter((r) => cals.has(r.shared === false ? 'PERSONAL' : 'SHARED'))
    .filter((r) => !labelPick || labelPick.has(r.labelText ? (r.labelCode ?? '') : ''))
    .filter((r) => !keyword
      || r.title.includes(keyword)
      || (r.owner ?? '').includes(keyword)
      || (r.attendees ?? '').includes(keyword)
      || (r.location ?? '').includes(keyword))
    .filter((r) => !from || r.eventDate >= from)
    .filter((r) => !to || r.eventDate <= to)
    .filter((r) => !titleCond || r.title.includes(titleCond))
    .filter((r) => !placeCond || (r.location ?? '').includes(placeCond))
    .filter((r) => !kindCond || (r.category ?? '') === kindCond)
    .filter((r) => !labelCond || (r.labelCode ?? '') === labelCond)
    .filter((r) => !bodyCond || (r.remark ?? '').includes(bodyCond))

  /* 조건 판([Search(F3)])의 조건 — 모든 양식(월간 · 일간 · 사용자별 · 목록)이 같이 쓴다. */
  const shown = inCalendar
    .filter((r) => !pickedDate || r.eventDate === pickedDate)

  const timeText = (r: ScheduleEvent) =>
    `${r.eventDate.replace(/-/g, '/')} ${r.startTime ?? ''}${r.endTime ? ` ~ ${r.endTime}` : ''}`.trim()

  function printOne(r: ScheduleEvent) {
    const win = openPrintWindow()
    if (!win) return
    const line = (k: string, v: string | null) => `<tr><th>${k}</th><td>${escapeHtml(v ?? '')}</td></tr>`
    fillAndPrint(win, `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>일정조회</title>
<style>body{font-family:sans-serif;font-size:12px;padding:24px}table{border-collapse:collapse;width:100%}
th,td{border:1px solid;padding:4px 6px;text-align:left}th{width:90px}</style></head><body><h1>일정조회</h1><table>
${line('제목', r.title)}${line('일정구분', r.category)}${line('장소', r.location)}${line('라벨', r.labelText)}
${line('날짜/시간', timeText(r))}${line('참석자', r.attendees)}${line('본문', r.remark)}</table></body></html>`)
  }

  /** 월간 양식의 칸 — 그 달 1일이 든 주의 일요일부터 6주(마지막 주가 다음 달뿐이면 뺀다). */
  const weeks: Date[][] = (() => {
    const start = new Date(month); start.setDate(1 - month.getDay())
    const out: Date[][] = []
    for (let w = 0; w < 6; w++) {
      const week = Array.from({ length: 7 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + w * 7 + i))
      if (w > 0 && week[0].getMonth() !== month.getMonth()) break
      out.push(week)
    }
    return out
  })()
  const todayStr = ymd(new Date())
  /** 월간 칸은 주 수(5·6)가 달마다 변한다 — 런타임에 머리·본문 칸 수를 맞춰 본다. */
  const monthRef = useRef<HTMLTableElement>(null)
  useTableColumnCheck(monthRef, '일정관리 월간', [view, month.getTime(), inCalendar.length])
  const userRef = useRef<HTMLTableElement>(null)
  useTableColumnCheck(userRef, '일정관리 사용자별', [view, day, users.length, inCalendar.length])

  const dayEvents = inCalendar
    .filter((r) => r.eventDate === day)
    .sort((a, b) => (a.startTime ?? '').localeCompare(b.startTime ?? ''))
  /**
   * 일간의 줄 — 원본은 맨 위 'AM 00:00' 줄과 AM 08:00 ~ PM 06:00 이다. 일정은 <b>시작 시각의 줄</b>에만 놓인다
   * (10:00 ~ 11:00 일정이 AM 10:00 줄에만 보였다). 8시 전 · 시간 없는 일정은 맨 위 줄, 6시 뒤는 PM 06:00 줄.
   */
  const dayRow = (r: ScheduleEvent) => { const h = startHour(r); return h == null || h < 8 ? 0 : Math.min(h, 18) }
  /** 사용자별의 칸 — 맨 위 줄이 없어서 8시 전 일정은 AM 08:00 칸에 둔다. */
  const userCol = (r: ScheduleEvent) => Math.min(Math.max(startHour(r) ?? 8, 8), 18)
  const attends = (r: ScheduleEvent, name: string) =>
    (r.attendees ?? '').split(',').map((a) => a.trim()).includes(name)

  /** 일간 · 사용자별 칸 하나 — 칩(일정구분) + 줄 글, 누르면 '일정조회'. */
  const eventLine = (r: ScheduleEvent) => (
    <button key={r.id} type="button" title={lineText(r)} onClick={() => setViewing(r)}
            className="no-ec flex items-center gap-[4px] w-full bg-transparent border-0 p-0 cursor-pointer text-left text-ec-ink">
      {r.labelText && <LabelChip name={r.labelText} color={r.labelColor} light={false} />}
      <span className="truncate">{lineText(r)}</span>
    </button>
  )

  /** 원본 머리: [월간양식 ▾][라벨] 검색칸 · Search(F3) · Option · 도움말. */
  const headTools = (
    <>
      <select className="ec-input w-[140px]" aria-label="양식" value={view} onChange={(e) => setView(e.target.value as View)}>
        {VIEWS.map((v) => <option key={v}>{v}</option>)}
      </select>
      <LabelFilter labels={labels} value={labelPick} onApply={setLabelPick} onManage={() => setShowLabels(true)} />
    </>
  )

  const calRow = ([k, label]: [CalKey, string]) => (
    <label key={k} className="inline-flex items-center gap-[6px] text-[12px] cursor-pointer">
      <input type="checkbox" checked={cals.has(k)} aria-label={label}
             onChange={() => setCals((c) => { const n = new Set(c); if (n.has(k)) n.delete(k); else n.add(k); return n })} />
      <span className="inline-block w-[12px] h-[12px] rounded-[3px]" ref={paint(CAL_COLOR[k])} />
      {label}
    </label>
  )
  const calendarPicker = (
    <div className="flex flex-col gap-[6px] mt-[10px] pt-[8px] border-t border-t-ec-line-soft border-solid">
      <span className="text-[12px] text-ec-navy">▾ 내 캘린더</span>
      {MY_CALS.map(calRow)}
      <span className="text-[12px] text-ec-navy mt-[6px]">▾ 다른 캘린더</span>
      {OTHER_CALS.map(calRow)}
    </div>
  )

  /** 일간 · 사용자별 왼쪽 — 원본은 작은 달력(날 고르기) + 캘린더 고르기다. */
  const dayPicker = (
    <div className="shrink-0">
      <EcMonthCalendar value={day} onPick={(d) => d && setDay(d)}
                       marks={new Set(inCalendar.map((r) => r.eventDate))} />
      {calendarPicker}
    </div>
  )

  return (
    <EcListShell
      title="일정관리"
      headExtra={headTools}
      search={keyword}
      onSearchChange={setKeyword}
      onNew={() => openNew()}
      actions={isMonth || view === '사용자별'
        // 원본 월간 · 사용자별 양식 하단은 [신규(F2)][인쇄] 뿐이다. 일간은 [Excel] 이 더 있다.
        ? [{ label: '인쇄' }]
        : view === '일간'
        ? [{ label: '인쇄' }, { label: 'Excel' }]
        : [
          { label: '미리보기' },
          { label: '인쇄' },
          { label: '선택삭제', onClick: removeSelected, selected: selected.size },
          { label: 'Excel' },
        ]}
    >
      {/* 원본 '일정관리등록' 창 */}
      <Modal error={error} open={showForm} title={editId != null ? '일정관리수정' : '일정관리등록'} onClose={() => setShowForm(false)} width={780}>
        <ul className="ec-form mb-[10px]">
          <li className="wide">
            <div className="title">제목</div>
            <div className="form"><input className="ec-input w-full" placeholder="제목" value={form.title}
                                         onChange={(e) => set('title', e.target.value)} /></div>
          </li>
          <li>
            <div className="title">일정구분</div>
            <div className="form">
              <span className="ec-code flex flex-1 min-w-0">
                <input className="ec-input w-[86px]" placeholder="일정구분" aria-label="일정구분코드" maxLength={20} value={categoryCode}
                       onChange={(e) => {
                         const code = e.target.value
                         setCategoryCode(code)
                         const hit = categories.find((c) => c.code === code.trim())
                         if (hit) set('category', hit.name)
                       }} />
                <button type="button" className="ec-btn" aria-label="일정구분검색" onClick={() => setShowCategories(true)}><EcIcon name="search" /></button>
                <input className="ec-input flex-1 min-w-0" aria-label="일정구분" maxLength={30} value={form.category}
                       onChange={(e) => { set('category', e.target.value); setCategoryCode(categories.find((c) => c.name === e.target.value.trim())?.code ?? '') }} />
              </span>
            </div>
          </li>
          <li>
            <div className="title">캘린더</div>
            <div className="form">
              <select className="ec-input w-full" aria-label="캘린더" value={form.shared ? 'SHARED' : 'PERSONAL'}
                      onChange={(e) => set('shared', e.target.value === 'SHARED')}>
                {MY_CALS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
            </div>
          </li>
          <li>
            <div className="title">장소</div>
            <div className="form"><input className="ec-input w-full" placeholder="장소" value={form.location}
                                         onChange={(e) => set('location', e.target.value)} /></div>
          </li>
          <li>
            <div className="title">라벨</div>
            <div className="form flex gap-[4px]">
              {/* 원본 [라벨] 🔍 → '라벨검색'(라벨코드 · 라벨명 · 색상) — 고른 라벨이 달력 칸의 칩이 된다. */}
              <button type="button" className="ec-btn" aria-label="라벨검색" onClick={() => setShowLabels(true)}><EcIcon name="search" /></button>
              <input className="ec-input w-full" placeholder="라벨" list="schedule-labels" value={form.labelText}
                     onChange={(e) => set('labelText', e.target.value)} />
              <datalist id="schedule-labels">
                {labels.filter((l) => l.active).map((l) => <option key={l.id} value={l.name} />)}
              </datalist>
            </div>
          </li>
          <li className="wide">
            <div className="title">날짜/시간</div>
            <div className="form">
              <EcDateInput className="ec-input w-[150px]" value={form.eventDate} onChange={(e) => set('eventDate', e.target.value)} />
              <input type="time" className="ec-input w-[110px]" value={form.startTime} onChange={(e) => set('startTime', e.target.value)} />
              <span className="text-ec-label">~</span>
              <input type="time" className="ec-input w-[110px]" value={form.endTime} onChange={(e) => set('endTime', e.target.value)} />
              {/* 원본 [종일] — 켜면 시간 없이 하루 전체(달력에는 막대로 선다). */}
              <label className="inline-flex items-center gap-[4px] cursor-pointer">
                <input type="checkbox" checked={!form.startTime && !form.endTime}
                       onChange={(e) => setForm((f) => ({ ...f, ...(e.target.checked ? { startTime: '', endTime: '' } : defaultTimes()) }))} />
                종일
              </label>
              {/* 원본 [반복설정] — 적용하면 그 자리에 주황 요약 글('매일, 2026/10/13 부터 3회 까지'). 고칠 때는 일정에 적힌 글만. */}
              {editId != null
                ? (editing?.repeatRule && <span className="rounded-ec bg-ec-warn text-ec-panel py-[2px] px-[6px]" aria-label="반복설정">{editing.repeatRule}</span>)
                : (
                  <button type="button" aria-label="반복설정" onClick={() => setShowRepeat(true)}
                          className={repeat ? 'no-ec rounded-ec bg-ec-warn text-ec-panel py-[2px] px-[6px] border-0 cursor-pointer'
                                            : 'no-ec bg-transparent border-0 p-0 cursor-pointer text-ec-navy'}>
                    {repeat ? repeatSummary(repeat) : '반복설정'}
                  </button>
                )}
            </div>
          </li>
          <li className="wide">
            <div className="title">참석자</div>
            <div className="form"><NameChips label="참석자" users={users} value={form.attendees} onChange={(v) => set('attendees', v)} /></div>
          </li>
          {/* 원본 [공유자] — [선택▾] 을 누르면 전체 / 선택. 전체면 칸 없이 '전체' 글만 선다. */}
          <li className="wide">
            <div className="title">공유자</div>
            <div className="form">
              <select className="ec-input w-[70px]" aria-label="공유자 범위" value={form.sharersAll ? '전체' : '선택'}
                      onChange={(e) => set('sharersAll', e.target.value === '전체')}>
                <option>선택</option>
                <option>전체</option>
              </select>
              {!form.sharersAll && (
                <NameChips label="공유자" users={users} value={form.sharers} onChange={(v) => set('sharers', v)} />
              )}
            </div>
          </li>
          <li className="wide">
            <div className="title">권한</div>
            <div className="form"><PermissionPopover form={form} onChange={(patch) => setForm((f) => ({ ...f, ...patch }))} /></div>
          </li>
        </ul>
        <textarea className="ec-input w-full h-[140px] py-[8px] resize-y" aria-label="본문" value={form.remark}
                  onChange={(e) => set('remark', e.target.value)} />
        <div className="flex gap-[6px] mt-[10px]">
          <button className="ec-btn ec-btn-primary" onClick={() => void submit()}>저장(F8)</button>
          {/* 원본 '일정관리수정' 하단 [저장(F8)][이전][닫기][삭제] — 이전은 일정조회로 돌아간다. */}
          {editId != null && editing && <button className="ec-btn" onClick={() => { setShowForm(false); setViewing(editing) }}>이전</button>}
          <button className="ec-btn" onClick={() => setShowForm(false)}>닫기</button>
          {editId != null && <button className="ec-btn" onClick={() => void removeOne(editId, editing?.repeatGroup ? editScope : undefined)}>삭제</button>}
        </div>
      </Modal>

      {showRepeat && (
        <RepeatModal value={repeat ?? defaultRepeat(form.eventDate)}
                     onApply={(r) => { setRepeat(r); setShowRepeat(false) }}
                     onRemove={() => { setRepeat(null); setShowRepeat(false) }}
                     onClose={() => setShowRepeat(false)} />
      )}


      {/* 원본 '일정조회' 창 */}
      <Modal error={error} open={!!viewing} title="일정조회" onClose={() => setViewing(null)} width={780}>
        {viewing && (
          <>
            <table className="w-full text-left mb-[10px]">
              <tbody>
                <tr><th className="w-[120px] bg-ec-page">제목</th><td colSpan={3}>{viewing.title}</td></tr>
                <tr>
                  <th className="bg-ec-page">일정구분</th><td>{viewing.category ?? ''}</td>
                  <th className="w-[120px] bg-ec-page">담당</th><td>{viewing.owner ?? ''}</td>
                </tr>
                <tr>
                  <th className="bg-ec-page">장소</th><td>{viewing.location ?? ''}</td>
                  <th className="bg-ec-page">라벨</th>
                  {/* 원본 일정조회의 라벨은 칩이다. 글자색은 칸 색마다 흰 · 검정(viewLabelLight). */}
                  <td>{viewing.labelText && <LabelChip name={viewing.labelText} color={viewing.labelColor} light={viewLabelLight(viewing.labelColor)} />}</td>
                </tr>
                <tr><th className="bg-ec-page">날짜/시간</th><td colSpan={3}>{timeText(viewing)}</td></tr>
                <tr><th className="bg-ec-page">참석자</th><td colSpan={3}>{viewing.attendees ?? ''}</td></tr>
                <tr><th className="bg-ec-page">공유자</th><td colSpan={3}>{viewing.sharers ?? ''}</td></tr>
              </tbody>
            </table>
            <div className="whitespace-pre-wrap text-[12px] text-ec-ink min-h-[120px] p-[10px] border border-ec-line border-solid rounded-ec">
              {viewing.remark ?? ''}
            </div>
            <div className="flex gap-[6px] mt-[10px]">
              {canEdit(viewing) && <button className="ec-btn ec-btn-primary" onClick={() => askEdit(viewing)}>수정</button>}
              <button className="ec-btn" onClick={() => printOne(viewing)}>인쇄</button>
              <button className="ec-btn" onClick={() => copyOf(viewing)}>복사</button>
              <button className="ec-btn" onClick={() => setViewing(null)}>닫기</button>
              {canEdit(viewing) && <button className="ec-btn" onClick={() => askRemove(viewing)}>삭제</button>}
              <button className="ec-btn" onClick={() => setHistory(viewing)}>H</button>
            </div>
          </>
        )}
      </Modal>

      {/* '일정조회' 위에 뜨도록 그 뒤에 둔다. 머리 '[2026/10/13 -4]' — 그날 일정 가운데 몇째로 넣었나. */}
      {history && (
        <EcHistoryModal url={`/schedule-events/${history.id}/history`} onClose={() => setHistory(null)}
                          head={`[${history.eventDate.replaceAll('-', '/')} -${rows.filter((r) => r.eventDate === history.eventDate && r.id <= history.id).length}]`} />
      )}
      {/* '일정조회' 위에 뜨도록 그 뒤에 둔다. */}
      {askScope && (
        <RepeatScopeModal onClose={() => setAskScope(null)}
                          onApply={(scope) => {
                            const { action, ev } = askScope
                            setAskScope(null)
                            if (action === 'edit') openEdit(ev, scope)
                            else void removeOne(ev.id, scope)
                          }} />
      )}

      {error && !showForm && !viewing && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}


      {/* 원본 조건 판 — 양식과 상관없이 [Search(F3)] 로 연다(셸이 .ec-cond 를 찾아 접어 둔다). */}
      <ul className="ec-cond mb-[6px]">
        {/* 원본 조건 첫째 [기준일자] — 구간이다. 달력의 하루 고르기는 이 안에서 더 좁힌다. */}
        <EcCond label="기준일자">
          <EcDateRange from={{ className: "ec-input w-[140px]", value: from, onChange: (e) => setFrom(e.target.value) }} to={{ className: "ec-input w-[140px]", value: to, onChange: (e) => setTo(e.target.value) }} />
        </EcCond>
        <EcCond label="제목">
          <input className="ec-input w-[160px]" value={titleCond} placeholder="제목" onChange={(e) => setTitleCond(e.target.value)} />
        </EcCond>
        <EcCond label="장소">
          <input className="ec-input w-[140px]" value={placeCond} placeholder="장소" onChange={(e) => setPlaceCond(e.target.value)} />
        </EcCond>
        <EcCond label="일정구분">
          <select className="ec-input w-[120px]" value={kindCond} onChange={(e) => setKindCond(e.target.value)}>
            <option value="">전체</option>
            {[...new Set(rows.map((r) => r.category).filter(Boolean))].map((c) => <option key={c as string}>{c}</option>)}
          </select>
        </EcCond>
        <EcCond label="라벨">
          <select className="ec-input w-[120px]" value={labelCond} onChange={(e) => setLabelCond(e.target.value)}>
            <option value="">전체</option>
            {labels.map((l) => <option key={l.id} value={l.code}>{l.name}</option>)}
          </select>
        </EcCond>
        <EcCond label="본문">
          <input className="ec-input w-[150px]" value={bodyCond} placeholder="본문" onChange={(e) => setBodyCond(e.target.value)} />
        </EcCond>
      </ul>

      {isMonth ? (
        <div className="flex gap-[10px] items-start">
          {/* 원본 왼쪽: 연도 넘기기 + 1~12월 + [오늘], 그 아래 캘린더 고르기 */}
          <div className="w-[200px] shrink-0 bg-ec-panel rounded-ec-panel p-[9px] mobile:w-full">
            <div className="flex items-center justify-between mb-[6px]">
              <button className="ec-btn ec-btn-sm" aria-label="앞 해" onClick={() => setMonth(new Date(month.getFullYear() - 1, month.getMonth(), 1))}>‹</button>
              <span className="text-[12px] font-bold">{month.getFullYear()}</span>
              <button className="ec-btn ec-btn-sm" aria-label="다음 해" onClick={() => setMonth(new Date(month.getFullYear() + 1, month.getMonth(), 1))}>›</button>
            </div>
            <div className="grid grid-cols-4 gap-[4px]">
              {Array.from({ length: 12 }, (_, m) => (
                <button key={m} type="button"
                        className={`ec-pill no-ec justify-center${month.getMonth() === m ? ' active' : ''}`}
                        onClick={() => setMonth(new Date(month.getFullYear(), m, 1))}>
                  {m + 1}월
                </button>
              ))}
            </div>
            <button type="button" className="ec-btn ec-btn-sm mt-[6px]"
                    onClick={() => { const d = new Date(); setMonth(new Date(d.getFullYear(), d.getMonth(), 1)) }}>오늘</button>
            {calendarPicker}
          </div>

          <div className="flex-1 min-w-0" id="schedule-month">
            <table ref={monthRef} className="w-full table-fixed">
              <thead>
                <tr>{DOW.map((d) => <th key={d} className="text-center">{d}</th>)}</tr>
              </thead>
              <tbody>
                {weeks.map((week, wi) => (
                  <tr key={wi}>
                    {week.map((d) => {
                      const key = ymd(d)
                      const inMonth = d.getMonth() === month.getMonth()
                      const evs = inMonth ? inCalendar.filter((r) => r.eventDate === key) : []
                      return (
                        <td key={key} onDoubleClick={() => inMonth && openNew(key)}
                            className={`h-[76px] align-top p-[2.7px] ${!inMonth ? 'bg-ec-disabled' : key === todayStr ? 'bg-ec-blue-wash' : ''}`}>
                          {inMonth && (
                            <>
                              <div className={`text-right ${key === todayStr ? 'font-bold' : ''}`}>{d.getDate()}</div>
                              {evs.map((r) => (
                                <button key={r.id} type="button" title={r.title} onClick={() => setViewing(r)}
                                        className={`no-ec flex items-center w-full border-0 py-[3.6px] px-[0.9px] cursor-pointer text-left text-ec-ink ${r.startTime ? 'bg-transparent' : 'bg-ec-calendar'}`}>
                                  {/* 원본: 시간 없는(종일) 일정은 캘린더 색 막대, 시간 있는 일정은 그 색 점(7.19 동그라미) */}
                                  {r.startTime && <span className="inline-block shrink-0 w-[7.1875px] h-[7.1875px] mr-[4.5px] rounded-full bg-ec-calendar" />}
                                  {view === '월간양식' && r.labelText && <LabelChip name={r.labelText} color={r.labelColor} light={false} className="mr-[4.5px]" />}
                                  <b className="truncate">{r.title}</b>
                                </button>
                              ))}
                              {extras.filter((x) => x.date === key).map((x) => (
                                /* 원본: 납기 막대를 누르면 그 주문의 '주문수정' 창이 뜬다(2026-10-13 실측) — 주문서 화면의 ?edit= 로 연다. */
                                <div key={x.key} title={x.text} ref={paint(CAL_COLOR[x.cal])}
                                     onClick={x.orderId ? (e) => { e.stopPropagation(); navigate(`/sales/orders?edit=${x.orderId}`) } : undefined}
                                     className={`truncate w-full py-[3.6px] px-[0.9px] text-ec-ink ${x.orderId ? 'cursor-pointer' : ''}`}>{x.text}</div>
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
          </div>
        </div>
      ) : view === '일간' ? (
        <div className="flex gap-[10px] items-start">
          {dayPicker}
          <div className="flex-1 min-w-0">
            <table className="w-full table-fixed">
              <thead><tr><th className="w-[120px] text-center">시간</th><th className="text-center">{dayHead(day)}</th></tr></thead>
              <tbody>
                {[0, ...HOURS].map((h) => {
                  const evs = dayEvents.filter((r) => dayRow(r) === h)
                  return (
                    <tr key={h} className={evs.length ? 'bg-ec-calendar' : ''}>
                      <td className="text-center">{hourText(h)}</td>
                      <td>{evs.map(eventLine)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : view === '사용자별' ? (
        <div className="flex gap-[10px] items-start">
          {dayPicker}
          <div className="flex-1 min-w-0 overflow-x-auto">
            <table ref={userRef} className="w-full table-fixed">
              <thead>
                <tr>
                  <th rowSpan={2} className="w-[115px] text-center">참석자</th>
                  <th colSpan={HOURS.length} className="text-center">{dayHead(day)}</th>
                </tr>
                <tr>{HOURS.map((h) => <th key={h} className="text-center">{hourText(h)}</th>)}</tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td className="bg-ec-disabled">{u.name}</td>
                    {HOURS.map((h) => {
                      const evs = dayEvents.filter((r) => userCol(r) === h && attends(r, u.name))
                      return <td key={h} className={evs.length ? 'bg-ec-calendar' : ''}>{evs.map(eventLine)}</td>
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="flex gap-[10px] items-start">
          <div className="shrink-0">
            <EcMonthCalendar
              value={pickedDate}
              onPick={setPickedDate}
              marks={new Set(rows.map((r) => r.eventDate))}
            />
            {calendarPicker}
          </div>
          <div className="flex-1 min-w-0">
            {/* 원본은 목록 위에 조회 기간을 적는다. 우리는 캘린더에서 고른 날(없으면 전체)이 그 자리다. */}
            <div className="mb-[4px] text-[12px] text-ec-ink">
              {pickedDate
                ? `${pickedDate.replace(/-/g, '/')} (${DOW[new Date(pickedDate).getDay()]})`
                : (from || to)
                  ? `${(from || '처음').replace(/-/g, '/')} ~ ${(to || '끝').replace(/-/g, '/')}`
                : '전체 기간'}
            </div>
            <table className="w-full text-left table-fixed">
              <thead>
                <tr>
                  <th className="w-[2.9%]"></th>
                  <th className="w-[11.6%] text-center">일자(요일)</th>
                  <th className="w-[6.4%] text-center">시작시간</th>
                  <th className="w-[6.4%] text-center">종료시간</th>
                  <th className="w-[18.5%]">참석자성명</th>
                  <th className="w-[34.7%]">제목</th>
                  <th className="w-[19.7%]">장소</th>
                </tr>
              </thead>
              <tbody>
                {shown.length === 0 ? (
                  <tr><td colSpan={7} className="text-center text-ec-ink">등록된 데이터가 없습니다.</td></tr>
                ) : shown.map((r, i) => (
                  <tr key={r.id}>
                    <td onClick={() => toggle(r.id)} title="눌러서 선택 (하단 [선택삭제])"
                        className={`text-center cursor-pointer ${selected.has(r.id)
                          ? 'bg-ec-blue-wash text-ec-navy font-bold' : 'bg-ec-stripe text-ec-hint'}`}>
                      {i + 1}
                    </td>
                    <td className="text-center">
                      {r.eventDate.replace(/-/g, '/')}({DOW[new Date(r.eventDate).getDay()]})
                    </td>
                    <td className="text-center">{r.startTime ?? ''}</td>
                    <td className="text-center">{r.endTime ?? ''}</td>
                    <td>{r.attendees ?? ''}</td>
                    <td>
                      <button type="button" className="no-ec bg-transparent border-0 p-0 cursor-pointer text-left text-ec-navy"
                              onClick={() => setViewing(r)}>{r.title}</button>
                    </td>
                    <td>{r.location ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {showCategories && <ScheduleCategoryModal onClose={() => { setShowCategories(false); void loadCategories() }}
                                                onPick={(c) => { setCategoryCode(c.code); set('category', c.name); setShowCategories(false); void loadCategories() }} />}
      {showLabels && <LabelMasterModal board="SCHEDULE" endpoint="/schedule-labels" title={showForm ? '라벨검색' : '라벨조회'}
                                       onPick={showForm ? (l) => { set('labelText', l.name); setShowLabels(false); void loadLabels() } : undefined}
                                       onClose={() => { setShowLabels(false); void loadLabels(); void load() }} />}
    </EcListShell>
  )
}
