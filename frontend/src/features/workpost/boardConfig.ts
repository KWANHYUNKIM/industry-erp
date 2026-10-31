import { ymd } from '../../components/EcPeriodPicks'
import type { WorkPost, WorkPostStatus } from '../../types/api'
import { htmlToText } from '../../utils/richText'
import { dateText } from '../../utils/dateText'
import { pad2, todayYmd } from '../../utils/periods'
import type { KanbanTone } from '../../components/EcKanban'

/* 게시판 목록 화면(pages/groupware/WorkPage)의 게시판별 설정 · 조건 · 입력 모양 — WorkPage 에서 몸통 그대로 옮겼다(단계 10). */

/**
 * 원본 목록 오른쪽 위의 조회 기간(= 조건 판 [게시일]의 기본값).
 * - yearBack: 오늘부터 1년 전 같은 날까지(WORK · 공지사항, 2026-10-03 실측 2025/10/03 ~ 2026/10/03).
 * - lastYear: 전년 1/1 ~ 12/31(통합게시판, 2026-10-13 실측 2025/01/01 ~ 2025/12/31 — 올해 쓴 글은
 *   [Search(F3)] → [금년] 으로 봐야 보인다. 원본 그대로다).
 */
export function defaultPeriod(kind: 'yearBack' | 'lastYear') {
  const d = new Date()
  if (kind === 'lastYear') return { from: `${d.getFullYear() - 1}-01-01`, to: `${d.getFullYear() - 1}-12-31` }
  const back = new Date(d)
  back.setFullYear(d.getFullYear() - 1)
  return { from: ymd(back), to: ymd(d) }
}

/** 조건 판 [유형] · [입력경로] 체크칸(2026-10-20 통합게시판 실측 — 처음 값 본문만 / 다섯 다). '전체' 는 나머지를 한꺼번에 켜고 끈다. */
export const COND_KINDS = ['전체', '본문', '답글']
export const COND_PATHS = ['전체', '웹(ERP)', '자료올리기', '기타', 'OAPI']
export type CondExtra = { kinds: string[]; doneFrom: string; doneTo: string; title: string; content: string; user: string; no: string
  del: '전체' | '미삭제' | '삭제'; paths: string[]; byUpdated: boolean }
export const EMPTY_COND: CondExtra = { kinds: ['본문'], doneFrom: '', doneTo: '', title: '', content: '', user: '', no: '', del: '미삭제', paths: [...COND_PATHS], byUpdated: false }

export function toggleAll(cur: string[], v: string, on: boolean, all: string[]) {
  if (v === '전체') return on ? [...all] : []
  const next = on ? [...cur, v] : cur.filter((x) => x !== v && x !== '전체')
  return on && all.slice(1).every((x) => next.includes(x)) ? [...all] : next
}

/**
 * 조건 판 거르기. [유형] 본문 = 원글, 답글 = 하위 글(parentId). 우리 글은 모두 웹(ERP) 입력이고, 지운 글은 남지 않는다 —
 * 그래서 [웹(ERP)] 끔 · 삭제구분 [삭제] 면 빈 목록(원본 삭제 = '등록된 데이터가 없습니다.' 와 같다).
 */
export function passCond(r: WorkPost, c: CondExtra) {
  if (!c.kinds.includes(r.parentId != null ? '답글' : '본문')) return false
  if (!c.paths.includes('웹(ERP)')) return false
  if (c.del === '삭제') return false
  const done = r.completedAt?.slice(0, 10) ?? ''
  if ((c.doneFrom || c.doneTo) && (!done || (c.doneFrom && done < c.doneFrom) || (c.doneTo && done > c.doneTo))) return false
  if (c.title && !r.title.includes(c.title)) return false
  if (c.content && !htmlToText(r.content ?? '').includes(c.content)) return false
  if (c.user && !(r.writerName ?? '').includes(c.user) && !r.writer.includes(c.user)) return false
  if (c.no && String(r.postNo) !== c.no) return false
  return true
}

