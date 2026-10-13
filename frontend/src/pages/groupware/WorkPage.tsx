import { Fragment, useEffect, useRef, useState } from 'react'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import { exportTableToXlsx } from '../../utils/excel'
import { openPrintWindow, fillAndPrint } from '../../utils/print'
import { escapeHtml } from '../../utils/escapeHtml'
import LabelChip from '../../features/board/components/LabelChip'
import LabelMasterModal from '../../features/board/components/LabelMasterModal'
import { fetchLabels, type BoardLabel } from '../../features/board/labels'
import Modal from '../../components/Modal'
import { api, extractErrorMessage } from '../../api/client'
import type { WorkPost } from '../../types/api'
import EcPeriodPicks, { ymd, BOARD_PICKS } from '../../components/EcPeriodPicks'
import UserPickModal from '../../features/schedule/components/UserPickModal'
import { useShortcut } from '../../utils/useShortcut'
import { downloadStoredFile, formatBytes } from '../../utils/fileDownload'
import EcFileDrop from '../../components/EcFileDrop'
import { dateText } from '../../utils/dateText'
import { requireSelection } from '../../components/EcDialog'
import EcKanban, { type KanbanCard, type KanbanTone } from '../../components/EcKanban'

const today = () => ymd(new Date())

/**
 * 원본 목록 오른쪽 위의 조회 기간(= 조건 판 [게시일]의 기본값).
 * - yearBack: 오늘부터 1년 전 같은 날까지(WORK · 공지사항, 2026-10-03 실측 2025/10/03 ~ 2026/10/03).
 * - lastYear: 전년 1/1 ~ 12/31(통합게시판, 2026-10-13 실측 2025/01/01 ~ 2025/12/31 — 올해 쓴 글은
 *   [Search(F3)] → [금년] 으로 봐야 보인다. 원본 그대로다).
 */
function defaultPeriod(kind: 'yearBack' | 'lastYear') {
  const d = new Date()
  if (kind === 'lastYear') return { from: `${d.getFullYear() - 1}-01-01`, to: `${d.getFullYear() - 1}-12-31` }
  const back = new Date(d)
  back.setFullYear(d.getFullYear() - 1)
  return { from: ymd(back), to: ymd(d) }
}

/** 전달자 · 참조자 칸에 든 이름들. 서버에는 ', ' 로 이어 한 글자열로 간다(전체 = null). */
const splitNames = (v: string | null | undefined) => (v ?? '').split(',').map((x) => x.trim()).filter(Boolean)

const WEEK = ['일', '월', '화', '수', '목', '금', '토']

/** 원본 View 머리줄의 작성 일시: '2026/10/03 (토) 오후 12:53:08'. */
function stampText(iso?: string | null) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const h = d.getHours()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${dateText(ymd(d))} (${WEEK[d.getDay()]}) ${h < 12 ? '오전' : '오후'} ${h % 12 === 0 ? 12 : h % 12}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

/** forwardAll: 원본 [전달자] 의 '전체'(켬) / '선택'(이름을 고른다). */
type Form = {
  title: string; content: string; forwardAll: boolean; forwardTo: string[]; ccTo: string[]; notice: boolean; postDate: string; stage: string
  /** 통합회의록 [주 차 구분] 1 ~ 5 · 부서 칸마다 이은 팀별회의록 글 id(MINUTE_TEAMS 차례). */
  weekNo: number | null; links: (number | null)[]
  /** 업무관리 예시 게시판의 입력항목(이름 → 값). BoardCfg.extras. */
  extra: Record<string, string>
  /** 간판제작 [프로젝트] · [칸반연결](📅 프로젝트 진행현황 칸반 글 id). */
  project: string; kanbanPostId: number | null
}
const emptyForm = (stage = ''): Form => ({
  title: '', content: '', forwardAll: true, forwardTo: [], ccTo: [], notice: false, postDate: today(), stage, weekNo: null, links: [null, null, null, null], extra: {},
  project: '', kanbanPostId: null,
})

export type PostBoardCode = 'WORK' | 'NOTICE' | 'SHARED' | 'MEETING' | 'SIGN' | 'MINUTES'
  | 'AI_GUIDE' | 'SITE_LOG' | 'SITE_STATUS' | 'DEV_LOG' | 'DEV_STATUS'
  | 'CONSULT' | 'VISIT' | 'CONTRACT' | 'AS_CARE' | 'CAR_INFO' | 'CAR_DOC' | 'CAR_RUN'
  | 'KANBAN_SAMPLE' | 'PROJECT_KANBAN'

/**
 * 격자 열(업무관리 예시 게시판 — 원본은 게시판마다 열을 고른다). 'x:이름' 은 입력항목 값, 'x:이름|머리' 는 머리 글자가 다를 때.
 * 행머리(선택) · 첨부 · 조회는 늘 앞뒤에 붙는다.
 */
type Col = 'no' | 'dateNo' | 'title' | 'writer' | 'forward' | 'stage' | 'postDate' | `x:${string}`
/** 입력 창의 게시판별 입력항목. 원본 '항목추가' 로 회사가 고른 칸이다. */
type Extra = { name: string; type: 'text' | 'date' }

/**
 * 통합회의록(E200066, 2026-10-13 실측)의 부서 칸 — 격자 머리 '경영지원팀 회의록 · 구매팀 회의록 · 생산팀 회의록 · 영업팀 회의록',
 * View 의 '경영지원팀(클릭)' …. 칸마다 🔍 '팀별회의록 게시판검색창' 에서 글을 하나 [적용] 한다.
 */
const MINUTE_TEAMS = ['경영지원팀', '구매팀', '생산팀', '영업팀']
/** 원본 '주차검색': 코드 1 ~ 5, 항목명 '1주차' …. */
const WEEKS = [1, 2, 3, 4, 5]

/**
 * 게시판마다 다른 것(2026-10-13 원본 실측).
 * - wide: E0725xx 꼴(통합게시판 · 간판제작) — 머리 '번호' · '작성자', 전달자 뒤에 [완료일] 열이 있다.
 *   E2000xx 꼴(WORK · 공지사항 · 팀별회의록)은 '게시글번호' · '작성자명', 완료일 열이 없다.
 * - stages: 회사가 정한 진행상태 이름(서버 stage). null 이면 WORK 의 진행중/완료.
 * - labels: [라벨] · [라벨변경] · [라벨설정] 이 있는가(통합게시판에는 없다).
 * - stageLabel: 진행상태 자리의 이름(팀별회의록은 '부서구분'). defaultStage: 새 글의 진행상태(안 주면 stages[0]).
 */
