import { useCallback, useRef, useEffect, useMemo, useState } from 'react'
import EcListShell from '../../components/EcListShell'
import { useTableSort } from '../../utils/useTableSort'
import { EcCond } from '../../components/EcStatusPanel'
import { PARTNER_LEDGER_PICKS, periodOf } from '../../components/EcPeriodPicks'
import { api, extractErrorMessage } from '../../api/client'
import type { PartnerBalance } from '../../api/types'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import CodePickerField from '../../components/CodePickerField'
import EcBarChart from '../../components/EcBarChart'
import { subtotalBy } from '../../utils/subtotalBy'
import { dateText } from '../../utils/dateText'
import type { LedgerBasis } from '../../utils/partnerRollup'
import { useCondPickers } from '../../utils/useCondPickers'
import { Link, useNavigate } from 'react-router-dom'

const won = (n: number) => n.toLocaleString('ko-KR')

/**
 * 잔액 칸 색.
 *
 * <p>음수는 <b>0 이 아니다.</b> 채권이 음수면 받을 돈보다 더 받은 것(선수금),
 * 채무가 음수면 줄 돈보다 더 준 것(선급금)이다. 예전에는 {@code n > 0 ? 색 : 회색} 이라
 * 선수금 100만원이 잔액 0 과 똑같이 흐린 회색으로 찍혔다 — 눈에 안 띄어 그냥 지나쳤다.
 */
const balanceStyle = (n: number, positive: string) => ({
  textAlign: 'right' as const,
  fontWeight: 600,
  color: n > 0 ? positive : n < 0 ? '#c60a2e' : '#bbb',
})

/** 음수 잔액에 붙이는 꼬리표. 숫자만으로는 무슨 뜻인지 알 수 없다. */
const balanceNote = (n: number, kind: '채권' | '채무') =>
  n < 0 ? (kind === '채권' ? ' (선수금)' : ' (선급금)') : ''

/** 채권만 / 채무만 / 둘 다. 원본은 거래처별채권(영업)과 거래처별채무(구매)가 <b>따로</b> 있다. */
export type LedgerSide = 'AR' | 'AP' | 'BOTH'

const TITLE: Record<LedgerSide, string> = {
  AR: '거래처별채권',
  AP: '거래처별채무',
  BOTH: '거래처별 채권·채무 현황',
}

/**
 * 원본 조건 판 실측(사본 · 거래처별채권/채무):
 *   [구분] 거래처별 | 담당자별 · 기준일자(전월+금월) · 거래처 · 대표거래처로 합산 ·
 *   거래처관계기준/개별거래처기준 · 거래처관리담당자 · [기타] 사용중단거래처포함 · 잔액
 *
 * <p>우리 화면은 조건이 <b>하나도 없었다</b> — 거래처 잔액을 통째로 뿌리기만 했다.
 * 특히 [구분] 담당자별이 없어 "이 담당자가 걷어야 할 돈이 얼마인가"를 볼 수가 없었다.
 *
 * <p>[대표거래처로 합산]은 <b>체크박스가 아니라 라디오 두 알</b>이다 —
 * [거래처관계기준] · [개별거래처기준]. 켜고 끄는 체크는 원본에 아예 없다
 * (qa/fixtures/ecount-radio-options.json 의 MainCustFlag, 채권현황과 글자까지 같다).
 * 예전에는 "그 체크와 같은 선택이라 안 그린다" 고 적고 검사 예외까지 달아 뒀는데,
 * 그 바람에 <b>[개별거래처기준]이라는 말이 화면에 한 번도 안 나왔고</b> 기본값도 뒤집혀 있었다.
 * 원본은 <b>[거래처관계기준]이 눌린 채로</b> 열린다(대조표의 `*`). 채권현황(cc77445)에서
 * 같은 것을 고쳤는데 이 화면이 남아 있었다.
 *
 * <p><b>원본 결과 열 실측(사본)</b>:
 * 채권 — 거래처명 · 기초채권 · 재고매출 · 회계매출 · 수금합계 · 기타할인등차액 · 잔액,
 * 채무 — 거래처명 · 기초채무 · 재고매입 · 회계매입 · 지급합계 · 기타할인등차액 · 잔액.
 * 우리는 <b>잔액 한 칸</b>뿐이었다. 잔액만 보면 왜 움직였는지 알 수 없다 — 새로 판 것 때문인지
 * 수금이 안 들어온 것인지 구분이 안 된다. 그래서 기준일자 구간을 받아 잔액을 쪼갠다
 * (GET /api/ledger/partner-movements).
 *
 * <p>[기타할인등차액]은 <b>나머지</b>다: 잔액 − (기초 + 재고 + 회계 − 수금). 0 이 아니면
 * 우리가 이름 붙여 세지 못한 움직임이 있다는 뜻이다. 지금은 <b>회계전표가 외상매출금·
 * 외상매입금을 직접 움직인 것</b>(어음·수표·상계)이 잔액 공식에 안 들어가 있어 여기 남는다.
 * 감추지 않고 그대로 보여 준다 — 감추면 채권이 왜 안 줄었는지 영영 못 찾는다.
 *
 * <p>채권·채무를 한 화면에서 보는 [BOTH]는 원본에 없는 우리 화면이라 예전 두 칸 표를 유지한다.
 */