/** 전달자 · 참조자 칸에 든 이름들. 서버에는 ', ' 로 이어 한 글자열로 간다(전체 = null). */
export const splitNames = (v: string | null | undefined) => (v ?? '').split(',').map((x) => x.trim()).filter(Boolean)

export const WEEK = ['일', '월', '화', '수', '목', '금', '토']

/**
 * 원본 View 머리줄의 일시: '2025/01/14 (화) 오전 10:49:55' — 날짜는 글의 [일자](입력한 때가 아니다, 차량 증빙관리 2026-10-30 실측).
 * 우리는 일자를 날짜로만 들고 있어 시각은 작성 시각을 붙인다. postDate 를 안 주면 작성 일시 그대로.
 */
export function stampText(iso?: string | null, postDate?: string | null) {
  const d = iso ? new Date(iso) : null
  const ok = !!d && !Number.isNaN(d.getTime())
  const day = postDate && /^\d{4}-\d\d-\d\d$/.test(postDate) ? postDate : ok ? ymd(d!) : ''
  if (!day) return ''
  const [y, m, dd] = day.split('-').map(Number)
  const wd = WEEK[new Date(y, m - 1, dd).getDay()]
  if (!ok) return `${dateText(day)} (${wd})`
  const h = d!.getHours()
  return `${dateText(day)} (${wd}) ${h < 12 ? '오전' : '오후'} ${h % 12 === 0 ? 12 : h % 12}:${pad2(d!.getMinutes())}:${pad2(d!.getSeconds())}`
}

/** forwardAll: 원본 [전달자] 의 '전체'(켬) / '선택'(이름을 고른다). */
export type Form = {
  title: string; content: string; forwardAll: boolean; forwardTo: string[]; ccTo: string[]; notice: boolean; postDate: string; stage: string
  /** 원본 [참조자] 의 '전체'(통합회의록 · 팀별회의록은 처음 값이 '전체' — BoardCfg.ccAll). 다른 게시판은 늘 '선택'. */
  ccAll: boolean
  /** 통합회의록 입력 창 [진행상태] 진행중 · 완료(WORK 꼴 진행상태 — 저장 뒤 /status 로 맞춘다). */
  status: WorkPostStatus
  /** 통합회의록 [주 차 구분] 1 ~ 5 · 부서 칸마다 이은 팀별회의록 글 id(MINUTE_TEAMS 차례). */
  weekNo: number | null; links: (number | null)[]
  /** 업무관리 예시 게시판의 입력항목(이름 → 값). BoardCfg.extras. */
  extra: Record<string, string>
  /** 간판제작 [프로젝트] · [칸반연결](📅 프로젝트 진행현황 칸반 글 id). */
  project: string; kanbanPostId: number | null
  /** 간판제작 [완료일시] 'YYYY-MM-DDTHH:mm'(원본 처음 값 = 지금). */
  done: string
}
/** 지금 시각 'YYYY-MM-DDTHH:mm'(로컬). */
export const nowLocal = () => { const d = new Date(); return `${ymd(d)}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` }
export const emptyForm = (stage = ''): Form => ({
  title: '', content: '', forwardAll: true, forwardTo: [], ccTo: [], notice: false, postDate: todayYmd(), stage, weekNo: null, links: [null, null, null, null], extra: {},
  project: '', kanbanPostId: null, ccAll: false, status: 'IN_PROGRESS', done: nowLocal(),
})

export type PostBoardCode = 'WORK' | 'NOTICE' | 'SHARED' | 'MEETING' | 'SIGN' | 'MINUTES'
  | 'AI_GUIDE' | 'SITE_LOG' | 'SITE_STATUS' | 'DEV_LOG' | 'DEV_STATUS'
  | 'CONSULT' | 'VISIT' | 'CONTRACT' | 'AS_CARE' | 'CAR_INFO' | 'CAR_DOC' | 'CAR_RUN'
  | 'KANBAN_SAMPLE' | 'PROJECT_KANBAN'