type BoardCfg = {
  wide: boolean; stages: string[] | null; labels: boolean; period: 'yearBack' | 'lastYear'
  stageLabel?: string; defaultStage?: string
  /** 통합회의록 꼴: 작성자 · 전달자 · 진행상태 열 대신 부서 회의록 넷 · 주 차, 입력 창에 부서 칸 · [주 차 구분]. */
  minutes?: boolean
  /** 업무관리 예시 게시판: 격자 열 차례(없으면 wide · minutes 로 정한 예전 꼴). */
  cols?: Col[]
  /** 업무관리 예시 게시판: 입력 창의 게시판별 입력항목. */
  extras?: Extra[]
  /** 알약 끝의 '진행상태를 자유롭게 추가 가능합니다' (원본 공지사항 · 계약관리 · 차량관리 게시판). */
  freePill?: boolean
  /** 본문 없이 저장되는가(서버 PostBoard#contentOptional). */
  contentOptional?: boolean
  /**
   * 목록이 표가 아니라 칸반 판(🔸 칸반보드 활용 예시 🔸 E200190). order = 판의 열 차례(입력 창 고르기 차례 stages 와 다르다),
   * tones = 열마다 카드 색, closed = 제목이 빨간 끝난 열. 알약 · 기간 글자가 없다.
   */
  kanban?: { order: string[]; tones: Record<string, KanbanTone>; closed: string[] }
  /** 새 글 본문에 미리 채우는 양식. */
  template?: string
  /** 카드 아랫줄에 보일 입력항목 이름(칸반). */
  subField?: string
}
/** 원본 '계약관리 게시판(예시)' 셋 — 진행상태 '기본' 하나, 격자는 공지사항과 같은 꼴(2026-10-14 실측). */
const PLAIN_COLS: Col[] = ['no', 'title', 'writer', 'forward', 'stage']
const SAMPLE = { wide: false, period: 'lastYear', contentOptional: true } as const
const BOARD_CFG: Record<PostBoardCode, BoardCfg> = {
  WORK: { wide: false, stages: null, labels: true, period: 'yearBack' },
  NOTICE: { wide: false, stages: ['기본'], labels: true, period: 'yearBack' },
  SHARED: { wide: true, stages: ['Default'], labels: false, period: 'lastYear' },
  /*
   * 팀별회의록 게시판(E200068, 2026-10-13 실측): 알약 [전체][경영지원팀][구매팀][생산팀][영업팀][항목을 자유롭게 추가 할 수 있습니다.],
   * 격자 머리 '부서구분', 입력 창 [부서구분] 의 처음 값이 '항목을 자유롭게 추가 할 수 있습니다.' 다. 기본 기간 전년.
   */
  MEETING: {
    wide: false, labels: true, period: 'lastYear', stageLabel: '부서구분',
    stages: ['경영지원팀', '구매팀', '생산팀', '영업팀', '항목을 자유롭게 추가 할 수 있습니다.'],
    defaultStage: '항목을 자유롭게 추가 할 수 있습니다.',
  },
  /* 간판제작 프로젝트관리(E200070, 2026-10-13 실측): 알약 [전체][수주견적][디자인팀 시안][자재발주, 제작][현장시공], 기본 기간 전년. */
  SIGN: { wide: true, stages: ['수주견적', '디자인팀 시안', '자재발주, 제작', '현장시공'], labels: true, period: 'lastYear' },
  /*
   * 통합회의록(E200066, 2026-10-13 직접 등록 · 수정 · 삭제): 알약 [전체][진행중][완료], 기본 기간 전년, 라벨 없음.
   * 격자 게시글번호 · 제목 · 경영지원팀 회의록 · 구매팀 회의록 · 생산팀 회의록 · 영업팀 회의록 · 주 차 · 첨부 · 조회.
   */
  MINUTES: { wide: false, stages: null, labels: false, period: 'lastYear', minutes: true, contentOptional: true },
  /*
   * 업무관리 의 예시 게시판(2026-10-14 loginaa 목록 · 입력 창 실측). 원본 목록의 글은 모두 '이카운트' 가 쓴 예시라
   * 우리 쪽은 빈 게시판으로 시작한다. 원본에서 🚗 1. 차량 정보관리에 제목만 넣고 저장 → 저장됨(본문 없이), 번호는 그 게시판 혼자 센다.
   */
  // 🔹 이카운트 AI 활용 예시 🔹 (E200188): 게시글번호 · 제목 · 작성자명 · 첨부 · 조회, 알약 진행중 · 완료, 기본 기간 최근 1년, 라벨 없음.
  AI_GUIDE: { ...SAMPLE, period: 'yearBack', stages: null, labels: false, cols: ['no', 'title', 'writer'] },
  // 🏗️ 현장공사일지 (E200176): 게시글번호 · 현장명 · 제목 · 작성자명 · 전달자 · 공정 흐름. 입력 창 [공정 흐름] 처음 값 '측량'.
  SITE_LOG: {
    ...SAMPLE, labels: true, stageLabel: '공정 흐름', stages: ['지반조사', '측량', '기초굴토', '가설'], defaultStage: '측량',
    cols: ['no', 'x:현장명', 'title', 'writer', 'forward', 'stage'], extras: [{ name: '현장명', type: 'text' }],
  },
  // 📊 공사진행현황 (E200178): 일자-No. · 게시글번호 · 제목 · 작성자명 · 전달자 · 진행상태, 알약 진행중 · 완료, 라벨 없음.
  SITE_STATUS: { ...SAMPLE, stages: null, labels: false, cols: ['dateNo', 'no', 'title', 'writer', 'forward', 'stage'] },
  // 📅 개발업무일지 (E200174): 게시글번호 · 프로젝트명 · 제목 · 작성자명 · 진행상태. 입력 창 [진행상태] 처음 값 '기획', 거래처 · 프로젝트 · 담당자 · 비고.
  DEV_LOG: {
    ...SAMPLE, labels: true, stages: ['요구분석', '기획', '디자인', '개발', '테스트', '디버깅', '오픈(완료)'], defaultStage: '기획',
    cols: ['no', 'x:프로젝트|프로젝트명', 'title', 'writer', 'stage'],
    extras: [{ name: '거래처', type: 'text' }, { name: '프로젝트', type: 'text' }, { name: '담당자', type: 'text' }, { name: '비고', type: 'text' }],
  },
  // 📈 개발진행현황 (E200186): 게시글번호 · 제목 · 전달자 · 일자 · 작성자명 · 진행상태, 알약 진행중 · 완료.
  DEV_STATUS: { ...SAMPLE, stages: null, labels: true, cols: ['no', 'title', 'forward', 'postDate', 'writer', 'stage'] },
  // 계약관리 게시판(예시) 🎧 · 🤝🏻 · 📑 (E200166 · E200168 · E200170): 알약 [전체][기본][진행상태를 자유롭게 추가 가능합니다].
  CONSULT: { ...SAMPLE, labels: true, stages: ['기본'], freePill: true, cols: PLAIN_COLS },
  VISIT: { ...SAMPLE, labels: true, stages: ['기본'], freePill: true, cols: PLAIN_COLS },
  CONTRACT: { ...SAMPLE, labels: true, stages: ['기본'], freePill: true, cols: PLAIN_COLS },
  // 🛠️ A/S 관리 (E200184): 게시글번호 · 수리요청일 · 제목 · 작성자명 · 전달자 · 진행상태, 알약 [전체][기본].
  AS_CARE: {
    ...SAMPLE, labels: true, stages: ['기본'], cols: ['no', 'x:수리요청일', 'title', 'writer', 'forward', 'stage'],
    extras: [{ name: '수리요청일', type: 'date' }],
  },
  // 🚗 1. 차량 정보관리 (E200172): 게시글번호 · 제목 · 차량번호 · 출고일자 · 작성자명 · 전달자 · 진행상태. 입력 창 제목 아래 [출고일자] · [차량번호].
  CAR_INFO: {
    ...SAMPLE, labels: true, stages: null, freePill: true, cols: ['no', 'title', 'x:차량번호', 'x:출고일자', 'writer', 'forward', 'stage'],
    extras: [{ name: '출고일자', type: 'date' }, { name: '차량번호', type: 'text' }],
  },
  // 🚗 2. 차량 증빙관리 (E200180): 공지사항 꼴, 알약 진행중 · 완료 + 자유롭게 추가.
  CAR_DOC: { ...SAMPLE, labels: true, stages: null, freePill: true, cols: PLAIN_COLS },
  // 🚗 3. 차량 운행관리 (E200182): 게시글번호 · 제목 · 차량증빙 · 차량정보 · 작성자명 · 진행상태, 라벨 없음.
  CAR_RUN: { ...SAMPLE, labels: false, stages: null, freePill: true, cols: ['no', 'title', 'x:차량증빙', 'x:차량정보', 'writer', 'stage'] },
  /*
   * 🔸 칸반보드 활용 예시 🔸 (E200190, 2026-10-14 실측): 목록 = 칸반 판(열 = 진행상태 7 + 건수), 조건 판 게시일 최근 1년.
   * 입력 창 [진행상태] 처음 값 '신규문의' · 고르기 차례는 '견적' 이 맨 앞(판 열 차례와 다르다) · 본문 '*고객정보*' 양식 · [담당자].
   */
  KANBAN_SAMPLE: {
    ...SAMPLE, period: 'yearBack', labels: true, defaultStage: '신규문의',
    stages: ['견적', '직접 test 해보세요', '신규문의', '고객요청사항', '고객사 미팅', '계약-개발팀 인계', '진행안함'],
    kanban: {
      order: ['직접 test 해보세요', '신규문의', '고객요청사항', '고객사 미팅', '견적', '계약-개발팀 인계', '진행안함'],
      tones: { '직접 test 해보세요': 'pink', 신규문의: 'yellow', 고객요청사항: 'yellow', '고객사 미팅': 'yellow', 견적: 'yellow', '계약-개발팀 인계': 'yellow', 진행안함: 'plain' },
      closed: ['진행안함'],
    },
    extras: [{ name: '담당자', type: 'text' }], subField: '담당자',
    template: '*고객정보*\n\n회사명:\n업종:\n담당자/직급:\n연락처:\n주소:\n기존 프로그램:\n니즈:\n\n영업 담당자는 담당자에 본인 이름을 걸어주시고, 진행중 라벨을 달아주세요.\n고객 리드 건 진행 상황은 답글 형태로 남겨주세요.',
  },
  /*
   * 📅 프로젝트 진행현황 칸반 (E200072, 2026-10-13 실측): 간판제작과 같은 E0725xx 꼴(번호 · 제목 · 작성자 · 전달자 · 완료일 · 진행상태),
   * 알약 진행중 · 완료, 기본 기간 전년. 글 View 본문이 칸반 판 — 이 글에 [칸반연결] 한 간판제작 글(열 = [프로젝트], 줄 = 진행상태).
   */
  PROJECT_KANBAN: { wide: true, stages: null, labels: true, period: 'lastYear' },
}

/** 서버가 진행상태 이름을 stage 에 적는 게시판(PostBoard#namedStages). */
const NAMED_STAGE_BOARDS = new Set<PostBoardCode>(['SHARED', 'MEETING', 'SIGN', 'SITE_LOG', 'DEV_LOG', 'CONSULT', 'VISIT', 'CONTRACT', 'AS_CARE', 'KANBAN_SAMPLE'])
const colHead = (c: Col, stageLabel: string) => {
  if (c.startsWith('x:')) { const [k, h] = c.slice(2).split('|'); return h ?? k }
  return ({ no: '게시글번호', dateNo: '일자-No.', title: '제목', writer: '작성자명', forward: '전달자', stage: stageLabel, postDate: '일자' } as Record<string, string>)[c]
}
function parseExtra(json?: string | null): Record<string, string> {
  if (!json) return {}
  try { const o = JSON.parse(json); return o && typeof o === 'object' ? o : {} } catch { return {} }
}

/**
 * 게시판 목록 화면. 원본은 게시판을 여러 개 두고 게시글을 그 아래 다는데,
 * 화면 모양은 게시판마다 똑같다 — 업무관리 &gt; WORK 와 공유정보 &gt; 공지사항이 그렇다.
 * 게시글번호도 게시판을 가로질러 한 줄기여서 목록 번호에 구멍이 보인다.
 *
 * 그래서 한 컴포넌트가 board 만 바꿔 두 화면을 낸다(내결재관리·기안서통합관리와 같은 방식).
 *
 * <p><b>2026-10-03 원본 공지사항(E200080)을 직접 쓰며 다시 맞췄다.</b>
 * <ul>
 *   <li>격자는 <b>게시글번호 · 제목 · 작성자명 · 전달자 · 진행상태 · 첨부 · 조회</b>다. [일자-No.]는 목록에 없고
 *       글을 연 View 안에만 있다 — 우리는 목록 첫 열에 두고 있었다.</li>
 *   <li>[공지사항여부]를 켠 글은 목록 <b>맨 위에 한 번 더</b> 붙는다(행번호 없이, 옅은 노랑 바탕). 아래 번호 붙은
 *       목록에도 그대로 남는다. 우리는 제목 앞에 빨간 [공지] 글자만 달았다.</li>
 *   <li>제목을 누르면 <b>'공지사항View' 창</b>이 뜬다 — 머리줄 '16 | 제목 | 작성자 | 2026/10/03 (토) 오후 12:53:08',
 *       그 아래 일자-No.·첨부와 본문, 하단 [수정]·[삭제]·[닫기]·[인쇄]. 우리는 목록 안에서 펼쳤다.
 *       [모두펼쳐보기]만 목록 안에서 편다(원본도 그 버튼은 목록 안에서 편다).</li>
 *   <li>[수정]은 입력 창을 '…입력(수정)' 으로 다시 띄운다. [삭제]는 '삭제하겠습니까?' 를 묻는다.</li>
 *   <li>[인쇄]는 목록 하단이 아니라 View 안에 있다 — 글 한 건을 찍는다.</li>
 * </ul>
 *
 * <p>답글·복사·보내기·업무지원AI·라벨·이력조회는 받쳐 줄 것이 없어 만들지 않는다 — 눌러도
 * 아무 일 없는 버튼은 있는 것만 못하다.
 */