/*
 * 원본 거래처관리대장 I 의 <b>[집계구분]</b>. 사본 실측 후보는
 * 거래처별 · 전표별 · 전표별+내역 · 일별 · 월별 · 회계전표별 이다.
 *
 * <p>[전표별]·[일별]·[월별]은 <b>열 예외에 "원장을 전표·일·월 단위로 쪼개지 않는다" 고
 * 적혀 있던 것</b>이다 — 그건 기능이 없다는 말이었지 값이 없다는 말이 아니었다.
 * 판매·구매·정산 전표가 일자와 전표번호와 금액을 이미 다 들고 있다. 합계만 내던 화면은
 * <b>잔액이 왜 그 값인지</b>를 못 보여 준다: 어느 전표가 올렸고 어느 수금이 내렸는지가
 * 안 보인다.
 *
 * <p>아직 없는 둘은 그대로 예외다 — [전표별+내역]은 줄(품목)까지 펴는 것이라 별개의 일이고,
 * [회계전표별]은 회계전표 단위 원장이라 축이 다르다.
 *
 * <p>[담당자별]은 원본에 없는 우리 것이다(거래처별채권·채무의 [구분]에서 왔다).
 */
type Group = '거래처별' | '담당자별' | '전표별' | '일별' | '월별'

/** [전표별] 원장 한 줄 (GET /api/ledger/partner-entries). */
interface Entry {
  date: string
  docNo: string | null
  kind: string
  partnerId: number
  partnerName: string
  increase: number
  decrease: number
}

/** 거래처별채권·채무의 기간 움직임 (GET /api/ledger/partner-movements). */
interface Movement {
  partnerId: number
  code: string
  name: string
  manager: string | null
  opening: number
  stockAmount: number
  accountingAmount: number
  settledAmount: number
  otherDiff: number
  closing: number
}