/**
 * 격자 열(업무관리 예시 게시판 — 원본은 게시판마다 열을 고른다). 'x:이름' 은 입력항목 값, 'x:이름|머리' 는 머리 글자가 다를 때.
 * 행머리(선택) · 첨부 · 조회는 늘 앞뒤에 붙는다.
 */
export type Col = 'no' | 'dateNo' | 'title' | 'writer' | 'forward' | 'stage' | 'postDate' | `x:${string}`
/** 입력 창의 게시판별 입력항목. 원본 '항목추가' 로 회사가 고른 칸이다. */
/**
 * 입력항목 종류. emp 사원검색 · vehicle 차량번호검색 · item 품목검색 · partner 거래처검색 · project 프로젝트검색(코드 🔍 이름 두 칸),
 * post 다른 게시판 글 잇기(board) · slip 판매 · 구매 · 견적서 전표 잇기(2026-10-22 loginaa 실측).
 */
export type Extra = { name: string; type: 'text' | 'date' | 'range' | 'emp' | 'vehicle' | 'item' | 'partner' | 'project' | 'post' | 'slip'; board?: PostBoardCode; slip?: 'sales' | 'purchase' | 'quotation' }
/** 원본 차량번호검색 창의 차량(코드 001 ~ 005 · 항목명). */
/** 2026-10-30 원본 차량 정보관리 목록 실측: 188머6153(예전 검색창 실측의 '188마' 는 잘못 옮겨 적은 것). */
export const VEHICLES = [['001', '458노4836'], ['002', '981부8492'], ['003', '188머6153'], ['004', '269라2544'], ['005', '356서1147']] as const
/** 게시판 잇기 창 제목(이모지 + 게시판 이름 + '검색창'). */
/** 게시판 잇기 창 [신규(F2)] · [리스트] 가 여는 그 게시판 화면(원본은 창 위에 창을 겹쳐 연다 — 우리는 새 탭). */
export const POST_BOARD_PATH: Partial<Record<PostBoardCode, string>> = {
  CONSULT: '/groupware/consult-board', VISIT: '/groupware/visit-board', CAR_INFO: '/groupware/car-info', CAR_DOC: '/groupware/car-doc', SITE_STATUS: '/groupware/site-status',
}
export const POST_BOARD_TITLE: Partial<Record<PostBoardCode, string>> = {
  CONSULT: '🎧 상담 이력관리', VISIT: '🤝🏻 영업 방문관리', CAR_INFO: '🚗 1. 차량 정보관리', CAR_DOC: '🚗 2. 차량 증빙관리', SITE_STATUS: '📊 공사진행현황',
}

/**
 * 통합회의록(E200066, 2026-10-13 실측)의 부서 칸 — 격자 머리 '경영지원팀 회의록 · 구매팀 회의록 · 생산팀 회의록 · 영업팀 회의록',
 * View 의 '경영지원팀(클릭)' …. 칸마다 🔍 '팀별회의록 게시판검색창' 에서 글을 하나 [적용] 한다.
 */
export const MINUTE_TEAMS = ['경영지원팀', '구매팀', '생산팀', '영업팀']
/** 원본 '주차검색': 코드 1 ~ 5, 항목명 '1주차' …. */
export const WEEKS = [1, 2, 3, 4, 5]

/**
 * 게시판마다 다른 것(2026-10-13 원본 실측).
 * - wide: E0725xx 꼴(통합게시판 · 간판제작) — 머리 '번호' · '작성자', 전달자 뒤에 [완료일] 열이 있다.
 *   E2000xx 꼴(WORK · 공지사항 · 팀별회의록)은 '게시글번호' · '작성자명', 완료일 열이 없다.
 * - stages: 회사가 정한 진행상태 이름(서버 stage). null 이면 WORK 의 진행중/완료.
 * - labels: [라벨] · [라벨변경] · [라벨설정] 이 있는가(통합게시판에는 없다).
 * - stageLabel: 진행상태 자리의 이름(팀별회의록은 '부서구분'). defaultStage: 새 글의 진행상태(안 주면 stages[0]).
 */