export default function WorkPage({ board = 'WORK', title = 'WORK' }: { board?: PostBoardCode; title?: string } = {}) {
  const cfg = BOARD_CFG[board]
  /** 서버가 stage 를 적는 게시판(공지사항의 '기본'은 화면에서만 붙이는 이름이라 뺀다). */
  const namedStages = NAMED_STAGE_BOARDS.has(board)
  const colCount = cfg.cols ? cfg.cols.length + 3 : cfg.minutes ? 10 : cfg.wide ? 9 : 8
  const [rows, setRows] = useState<WorkPost[]>([])
  const [tab, setTab] = useState<string>('전체')
  /*
   * 진행상태는 게시판마다 회사가 정한다(원본 '진행상태를 자유롭게 추가 가능합니다'). 2026-10-03 원본 공지사항은
   * 상태가 <b>'기본' 하나</b> — 알약 [전체][기본], 모든 줄의 진행상태 '기본'. WORK 는 진행중 · 완료 그대로.
   * 우리 서버의 상태(진행중/완료)는 WORK 의 것이라 공지사항에서는 쓰지 않고 '기본' 으로 보인다.
   */
  const statuses: string[] = cfg.stages ?? ['진행중', '완료']
  const firstStage = cfg.defaultStage ?? cfg.stages?.[0] ?? ''
  const stageLabel = cfg.stageLabel ?? '진행상태'
  const statusOf = (r: WorkPost) => (board === 'NOTICE' ? '기본' : namedStages ? (r.stage ?? firstStage) : r.statusName)
  const [keyword, setKeyword] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  /** 입력 창. editId 가 있으면 '…입력(수정)'. */
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<number | null>(null)
  const [form, setForm] = useState<Form>(emptyForm)
  /** 글에 붙일 파일. 원본 [웹자료올리기]·[여기에 파일 놓기]. */
  const [attachment, setAttachment] = useState<{ id: number; name: string } | null>(null)
  const [uploading, setUploading] = useState(false)
  // 원본 하단의 [진행상태변경]·[선택삭제]는 고른 글에 한꺼번에 하는 동작이다.
  // 고르는 방식은 다른 목록과 같다 — 회색 행번호 칸을 누른다.
  const [selected, setSelected] = useState<Set<number>>(new Set())
  /** [모두펼쳐보기]로 목록 안에 펴 놓은 글. */
  const [opened, setOpened] = useState(false)
  /** View 창에 띄운 글. */
  const [viewing, setViewing] = useState<WorkPost | null>(null)
  /** 통합회의록이 잇는 팀별회의록 게시판 글(부서 칸 제목 · View 의 펼친 본문 · 🔍 검색창). */
  const [meetingPosts, setMeetingPosts] = useState<WorkPost[]>([])
  /** 🔍 '팀별회의록 게시판검색창' 을 띄운 부서 칸(MINUTE_TEAMS 의 차례). */
  const [linkPickFor, setLinkPickFor] = useState<number | null>(null)
  const [linkTab, setLinkTab] = useState('전체')
  const [weekMenu, setWeekMenu] = useState(false)
  /** View 에서 펼친 부서 칸('경영지원팀(클릭)'). */
  const [openTeams, setOpenTeams] = useState<Set<number>>(new Set())
  /** 간판제작 ↔ 📅 프로젝트 진행현황 칸반: 간판제작 입력 창 [칸반연결] 후보 · 칸반 글 View 판의 카드(간판제작 글과 그 라벨 색). */
  const [kanbanPosts, setKanbanPosts] = useState<WorkPost[]>([])
  const [signPosts, setSignPosts] = useState<WorkPost[]>([])
  const [signLabels, setSignLabels] = useState<BoardLabel[]>([])
  /** View 칸반 판에서 고른 카드 · [카드접기]. */
  const [boardPick, setBoardPick] = useState<Set<number>>(new Set())
  const [cardsFolded, setCardsFolded] = useState(false)
  /** View 칸반 판에서 누른 카드(간판제작 글) — 판 아래에 제목 · 본문을 편다. */
  const [cardView, setCardView] = useState<WorkPost | null>(null)
  const meetingTitle = (id: number | null | undefined) => (id == null ? '' : meetingPosts.find((m) => m.id === id)?.title ?? '')

  /*
   * 조회 기간 — 원본 [Search(F3)] 를 검색창이 빈 채로 누르면 내려오는 조건 판의 [게시일]. 판에서 고친 값은
   * [검색(F8)] 을 눌러야 목록에 걸린다(원본도 그렇다).
   */
  const [period, setPeriod] = useState(() => defaultPeriod(cfg.period))
  const { from, to } = period
  const [condOpen, setCondOpen] = useState(false)
  const [cond, setCond] = useState({ from: period.from, to: period.to, title: '' })
  const [titleFilter, setTitleFilter] = useState('')
  useEffect(() => {
    const p = defaultPeriod(BOARD_CFG[board].period)
    setPeriod(p)
    setCond({ ...p, title: '' })
    setTitleFilter('')
  }, [board])
  function applyCond() {
    setPeriod({ from: cond.from, to: cond.to })
    setTitleFilter(cond.title.trim())
    setCondOpen(false)
    void load()
  }
  /** 원본 [Search(F3)] — 검색창이 비었으면 조건 판을 내리고, 글자가 있으면 그 글자로 찾는다. */
  function onSearch() {
    if (!keyword.trim()) { setCondOpen((v) => !v); return }
    void load()
  }

  /** 원본 화면 안 '알림' 창 — '삭제하겠습니까?' [확인][취소]. 브라우저 confirm 대신. ids 가 지울 글. */
  const [confirmIds, setConfirmIds] = useState<number[] | null>(null)
  /** 전달자 · 참조자 🔍 '사용자검색' 창. */
  const [pickFor, setPickFor] = useState<'forwardTo' | 'ccTo' | null>(null)
  /** 전달자 '전체 / 선택' 고르기 판. */
  const [forwardMenu, setForwardMenu] = useState(false)
  /** 하단 [진행상태변경 ▲] 의 진행상태 목록 판. */
  const [stageMenu, setStageMenu] = useState(false)
  /** 바깥 기능 버튼(보내기 · 업무지원AI · 이력조회 · 웹자료올리기)을 눌렀을 때의 안내. */
  const [info, setInfo] = useState('')

  /** 원본 '라벨조회' 의 라벨 마스터(코드 · 이름 · 색). */
  const [labelMaster, setLabelMaster] = useState<BoardLabel[]>([])
  const [masterOpen, setMasterOpen] = useState(false)

  // Search(F3) — 버튼 라벨이 약속한 단축키. 창이 떠 있을 때는 뒤 화면이 바뀌면 안 된다.
  useShortcut('F3', onSearch, !showForm && !viewing && !masterOpen && !condOpen)
  useShortcut('F8', applyCond, condOpen && !showForm && !viewing)
  useShortcut('F2', openNew, !showForm && !viewing && !masterOpen)
  useShortcut('F8', () => void submit(), showForm)

  const colorOf = (name: string) => labelMaster.find((l) => l.name === name)?.color

  async function load() {
    setLoading(true)
    try {
      const none = Promise.resolve([] as WorkPost[])
      const [r, labs, meet, kan, sign, signLabs] = await Promise.all([
        api.get<WorkPost[]>('/work-posts', { params: { board } }),
        cfg.labels ? fetchLabels(board) : Promise.resolve([] as BoardLabel[]),
        cfg.minutes ? api.get<WorkPost[]>('/work-posts', { params: { board: 'MEETING' } }).then((x) => x.data) : none,
        board === 'SIGN' ? api.get<WorkPost[]>('/work-posts', { params: { board: 'PROJECT_KANBAN' } }).then((x) => x.data) : none,
        board === 'PROJECT_KANBAN' ? api.get<WorkPost[]>('/work-posts', { params: { board: 'SIGN' } }).then((x) => x.data) : none,
        board === 'PROJECT_KANBAN' ? fetchLabels('SIGN') : Promise.resolve([] as BoardLabel[]),
      ])
      setRows(r.data)
      setLabelMaster(labs)
      setMeetingPosts(meet)
      setKanbanPosts(kan)
      setSignPosts(sign)
      setSignLabels(signLabs)
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [board])

  /**
   * View 창을 연다. <b>열 때만</b> 조회수를 올린다 — 목록을 부르는 것만으로 올리면
   * 화면을 열 때마다 모든 글이 같이 올라가서 그 숫자가 '몇 명이 봤나' 를 뜻하지 않게 된다.
   */
  function openView(r: WorkPost) {
    setViewing(r)
    setBoardPick(new Set())
    setCardView(null)
    setOpenTeams(new Set())
    api.post<WorkPost>(`/work-posts/${r.id}/read`)
      .then((res) => {
        setRows((prev) => prev.map((x) => (x.id === r.id ? res.data : x)))
        setViewing((v) => (v && v.id === r.id ? res.data : v))
      })
      .catch(() => { /* 조회수는 곁다리다 — 실패해도 글은 보인다. */ })
  }

  function openNew() {
    setEditId(null)
    // 원본 통합회의록 입력 창은 제목에 오늘 날짜가 미리 들어 있다('2026/10/13 ').
    setForm({ ...emptyForm(), title: cfg.minutes ? `${dateText(today())} ` : '', content: cfg.template ?? '' })
    setAttachment(null)
    setError('')
    setShowForm(true)
  }

  /** 원본 View 의 [수정] — 같은 입력 창을 '…입력(수정)' 으로 띄운다. */
  function openEdit(r: WorkPost) {
    setViewing(null)
    setEditId(r.id)
    setForm({
      title: r.title, content: r.content,
      forwardAll: !r.forwardTo, forwardTo: splitNames(r.forwardTo), ccTo: splitNames(r.ccTo),
      notice: r.notice, postDate: r.postDate, stage: r.stage ?? '',
      weekNo: r.weekNo ?? null,
      links: MINUTE_TEAMS.map((_, i) => r.meetingLinks?.[i] ?? null),
      extra: parseExtra(r.extraFields),
      project: r.project ?? '', kanbanPostId: r.kanbanPostId ?? null,
    })
    setAttachment(r.attachmentId ? { id: r.attachmentId, name: r.attachmentName ?? '첨부' } : null)
    setError('')
    setShowForm(true)
  }

  /** [삭제] — 먼저 '알림' 창으로 묻는다. 지우는 일은 [확인] 에서(doDelete). */
  function removeOne(id: number) { setConfirmIds([id]) }

  async function doDelete() {
    const ids = confirmIds ?? []
    setConfirmIds(null)
    for (const id of ids) {
      try {
        await api.delete(`/work-posts/${id}`)
      } catch (err) {
        setError(extractErrorMessage(err))
      }
    }
    setViewing(null)
    setShowForm(false)
    setEditId(null)
    setSelected(new Set())
    load()
  }

  function set<K extends keyof Form>(k: K, v: Form[K]) { setForm((f) => ({ ...f, [k]: v })) }

  /** 파일을 먼저 올려 id 를 받고, 글을 저장할 때 그 id 를 붙인다(기안서와 같은 방식). */
  async function upload(file: File) {
    setUploading(true)
    setError('')
    try {
      const fd = new FormData()
      fd.append('file', file)
      const r = await api.post<{ id: number; name: string }>('/files', fd)
      setAttachment({ id: r.data.id, name: r.data.name })
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setUploading(false)
    }
  }

  async function submit() {
    setError('')
    if (!form.title.trim()) return setError('제목을 입력하세요.')
    // 통합회의록은 내용 없이도 저장된다(원본 2026-10-13 — 부서 칸 · 주 차만 넣고 저장).
    if (!cfg.contentOptional && !form.content.trim()) return setError('내용을 입력하세요.')
    if (!form.forwardAll && form.forwardTo.length === 0) return setError('전달자를 선택하세요.')
    const common = {
      title: form.title, content: form.content,
      // 전달자 '전체' 는 null 로 둔다. 알림은 보내지 않는다 — 우리는 누구에게 전달했는지 적어 두기만 한다.
      forwardTo: form.forwardAll ? null : form.forwardTo.join(', '),
      ccTo: form.ccTo.length ? form.ccTo.join(', ') : null,
      notice: form.notice,
      stage: namedStages ? (form.stage || firstStage) : null,
      // 수정은 통째로 덮는다 — 첨부를 안 보내면 서버가 뗀다(예전 수정이 그래서 첨부를 잃었다).
      attachmentId: attachment ? attachment.id : null,
      weekNo: cfg.minutes ? form.weekNo : null,
      meetingLinks: cfg.minutes ? form.links : null,
      extraFields: cfg.extras && Object.values(form.extra).some((v) => v.trim())
        ? JSON.stringify(Object.fromEntries(cfg.extras.map((x) => [x.name, (form.extra[x.name] ?? '').trim()]).filter(([, v]) => v)))
        : null,
      project: board === 'SIGN' ? form.project.trim() || null : null,
      kanbanPostId: board === 'SIGN' ? form.kanbanPostId : null,
    }
    try {
      if (editId != null) {
        // 원본: 수정 저장 뒤에는 목록이 아니라 그 글의 View 로 돌아간다(2026-10-13 실측).
        const res = await api.put<WorkPost>(`/work-posts/${editId}`, common)
        setShowForm(false)
        setEditId(null)
        setViewing(res.data)
      } else {
        await api.post('/work-posts', { ...common, board, postDate: form.postDate })
        setShowForm(false)
      }
      load()
    } catch (err) {
      setError(extractErrorMessage(err))
    }
  }

  const toggleSelect = (id: number) => setSelected((prev) => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id); else next.add(id)
    return next
  })

  /**
   * 원본 [진행상태변경 ▲] — 위로 진행상태 목록이 펴지고, 하나를 누르면 고른 글이 모두 그 상태가 된다.
   * 회사가 정한 이름(통합게시판 · 팀별회의록 · 간판제작)은 stage 로, WORK 는 진행중/완료(status)로 보낸다.
   */
  function openStageMenu() {
    if (shown.every((r) => !selected.has(r.id))) return setError('상태를 바꿀 글을 고르세요. 행번호 칸을 누르면 선택됩니다.')
    setStageMenu((v) => !v)
  }
  async function changeStatusSelected(target: string) {
    setStageMenu(false)
    const targets = shown.filter((r) => selected.has(r.id))
    for (const r of targets) {
      try {
        // enum 값은 IN_PROGRESS 다. 'ONGOING' 을 보내면 400 이 난다(직접 시험해서 잡았다).
        await api.patch(`/work-posts/${r.id}/status`, namedStages
          ? { stage: target }
          : { status: target === '완료' ? 'DONE' : 'IN_PROGRESS' })
      } catch (err) {
        setError(extractErrorMessage(err))
      }
    }
    setSelected(new Set())
    load()
  }

  /*
   * 원본 [라벨변경](2026-10-03 실측): 글을 고르고 누르면 작은 판이 뜬다 — [전체] · 라벨마다 체크(여럿 고름),
   * 아래 ↵(적용) · +(라벨조회 창) · ×(닫기). 후보는 '라벨조회' 에서 회사가 정한 라벨(사용중단 뺌), 칩은 그 색
   * (2026-10-12 라벨 마스터를 만들어 이어 붙임).
   */
  const [labelOpen, setLabelOpen] = useState(false)
  const [labelPick, setLabelPick] = useState<Set<string>>(new Set())
  const knownLabels = labelMaster.filter((l) => l.active).map((l) => l.name)
  /**
   * 원본 제목줄 [라벨] — 펴면 전체 · 라벨없음 · 라벨마다 체크, ↵(적용) · +(라벨조회) · ×. 고른 라벨이 붙은 글만 본다.
   * null 이면 거르지 않는다(전체).
   */
  const [labelFilter, setLabelFilter] = useState<Set<string> | null>(null)
  const [filterOpen, setFilterOpen] = useState(false)
  const [filterPick, setFilterPick] = useState<Set<string>>(new Set())
  const NO_LABEL = '\u0000라벨없음'
  const filterKeys = [NO_LABEL, ...knownLabels]
  function openFilter() {
    setFilterPick(new Set(labelFilter ?? filterKeys))
    setFilterOpen((v) => !v)
  }
  function applyFilter() {
    setLabelFilter(filterKeys.every((k) => filterPick.has(k)) ? null : new Set(filterPick))
    setFilterOpen(false)
  }
  const passLabel = (r: WorkPost) => {
    if (!labelFilter) return true
    const ls = r.labels ?? []
    return ls.length === 0 ? labelFilter.has(NO_LABEL) : ls.some((l) => labelFilter.has(l))
  }
  function openLabels() {
    const targets = rows.filter((r) => selected.has(r.id))
    // 하나만 골랐으면 그 글의 라벨을 켜 두고 연다 — 고칠 때 지금 값에서 시작한다.
    setLabelPick(new Set(targets.length === 1 ? targets[0].labels ?? [] : []))
    setLabelOpen(true)
  }
  const togglePick = (l: string) => setLabelPick((p) => { const n = new Set(p); if (n.has(l)) n.delete(l); else n.add(l); return n })
  async function applyLabels() {
    const targets = rows.filter((r) => selected.has(r.id))
    for (const r of targets) {
      try { await api.patch(`/work-posts/${r.id}/labels`, { labels: knownLabels.filter((l) => labelPick.has(l)) }) }
      catch (err) { setError(extractErrorMessage(err)) }
    }
    setLabelOpen(false)
    setSelected(new Set())
    load()
  }

  /** 원본 '조회자 현황' — 왼쪽 미조회자, 오른쪽 조회자 [이름][최초조회일시][최종조회일시]. */
  const [readers, setReaders] = useState<{ readers: { name: string; firstReadAt: string; lastReadAt: string }[]; nonReaders: string[] } | null>(null)
  async function openReaders(r: WorkPost) {
    try { setReaders((await api.get(`/work-posts/${r.id}/readers`)).data) }
    catch (err) { setError(extractErrorMessage(err)) }
  }

  /** 원본 [선택삭제] */
  async function deleteSelected() {
    const targets = shown.filter((r) => selected.has(r.id))
    if (targets.length === 0) return setError('지울 글을 고르세요. 행번호 칸을 누르면 선택됩니다.')
    setConfirmIds(targets.map((r) => r.id))
  }

  async function doExcel() {
    const table = document.querySelector('#work-list table') as HTMLTableElement | null
    if (!table) return setError('내보낼 표가 없습니다.')
    if (!(await exportTableToXlsx(table, title))) setError('내보낼 자료가 없습니다.')
  }

  /** 원본 View 의 [인쇄] — 펼쳐 놓은 글 한 건을 찍는다. */
  function printPost(r: WorkPost) {
    const win = openPrintWindow()
    if (!win) return
    fillAndPrint(win, `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>${escapeHtml(r.title)}</title>
<style>body{font-family:sans-serif;font-size:12px;padding:24px}h1{font-size:14px;margin:0 0 8px}
.meta{margin-bottom:12px}.body{white-space:pre-wrap;border-top:1px solid;padding-top:12px}</style></head>
<body><h1>${escapeHtml(`${r.postNo} | ${r.title} | ${r.writerName ?? r.writer} | ${stampText(r.createdAt)}`)}</h1>
<div class="meta">일자-No. ${escapeHtml(`${dateText(r.postDate)} -1`)}${r.attachmentName ? ` · 첨부 ${escapeHtml(r.attachmentName)}` : ''}</div>
<div class="body">${escapeHtml(r.content)}</div></body></html>`)
  }

  const shown = rows
    .filter((r) => r.postDate >= from && r.postDate <= to)
    .filter((r) => tab === '전체' || statusOf(r) === tab)
    .filter(passLabel)
    .filter((r) => !titleFilter || r.title.includes(titleFilter))
    .filter((r) => !keyword || r.title.includes(keyword) || (r.writerName ?? r.writer).includes(keyword))
  /*
   * 원본(2026-10-03 같은 글 넷을 넣어 견줌): 번호 붙은 줄은 공지 여부와 상관없이 <b>새 글부터</b>(15 · 14 · 13 · 12),
   * 공지사항여부를 켠 글은 그와 별도로 맨 위에 한 번 더(행번호 없이, 역시 새 글부터). 서버는 공지를 앞에 세워 주는데
   * 그 차례를 그대로 쓰면 번호 줄에서도 공지가 위로 올라갔다(3 · 2 · 4 · 1).
   */
  const newestFirst = (a: WorkPost, b: WorkPost) =>
    a.postDate !== b.postDate ? (a.postDate < b.postDate ? 1 : -1) : b.postNo - a.postNo
  const numbered = [...shown].sort(newestFirst)
  const pinned = shown.filter((r) => r.notice).sort(newestFirst)
  /** 게시판마다 [완료일] 열이 붙었다 빠졌다 한다 — 머리 · 본문 · 빈 줄 칸 수를 개발 모드에서 본다. */
  const gridRef = useRef<HTMLDivElement>(null)
  useTableColumnCheck(gridRef, `${board} 게시판`, [shown.length, opened, loading, board])

  /** 격자 한 줄의 데이터 칸(게시글번호부터). 맨 위 공지 줄과 번호 붙은 줄이 같이 쓴다. */
  const cells = (r: WorkPost, pin: boolean) => {
    const bg = pin ? 'bg-ec-pinned' : ''
    if (cfg.cols) {
      const ex = parseExtra(r.extraFields)
      return (
        <>
          {cfg.cols.map((c) => {
            if (c === 'title') return (
              <td key={c} className={bg}>
                {cfg.labels && (r.labels ?? []).map((l) => <LabelChip key={l} name={l} color={colorOf(l)} className="mr-[4.5px]" />)}
                <button type="button" className="no-ec bg-transparent border-0 p-0 cursor-pointer text-left text-ec-navy"
                        onClick={() => openView(r)}>{r.title}</button>
              </td>
            )
            if (c.startsWith('x:')) {
              const v = ex[c.slice(2).split('|')[0]] ?? ''
              return <td key={c} className={`${bg}${/^\d{4}-\d\d-\d\d$/.test(v) ? ' text-center' : ''}`}>{/^\d{4}-\d\d-\d\d$/.test(v) ? dateText(v) : v}</td>
            }
            const text = c === 'no' ? r.postNo : c === 'dateNo' ? `${dateText(r.postDate)} -1` : c === 'writer' ? (r.writerName ?? r.writer)
              : c === 'forward' ? (r.forwardTo ?? '') : c === 'postDate' ? dateText(r.postDate) : statusOf(r)
            return <td key={c} className={`${bg}${c === 'stage' ? ' text-ec-navy' : ''}${c === 'postDate' || c === 'dateNo' ? ' text-center' : ''}`}>{text}</td>
          })}
          <td className={`${bg} text-center`}>
            {r.attachmentId && (
              <span title={`${r.attachmentName} (${formatBytes(r.attachmentSize ?? 0)})`}
                    onClick={() => void downloadStoredFile(r.attachmentId!, r.attachmentName ?? '첨부')}
                    className="cursor-pointer text-ec-blue">📎</span>
            )}
          </td>
          <td className={`${bg} text-center`}>
            <button type="button" className="no-ec bg-transparent border-0 p-0 cursor-pointer text-ec-navy"
                    title={`연 횟수 ${r.viewCount ?? 0}`} onClick={() => void openReaders(r)}>R</button>
          </td>
        </>
      )
    }
    return (
      <>
        <td className={bg}>{r.postNo}</td>
        <td className={bg}>
          {/* 원본 [라벨] 칩 — 제목 앞(여백 3.6 4.5 2.7 · 둥글기 10 · 오른쪽 4.5, 실측) */}
          {cfg.labels && (r.labels ?? []).map((l) => <LabelChip key={l} name={l} color={colorOf(l)} className="mr-[4.5px]" />)}
          <button type="button" className="no-ec bg-transparent border-0 p-0 cursor-pointer text-left text-ec-navy"
                  onClick={() => openView(r)}>
            {r.title}
          </button>
        </td>
        {cfg.minutes ? (
          <>
            {/* 원본 부서 칸 — 이은 팀별회의록 글의 제목(링크 아님) */}
            {MINUTE_TEAMS.map((t, i) => <td key={t} className={bg}>{meetingTitle(r.meetingLinks?.[i])}</td>)}
            <td className={bg}>{r.weekNo ? `${r.weekNo}주차` : ''}</td>
          </>
        ) : (
          <>
            <td className={bg}>{r.writerName ?? r.writer}</td>
            <td className={bg}>{r.forwardTo ?? ''}</td>
            {cfg.wide && <td className={`${bg} text-center`}>{r.completedAt ? dateText(r.completedAt.slice(0, 10)) : ''}</td>}
            <td className={`${bg} text-ec-navy`}>{statusOf(r)}</td>
          </>
        )}
        {/* 원본 [첨부]. 파일이 없으면 원본도 빈 칸이다. */}
        <td className={`${bg} text-center`}>
          {r.attachmentId && (
            <span title={`${r.attachmentName} (${formatBytes(r.attachmentSize ?? 0)})`}
                  onClick={() => void downloadStoredFile(r.attachmentId!, r.attachmentName ?? '첨부')}
                  className="cursor-pointer text-ec-blue">📎</span>
          )}
        </td>
        {/* 원본 [조회] — 숫자가 아니라 'R' 링크, 누르면 '조회자 현황'(2026-10-03 실측). 연 횟수는 글자 풍선으로. */}
        <td className={`${bg} text-center`}>
          <button type="button" className="no-ec bg-transparent border-0 p-0 cursor-pointer text-ec-navy"
                  title={`연 횟수 ${r.viewCount ?? 0}`} onClick={() => void openReaders(r)}>R</button>
        </td>
      </>
    )
  }

  /**
   * 칸반 카드 한 장 — 라벨 칩 · 제목 · N(아직 아무도 안 연 글) · 아랫줄(담당자). 답글 수는 우리 게시판에 답글이 없어 붙지 않는다.
   * 원본 N 은 '내가 안 읽은 글' 로 보이는데 우리 응답에는 조회수만 있어 '조회 0' 으로 본다.
   */
  const toCard = (r: WorkPost, col: string, lane?: string, colors: BoardLabel[] = labelMaster): KanbanCard => ({
    id: r.id, col, lane, title: r.title, bold: r.notice, isNew: (r.viewCount ?? 0) === 0,
    chips: (r.labels ?? []).map((l) => ({ name: l, color: colors.find((x) => x.name === l)?.color })),
    sub: cfg.subField ? parseExtra(r.extraFields)[cfg.subField] : undefined,
  })
  /** 카드를 끌어 놓으면 진행상태가 바뀐다(= [진행상태변경]). */
  async function moveStage(id: number, stage: string) {
    try { await api.patch(`/work-posts/${id}/status`, { stage }) } catch (err) { setError(extractErrorMessage(err)) }
    void load()
  }

  /** 하단 [라벨변경] · [라벨설정] — 칸반 게시판은 줄 끝에 둔다(원본 차례). */
  const labelButtons = (
    <>
        {cfg.labels && <span className="relative">
          <button className="ec-btn" onClick={() => { if (requireSelection(selected.size)) openLabels() }}>라벨변경</button>
          {labelOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setLabelOpen(false)} />
              <div role="dialog" aria-label="라벨변경"
                   className="absolute bottom-full left-0 mb-[4px] z-[41] min-w-[160px] p-[9px] bg-ec-panel border border-ec-line border-solid rounded-ec shadow-lg">
                <label className="flex items-center gap-[6px] py-[3px] cursor-pointer">
                  <input type="checkbox" checked={knownLabels.length > 0 && knownLabels.every((l) => labelPick.has(l))}
                         onChange={(e) => setLabelPick(new Set(e.target.checked ? knownLabels : []))} />
                  전체
                </label>
                {knownLabels.map((l) => (
                  <label key={l} className="flex items-center gap-[6px] py-[3px] cursor-pointer">
                    <input type="checkbox" checked={labelPick.has(l)} onChange={() => togglePick(l)} />
                    <LabelChip name={l} color={colorOf(l)} />
                  </label>
                ))}
                <div className="flex justify-between mt-[6px]">
                  <button type="button" className="ec-btn ec-btn-sm ec-btn-primary" aria-label="적용" onClick={() => void applyLabels()}>↵</button>
                  <button type="button" className="ec-btn ec-btn-sm" aria-label="라벨 더하기"
                          onClick={() => { setLabelOpen(false); setMasterOpen(true) }}>+</button>
                  <button type="button" className="ec-btn ec-btn-sm" aria-label="닫기" onClick={() => setLabelOpen(false)}>×</button>
                </div>
              </div>
            </>
          )}
        </span>}
        {/* 원본 하단 [라벨설정] — '라벨조회' 창(2026-10-12 잼, [라벨] · [라벨변경]의 + 와 같은 창). 통합게시판에는 없다. */}
        {cfg.labels && <button className="ec-btn" onClick={() => setMasterOpen(true)}>라벨설정</button>}
    </>
  )

  return (
    <div className="flex flex-col min-h-[100%]">
      <div className="flex items-center mb-[8px]">
        <span className="text-ec-star text-[14px] mr-[4px]">☆</span>
        <span className="text-[15px] font-extrabold text-ec-text">{title}</span>
        {/* 상태 알약은 원본처럼 제목 바로 옆에 붙는다. */}
        {!cfg.kanban && <div className="ec-pills ml-[8px]">
          {['전체', ...statuses].map((t) => (
            <button
              key={t} type="button" onClick={() => setTab(t)}
              className={`ec-pill no-ec${tab === t ? ' active' : ''}`}
            >
              {t}
            </button>
          ))}
          {/* 원본 공지사항은 알약 끝에 이 안내가 붙는다(누르면 회사 진행상태 설정 — 우리에게는 아직 없다). */}
          {(board === 'NOTICE' || cfg.freePill) && <span className="ec-pill no-ec">진행상태를 자유롭게 추가 가능합니다</span>}
        </div>}
        <div className="ml-auto flex gap-[4px]">
          {cfg.labels && <span className="relative">
            <button type="button" className={`ec-btn${labelFilter ? ' ec-btn-primary' : ''}`} onClick={openFilter}>라벨</button>
            {filterOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setFilterOpen(false)} />
                <div role="dialog" aria-label="라벨"
                     className="absolute top-full right-0 mt-[4px] z-[41] min-w-[160px] p-[9px] bg-ec-panel border border-ec-line border-solid rounded-ec shadow-lg">
                  <label className="flex items-center gap-[6px] py-[3px] cursor-pointer">
                    <input type="checkbox" checked={filterKeys.every((k) => filterPick.has(k))}
                           onChange={(e) => setFilterPick(new Set(e.target.checked ? filterKeys : []))} />
                    전체
                  </label>
                  {filterKeys.map((k) => (
                    <label key={k} className="flex items-center gap-[6px] py-[3px] cursor-pointer">
                      <input type="checkbox" checked={filterPick.has(k)}
                             onChange={() => setFilterPick((p) => { const n = new Set(p); if (n.has(k)) n.delete(k); else n.add(k); return n })} />
                      {k === NO_LABEL ? '라벨없음' : <LabelChip name={k} color={colorOf(k)} />}
                    </label>
                  ))}
                  <div className="flex justify-between mt-[6px]">
                    <button type="button" className="ec-btn ec-btn-sm ec-btn-primary" aria-label="적용" onClick={applyFilter}>↵</button>
                    <button type="button" className="ec-btn ec-btn-sm" aria-label="라벨조회"
                            onClick={() => { setFilterOpen(false); setMasterOpen(true) }}>+</button>
                    <button type="button" className="ec-btn ec-btn-sm" aria-label="닫기" onClick={() => setFilterOpen(false)}>×</button>
                  </div>
                </div>
              </>
            )}
          </span>}
          <input className="ec-input w-[110px]" placeholder="입력 후 [Enter]" value={keyword}
                 onChange={(e) => setKeyword(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') load() }} />
          <button className="ec-btn ec-btn-primary" onClick={onSearch}>Search(F3)</button>
          <button className="ec-btn">Option</button>
          <button className="ec-btn">도움말</button>
        </div>
      </div>

      {/*
        원본 조건 판(2026-10-13 통합게시판 실측): 메뉴 · 게시일 · 유형 · 완료일 · 제목 · 내용1 · 사용자 · 게시글번호 · 삭제구분 · 기타 ·
        입력경로 · 적용양식, 아래 [검색(F8)] + 기간 빠른선택. 우리는 게시일 · 제목만 건다(나머지는 받쳐 줄 자료가 없다).
      */}
      {condOpen && (
        <div className="ec-cond mb-[8px]">
          <ul className="ec-form border-0">
            <li className="wide">
              <div className="title">게시일</div>
              <div className="form gap-[4px]">
                <input type="date" className="ec-input w-[140px]" value={cond.from} onChange={(e) => setCond((c) => ({ ...c, from: e.target.value }))} />
                ~
                <input type="date" className="ec-input w-[140px]" value={cond.to} onChange={(e) => setCond((c) => ({ ...c, to: e.target.value }))} />
              </div>
            </li>
            <li className="wide">
              <div className="title">제목</div>
              <div className="form">
                <input className="ec-input w-full" placeholder="제목" value={cond.title}
                       onChange={(e) => setCond((c) => ({ ...c, title: e.target.value }))}
                       onKeyDown={(e) => { if (e.key === 'Enter') applyCond() }} />
              </div>
            </li>
          </ul>
          <div className="flex flex-wrap gap-[4px] mt-[8px]">
            <button type="button" className="ec-btn ec-btn-primary" onClick={applyCond}>검색(F8)</button>
            <EcPeriodPicks labels={BOARD_PICKS} currentFrom={cond.from}
                           onPick={(r) => setCond((c) => ({ ...c, from: r.from, to: r.to }))} />
            <button type="button" className="ec-btn" onClick={() => setCond({ ...defaultPeriod(cfg.period), title: '' })}>다시작성</button>
          </div>
        </div>
      )}

      {error && !showForm && !viewing && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
      {info && <p className="ec-alert mb-[8px]" onClick={() => setInfo('')}>{info}</p>}

      {/* 원본 목록 오른쪽 위의 조회 기간 */}
      {!cfg.kanban && <div className="text-right text-[12px] text-ec-ink mb-[4px]">{dateText(from)} ~ {dateText(to)}</div>}

      <div id="work-list" ref={gridRef} className="flex-1 min-h-0">
        {cfg.kanban ? (
          <EcKanban
            columns={cfg.kanban.order.map((st) => ({ key: st, name: st, tone: cfg.kanban!.tones[st], closed: cfg.kanban!.closed.includes(st) }))}
            cards={numbered.map((r) => toCard(r, statusOf(r)))}
            selected={selected}
            onToggle={(ids, on) => setSelected((p) => { const n = new Set(p); ids.forEach((id) => (on ? n.add(id) : n.delete(id))); return n })}
            onOpen={(c) => { const r = rows.find((x) => x.id === c.id); if (r) openView(r) }}
            onMove={(c, col) => void moveStage(c.id, col)} />
        ) : (
        <table className="w-full text-left">
          <thead>
            <tr>
              {/* 1열은 행머리 — 헤더는 전체선택, 본문은 회색 행번호(눌러서 선택). 다른 목록과 같은 규칙. */}
              <th className="w-[34px] cursor-pointer" title="전체 선택 / 해제"
                  onClick={() => setSelected(
                    selected.size === shown.length ? new Set() : new Set(shown.map((r) => r.id)),
                  )}>
                {shown.length > 0 && selected.size === shown.length ? '☑' : ''}
              </th>
              {/* 원본 컬럼 순서: 게시글번호 · 제목 · 작성자명 · 전달자 · 진행상태 · 첨부 · 조회 */}
              {cfg.cols ? cfg.cols.map((c) => (
                <th key={c} className={`${c === 'title' ? '' : c === 'stage' || c === 'forward' ? 'w-[150px] ' : 'w-[100px] '}text-center`}>{colHead(c, stageLabel)}</th>
              )) : <>
              <th className="w-[90px] text-center">{cfg.wide ? '번호' : '게시글번호'}</th>
              <th className="text-center">제목</th>
              {cfg.minutes ? (
                <>
                  {MINUTE_TEAMS.map((t) => <th key={t} className="w-[150px] text-center">{t} 회의록</th>)}
                  <th className="w-[80px] text-center">주 차</th>
                </>
              ) : (
                <>
                  <th className="w-[100px] text-center">{cfg.wide ? '작성자' : '작성자명'}</th>
                  <th className="w-[150px] text-center">전달자</th>
                  {cfg.wide && <th className="w-[100px] text-center">완료일</th>}
                  <th className="w-[150px] text-center">{stageLabel}</th>
                </>
              )}
              </>}
              <th className="w-[60px] text-center">첨부</th>
              <th className="w-[60px] text-center">조회</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={colCount} className="ec-empty">불러오는 중…</td></tr>
            ) : shown.length === 0 ? (
              <tr><td colSpan={colCount} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
            ) : (
              <>
                {pinned.map((r) => (
                  <tr key={`pin-${r.id}`}>
                    <td className="bg-ec-pinned" />
                    {cells(r, true)}
                  </tr>
                ))}
                {numbered.map((r, i) => (
                  <Fragment key={r.id}>
                    <tr>
                      <td className={`text-center cursor-pointer select-none ${selected.has(r.id)
                            ? 'bg-ec-blue-wash text-ec-navy font-bold' : 'bg-ec-stripe text-ec-hint'}`}
                          title="눌러서 이 글을 고릅니다"
                          onClick={() => toggleSelect(r.id)}>
                        {i + 1}
                      </td>
                      {cells(r, false)}
                    </tr>
                    {opened && (
                      <tr>
                        <td colSpan={colCount} className="bg-ec-page px-[14px] py-[10px]">
                          <div className="whitespace-pre-wrap text-[12px] text-ec-ink min-h-[20px]">{r.content}</div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </>
            )}
          </tbody>
        </table>
        )}
      </div>

      <div className="flex gap-[6px] mt-[10px] pt-[8px] border-t border-t-ec-line-soft border-solid">
        {/*
          원본 하단: 신규(F2)·보내기·업무지원AI·진행상태변경·라벨변경·라벨설정·모두펼쳐보기·선택삭제·Excel·이력조회·웹자료올리기.
          받쳐 줄 기능이 있는 것만 둔다 — 보내기·업무지원AI·이력조회는 아직 없다. 라벨설정은 [라벨] · [라벨변경]의 + (라벨조회 창).
          [인쇄]는 원본처럼 View 창 안에 있다. [웹자료올리기]는 입력 창의 첨부 자리다.
        */}
        <button className="ec-btn ec-btn-primary" onClick={openNew}>신규(F2)</button>
        {/* 원본 [보내기 ▲] · [업무지원AI ▲] — 메일 · 바깥 AI 로 나가는 기능이라 모양만 둔다(누르면 안내). */}
        <button className="ec-btn" onClick={() => setInfo('보내기는 지원하지 않습니다(메일 · 쪽지 발송).')}>보내기 ▲</button>
        <button className="ec-btn" onClick={() => setInfo('업무지원AI는 지원하지 않습니다(바깥 서비스).')}>업무지원AI ▲</button>
        {/* 공지사항은 상태가 '기본' 하나라 바꿀 곳이 없다. */}
        <span className="relative">
          <button className="ec-btn disabled:opacity-45" disabled={statuses.length < 2 && !namedStages} onClick={openStageMenu}>진행상태변경 ▲</button>
          {stageMenu && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setStageMenu(false)} />
              <ul role="menu" aria-label="진행상태변경"
                  className="absolute bottom-full left-0 mb-[4px] z-[41] min-w-[140px] py-[4px] bg-ec-panel border border-ec-line border-solid rounded-ec shadow-lg">
                {statuses.map((st) => (
                  <li key={st}>
                    <button type="button" role="menuitem" className="no-ec w-full text-left px-[10px] py-[4px] bg-transparent border-0 cursor-pointer hover:bg-ec-blue-wash"
                            onClick={() => void changeStatusSelected(st)}>{st}</button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </span>
        {!cfg.kanban && labelButtons}
        {/* 원본 칸반 게시판(E200190) 하단: … 진행상태변경 · 선택삭제 · Excel · 이력조회 · 라벨변경 · 라벨설정 — 모두펼쳐보기 · 웹자료올리기 없음 */}
        {!cfg.kanban && <button className="ec-btn" onClick={() => setOpened((v) => !v)}>{opened ? '모두접기' : '모두펼쳐보기'}</button>}
        <button className="ec-btn" onClick={() => { if (requireSelection(selected.size)) void deleteSelected() }}>선택삭제</button>
        <button className="ec-btn" onClick={() => void doExcel()}>Excel</button>
        <button className="ec-btn" onClick={() => setInfo('이력조회는 아직 지원하지 않습니다.')}>이력조회</button>
        {cfg.kanban ? labelButtons
          : <button className="ec-btn" onClick={() => setInfo('웹자료올리기는 지원하지 않습니다 — 신규(F2) 입력 창의 [첨부] 를 쓰세요.')}>웹자료올리기</button>}
      </div>

      {masterOpen && <LabelMasterModal board={board} onClose={() => { setMasterOpen(false); void load() }} />}

      {/* 원본 '공지사항입력' / '공지사항입력(수정)' 창 — 항목이 한 줄에 하나씩 세로로 놓인다. */}
      <Modal error={error} open={showForm} title={`${title}입력${editId != null ? '(수정)' : ''}`}
             onClose={() => setShowForm(false)} width={780}>
        <ul className="ec-form mb-[10px]">
          {/* 원본 입력 창 맨 위 [진행상태] — 회사가 정한 이름(통합게시판 'Default' 하나). */}
          {namedStages && (
            <li className="wide">
              <div className="title">{stageLabel}</div>
              <div className="form">
                <select className="ec-input w-[260px]" value={form.stage || firstStage} onChange={(e) => set('stage', e.target.value)}>
                  {cfg.stages!.map((st) => <option key={st} value={st}>{st}</option>)}
                </select>
              </div>
            </li>
          )}
          {/*
            원본 [전달자]: 글자 링크 '전체' 를 누르면 [전체][선택] 판, '선택' 이면 🔍 사용자검색 + 이름 칩.
            [참조자] 는 처음부터 '선택'. 원본은 전달자에게 알림을 보내지만 우리는 적어 두기만 한다.
          */}
          <li className="wide">
            <div className="title">전달자</div>
            <div className="form gap-[6px] relative">
              <button type="button" className="no-ec bg-transparent border-0 p-0 cursor-pointer text-ec-navy underline"
                      onClick={() => setForwardMenu((v) => !v)}>{form.forwardAll ? '전체' : '선택'}</button>
              {forwardMenu && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setForwardMenu(false)} />
                  <ul role="menu" aria-label="전달자"
                      className="absolute top-full left-0 mt-[2px] z-[41] min-w-[110px] py-[4px] bg-ec-panel border border-ec-line border-solid rounded-ec shadow-lg">
                    {(['전체', '선택'] as const).map((m) => (
                      <li key={m}>
                        <button type="button" role="menuitem" className="no-ec w-full text-left px-[10px] py-[4px] bg-transparent border-0 cursor-pointer hover:bg-ec-blue-wash"
                                onClick={() => { setForwardMenu(false); set('forwardAll', m === '전체') }}>{m}</button>
                      </li>
                    ))}
                  </ul>
                </>
              )}
              {!form.forwardAll && <NameChips names={form.forwardTo} placeholder="전달자" onPick={() => setPickFor('forwardTo')}
                                              onRemove={(n) => set('forwardTo', form.forwardTo.filter((x) => x !== n))} />}
            </div>
          </li>
          <li className="wide">
            <div className="title">참조자</div>
            <div className="form gap-[6px]">
              <span className="text-ec-ink">선택</span>
              <NameChips names={form.ccTo} placeholder="참조자" onPick={() => setPickFor('ccTo')}
                         onRemove={(n) => set('ccTo', form.ccTo.filter((x) => x !== n))} />
            </div>
          </li>
          {/* 원본 차례: 진행상태 · 권한 · 비밀번호 · 전달자 · 참조자 · 제목(+공지사항여부) · 첨부 */}
          <li className="wide">
            <div className="title">제목</div>
            <div className="form flex-col items-start">
              <input className="ec-input w-full" placeholder="제목" value={form.title}
                     onChange={(e) => set('title', e.target.value)} />
              {/* 원본은 제목 칸 바로 아래에 [공지사항여부]를 단다. 켜면 목록 맨 위에 한 번 더 붙는다. */}
              <label className="inline-flex items-center gap-[6px] text-[12px] cursor-pointer">
                공지사항여부
                <input type="checkbox" checked={form.notice} onChange={(e) => set('notice', e.target.checked)} />
              </label>
            </div>
          </li>
          {/* 원본 간판제작 입력 창 [프로젝트] · [칸반연결] — 📅 프로젝트 진행현황 칸반 글의 판에 이 글이 [프로젝트] 열의 카드로 뜬다. */}
          {board === 'SIGN' && (
            <>
              <li>
                <div className="title">프로젝트</div>
                <div className="form">
                  <input className="ec-input w-full" placeholder="프로젝트" aria-label="프로젝트" value={form.project}
                         onChange={(e) => set('project', e.target.value)} />
                </div>
              </li>
              <li>
                <div className="title">칸반연결</div>
                <div className="form">
                  <select className="ec-input w-full" aria-label="칸반연결" value={form.kanbanPostId ?? ''}
                          onChange={(e) => set('kanbanPostId', e.target.value ? Number(e.target.value) : null)}>
                    <option value="">(연결 안 함)</option>
                    {kanbanPosts.map((k) => <option key={k.id} value={k.id}>{k.postNo} {k.title}</option>)}
                  </select>
                </div>
              </li>
            </>
          )}
          {/* 게시판별 입력항목(원본 🚗 1. 차량 정보관리: 제목 아래 [출고일자] · [차량번호]). */}
          {cfg.extras?.map((x) => (
            <li key={x.name}>
              <div className="title">{x.name}</div>
              <div className="form">
                <input className="ec-input w-full" type={x.type} placeholder={x.name} aria-label={x.name}
                       value={form.extra[x.name] ?? ''} onChange={(e) => set('extra', { ...form.extra, [x.name]: e.target.value })} />
              </div>
            </li>
          ))}
          <li className="wide">
            <div className="title">첨부</div>
            <div className="form">
              <EcFileDrop busy={uploading} disabled={uploading}
                          onFiles={(fs) => { if (fs[0]) void upload(fs[0]) }}>
                {attachment && (
                  <span className="text-[12px] text-ec-navy">
                    {attachment.name}
                    <span onClick={() => setAttachment(null)} className="cursor-pointer ml-[6px] font-bold">×</span>
                  </span>
                )}
              </EcFileDrop>
            </div>
          </li>
          {/* 원본 통합회의록 입력 창: 첨부 아래 부서 칸 넷(두 칸씩) · [주 차 구분](코드 🔍 · 이름). */}
          {cfg.minutes && MINUTE_TEAMS.map((t, i) => (
            <li key={t}>
              <div className="title">{t} 회의록</div>
              <div className="form gap-[4px]">
                <div className="flex-1 flex items-center gap-[4px] ec-input">
                  <button type="button" aria-label={`${t} 회의록 검색`} className="no-ec bg-transparent border-0 p-0 cursor-pointer text-ec-hint"
                          onClick={() => { setLinkTab('전체'); setLinkPickFor(i) }}>🔍</button>
                  <span className={`flex-1 truncate ${form.links[i] == null ? 'text-ec-hint' : ''}`}>
                    {form.links[i] == null ? `${t} 회의록` : meetingTitle(form.links[i])}
                  </span>
                  {form.links[i] != null && (
                    <button type="button" aria-label={`${t} 회의록 지우기`} className="no-ec bg-transparent border-0 p-0 cursor-pointer"
                            onClick={() => set('links', form.links.map((x, j) => (j === i ? null : x)))}>×</button>
                  )}
                </div>
              </div>
            </li>
          ))}
          {cfg.minutes && (
            <li>
              <div className="title">주 차 구분</div>
              <div className="form gap-[4px] relative">
                <span className="ec-input w-[80px]">{form.weekNo ?? ''}</span>
                <button type="button" aria-label="주차검색" className="ec-btn" onClick={() => setWeekMenu((v) => !v)}>🔍</button>
                <span className="ec-input flex-1">{form.weekNo ? `${form.weekNo}주차` : ''}</span>
                {weekMenu && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setWeekMenu(false)} />
                    <div role="dialog" aria-label="주차검색"
                         className="absolute top-full left-0 mt-[2px] z-[41] min-w-[220px] p-[6px] bg-ec-panel border border-ec-line border-solid rounded-ec shadow-lg">
                      <table className="w-full text-left">
                        <thead><tr><th className="text-center">코드</th><th className="text-center">항목명</th></tr></thead>
                        <tbody>
                          {WEEKS.map((w) => (
                            <tr key={w} className="cursor-pointer" onClick={() => { set('weekNo', w); setWeekMenu(false) }}>
                              <td className="text-center text-ec-navy">{w}</td><td className="text-ec-navy">{w}주차</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </div>
            </li>
          )}
        </ul>
        <textarea className="ec-input w-full h-[160px] py-[8px] resize-y" value={form.content}
                  onChange={(e) => set('content', e.target.value)} />
        <div className="flex gap-[6px] mt-[10px]">
          {/* 원본 신규: 저장(F8) · 다시 작성 · 리스트 · 닫기 / 수정: 저장(F8) · 리스트 · View · 닫기 · 삭제 */}
          <button className="ec-btn ec-btn-primary" onClick={() => void submit()}>저장(F8)</button>
          {editId == null && (
            <button className="ec-btn" onClick={() => { setForm(emptyForm()); setAttachment(null); setError('') }}>다시 작성</button>
          )}
          <button className="ec-btn" onClick={() => { setShowForm(false); setEditId(null) }}>리스트</button>
          {editId != null && (
            <button className="ec-btn" onClick={() => {
              const r = rows.find((x) => x.id === editId)
              setShowForm(false); setEditId(null)
              if (r) setViewing(r)
            }}>View</button>
          )}
          <button className="ec-btn" onClick={() => setShowForm(false)}>닫기</button>
          {editId != null && <button className="ec-btn" onClick={() => removeOne(editId)}>삭제</button>}
        </div>
      </Modal>

      {/* 원본 '공지사항View' 창 */}
      <Modal error={error} open={!!viewing} title={`${title}View`} onClose={() => setViewing(null)} width={780}>
        {viewing && (
          <>
            <div className="bg-ec-page rounded-ec px-[12px] py-[8px] text-[12px] font-bold text-ec-ink">
              {viewing.postNo} | {viewing.title} | {viewing.writerName ?? viewing.writer} | {stampText(viewing.createdAt)}
            </div>
            <ul className="ec-form border-0 mb-[6px]">
              <li className="wide"><div className="title">일자-No.</div><div className="form text-ec-navy">{dateText(viewing.postDate)} -1</div></li>
              <li className="wide">
                <div className="title">첨부</div>
                <div className="form">
                  {viewing.attachmentId && (
                    <span className="cursor-pointer text-ec-navy"
                          onClick={() => void downloadStoredFile(viewing.attachmentId!, viewing.attachmentName ?? '첨부')}>
                      {viewing.attachmentName} ({formatBytes(viewing.attachmentSize ?? 0)})
                    </span>
                  )}
                </div>
              </li>
            </ul>
            <div className="whitespace-pre-wrap text-[12px] text-ec-ink min-h-[120px] px-[12px]">{viewing.content}</div>
            {/*
              원본 '📅 프로젝트 진행현황 칸반View' 본문 판(2026-10-13): 열 = 이 글에 [칸반연결] 한 간판제작 글의 [프로젝트] + 건수,
              줄 = 간판제작 진행상태, 카드 = 그 글(라벨 칩 + 제목). 판 아래 신규 ▲ · 선택삭제 · 카드접기 · 더보기(신규 ▲ 판은 못 잼 — 뺌).
              카드를 다른 줄로 끌어 놓으면 그 간판제작 글의 진행상태가 바뀐다.
            */}
            {board === 'PROJECT_KANBAN' && (() => {
              const linked = signPosts.filter((x) => x.kanbanPostId === viewing.id).sort((a, b) => a.postNo - b.postNo)
              const projects = [...new Set(linked.map((x) => x.project ?? ''))]
              const signStages = BOARD_CFG.SIGN.stages ?? []
              return (
                <div className="mt-[8px]">
                  {linked.length === 0 ? <div className="ec-empty">등록된 데이터가 없습니다.</div> : (
                    <EcKanban
                      columns={projects.map((p) => ({ key: p, name: p || '(프로젝트 없음)' }))}
                      lanes={signStages.map((st) => ({ key: st, name: st }))}
                      cards={linked.map((x) => toCard(x, x.project ?? '', x.stage ?? signStages[0], signLabels))}
                      selected={boardPick} hideSub={cardsFolded}
                      onToggle={(ids, on) => setBoardPick((p) => { const n = new Set(p); ids.forEach((id) => (on ? n.add(id) : n.delete(id))); return n })}
                      onOpen={(c) => setCardView(signPosts.find((x) => x.id === c.id) ?? null)}
                      onMove={(c, _col, lane) => { if (lane && lane !== c.lane) void moveStage(c.id, lane) }} />
                  )}
                  <div className="flex gap-[6px] mt-[6px]">
                    <button type="button" className="ec-btn ec-btn-sm"
                            onClick={() => { if (requireSelection(boardPick.size)) setConfirmIds([...boardPick]) }}>선택삭제</button>
                    <button type="button" className="ec-btn ec-btn-sm" onClick={() => setCardsFolded((v) => !v)}>{cardsFolded ? '카드펼치기' : '카드접기'}</button>
                  </div>
                  {cardView && (
                    <div className="bg-ec-page rounded-ec px-[12px] py-[8px] mt-[6px] text-[12px] text-ec-ink">
                      <div className="font-bold mb-[4px]">{cardView.postNo} | {cardView.title} | {cardView.writerName ?? cardView.writer} | {cardView.stage ?? ''}</div>
                      <div className="whitespace-pre-wrap">{cardView.content}</div>
                      <button type="button" className="ec-btn ec-btn-sm mt-[6px]" onClick={() => setCardView(null)}>닫기</button>
                    </div>
                  )}
                </div>
              )
            })()}
            {/* 원본 통합회의록View: 부서마다 '경영지원팀(클릭)' 판 — 누르면 이은 팀별회의록 글의 제목 · 본문이 펴진다. */}
            {cfg.minutes && (
              <div className="grid grid-cols-2 gap-[8px] mt-[8px]">
                {MINUTE_TEAMS.map((t, i) => {
                  const m = meetingPosts.find((x) => x.id === viewing.meetingLinks?.[i])
                  const on = openTeams.has(i)
                  return (
                    <div key={t} className="bg-ec-page rounded-ec">
                      <button type="button" className="no-ec w-full text-left bg-transparent border-0 px-[12px] py-[8px] cursor-pointer font-bold text-[12px] text-ec-ink"
                              onClick={() => setOpenTeams((p) => { const n = new Set(p); if (n.has(i)) n.delete(i); else n.add(i); return n })}>
                        {t}(클릭)
                      </button>
                      {on && (
                        <div className="px-[12px] pb-[10px] text-[12px] text-ec-ink">
                          {m ? (
                            <>
                              <div className="text-[14px] font-bold mb-[6px]">{m.title}</div>
                              <div className="whitespace-pre-wrap">{m.content}</div>
                            </>
                          ) : <div className="ec-empty">등록된 데이터가 없습니다.</div>}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
            <div className="flex gap-[6px] mt-[10px]">
              <button className="ec-btn" onClick={() => openEdit(viewing)}>수정</button>
              <button className="ec-btn" onClick={() => removeOne(viewing.id)}>삭제</button>
              <button className="ec-btn" onClick={() => setViewing(null)}>닫기</button>
              <button className="ec-btn" onClick={() => printPost(viewing)}>인쇄</button>
            </div>
          </>
        )}
      </Modal>

      {/*
        원본 '팀별회의록 게시판검색창'(2026-10-13): 부서구분 알약 [전체][경영지원팀]… — 처음은 [전체], 격자 맨 앞 '적용' 링크,
        게시글번호 · 제목 · 작성자명 · 전달자 · 부서구분 · 첨부 · 조회, 하단 신규(F2) · 리스트 · 닫기. 우리는 기간으로 거르지 않는다.
      */}
      <Modal error={error} open={linkPickFor != null} title="팀별회의록 게시판검색창" width={780} onClose={() => setLinkPickFor(null)}>
        <div className="ec-pills mb-[8px]">
          {['전체', ...(BOARD_CFG.MEETING.stages ?? [])].map((t) => (
            <button key={t} type="button" className={`ec-pill no-ec${linkTab === t ? ' active' : ''}`} onClick={() => setLinkTab(t)}>{t}</button>
          ))}
        </div>
        <table className="w-full text-left">
          <thead>
            <tr>
              <th className="w-[50px]" /><th className="w-[70px] text-center">게시글번호</th><th className="text-center">제목</th>
              <th className="w-[90px] text-center">작성자명</th><th className="w-[90px] text-center">전달자</th>
              <th className="w-[100px] text-center">부서구분</th><th className="w-[50px] text-center">첨부</th><th className="w-[50px] text-center">조회</th>
            </tr>
          </thead>
          <tbody>
            {(() => {
              const list = meetingPosts
                .filter((m) => linkTab === '전체' || (m.stage ?? BOARD_CFG.MEETING.defaultStage) === linkTab)
                .sort((a, b) => b.postNo - a.postNo)
              if (list.length === 0) return <tr><td colSpan={8} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
              return list.map((m) => (
                <tr key={m.id}>
                  <td className="text-center">
                    <button type="button" className="no-ec bg-transparent border-0 p-0 cursor-pointer text-ec-navy"
                            onClick={() => { const i = linkPickFor!; set('links', form.links.map((x, j) => (j === i ? m.id : x))); setLinkPickFor(null) }}>적용</button>
                  </td>
                  <td className="text-center">{m.postNo}</td>
                  <td>{m.title}</td>
                  <td>{m.writerName ?? m.writer}</td>
                  <td>{m.forwardTo ?? ''}</td>
                  <td>{m.stage ?? BOARD_CFG.MEETING.defaultStage}</td>
                  <td className="text-center">{m.attachmentId ? '📎' : ''}</td>
                  <td className="text-center text-ec-navy">R</td>
                </tr>
              ))
            })()}
          </tbody>
        </table>
        <div className="flex gap-[6px] mt-[10px]">
          <button type="button" className="ec-btn" onClick={() => setLinkPickFor(null)}>닫기</button>
        </div>
      </Modal>

      {/* 원본 '알림' 창 — 삭제하겠습니까? [확인][취소] (2026-10-13 통합게시판 View [삭제] 실측) */}
      <Modal error={error} open={!!confirmIds} title="알림" width={420} onClose={() => setConfirmIds(null)}>
        <p className="text-[12px] text-ec-ink min-h-[60px]">삭제하겠습니까?</p>
        <div className="flex gap-[6px] mt-[10px]">
          <button type="button" className="ec-btn ec-btn-primary" onClick={() => void doDelete()}>확인</button>
          <button type="button" className="ec-btn" onClick={() => setConfirmIds(null)}>취소</button>
        </div>
      </Modal>

      {pickFor && (
        <UserPickModal selected={form[pickFor]} onClose={() => setPickFor(null)}
                       onApply={(names) => { set(pickFor, names); setPickFor(null) }} />
      )}

      {/* 원본 '조회자 현황' 창 */}
      <Modal error={error} open={!!readers} title="조회자 현황" width={780} onClose={() => setReaders(null)}>
        {readers && (
          <div className="flex gap-[10px] items-start">
            <div className="w-[200px] shrink-0">
              <div className="text-[12px] mb-[4px]">▸ 미조회자</div>
              <table className="w-full text-left">
                <thead><tr><th className="text-center">이름</th></tr></thead>
                <tbody>
                  {readers.nonReaders.length === 0
                    ? <tr><td className="text-center text-ec-ink">등록된 데이터가 없습니다.</td></tr>
                    : readers.nonReaders.map((n, i) => <tr key={`${n}-${i}`}><td className="text-center">{n}</td></tr>)}
                </tbody>
              </table>
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[12px] mb-[4px]">▸ 조회자</div>
              <table className="w-full text-left">
                <thead><tr><th className="text-center">이름</th><th className="text-center">최초조회일시</th><th className="text-center">최종조회일시</th></tr></thead>
                <tbody>
                  {readers.readers.length === 0
                    ? <tr><td colSpan={3} className="text-center text-ec-ink">등록된 데이터가 없습니다.</td></tr>
                    : readers.readers.map((x, i) => (
                      <tr key={`${x.name}-${i}`}>
                        <td className="text-center">{x.name}</td>
                        <td className="text-center">{stampText(x.firstReadAt)}</td>
                        <td className="text-center">{stampText(x.lastReadAt)}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
        <div className="flex gap-[6px] mt-[10px]">
          <button type="button" className="ec-btn" onClick={() => setReaders(null)}>닫기</button>
        </div>
      </Modal>
    </div>
  )
}

/** 전달자 · 참조자 칸 — 🔍(사용자검색) + 고른 이름 칩(× 로 뺀다). 원본 '선택 🔍 [전달자]'. */
function NameChips({ names, placeholder, onPick, onRemove }: {
  names: string[]; placeholder: string; onPick: () => void; onRemove: (name: string) => void
}) {
  return (
    <div className="flex-1 flex items-center gap-[4px] flex-wrap ec-input min-h-[26px] h-auto">
      <button type="button" aria-label={`${placeholder} 검색`} className="no-ec bg-transparent border-0 p-0 cursor-pointer text-ec-hint" onClick={onPick}>🔍</button>
      {names.length === 0 && <span className="text-ec-hint cursor-pointer" onClick={onPick}>{placeholder}</span>}
      {names.map((n) => (
        <span key={n} className="inline-flex items-center px-[6px] rounded-ec bg-ec-blue-wash text-ec-navy">
          {n}
          <button type="button" aria-label={`${n} 빼기`} className="no-ec bg-transparent border-0 p-0 ml-[4px] cursor-pointer" onClick={() => onRemove(n)}>×</button>
        </span>
      ))}
    </div>
  )
}