export default function LedgerPage({ side: initialSide = 'BOTH' }: { side?: LedgerSide }) {
  /*
   * 원본 거래처관리대장의 <b>[채권채무구분]</b>. 우리는 메뉴(경로)로만 갈랐다 —
   * 채권을 보다가 채무를 보려면 <b>메뉴로 되돌아가야</b> 했다. 원본은 화면 안에서 고른다.
   * 들어온 경로가 기본값이 된다.
   */
  /*
   * 원본 [결재방표시] — 켜면 출력물에 <b>결재란</b>(담당/검토/승인 도장칸)이 찍힌다.
   * 기본값은 <b>꺼짐</b>이다(사본 실측). 우리는 그 칸을 늘 찍고 있었다.
   */
  const [signBox, setSignBox] = useState(false)
  const [side, setSide] = useState<LedgerSide>(initialSide)
  /** 원본 [전표입력] — 판매입력으로 넘긴다. */
  const navigate = useNavigate()
  const showAr = side !== 'AP'
  const showAp = side !== 'AR'
  /* 원본은 조건 판의 창고·거래처·품목·프로젝트를 모두 코드도움으로 둔다. */
  const pickers = useCondPickers(['partners', 'employees'])
  const [rows, setRows] = useState<PartnerBalance[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [group, setGroup] = useState<Group>('거래처별')
  const [partner, setPartner] = useState('')
  const [manager, setManager] = useState('')
  /*
   * 원본 [사용중단거래처포함]은 <b>켜짐</b>이 기본이다(사본 실측).
   * 거래를 그만둔 곳이라도 못 받은 돈은 그대로 남아 있다 — 꺼 두면 화면 위 [총 채권]과
   * 움직임 표의 합계가 실제보다 작게 나온다. 채권현황(ArApStatusPage)에서 같은 것을
   * 이미 한 번 고쳤는데 이 화면이 남아 있었다.
   */
  const [withInactive, setWithInactive] = useState(true)
  const [onlyOpen, setOnlyOpen] = useState(false)
  /** 원본 [정렬/소계기준]. 채권현황과 같은 두 기준을 쓴다. */
  const SUBTOTALS = ['거래처그룹', '거래처관리담당자'] as const
  const [subtotal, setSubtotal] = useState<typeof SUBTOTALS[number]>('거래처그룹')
  /** 원본 [데이터 보기형식]. 기본은 표다 — 사본의 [그래프로 보기]가 꺼짐이다. */
  const [view, setView] = useState<'표' | '그래프'>('표')
  /** 원본 조건 판의 기준일자. 기본값도 원본 그대로 [전월+금월] 이다. */
  const init = periodOf('전월+금월')!
  const [from, setFrom] = useState(init.from)
  const [to, setTo] = useState(init.to)
  const [moves, setMoves] = useState<Movement[]>([])
  /* [전표별]·[일별]·[월별]이 쓰는 줄. 그 셋을 고를 때만 받는다. */
  const [entries, setEntries] = useState<Entry[]>([])
  /**
   * 원본 대장 열 [검색창내용]. 잔액 API 가 주지 않아 <b>거래처 목록에서 붙인다</b> —
   * 부르는 이름(별칭)이라, 코드도 상호도 모르는 사람이 이 칸으로 알아본다.
   */
  const [aliasOf, setAliasOf] = useState<Map<number, string>>(new Map())
  /*
   * 원본 <b>[대표거래처로 합산]</b> — 지점·사업장을 <b>한 회사로 묶어</b> 잔액을 본다.
   * 예전에는 '거래처 관계 마스터가 없다' 고 적고 뺐는데 <b>대표거래처는 그 사이 생겼다</b>
   * (BusinessPartner.parent, 거래처리스트의 [관계설정]으로 정한다).
   * 지점이 다섯이면 채권이 다섯 줄로 흩어져, 그 회사에 얼마를 받을지 눈으로 더해야 했다.
   */
  const [parentOf, setParentOf] = useState<Map<number, { id: number; name: string }>>(new Map())
  /** 원본은 [거래처관계기준]이 눌린 채로 열린다(대조표 MainCustFlag 의 `*`). */
  const [basis, setBasis] = useState<LedgerBasis>('거래처관계기준')
  const byParent = basis === '거래처관계기준'
  useEffect(() => {
    api.get<{ id: number; searchKeyword: string | null; parentId: number | null; parentName: string | null }[]>('/partners')
      .then((r) => {
        setAliasOf(new Map(r.data.map((x) => [x.id, x.searchKeyword ?? ''])))
        setParentOf(new Map(r.data
          .filter((x) => x.parentId != null)
          .map((x) => [x.id, { id: x.parentId as number, name: x.parentName ?? '' }])))
      })
      .catch(() => { setAliasOf(new Map()); setParentOf(new Map()) })
  }, [])

  /** 잔액을 다시 읽는다. 원본 [검색(F8)] 이 이 일을 한다. */
  const load = useCallback(() => {
    setLoading(true)
    setError('')
    api
      .get<PartnerBalance[]>('/ledger/partner-balances')
      .then((res) => setRows(res.data))
      .catch((err) => setError(extractErrorMessage(err)))
      .finally(() => setLoading(false))
  }, [])
  useEffect(() => { load() }, [load])

  // 채권·채무를 한쪽만 보는 화면(원본의 거래처별채권/채무)에서만 열을 쪼갠다.
  const oneSide = side !== 'BOTH'
  useEffect(() => {
    if (!oneSide) return
    api
      .get<Movement[]>('/ledger/partner-movements', { params: { from, to, side } })
      .then((res) => setMoves(res.data))
      .catch((err) => setError(extractErrorMessage(err)))
  }, [oneSide, side, from, to])

  /*
   * 전표 줄은 <b>그 셋을 고를 때만</b> 받는다 — 거래처별로 보는 사람에게는 쓸 데가 없는데
   * 기간이 넓으면 전표가 수천 줄이다.
   */
  const byDoc = group === '전표별' || group === '일별' || group === '월별'
  useEffect(() => {
    if (!oneSide || !byDoc) { setEntries([]); return }
    api
      .get<Entry[]>('/ledger/partner-entries', { params: { from, to, side } })
      .then((res) => setEntries(res.data))
      .catch((err) => setError(extractErrorMessage(err)))
  }, [oneSide, byDoc, side, from, to])

  const shown = useMemo(() => rows.filter((r) => {
    if (partner && !(r.name.includes(partner) || r.code.includes(partner))) return false
    if (manager && !(r.manager ?? '').includes(manager)) return false
    if (!withInactive && !r.active) return false
    if (onlyOpen) {
      const bal = (showAr ? r.receivable : 0) + (showAp ? r.payable : 0)
      if (bal === 0) return false
    }
    return true
  }), [rows, partner, manager, withInactive, onlyOpen, showAr, showAp])

  /**
   * 원본 [대표거래처로 합산]. 대표를 정해 둔 거래처는 <b>대표 줄에 합쳐</b> 센다.
   * 대표가 없는 거래처는 <b>자기가 곧 대표</b>라 그대로 한 줄로 남는다.
   */
  const rollUp = <T extends { partnerId: number; name: string }>(list: T[], add: (a: T, b: T) => T) => {
    if (!byParent) return list
    const m = new Map<number, T>()
    for (const r of list) {
      const head = parentOf.get(r.partnerId)
      const key = head?.id ?? r.partnerId
      const cur = m.get(key)
      if (!cur) m.set(key, { ...r, partnerId: key, name: head?.name || r.name })
      else m.set(key, add(cur, r))
    }
    return [...m.values()]
  }
  const shownRolled = rollUp(shown, (a, b) => ({
    ...a, receivable: a.receivable + b.receivable, payable: a.payable + b.payable,
  }))

  /** 담당자별 — 같은 관리담당자의 거래처 잔액을 모은다. 담당자가 없으면 '(미지정)'. */
  const byManager = useMemo(() => {
    const m = new Map<string, { key: string; count: number; receivable: number; payable: number }>()
    for (const r of shown) {
      const key = r.manager?.trim() || '(미지정)'
      const cur = m.get(key)
      if (!cur) m.set(key, { key, count: 1, receivable: r.receivable, payable: r.payable })
      else { cur.count += 1; cur.receivable += r.receivable; cur.payable += r.payable }
    }
    return [...m.values()].sort((a, b) => (b.receivable + b.payable) - (a.receivable + a.payable))
  }, [shown])

  /** 조건(거래처·담당자)을 움직임 표에도 그대로 건다. */
  const shownMoves = useMemo(() => moves.filter((m) => {
    if (partner && !(m.name.includes(partner) || m.code.includes(partner))) return false
    if (manager && !(m.manager ?? '').includes(manager)) return false
    if (onlyOpen && m.closing === 0) return false
    return true
  }), [moves, partner, manager, onlyOpen])
  const movesRolled = rollUp(shownMoves, (a, b) => ({
    ...a,
    opening: a.opening + b.opening, stockAmount: a.stockAmount + b.stockAmount,
    accountingAmount: a.accountingAmount + b.accountingAmount,
    settledAmount: a.settledAmount + b.settledAmount,
    otherDiff: a.otherDiff + b.otherDiff, closing: a.closing + b.closing,
  }))

  /*
   * <b>[전표별]·[일별]·[월별] 줄.</b> 거래처·담당자 조건을 움직임 표와 <b>같은 잣대로</b> 건다 —
   * 담당자는 전표가 안 들고 있어 거래처의 담당자를 쓴다(movements 가 그것을 준다).
   *
   * <p>잔액 누계는 <b>기초잔액에서부터</b> 선다. 기초를 안 깔면 첫 줄의 잔액이 0에서
   * 시작해 <b>실제 잔액과 다른 숫자</b>가 되고, 그게 원장에서 가장 흔한 거짓말이다.
   */
  const managerOf = useMemo(() => new Map(moves.map((m) => [m.partnerId, m.manager ?? ''])), [moves])
  const nameOf = useMemo(() => new Map(moves.map((m) => [m.partnerId, m.name])), [moves])
  const entryRows = useMemo(() => {
    const kept = entries.filter((e) => {
      if (partner && !((nameOf.get(e.partnerId) ?? e.partnerName).includes(partner))) return false
      if (manager && !(managerOf.get(e.partnerId) ?? '').includes(manager)) return false
      return true
    })
    /* [일별]·[월별]은 같은 줄을 날짜/달로 묶는다 — 전표번호는 묶으면 뜻을 잃어 비운다. */
    const keyOf = (e: Entry) => (group === '월별' ? e.date.slice(0, 7) : e.date)
    const grouped = group === '전표별'
      ? kept.map((e) => ({ key: e.date, date: e.date, docNo: e.docNo, kind: e.kind,
                           name: nameOf.get(e.partnerId) ?? e.partnerName,
                           increase: e.increase, decrease: e.decrease }))
      : [...kept.reduce((m, e) => {
          const k = keyOf(e)
          const cur = m.get(k)
          if (cur) { cur.increase += e.increase; cur.decrease += e.decrease }
          else m.set(k, { key: k, date: k, docNo: null, kind: `${kept.filter((x) => keyOf(x) === k).length}건`,
                          name: '', increase: e.increase, decrease: e.decrease })
          return m
        }, new Map<string, { key: string; date: string; docNo: string | null; kind: string; name: string; increase: number; decrease: number }>()).values()]
    grouped.sort((a2, b2) => (a2.date < b2.date ? -1 : a2.date > b2.date ? 1 : 0))
    let bal = movesRolled.reduce((t, m) => t + m.opening, 0)
    return grouped.map((g) => { bal += g.increase - g.decrease; return { ...g, balance: bal } })
  }, [entries, group, partner, manager, managerOf, nameOf, movesRolled])
  const entryTotal = useMemo(() => entryRows.reduce(
    (t, e) => ({ inc: t.inc + e.increase, dec: t.dec + e.decrease }), { inc: 0, dec: 0 }), [entryRows])

  const moveTotal = useMemo(() => movesRolled.reduce((t, m) => ({
    opening: t.opening + m.opening, stock: t.stock + m.stockAmount,
    acct: t.acct + m.accountingAmount, settled: t.settled + m.settledAmount,
    other: t.other + m.otherDiff, closing: t.closing + m.closing,
  }), { opening: 0, stock: 0, acct: 0, settled: 0, other: 0, closing: 0 }), [movesRolled])

  const subtotals = useMemo(
    () => subtotalBy(shownRolled, (r) => (subtotal === '거래처관리담당자' ? r.manager : r.partnerGroupName),
      { receivable: (r) => r.receivable, payable: (r) => r.payable }),
    [shown, subtotal])
  /* 한쪽만 보는 화면이면 그 쪽 잔액을, 둘 다 보면 순채권(채권−채무)을 그린다. */
  const chartRows = useMemo(() => shownRolled.map((r) => ({
    label: r.name,
    value: side === 'AR' ? r.receivable : side === 'AP' ? r.payable : r.receivable - r.payable,
  })), [shown, side])

  const totalReceivable = shownRolled.reduce((a, r) => a + r.receivable, 0)
  const totalPayable = shownRolled.reduce((a, r) => a + r.payable, 0)

  // 조건부 열이 있어 정적 검사(qa/ui-check.mjs)로는 칸 수를 셀 수 없다.
  // 개발 모드에서 렌더된 표를 직접 재서 합계행이 밀렸는지 잡는다.
  const tableRef = useRef<HTMLTableElement>(null)
  /*
   * 두 칸에 <b>▼ 만 그려 놓고</b> 정렬은 없었다. 정렬은 <b>목록 표에만</b> 건다 —
   * 아래 소계·그래프는 <code>shown</code> 을 묶어 만들므로 그쪽 입력까지 뒤집으면
   * 소계 줄의 차례가 목록을 따라 흔들린다.
   */
  const sort = useTableSort(shownRolled, {
    거래처코드: (r) => r.code,
    /* 원본 거래처관리대장 I 의 이름은 [상호] 가 아니라 <b>[거래처명]</b> 이다(사본 실측). */
    거래처명: (r) => r.name,
  })

  useTableColumnCheck(tableRef, '거래처별 채권·채무', [side, shownRolled.length, group, basis])
  // 담당자별 표도 채권/채무 열이 조건부라 정적으로 셀 수 없다 — 같은 방식으로 못 박는다.
  const mgrTableRef = useRef<HTMLTableElement>(null)
  useTableColumnCheck(mgrTableRef, '담당자별 채권·채무', [side, byManager.length, group])

  return (
    <EcListShell
      title={TITLE[side]}
      actions={[
        { label: '검색(F8)', primary: true, onClick: load },
        // 원본 차례: 검색(F8) · 인쇄 · Excel · 전표입력 (사본 실측)
        { label: '인쇄' },
        { label: 'Excel' },
        /*
         * 원본 [전표입력] — 대장을 보다가 그 자리에서 전표를 만든다. 우리는 판매입력에서
         * 만들므로 그 화면으로 넘긴다. 거래처를 골라 뒀으면 물고 간다.
         */
        { label: '전표입력', onClick: () => {
          // 판매입력은 ?partnerId= 로 거래처를 문다. 조건은 이름이라 id 를 찾아 넘긴다.
          const picked = rows.find((r) => r.name === partner)
          navigate(picked ? `/sales/sell?partnerId=${picked.partnerId}` : '/sales/sell')
        } },
        { label: '다시 작성', onClick: () => {
          setGroup('거래처별'); setPartner(''); setManager(''); setWithInactive(false); setOnlyOpen(false)
        } },
      ]}
      signLine={signBox}
    >
      <ul className="ec-cond" style={{ marginBottom: 8 }}>
        {/*
          원본 [채권채무구분] — <b>전체 · 채권 · 채무</b> 차례다(사본 실측).
          우리는 '채권채무' 라 적고 맨 뒤에 두었다. 이름도 자리도 원본에 맞춘다.
        */}
        <EcCond label="채권채무구분">
          <div className="ec-pills">
            {([['BOTH', '전체'], ['AR', '채권'], ['AP', '채무']] as const).map(([v, l]) => (
              <button key={v} type="button" className={`ec-pill no-ec${side === v ? ' active' : ''}`}
                      onClick={() => setSide(v)}>{l}</button>
            ))}
          </div>
        </EcCond>
        {/*
          <b>이 파일이 겸하는 화면들이 이 줄을 서로 다르게 부른다</b>(사본 실측) —
          거래처별채권·채무는 <b>[구분]</b>(rbSumGubun 라디오, [거래처별]·[담당자별]),
          거래처관리대장 I 은 <b>[집계구분]</b>이다. 한쪽 이름으로 눌러 두면 다른 쪽이 늘 틀린다.
        */}
        <EcCond label={oneSide ? '구분' : '집계구분'}>
          <div className="ec-pills">
            {(['거래처별', '담당자별'] as const).map((g) => (
              <button key={g} type="button" className={`ec-pill no-ec${group === g ? ' active' : ''}`}
                      onClick={() => setGroup(g)}>{g}</button>
            ))}
            {/* 원장을 쪼개는 셋은 <b>한쪽만 볼 때만</b> 뜻이 있다 — 채권과 채무를 한 표에
                섞어 놓고 잔액을 누계하면 그 숫자가 무엇인지 아무도 못 읽는다. */}
            {oneSide && (['전표별', '일별', '월별'] as const).map((g) => (
              <button key={g} type="button" className={`ec-pill no-ec${group === g ? ' active' : ''}`}
                      onClick={() => setGroup(g)}>{g}</button>
            ))}
          </div>
        </EcCond>
        {oneSide && (
          <EcCond label="기준일자">
            <input type="date" className="ec-input" value={from}
                   onChange={(e) => setFrom(e.target.value)} style={{ width: 140 }} />
            <span style={{ margin: '0 4px' }}>~</span>
            <input type="date" className="ec-input" value={to}
                   onChange={(e) => setTo(e.target.value)} style={{ width: 140 }} />
            <span style={{ marginLeft: 6, display: 'inline-flex', gap: 3 }}>
              {PARTNER_LEDGER_PICKS.map((label) => (
                <button key={label} type="button" className="ec-btn"
                        onClick={() => { const r = periodOf(label); if (r) { setFrom(r.from); setTo(r.to) } }}>
                  {label}
                </button>
              ))}
            </span>
          </EcCond>
        )}
        <EcCond label="거래처" pick>
          <CodePickerField label="거래처" hideLabel width={200} emptyLabel="전체"
                           value={partner} onChange={(v) => setPartner(v)}
                           items={pickers.partners} />
        </EcCond>
        {/*
          원본 [대표거래처로 합산] — 지점·사업장을 한 회사로 묶어 본다.
          대표를 안 정한 거래처는 <b>자기가 곧 대표</b>라 그대로 한 줄로 남는다.
          원본은 이것을 <b>[기타]에 섞지 않고 제 줄로</b> 둔다 — [거래처] 바로 다음이다(실측).
        */}
        <EcCond label="대표거래처로 합산">
          {/* 배열로 돌리면 라벨이 <b>글자로 남지 않아</b> 검사가 못 본다 — 그대로 편다. */}
          <div style={{ display: 'flex', gap: 10, fontSize: 12.5 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <input type="radio" name="ledger-basis" checked={basis === '거래처관계기준'}
                     onChange={() => setBasis('거래처관계기준')} />
              거래처관계기준
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <input type="radio" name="ledger-basis" checked={basis === '개별거래처기준'}
                     onChange={() => setBasis('개별거래처기준')} />
              개별거래처기준
            </label>
          </div>
        </EcCond>
        <EcCond label="거래처관리담당자" pick>
          <CodePickerField label="거래처관리담당자" hideLabel width={200} emptyLabel="전체"
                           value={manager} onChange={(v) => setManager(v)}
                           items={pickers.employees} />
        </EcCond>
        <EcCond label="기타">
          <label style={{ fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 4 }}>
            <input type="checkbox" checked={withInactive} onChange={(e) => setWithInactive(e.target.checked)} />
            사용중단거래처포함
          </label>
        </EcCond>
        {/* 원본은 [잔액]을 따로 한 줄로 둔다 — [기타]에 섞여 있지 않다(사본 실측). */}
        <EcCond label="잔액">
          <label style={{ fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 4 }}>
            <input type="checkbox" checked={onlyOpen} onChange={(e) => setOnlyOpen(e.target.checked)} />
            잔액 있는 거래처만
          </label>
        </EcCond>
        {/* 원본 차례: … 잔액 · 정렬/소계기준 · 데이터 보기형식 (사본 실측). */}
        <EcCond label="정렬/소계기준">
          <div className="ec-pills">
            {SUBTOTALS.map((v) => (
              <button key={v} type="button" className={`ec-pill no-ec${subtotal === v ? ' active' : ''}`}
                      onClick={() => setSubtotal(v)}>{v}</button>
            ))}
          </div>
        </EcCond>
        <EcCond label="데이터 보기형식">
          <div className="ec-pills">
            {(['표', '그래프'] as const).map((v) => (
              <button key={v} type="button" className={`ec-pill no-ec${view === v ? ' active' : ''}`}
                      onClick={() => setView(v)}>{v === '그래프' ? '그래프로 보기' : '표'}</button>
            ))}
          </div>
        </EcCond>
        <EcCond label="결재방표시">
          <label style={{ fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 4 }}>
            <input type="checkbox" checked={signBox} onChange={(e) => setSignBox(e.target.checked)} />
            인쇄물에 결재란(도장칸)을 찍는다
          </label>
        </EcCond>
      </ul>

      {/* 요약 박스 */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
        {showAr && <div style={{ flex: 1, border: '1px solid var(--ec-border)', background: '#f7f9ff', padding: '12px 16px' }}>
          <div style={{ fontSize: 12, color: 'var(--ec-blue-dark)' }}>총 채권 (받을 돈)</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--ec-blue)' }}>{won(totalReceivable)} <span style={{ fontSize: 13, fontWeight: 400 }}>원</span></div>
        </div>}
        {showAp && <div style={{ flex: 1, border: '1px solid var(--ec-border)', background: '#f4faf5', padding: '12px 16px' }}>
          <div style={{ fontSize: 12, color: '#1c6b32' }}>총 채무 (줄 돈)</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#2f8401' }}>{won(totalPayable)} <span style={{ fontSize: 13, fontWeight: 400 }}>원</span></div>
        </div>}
      </div>

      {error && <p style={{ marginBottom: 8, background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3 }}>{error}</p>}

      {view === '그래프' ? (
        <EcBarChart rows={chartRows} unit=" 원" emptyText="조회된 거래처가 없습니다." />
      ) : group === '담당자별' ? (
        <table ref={mgrTableRef} className="w-full text-left">
          <thead>
            <tr>
              <th style={{ width: 34 }}></th>
              <th>거래처관리담당자</th>
              <th style={{ width: 110, textAlign: 'right' }}>거래처수</th>
              {showAr && <th style={{ width: 160, textAlign: 'right' }}>채권 (외상매출금)</th>}
              {showAp && <th style={{ width: 160, textAlign: 'right' }}>채무 (외상매입금)</th>}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={3 + (showAr ? 1 : 0) + (showAp ? 1 : 0)} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
            ) : byManager.length === 0 ? (
              <tr><td colSpan={3 + (showAr ? 1 : 0) + (showAp ? 1 : 0)} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>등록된 데이터가 없습니다.</td></tr>
            ) : byManager.map((g, i) => (
              <tr key={g.key}>
                <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
                <td style={{ color: g.key === '(미지정)' ? '#9aa1ab' : undefined }}>{g.key}</td>
                <td style={{ textAlign: 'right', color: '#8a929c' }}>{won(g.count)}</td>
                {showAr && <td style={balanceStyle(g.receivable, 'var(--ec-blue)')}>{won(g.receivable)}{balanceNote(g.receivable, '채권')}</td>}
                {showAp && <td style={balanceStyle(g.payable, '#2f8401')}>{won(g.payable)}{balanceNote(g.payable, '채무')}</td>}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ fontWeight: 700, background: '#f7f9fb' }}>
              <td colSpan={2} style={{ border: '1px solid var(--ec-border)', padding: '5px 8px' }}>합계</td>
              <td style={{ border: '1px solid var(--ec-border)', padding: '5px 8px', textAlign: 'right' }}>{won(shownRolled.length)}</td>
              {showAr && <td style={{ border: '1px solid var(--ec-border)', padding: '5px 8px', textAlign: 'right', color: 'var(--ec-blue)' }}>{won(totalReceivable)}</td>}
              {showAp && <td style={{ border: '1px solid var(--ec-border)', padding: '5px 8px', textAlign: 'right', color: '#2f8401' }}>{won(totalPayable)}</td>}
            </tr>
          </tfoot>
        </table>
      ) : oneSide && byDoc ? (
        /*
          <b>[전표별]·[일별]·[월별] 원장.</b> 맨 윗줄이 <b>기초잔액</b>이다 —
          그 줄이 없으면 첫 전표의 잔액이 어디서 왔는지 알 수가 없다.
        */
        <table className="w-full text-left">
          <thead>
            <tr>
              <th style={{ width: 34 }}></th>
              {/* 묶으면 그 칸에 서는 것이 날짜가 아니라 달이다 — 이름도 같이 바꾼다. */}
              <th style={{ width: 110 }}>{group === '월별' ? '연월' : '일자'}</th>
              {group === '전표별' && <th style={{ width: 150 }}>전표번호</th>}
              <th style={{ width: 70, textAlign: 'center' }}>{group === '전표별' ? '구분' : '건수'}</th>
              {group === '전표별' && <th>거래처명</th>}
              <th style={{ width: 150, textAlign: 'right' }}>{showAr ? '매출(증가)' : '매입(증가)'}</th>
              <th style={{ width: 150, textAlign: 'right' }}>{showAr ? '수금(감소)' : '지급(감소)'}</th>
              <th style={{ width: 150, textAlign: 'right' }}>잔액</th>
            </tr>
          </thead>
          <tbody>
            <tr style={{ background: '#f7f9fb', color: '#6b7280' }}>
              <td style={{ textAlign: 'center' }}></td>
              <td colSpan={group === '전표별' ? 4 : 2}>기초잔액 ({dateText(from)} 전날까지)</td>
              <td style={{ textAlign: 'right' }}></td>
              <td style={{ textAlign: 'right' }}></td>
              <td style={{ textAlign: 'right' }}>{won(moveTotal.opening)}</td>
            </tr>
            {entryRows.length === 0 ? (
              <tr><td colSpan={group === '전표별' ? 7 : 5} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>등록된 데이터가 없습니다.</td></tr>
            ) : entryRows.map((e, i) => (
              <tr key={`${e.key}-${e.docNo ?? ''}-${i}`}>
                <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
                <td>{group === '월별' ? e.date : dateText(e.date)}</td>
                {group === '전표별' && <td style={{ fontFamily: 'monospace' }}>{e.docNo ?? ''}</td>}
                <td style={{ textAlign: 'center' }}>{e.kind}</td>
                {group === '전표별' && <td>{e.name}</td>}
                <td style={{ textAlign: 'right', color: e.increase === 0 ? '#c9ced6' : undefined }}>{won(e.increase)}</td>
                <td style={{ textAlign: 'right', color: e.decrease === 0 ? '#c9ced6' : undefined }}>{won(e.decrease)}</td>
                <td style={balanceStyle(e.balance, showAr ? 'var(--ec-blue)' : '#2f8401')}>{won(e.balance)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ fontWeight: 700, background: '#f7f9fb' }}>
              <td colSpan={group === '전표별' ? 5 : 3} style={{ textAlign: 'right' }}>합계 ({entryRows.length}줄)</td>
              <td style={{ textAlign: 'right' }}>{won(entryTotal.inc)}</td>
              <td style={{ textAlign: 'right' }}>{won(entryTotal.dec)}</td>
              <td style={{ textAlign: 'right', color: showAr ? 'var(--ec-blue)' : '#2f8401' }}>
                {won(entryRows.length ? entryRows[entryRows.length - 1].balance : moveTotal.opening)}
              </td>
            </tr>
          </tfoot>
        </table>
      ) : oneSide ? (
        <table className="w-full text-left">
          <thead>
            <tr>
              <th style={{ width: 34 }}></th>
              <th>거래처명</th>
              <th style={{ width: 140, textAlign: 'right' }}>{showAr ? '기초채권' : '기초채무'}</th>
              <th style={{ width: 140, textAlign: 'right' }}>{showAr ? '재고매출' : '재고매입'}</th>
              <th style={{ width: 140, textAlign: 'right' }}>{showAr ? '회계매출' : '회계매입'}</th>
              <th style={{ width: 140, textAlign: 'right' }}>{showAr ? '수금합계' : '지급합계'}</th>
              <th style={{ width: 150, textAlign: 'right' }}>기타할인등차액</th>
              <th style={{ width: 150, textAlign: 'right' }}>잔액</th>
            </tr>
          </thead>
          <tbody>
            {movesRolled.length === 0 ? (
              <tr><td colSpan={8} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>등록된 데이터가 없습니다.</td></tr>
            ) : movesRolled.map((m, i) => (
              <tr key={m.partnerId}>
                <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
                <td>{m.name}</td>
                <td style={{ textAlign: 'right' }}>{won(m.opening)}</td>
                <td style={{ textAlign: 'right' }}>{won(m.stockAmount)}</td>
                <td style={{ textAlign: 'right', color: m.accountingAmount === 0 ? '#c9ced6' : undefined }}>{won(m.accountingAmount)}</td>
                <td style={{ textAlign: 'right' }}>{won(m.settledAmount)}</td>
                <td style={{ textAlign: 'right', color: m.otherDiff === 0 ? '#c9ced6' : '#c07a00', fontWeight: m.otherDiff === 0 ? 400 : 700 }}>
                  {won(m.otherDiff)}
                </td>
                <td style={balanceStyle(m.closing, showAr ? 'var(--ec-blue)' : '#2f8401')}>
                  {won(m.closing)}{balanceNote(m.closing, showAr ? '채권' : '채무')}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ fontWeight: 700, background: '#f7f9fb' }}>
              <td colSpan={2} style={{ textAlign: 'right' }}>합계 ({movesRolled.length}곳)</td>
              <td style={{ textAlign: 'right' }}>{won(moveTotal.opening)}</td>
              <td style={{ textAlign: 'right' }}>{won(moveTotal.stock)}</td>
              <td style={{ textAlign: 'right' }}>{won(moveTotal.acct)}</td>
              <td style={{ textAlign: 'right' }}>{won(moveTotal.settled)}</td>
              <td style={{ textAlign: 'right', color: moveTotal.other === 0 ? undefined : '#c07a00' }}>{won(moveTotal.other)}</td>
              <td style={{ textAlign: 'right', color: showAr ? 'var(--ec-blue)' : '#2f8401' }}>{won(moveTotal.closing)}</td>
            </tr>
          </tfoot>
        </table>
      ) : (
      <table ref={tableRef} className="w-full text-left">
        <thead>
          <tr>
            <th style={{ width: 34 }}></th>
            <th style={{ cursor: 'pointer' }} onClick={() => sort.toggle('거래처코드')}>거래처코드 {sort.mark('거래처코드')}</th>
            <th style={{ cursor: 'pointer' }} onClick={() => sort.toggle('거래처명')}>거래처명 {sort.mark('거래처명')}</th>
            <th style={{ textAlign: 'center' }}>구분</th>
            <th style={{ width: 140 }}>검색창내용</th>
            {showAr && <th style={{ textAlign: 'right' }}>채권 (외상매출금)</th>}
            {showAp && <th style={{ textAlign: 'right' }}>채무 (외상매입금)</th>}
            {/* 원본 실측: 왼쪽. */}
            {/* 원본 실측: 왼쪽. */}
            <th style={{ width: 80 }}>상세내역</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={6 + (showAr ? 1 : 0) + (showAp ? 1 : 0)} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
          ) : shownRolled.length === 0 ? (
            <tr><td colSpan={6 + (showAr ? 1 : 0) + (showAp ? 1 : 0)} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>등록된 데이터가 없습니다.</td></tr>
          ) : sort.sorted.map((r, idx) => (
            <tr key={r.partnerId}>
              <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{idx + 1}</td>
              {/* 원본은 코드·이름을 눌러 그 거래처를 연다(사본 실측). */}
              <td style={{ fontFamily: 'monospace' }}>
                <Link to={`/sales/partners?q=${encodeURIComponent(r.code)}`} style={{ color: 'var(--ec-blue)' }}>{r.code}</Link>
              </td>
              <td>
                <Link to={`/sales/partners?q=${encodeURIComponent(r.name)}`} style={{ color: 'var(--ec-blue)' }}>{r.name}</Link>
              </td>
              <td style={{ textAlign: 'center' }}>{r.typeName}</td>
              <td style={{ color: '#6b7280' }}>{aliasOf.get(r.partnerId) ?? ''}</td>
              {showAr && <td style={balanceStyle(r.receivable, 'var(--ec-blue)')}>{won(r.receivable)}{balanceNote(r.receivable, '채권')}</td>}
              {showAp && <td style={balanceStyle(r.payable, '#2f8401')}>{won(r.payable)}{balanceNote(r.payable, '채무')}</td>}
              <td>
                {/* 그 거래처만 남기면 아래 움직임 표가 그 거래처 것만 된다 */}
                <button type="button" onClick={() => setPartner(r.name)}
                        style={{ color: 'var(--ec-blue)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12 }}>
                  보기
                </button>
              </td>
            </tr>
          ))}
        </tbody>
        {shownRolled.length > 0 && (
          <tfoot>
            <tr style={{ fontWeight: 700, background: '#f7f9fb' }}>
              <td colSpan={5} style={{ border: '1px solid var(--ec-border)', padding: '5px 8px' }}>합계</td>
              {showAr && <td style={{ border: '1px solid var(--ec-border)', padding: '5px 8px', textAlign: 'right', color: 'var(--ec-blue)' }}>{won(totalReceivable)}</td>}
              {showAp && <td style={{ border: '1px solid var(--ec-border)', padding: '5px 8px', textAlign: 'right', color: '#2f8401' }}>{won(totalPayable)}</td>}
              <td style={{ border: '1px solid var(--ec-border)', padding: '5px 8px' }}></td>
            </tr>
          </tfoot>
        )}
      </table>
      )}

      {view === '표' && shownRolled.length > 0 && (
        <>
          <h3 style={{ fontSize: 13, fontWeight: 700, margin: '16px 0 6px' }}>{subtotal} 소계</h3>
          <table className="w-full text-left">
            <thead><tr>
              <th>{subtotal}</th>
              <th style={{ width: 90, textAlign: 'right' }}>거래처수</th>
              {showAr && <th style={{ width: 140, textAlign: 'right' }}>채권</th>}
              {showAp && <th style={{ width: 140, textAlign: 'right' }}>채무</th>}
            </tr></thead>
            <tbody>
              {subtotals.map((g) => (
                <tr key={g.label}>
                  <td style={{ fontWeight: 600 }}>{g.label}</td>
                  <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>{g.count}</td>
                  {showAr && <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>{won(g.sums.receivable)}</td>}
                  {showAp && <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>{won(g.sums.payable)}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      <p style={{ marginTop: 10, fontSize: 11.5, color: '#9aa1ab' }}>
        ※ 채권 = 판매 합계 − 수금, 채무 = 구매 합계 − 지급. 수금·지급 등록은 「수금현황」·「지급현황」에서 합니다.
        <br />※ 채권이 음수면 받을 돈보다 더 받은 것(선수금), 채무가 음수면 줄 돈보다 더 준 것(선급금)입니다.
        {oneSide && (
          <>
            <br />※ [기타할인등차액] = 잔액 − (기초 + 재고 + {showAr ? '회계매출 − 수금' : '회계매입 − 지급'}).
            0 이 아니면 이름 붙여 세지 못한 움직임이 있다는 뜻입니다 — 지금은 회계전표가
            외상매출금·외상매입금을 직접 움직인 것(어음·수표·상계)이 잔액 공식에 안 들어가 여기 남습니다.
          </>
        )}
      </p>
    </EcListShell>
  )
}