export type BoardCfg = {
  wide: boolean; stages: string[] | null; labels: boolean; period: 'yearBack' | 'lastYear'
  stageLabel?: string; defaultStage?: string
  /** 통합회의록 꼴: 작성자 · 전달자 · 진행상태 열 대신 부서 회의록 넷 · 주 차, 입력 창에 부서 칸 · [주 차 구분].
   *  입력 창 차례도 원본대로 제목 · 진행상태(진행중 · 완료) · 전달자 · 공지사항여부(Y · N 라디오, 처음 N) · 참조자(2026-10-14 실측). */
  minutes?: boolean
  /** 입력 창 [참조자] 처음 값이 '전체'(원본 통합회의록 · 팀별회의록, 2026-10-14 · 10-13 실측). */
  ccAll?: boolean
  /** 입력 창 첨부 아래 [주 차 구분](주차검색 1 ~ 5주차) — 팀별회의록(통합회의록은 minutes 가 그린다). */
  weekPick?: boolean
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
  /** 조건 판 맨 위 [메뉴] ○조회 ○현황 ○집계(통합게시판 E200076 실측). */
  menuModes?: boolean
  /** 새 글 본문에 미리 채우는 양식. */
  template?: string
  /** 카드 아랫줄에 보일 입력항목 이름(칸반). */
  subField?: string
}
/** 원본 '계약관리 게시판(예시)' 셋 — 진행상태 '기본' 하나, 격자는 공지사항과 같은 꼴(2026-10-14 실측). */
export const PLAIN_COLS: Col[] = ['no', 'title', 'writer', 'forward', 'stage']
export const SAMPLE = { wide: false, period: 'lastYear', contentOptional: true } as const
export const BOARD_CFG: Record<PostBoardCode, BoardCfg> = {
  WORK: { wide: false, stages: null, labels: true, period: 'yearBack' },
  NOTICE: { wide: false, stages: ['기본'], labels: true, period: 'yearBack' },
  SHARED: { wide: true, stages: ['Default'], labels: false, period: 'lastYear', menuModes: true },
  /*
   * 팀별회의록 게시판(E200068, 2026-10-13 실측): 알약 [전체][경영지원팀][구매팀][생산팀][영업팀][항목을 자유롭게 추가 할 수 있습니다.],
   * 격자 머리 '부서구분', 입력 창 [부서구분] 의 처음 값이 '항목을 자유롭게 추가 할 수 있습니다.' 다. 기본 기간 전년.
   */
  MEETING: {
    wide: false, labels: true, period: 'lastYear', stageLabel: '부서구분',
    stages: ['경영지원팀', '구매팀', '생산팀', '영업팀', '항목을 자유롭게 추가 할 수 있습니다.'],
    defaultStage: '항목을 자유롭게 추가 할 수 있습니다.', ccAll: true, weekPick: true,
  },
  /* 간판제작 프로젝트관리(E200070, 2026-10-13 실측): 알약 [전체][수주견적][디자인팀 시안][자재발주, 제작][현장시공], 기본 기간 전년. */
  SIGN: { wide: true, stages: ['수주견적', '디자인팀 시안', '자재발주, 제작', '현장시공'], labels: true, period: 'lastYear' },
  /*
   * 통합회의록(E200066, 2026-10-13 직접 등록 · 수정 · 삭제): 알약 [전체][진행중][완료], 기본 기간 전년, 라벨 없음.
   * 격자 게시글번호 · 제목 · 경영지원팀 회의록 · 구매팀 회의록 · 생산팀 회의록 · 영업팀 회의록 · 주 차 · 첨부 · 조회.
   */
  MINUTES: { wide: false, stages: null, labels: false, period: 'lastYear', minutes: true, contentOptional: true, ccAll: true },
  /*
   * 업무관리 의 예시 게시판(2026-10-14 loginaa 목록 · 입력 창 실측). 원본 목록의 글은 모두 '이카운트' 가 쓴 예시라
   * 우리 쪽은 빈 게시판으로 시작한다. 원본에서 🚗 1. 차량 정보관리에 제목만 넣고 저장 → 저장됨(본문 없이), 번호는 그 게시판 혼자 센다.
   */
  // 🔹 이카운트 AI 활용 예시 🔹 (E200188): 게시글번호 · 제목 · 작성자명 · 첨부 · 조회, 알약 진행중 · 완료, 기본 기간 최근 1년, 라벨 없음.
  AI_GUIDE: { ...SAMPLE, period: 'yearBack', stages: null, labels: false, cols: ['no', 'title', 'writer'] },
  // 🏗️ 현장공사일지 (E200176): 게시글번호 · 현장명 · 제목 · 작성자명 · 전달자 · 공정 흐름. 입력 창 [공정 흐름] 처음 값 '측량'.
  // 공정 이름은 2026-10-30 원본 알약 실측: 지반조사 · 측량 · 기초굴토 · 가설 (글 제목의 '땅파기 (기초굴토)' · '가설공사' 는 제목일 뿐).
  SITE_LOG: {
    ...SAMPLE, labels: true, stageLabel: '공정 흐름', stages: ['지반조사', '측량', '기초굴토', '가설'], defaultStage: '측량',
    cols: ['no', 'x:현장명', 'title', 'writer', 'forward', 'stage'],
    extras: [{ name: '현장명', type: 'text' }, { name: '거래형1', type: 'post', board: 'SITE_STATUS' }, { name: '프로젝트', type: 'project' }],
  },
  // 📊 공사진행현황 (E200178): 일자-No. · 게시글번호 · 제목 · 작성자명 · 전달자 · 진행상태, 알약 진행중 · 완료, 라벨 없음.
  SITE_STATUS: { ...SAMPLE, stages: null, labels: false, cols: ['dateNo', 'no', 'title', 'writer', 'forward', 'stage'] },
  // 📅 개발업무일지 (E200174): 게시글번호 · 프로젝트명 · 제목 · 작성자명 · 진행상태. 입력 창 [진행상태] 처음 값 '기획', 거래처 · 프로젝트 · 담당자 · 비고.
  DEV_LOG: {
    ...SAMPLE, labels: true, stages: ['요구분석', '기획', '디자인', '개발', '테스트', '디버깅', '오픈(완료)'], defaultStage: '기획',
    cols: ['no', 'x:프로젝트|프로젝트명', 'title', 'writer', 'stage'],
    extras: [{ name: '거래처', type: 'partner' }, { name: '프로젝트', type: 'project' }, { name: '담당자', type: 'emp' }, { name: '비고', type: 'text' }],
  },
  // 📈 개발진행현황 (E200186): 게시글번호 · 제목 · 전달자 · 일자 · 작성자명 · 진행상태, 알약 진행중 · 완료.
  DEV_STATUS: { ...SAMPLE, stages: null, labels: true, cols: ['no', 'title', 'forward', 'postDate', 'writer', 'stage'] },
  // 계약관리 게시판(예시) 🎧 · 🤝🏻 · 📑 (E200166 · E200168 · E200170): 알약 [전체][기본][진행상태를 자유롭게 추가 가능합니다].
  CONSULT: { ...SAMPLE, labels: true, stages: ['기본'], freePill: true, cols: PLAIN_COLS },
  VISIT: { ...SAMPLE, labels: true, stages: ['기본'], freePill: true, cols: PLAIN_COLS, extras: [{ name: '전표형식1', type: 'post', board: 'CONSULT' }] },
  CONTRACT: {
    ...SAMPLE, labels: true, stages: ['기본'], freePill: true, cols: PLAIN_COLS,
    extras: [{ name: '전화상담 보고서', type: 'post', board: 'CONSULT' }, { name: '방문 보고서', type: 'post', board: 'VISIT' },
      { name: '판매 전표', type: 'slip', slip: 'sales' }, { name: '최종 발송 견적서', type: 'slip', slip: 'quotation' }],
  },
  // 🛠️ A/S 관리 (E200184): 게시글번호 · 수리요청일 · 제목 · 작성자명 · 전달자 · 진행상태, 알약 [전체][기본].
  AS_CARE: {
    ...SAMPLE, labels: true, stages: ['기본'], cols: ['no', 'x:수리요청일', 'title', 'writer', 'forward', 'stage'],
    extras: [{ name: '수리요청일', type: 'date' }, { name: '날짜/시간', type: 'range' }, { name: '품목', type: 'item' }, { name: '상담 이력', type: 'post', board: 'CONSULT' }, { name: '연관 매입 내역', type: 'slip', slip: 'purchase' }],
  },
  // 🚗 1. 차량 정보관리 (E200172): 게시글번호 · 제목 · 차량번호 · 출고일자 · 작성자명 · 전달자 · 진행상태. 입력 창 제목 아래 [출고일자] · [차량번호].
  CAR_INFO: {
    ...SAMPLE, labels: true, stages: null, freePill: true, cols: ['no', 'title', 'x:차량번호', 'x:출고일자', 'writer', 'forward', 'stage'],
    extras: [{ name: '출고일자', type: 'date' }, { name: '차량번호', type: 'vehicle' }],
  },
  // 🚗 2. 차량 증빙관리 (E200180): 공지사항 꼴, 알약 진행중 · 완료 + 자유롭게 추가.
  CAR_DOC: { ...SAMPLE, labels: true, stages: null, freePill: true, cols: PLAIN_COLS, extras: [{ name: '차량정보', type: 'post', board: 'CAR_INFO' }] },
  // 🚗 3. 차량 운행관리 (E200182): 게시글번호 · 제목 · 차량증빙 · 차량정보 · 작성자명 · 진행상태, 라벨 없음.
  CAR_RUN: { ...SAMPLE, labels: false, stages: null, freePill: true, cols: ['no', 'title', 'x:차량증빙', 'x:차량정보', 'writer', 'stage'],
    extras: [{ name: '차량정보', type: 'post', board: 'CAR_INFO' }, { name: '차량증빙', type: 'post', board: 'CAR_DOC' }] },
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
    extras: [{ name: '담당자', type: 'emp' }], subField: '담당자',
    template: '*고객정보*\n\n회사명:\n업종:\n담당자/직급:\n연락처:\n주소:\n기존 프로그램:\n니즈:\n\n영업 담당자는 담당자에 본인 이름을 걸어주시고, 진행중 라벨을 달아주세요.\n고객 리드 건 진행 상황은 답글 형태로 남겨주세요.',
  },
  /*
   * 📅 프로젝트 진행현황 칸반 (E200072, 2026-10-13 실측): 간판제작과 같은 E0725xx 꼴(번호 · 제목 · 작성자 · 전달자 · 완료일 · 진행상태),
   * 알약 진행중 · 완료, 기본 기간 전년. 글 View 본문이 칸반 판 — 이 글에 [칸반연결] 한 간판제작 글(열 = [프로젝트], 줄 = 진행상태).
   */
  PROJECT_KANBAN: { wide: true, stages: null, labels: true, period: 'lastYear' },
}

/** 서버가 진행상태 이름을 stage 에 적는 게시판(PostBoard#namedStages). */
export const NAMED_STAGE_BOARDS = new Set<PostBoardCode>(['SHARED', 'MEETING', 'SIGN', 'SITE_LOG', 'DEV_LOG', 'CONSULT', 'VISIT', 'CONTRACT', 'AS_CARE', 'KANBAN_SAMPLE'])
export const colHead = (c: Col, stageLabel: string) => {
  if (c.startsWith('x:')) { const [k, h] = c.slice(2).split('|'); return h ?? k }
  return ({ no: '게시글번호', dateNo: '일자-No.', title: '제목', writer: '작성자명', forward: '전달자', stage: stageLabel, postDate: '일자' } as Record<string, string>)[c]
}
export function parseExtra(json?: string | null): Record<string, string> {
  if (!json) return {}
  try { const o = JSON.parse(json); return o && typeof o === 'object' ? o : {} } catch { return {} }
}
