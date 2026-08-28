import { useEffect, useMemo, useRef, useState, Fragment } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useNavigate } from 'react-router-dom'
import EcListShell from '../../components/EcListShell'
import { useTableSort } from '../../utils/useTableSort'
import CodePickerField from '../../components/CodePickerField'
import CustomFieldsPanel from '../../components/CustomFieldsPanel'
import EvidencePanel from '../../components/EvidencePanel'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import { api, extractErrorMessage } from '../../api/client'
import { loadSupplierParty, printDocuments, type DocParty } from '../../utils/printDocument'
import type { SalesConfirmStatus, SalesDoc, PurchaseDoc, Partner, TradeLine } from '../../api/types'

/** 판매조회 / 구매조회 — 전표(문서) 단위 조회. 행 클릭 시 품목 상세 펼침. */
type Mode = 'sales' | 'purchase'
interface NormalDoc {
  id: number; docNo: string; partnerId: number; partnerName: string; warehouseName: string
  date: string; supplyAmount: number; vatAmount: number; totalAmount: number
  createdBy: string | null; remark: string | null
  confirmStatus?: SalesConfirmStatus; confirmStatusName?: string
  accountingReflected: boolean
  /** 원본 구매조회에만 있는 열. 판매 전표에도 프로젝트는 붙지만 원본 판매조회는 안 보여 준다. */
  projectName?: string | null
  // 라인은 공용 타입을 그대로 쓴다 — 여기서 좁게 다시 적어 두면 백엔드가 필드를 늘려도 화면이 못 본다
  // (실제로 lotNo·부대비용·불러온전표가 늘었는데 이 화면만 모르고 있었다).
  lines: TradeLine[]
}

// 판매조회 탭 (이카운트). '결재중'은 전자결재 진행중, '확인/미확인'은 확인상태.
const SALES_TABS = ['전체', '결재중', '미확인', '확인'] as const
type SalesTab = (typeof SALES_TABS)[number]
const TAB_STATUS: Record<Exclude<SalesTab, '전체'>, SalesConfirmStatus> = {
  결재중: 'IN_APPROVAL',
  미확인: 'UNCONFIRMED',
  확인: 'CONFIRMED',
}
const confirmColor = (s?: SalesConfirmStatus) =>
  s === 'CONFIRMED' ? '#1c7c3c' : s === 'IN_APPROVAL' ? 'var(--ec-blue)' : '#8a929c'

const won = (n: number) => n.toLocaleString('ko-KR')
const CFG: Record<Mode, { title: string; url: string; dateKey: 'saleDate' | 'purchaseDate'; partnerLabel: string; accent: string; entryTo: string }> = {
  sales: { title: '판매조회', url: '/sales', dateKey: 'saleDate', partnerLabel: '매출처', accent: 'var(--ec-blue)', entryTo: '/sales/sell' },
  purchase: { title: '구매조회', url: '/purchases', dateKey: 'purchaseDate', partnerLabel: '매입처', accent: '#a5561b', entryTo: '/sales/buy' },
}

export default function TradeInquiryPage({ mode }: { mode: Mode }) {
  const cfg = CFG[mode]
  const isSales = mode === 'sales'
  const navigate = useNavigate()
  const [docs, setDocs] = useState<NormalDoc[]>([])
  const [error, setError] = useState('')
  /**
 * 거래처중심입력에서 넘어올 때 <b>그 거래처를 물고</b> 열린다(?partner=거래처명).
 * 허브에서 골라 놓고 넘어왔는데 전체 목록이 나오면 다시 거르게 되고,
 * 그러면 허브가 있으나 마나다.
 */
  const [searchParams] = useSearchParams()
  const [keyword, setKeyword] = useState(searchParams.get('partner') ?? '')
  /*
   * 원본 조회 화면의 조건 판: 일자 · 거래처 · 담당자 · 창고 · 거래유형 · 통화 · 프로젝트.
   * 우리는 기간과 검색창만 있어 <b>거래처·담당자로 좁힐 수가 없었다.</b> 전표가 쌓이면
   * 검색창 하나로는 '이 담당자가 이 달에 친 구매' 를 뽑지 못한다.
   */
  const [partnerCond, setPartnerCond] = useState('')
  const [managerCond, setManagerCond] = useState('')
  const [whCond, setWhCond] = useState('')
  const [typeCond, setTypeCond] = useState('')
  const [projectCond, setProjectCond] = useState('')
  const [itemCond, setItemCond] = useState('')
  /** 목록의 [거래유형명]과 같은 규칙 — 부가세가 있으면 과세다(전표 입력과 같다). */
  const tradeTypeOf = (d: { vatAmount: number }) => (d.vatAmount > 0 ? '부가세율 적용' : '면세')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [tab, setTab] = useState<SalesTab>('전체')
  const [openId, setOpenId] = useState<number | null>(null)
  // 이번 세션에서 세금계산서를 발행한 전표 id (버튼 중복 클릭 방지)
  const [taxIssued, setTaxIssued] = useState<Set<number>>(new Set())
  // 원본 목록의 [선택삭제] 대상. 전표 입력 그리드와 같이 **행번호 칸을 눌러** 고른다.
  const [selected, setSelected] = useState<Set<number>>(new Set())
  // 열을 더할 때 합계행(tfoot)을 같이 안 고치면 숫자가 엉뚱한 열 아래에 선다. 개발 모드에서 잡는다.
  const listRef = useRef<HTMLTableElement>(null)
  // 명세서 인쇄용 — 우리 회사(공급자) 정보와 거래처 상세
  const [company, setCompany] = useState<DocParty | null>(null)
  const [partners, setPartners] = useState<Partner[]>([])

  function load() {
    setError('')
    api.get<(SalesDoc | PurchaseDoc)[]>(cfg.url)
      .then((res) => setDocs(res.data.map((d) => ({
        id: d.id, docNo: d.docNo, partnerId: d.partnerId, partnerName: d.partnerName, warehouseName: d.warehouseName,
        date: (d as never)[cfg.dateKey] as string,
        supplyAmount: d.supplyAmount, vatAmount: d.vatAmount, totalAmount: d.totalAmount,
        createdBy: d.createdBy, remark: d.remark,
        confirmStatus: (d as SalesDoc).confirmStatus,
        confirmStatusName: (d as SalesDoc).confirmStatusName,
        accountingReflected: d.accountingReflected,
        projectName: d.projectName,
        // 라인은 그대로 넘긴다. 필드를 골라 담으면 백엔드가 늘린 것을 화면이 못 본다.
        lines: d.lines,
      }))))
      .catch((err) => setError(extractErrorMessage(err)))
  }

  useEffect(() => {
    loadSupplierParty().then(setCompany)
    api.get<Partner[]>('/partners').then((r) => setPartners(r.data)).catch(() => {})
  }, [])

  useEffect(() => {
    load()
    setTab('전체')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cfg.url, cfg.dateKey])

  async function confirmAct(d: NormalDoc, kind: 'confirm' | 'unconfirm') {
    try {
      await api.post(`/sales/${d.id}/${kind}`)
      load()
    } catch (err) {
      alert(extractErrorMessage(err))
    }
  }

  /**
   * 진행상태변경 — 원본 판매조회·구매조회 버튼이다. 고른 전표의 <b>확인상태</b>를 한 번에 바꾼다.
   *
   * <p>한 줄씩 [확인] 을 누르는 것밖에 없어서, 월말에 수십 장을 확인하려면 수십 번을 눌러야 했다.
   *
   * <p>고른 것이 섞여 있으면 <b>전부 확인</b>으로 맞춘다. 하나씩 뒤집으면 한 번 눌렀을 때
   * 결과가 뭔지 알 수 없다. 확인은 판매전표에만 있다 — 구매에는 확인상태가 없다.
   */
  async function confirmSelected() {
    const targets = shown.filter((d) => selected.has(d.id))
    if (targets.length === 0) return alert('진행상태를 바꿀 전표를 고르세요.')
    const kind = targets.every((d) => d.confirmStatus === 'CONFIRMED') ? 'unconfirm' : 'confirm'
    if (!window.confirm(`${targets.length}건을 ${kind === 'confirm' ? '확인' : '확인해제'}할까요?`)) return
    try {
      for (const d of targets) await api.post(`/sales/${d.id}/${kind}`)
      setSelected(new Set())
      load()
    } catch (err) {
      alert(extractErrorMessage(err))
    }
  }

  /** 전표 수정 — 입력 화면을 수정 모드로 연다. 원본도 조회에서 전표번호를 누르면 입력 팝업이 뜬다. */
  function editDoc(d: NormalDoc) {
    navigate(`${isSales ? '/sales/sell' : '/sales/buy'}?edit=${d.id}`)
  }

  /**
   * 원본 구매조회의 <b>[반품처리]</b> 버튼. 그 전표를 근거로 <b>반품 전표를 새로</b> 만든다.
   *
   * <p>원 전표는 손대지 않는다 — 산 사실은 남고, 되돌려준 사실이 따로 하나 더 생기는 것이
   * 반품이다. 원 전표의 수량을 깎아 버리면 애초에 그만큼만 산 것이 되어 이력이 사라진다.
   *
   * <p>입력 화면이 [거래구분: 반품]으로 열리고 그 전표 라인이 담겨 있다. 전량 반품이 아니면
   * 그 자리에서 수량을 고친다 — 얼마를 되돌려주는지는 사람만 안다.
   */
  function returnDoc(d: NormalDoc) {
    navigate(`${isSales ? '/sales/sell' : '/sales/buy'}?returnFrom=${d.id}`)
  }

  /**
   * 전표 삭제. 서버가 재고를 되돌리고 지운다. 회계반영·확인·세금계산서 발행 전표는 서버가 거부한다.
   * 되돌릴 수 없는 조작이라 한 번 더 묻는다.
   */
  async function deleteDoc(d: NormalDoc) {
    const ok = window.confirm(
      `${d.docNo} 전표를 삭제합니다.\n\n`
      + `${isSales ? '출고' : '입고'}했던 재고가 되돌아갑니다 (품목 ${d.lines.length}건, 합계 ${won(d.totalAmount)}원).\n`
      + '이 작업은 되돌릴 수 없습니다. 진행할까요?',
    )
    if (!ok) return
    try {
      await api.delete(`${cfg.url}/${d.id}`)
      setOpenId(null)
      load()
    } catch (err) {
      alert(extractErrorMessage(err))
    }
  }

  async function issueTaxInvoice(d: NormalDoc) {
    try {
      await api.post('/tax-invoices', { type: isSales ? 'SALES' : 'PURCHASE', sourceId: d.id })
      setTaxIssued((s) => new Set(s).add(d.id))
      alert(`${d.docNo} 세금계산서를 발행했습니다. (${isSales ? '매출' : '매입'} 세금계산서 화면에서 진행단계 관리)`)
    } catch (err) {
      alert(extractErrorMessage(err))
    }
  }

  /**
   * 전표를 명세서 서식으로 인쇄한다.
   * 판매는 우리가 공급자, 구매는 <b>거래처가 공급자</b>다 — 양쪽을 바꿔 넣어야 서식이 사실과 맞는다.
   */
  async function printStatement(d: NormalDoc) {
    const p = partners.find((x) => x.id === d.partnerId)
    const partnerParty = {
      label: isSales ? '공급받는자' : '공급자',
      name: d.partnerName,
      bizRegNo: p?.bizRegNo, ceo: p?.ceoName, bizType: p?.bizType, bizItem: p?.bizItem,
      tel: p?.phone, address: p?.address,
    }
    const ourParty: DocParty = company
      ? { ...company, label: isSales ? '공급자' : '공급받는자' }
      : { label: isSales ? '공급자' : '공급받는자', name: '(회사정보 미등록)' }

    await printDocuments([{
      title: isSales ? '거래명세서' : '매입명세서',
      docNo: d.docNo,
      docDate: d.date,
      supplier: isSales ? ourParty : partnerParty,
      customer: isSales ? partnerParty : ourParty,
      extra: [{ label: '창고', value: d.warehouseName }, { label: '담당', value: d.createdBy }],
      remark: d.remark,
      lines: d.lines,
      footNote: isSales ? '위와 같이 거래하였음을 확인합니다.' : undefined,
    }])
  }

  const shown = useMemo(() => docs
    .filter((d) => !keyword || d.partnerName.includes(keyword) || d.docNo.includes(keyword))
    .filter((d) => !partnerCond || d.partnerName === partnerCond)
    .filter((d) => !managerCond || (d.createdBy ?? '') === managerCond)
    .filter((d) => !whCond || d.warehouseName === whCond)
    .filter((d) => !itemCond || d.lines.some((l) => l.itemName === itemCond))
    .filter((d) => !typeCond || tradeTypeOf(d) === typeCond)
    .filter((d) => !projectCond || (d.projectName ?? '') === projectCond)
    .filter((d) => !from || d.date >= from)
    .filter((d) => !to || d.date <= to)
    .filter((d) => !isSales || tab === '전체' || d.confirmStatus === TAB_STATUS[tab])
    .sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id), [docs, keyword, partnerCond, managerCond, whCond, typeCond, projectCond, from, to, tab, isSales])

  const toggleSelect = (id: number) => setSelected((s) => {
    const next = new Set(s)
    if (next.has(id)) next.delete(id); else next.add(id)
    return next
  })

  /**
   * 원본 하단 버튼줄의 [선택삭제]. 전표를 지우면 재고가 되돌아가고, 발주에서 입고전환된
   * 구매전표라면 발주서도 '발주확정' 으로 풀린다(백엔드가 처리한다).
   * 지울 수 없는 전표(회계반영·세금계산서 발행·확인됨 등)는 서버가 사유를 준다 — 그대로 보여 준다.
   */
  async function deleteSelected() {
    const ids = shown.filter((d) => selected.has(d.id)).map((d) => d.id)
    if (ids.length === 0) { setError('지울 전표를 고르세요. 행번호 칸을 누르면 선택됩니다.'); return }
    if (!confirm(`전표 ${ids.length}건을 지울까요? 재고도 함께 되돌아갑니다.`)) return
    const failed: string[] = []
    for (const id of ids) {
      try {
        await api.delete(`${cfg.url}/${id}`)
      } catch (err) {
        const doc = shown.find((d) => d.id === id)
        failed.push(`${doc?.docNo ?? id}: ${extractErrorMessage(err)}`)
      }
    }
    setSelected(new Set())
    load()
    setError(failed.length === 0 ? '' : `지우지 못한 전표 ${failed.length}건 — ${failed.join(' / ')}`)
  }

  const tabCount = (t: SalesTab) =>
    docs.filter((d) => t === '전체' || d.confirmStatus === TAB_STATUS[t]).length

  const totals = shown.reduce((a, d) => ({ supply: a.supply + d.supplyAmount, vat: a.vat + d.vatAmount, total: a.total + d.totalAmount }), { supply: 0, vat: 0, total: 0 })

  // 판매조회는 확인상태·확인버튼 2컬럼 + 세금계산서 1컬럼, 구매조회는 세금계산서 1컬럼이 더 붙는다.
  // 번호 + 전표번호·일자·거래처·품목명(요약)·거래유형·창고·공급가액·부가세·합계·담당·불러온전표·회계반영·세금계산서
  // + 판매만 있는 확인상태·확인 2개
  const colCount = 14 + (isSales ? 2 : 1)   // 판매: 확인상태·확인 / 구매: 프로젝트명
  /**
   * 합계행 가운데 빈 칸 수 — 금액합계와 공급가액 사이의 열들
   * (거래유형·창고·회계반영·인쇄·불러온전표, 구매는 앞에 프로젝트명이 하나 더).
   * 앞 4칸 + 금액합계 1칸 + midSpan + 공급가액 + 부가세 = 7 + midSpan 이고, 나머지가 꼬리다.
   */
  const midSpan = isSales ? 5 : 6

  /**
   * 원본은 일자와 전표번호를 '2026/08/03 -1' 로 한 칸에 적는다(게시글의 '일자-No.'와 같은 규칙).
   * 우리 전표번호는 'SL-20260803-0001' 이라 끝의 일련번호만 떼어 붙인다.
   */
  const dateNo = (d: { date: string; docNo: string }) => {
    const seq = d.docNo.split('-').pop() ?? ''
    return `${d.date.replace(/-/g, '/')} -${Number(seq) || seq}`
  }

  /** 행의 [인쇄] — 그 전표 하나만 인쇄한다(원본 목록에도 행마다 인쇄가 있다). */
  function printOne(d: { id: number }) {
    setOpenId(d.id)
    // 상세가 펼쳐진 뒤에 인쇄해야 품목까지 같이 나온다.
    window.setTimeout(() => window.print(), 100)
  }
  useTableColumnCheck(listRef, `${cfg.title} 목록`, [isSales, shown.length])


  /* 화면에 찍히는 <code>dateNo</code> 그대로 견준다 — 보이는 글자와 차례가 맞아야 한다. */
  const sort = useTableSort(shown, {
    '일자-No.': (d) => dateNo(d),
  })

  return (
    <EcListShell
      title={cfg.title} search={keyword} onSearchChange={setKeyword}
      // 원본 목록의 하단 버튼줄은 [신규(F2)] 로 시작한다 — 조회에서 바로 입력 화면으로 간다.
      // 셸에는 이미 그 자리가 있었는데 이 화면이 onNew 를 안 넘겨 비어 있었다.
      onNew={() => navigate(cfg.entryTo)}
      /*
       * 원본 버튼 실측(사본 · 판매조회/구매조회):
       *   신규(F2) · 진행상태변경 · 보내기 · 바코드(품목) · 선택삭제 · 이력조회
       * 보내기·바코드·이력조회는 받쳐 줄 것이 없어 만들지 않는다 —
       * 눌러도 아무 일 없는 버튼은 있는 것만 못하다. [신규(F2)] 는 위 onNew 가 이미 맡는다.
       */
      actions={[
        ...(isSales ? [{ label: `진행상태변경${selected.size ? ` (${selected.size})` : ''}`, onClick: () => void confirmSelected() }] : []),
        { label: '선택삭제', onClick: () => void deleteSelected() },
        /*
         * 원본 [거래내역보기(구매)] — 지금 고른 거래처의 거래만 남긴다.
         * 조회 화면에서 한 거래처만 훑고 싶을 때 조건을 다시 고르지 않아도 된다.
         */
        { label: isSales ? '거래내역보기(판매)' : '거래내역보기(구매)',
          onClick: () => setPartnerCond(partnerCond || (shown[0]?.partnerName ?? '')) },
        { label: 'Excel' },
        { label: '인쇄' },
      ]}
    >
      {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}

      {/*
        원본은 이 줄이 [상태 알약]…………[기간] 이다 — 왼쪽에 필터, 오른쪽 끝에 조회 기간.
        우리는 기간을 왼쪽 위에 조건 폼으로 따로 두고 있었다. 기간은 조건이라기보다 '지금 뭘 보고 있나' 라
        오른쪽이 맞다. 원본은 기간을 텍스트로만 보여 주지만, 우리는 바꿀 수 있게 남긴다 —
        못 바꾸게 만들 이유가 없다.
      */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        {isSales && (
          <div className="ec-pills">
            {SALES_TABS.map((t) => (
              <button
                key={t} type="button" onClick={() => setTab(t)}
                className={`ec-pill no-ec${tab === t ? ' active' : ''}`}
              >
                {t} ({tabCount(t)})
              </button>
            ))}
          </div>
        )}
        <span style={{ marginLeft: isSales ? 8 : 0, fontSize: 12, color: '#9aa1ab' }}>
          총 {shown.length}건 · 행을 클릭하면 품목 상세가 펼쳐집니다.
        </span>
        <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#62677e' }}>
          {/* 원본은 이 조건을 [일자]라고 부른다(사본 실측). 이름표가 없으면 무슨 날짜인지 모른다. */}
          <span>일자</span>
          <input type="date" className="ec-input" value={from} onChange={(e) => setFrom(e.target.value)} style={{ width: 140 }} />
          <span>~</span>
          <input type="date" className="ec-input" value={to} onChange={(e) => setTo(e.target.value)} style={{ width: 140 }} />
          {/*
            원본 판매조회 조건 차례 실측(사본): 기준일자 · <b>거래유형 · 창고 · 프로젝트 ·
            거래처 · 품목</b> · 발송여부. 우리는 거래처·담당자·창고·품목·거래유형 차례였다.
          */}
          <CodePickerField label="거래유형" width={130} emptyLabel="전체"
                           value={typeCond} onChange={setTypeCond}
                           items={[...new Set(docs.map(tradeTypeOf))].sort()
                             .map((n) => ({ value: n, name: n }))} />
          {/*
            목록에 열로 있는 값은 걸러 낼 수도 있어야 한다. 원본 조회의 조건이 그것이다.
            이름은 화면마다 다르다 — 원본 <b>판매조회는 [창고], 구매조회는 [입고창고]</b> 다.
            한 이름으로 묶으면 한쪽은 원본과 다른 말을 쓰게 된다.
          */}
          {isSales ? (
            <CodePickerField label="창고" width={130} emptyLabel="전체"
                             value={whCond} onChange={setWhCond}
                             items={[...new Set(docs.map((d) => d.warehouseName).filter(Boolean))].sort()
                               .map((n) => ({ value: n, name: n }))} />
          ) : (
            <CodePickerField label="입고창고" width={130} emptyLabel="전체"
                             value={whCond} onChange={setWhCond}
                             items={[...new Set(docs.map((d) => d.warehouseName).filter(Boolean))].sort()
                               .map((n) => ({ value: n, name: n }))} />
          )}
          <CodePickerField label="프로젝트" width={130} emptyLabel="전체"
                           value={projectCond} onChange={setProjectCond}
                           items={[...new Set(docs.map((d) => d.projectName).filter(Boolean) as string[])].sort()
                             .map((n) => ({ value: n, name: n }))} />
          <CodePickerField label="거래처" width={150} emptyLabel="전체"
                           value={partnerCond} onChange={setPartnerCond}
                           items={[...new Set(docs.map((d) => d.partnerName))].sort()
                             .map((n) => ({ value: n, name: n }))} />
          {/* 원본 [품목] — 전표 안의 어느 줄이든 그 품목이 있으면 걸린다. */}
          <CodePickerField label="품목" width={130} emptyLabel="전체"
                           value={itemCond} onChange={setItemCond}
                           items={[...new Set(docs.flatMap((d) => d.lines.map((l) => l.itemName)).filter(Boolean))].sort()
                             .map((n) => ({ value: n, name: n }))} />
          {/* 원본 구매조회에만 있는 [담당자]. */}
          <CodePickerField label="담당자" width={120} emptyLabel="전체"
                           value={managerCond} onChange={setManagerCond}
                           items={[...new Set(docs.map((d) => d.createdBy).filter(Boolean) as string[])].sort()
                             .map((n) => ({ value: n, name: n }))} />
        </span>
      </div>

      <table ref={listRef} className="w-full text-left">
        <thead>
          <tr>
            {/* 원본 1열은 행머리다 — 헤더는 전체선택, 본문은 행번호(눌러서 선택). 전표 입력 그리드와 같은 규칙. */}
            <th
              style={{ width: 34, cursor: shown.length > 0 ? 'pointer' : 'default' }}
              title="전체 선택 / 해제"
              onClick={() => setSelected(selected.size === shown.length ? new Set() : new Set(shown.map((d) => d.id)))}
            >
              {shown.length > 0 && selected.size === shown.length ? '☑' : ''}
            </th>
            {/*
              여기까지가 원본 판매조회의 열이고 순서도 같다(실측 폭 70·279·304·715·201·140·201·154·101·101).
              원본은 일자와 번호를 '2026/08/03 -1' 처럼 한 칸에 적는다 — 게시글의 '일자-No.'와 같은 규칙이다.
            */}
            <th style={{ cursor: 'pointer' }} onClick={() => sort.toggle('일자-No.')}>일자-No. {sort.mark('일자-No.')}</th>
            <th>{cfg.partnerLabel}</th>
            <th>품목명(요약)</th>
            <th style={{ textAlign: 'right' }}>금액합계</th>
            {/* 원본 구매조회에만 있는 열이다 — 판매조회에는 없다. 실측으로 확인했다. */}
            {!isSales && <th>프로젝트명</th>}
            {/* 원본 '거래유형명'. 우리는 과세/면세를 부가세 유무로 판별한다(전표 입력과 같은 규칙). */}
            <th>거래유형명</th>
            <th>창고명</th>
            <th style={{ textAlign: 'center' }}>회계반영여부</th>
            <th style={{ textAlign: 'center' }}>인쇄</th>
            {/* 이 전표가 어느 수주/발주에서 왔는지 */}
            <th>불러온전표</th>
            {/* 아래는 원본에 없지만 우리가 더 보여 주는 열이다. 원본 열을 밀어내지 않도록 뒤에 둔다. */}
            <th style={{ textAlign: 'right' }}>공급가액</th><th style={{ textAlign: 'right' }}>부가세</th><th>담당</th>
            {isSales && <><th style={{ textAlign: 'center' }}>확인상태</th><th style={{ textAlign: 'center' }}>확인</th></>}
            <th style={{ textAlign: 'center' }}>세금계산서</th>
          </tr>
        </thead>
        <tbody>
          {shown.length === 0 ? (
            <tr><td colSpan={colCount} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>등록된 데이터가 없습니다.</td></tr>
          ) : sort.sorted.map((d, i) => (
            <Fragment key={d.id}>
              <tr onClick={() => setOpenId(openId === d.id ? null : d.id)} style={{ cursor: 'pointer' }}>
                <td
                  style={{
                    textAlign: 'center',
                    background: selected.has(d.id) ? 'var(--ec-blue-light)' : '#f3f3f3',
                    color: selected.has(d.id) ? 'var(--ec-blue-dark)' : '#8a929c',
                    fontWeight: selected.has(d.id) ? 700 : 400,
                    cursor: 'pointer', userSelect: 'none',
                  }}
                  title="눌러서 이 전표를 고릅니다"
                  onClick={(e) => { e.stopPropagation(); toggleSelect(d.id) }}
                >
                  {i + 1}
                </td>
                <td style={{ fontFamily: 'monospace', color: cfg.accent, fontWeight: 600 }}>
                  {openId === d.id ? '▾ ' : '▸ '}{dateNo(d)}
                </td>
                <td>{d.partnerName}</td>
                <td style={{ color: '#5a626e' }}>
                  {d.lines[0]?.itemName ?? ''}{d.lines.length > 1 ? ` 외 ${d.lines.length - 1}건` : ''}
                </td>
                <td style={{ textAlign: 'right', fontWeight: 700, color: cfg.accent }}>{won(d.totalAmount)}</td>
                {!isSales && <td style={{ color: '#5a626e' }}>{d.projectName ?? ''}</td>}
                <td style={{ color: '#5a626e' }}>{d.vatAmount > 0 ? '부가세율 적용' : '면세'}</td>
                <td>{d.warehouseName}</td>
                <td style={{ textAlign: 'center', color: d.accountingReflected ? '#1c7c3c' : '#9aa1ab' }}>
                  {d.accountingReflected ? '반영' : '미반영'}
                </td>
                <td style={{ textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
                  <button className="ec-btn ec-btn-sm" onClick={() => printOne(d)}>인쇄</button>
                </td>
                <td style={{ fontFamily: 'monospace', color: '#8a929c' }}>
                  {/* 한 전표의 라인들이 서로 다른 근거전표에서 올 수 있다 — 중복을 없애고 요약한다 */}
                  {(() => {
                    const nos = [...new Set(d.lines.map((l) => l.sourceDocNo).filter(Boolean))] as string[]
                    if (nos.length === 0) return ''
                    return nos.length === 1 ? nos[0] : `${nos[0]} 외 ${nos.length - 1}건`
                  })()}
                </td>
                <td style={{ textAlign: 'right' }}>{won(d.supplyAmount)}</td>
                <td style={{ textAlign: 'right', color: '#8a929c' }}>{won(d.vatAmount)}</td>
                <td>{d.createdBy ?? ''}</td>
                {isSales && (
                  <>
                    <td style={{ textAlign: 'center', color: confirmColor(d.confirmStatus), fontWeight: 600 }} onClick={(e) => e.stopPropagation()}>
                      {d.confirmStatusName ?? '미확인'}
                    </td>
                    <td style={{ textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
                      {d.confirmStatus === 'CONFIRMED' ? (
                        <button className="ec-btn" style={{ height: 20, padding: '0 8px' }} onClick={() => confirmAct(d, 'unconfirm')}>확인취소</button>
                      ) : d.confirmStatus === 'IN_APPROVAL' ? (
                        <span style={{ color: '#c9ced6' }}>—</span>
                      ) : (
                        <button className="ec-btn ec-btn-primary" style={{ height: 20, padding: '0 8px' }} onClick={() => confirmAct(d, 'confirm')}>확인</button>
                      )}
                    </td>
                  </>
                )}
                <td style={{ textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
                  {taxIssued.has(d.id) ? (
                    <span style={{ color: '#1c7c3c', fontSize: 11.5 }}>발행됨</span>
                  ) : (
                    <button className="ec-btn" style={{ height: 20, padding: '0 8px' }} onClick={() => issueTaxInvoice(d)}>발행</button>
                  )}
                </td>
              </tr>
              {openId === d.id && (
                <tr className="no-ec">
                  <td colSpan={colCount} style={{ padding: 0, background: '#fafbfc' }}>
                    <table className="w-full text-left" style={{ margin: '4px 0' }}>
                      <thead>
                        {/*
                          원본 구매조회 라인 열 실측(사본): 품목코드 · 품목명 · <b>규격</b> ·
                          <b>기본수량</b> · 단가 · 공급가액 · 부가세 · <b>적요</b>.
                          규격과 적요가 빠져 있었다 — 같은 품목의 다른 규격을 구분할 수가 없고,
                          라인에 적어 둔 메모를 조회에서 볼 수가 없었다.
                          수량 이름은 원본이 판매는 '수량', 구매는 '기본수량' 으로 다르다.
                        */}
                        <tr>
                          <th style={{ width: 34 }}></th>
                          <th>품목코드</th>
                          <th>품목명</th>
                          <th style={{ width: 110 }}>규격</th>
                          <th style={{ textAlign: 'right' }}>{isSales ? '수량' : '기본수량'}</th>
                          <th style={{ textAlign: 'right' }}>단가</th>
                          <th style={{ textAlign: 'right' }}>공급가액</th>
                          <th style={{ textAlign: 'right' }}>부가세</th>
                          <th style={{ width: 160 }}>적요</th>
                        </tr>
                      </thead>
                      <tbody>
                        {d.lines.map((l, li) => (
                          <tr key={li}>
                            <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{li + 1}</td>
                            <td style={{ fontFamily: 'monospace' }}>{l.itemCode}</td>
                            <td>{l.itemName}</td>
                            <td style={{ color: '#5a626e' }}>{l.spec ?? ''}</td>
                            <td style={{ textAlign: 'right' }}>{won(l.quantity)} {l.unit}</td>
                            <td style={{ textAlign: 'right' }}>{won(l.unitPrice)}</td>
                            <td style={{ textAlign: 'right' }}>{won(l.supplyAmount)}</td>
                            <td style={{ textAlign: 'right', color: '#8a929c' }}>{won(l.vatAmount)}</td>
                            <td style={{ color: '#5a626e' }}>{l.remark ?? ''}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <div style={{ padding: '4px 10px 8px', display: 'flex', gap: 6, alignItems: 'center' }}>
                      <button className="ec-btn ec-btn-primary" onClick={() => printStatement(d)}>
                        {isSales ? '거래명세서 인쇄' : '매입명세서 인쇄'}
                      </button>
                      <button className="ec-btn" onClick={() => editDoc(d)}>수정</button>
                      {/* 원본 구매조회의 [반품처리]. 원 전표는 그대로 두고 반품 전표를 새로 만든다. */}
                      <button className="ec-btn" onClick={() => returnDoc(d)}>반품처리</button>
                      <button
                        className="ec-btn"
                        style={{ color: '#c60a2e', borderColor: '#e2b4bc' }}
                        onClick={() => deleteDoc(d)}
                      >
                        삭제
                      </button>
                      <span style={{ fontSize: 11.5, color: '#8a929c' }}>
                        삭제하면 {isSales ? '출고' : '입고'}분이 재고로 되돌아갑니다.
                        회계반영·확인{isSales ? '' : ''}·세금계산서 발행 전표는 먼저 취소해야 합니다.
                      </span>
                    </div>
                    {d.remark && <div style={{ padding: '2px 10px 8px', fontSize: 12, color: '#5a626e' }}>비고: {d.remark}</div>}
                    {isSales && <div style={{ padding: '0 10px 8px' }}><CustomFieldsPanel entityType="SALES" entityId={d.id} /></div>}
                    <div style={{ padding: '0 10px 8px' }}>
                      <EvidencePanel
                        entityType={isSales ? 'SALES' : 'PURCHASE'}
                        entityId={d.id}
                        docNo={d.docNo}
                        docDate={d.date}
                      />
                    </div>
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
        </tbody>
        <tfoot>
          <tr style={{ fontWeight: 700, background: '#f7f9fb' }}>
            {/*
              합계행은 머리글과 칸 수가 정확히 같아야 숫자가 제 열 아래에 선다.
              앞 4칸(행머리·일자-No.·거래처·품목명) + 금액합계 + 5칸(거래유형·창고·회계반영·인쇄·불러온전표)
              + 공급가액 + 부가세 + 나머지. 나머지는 colCount 에서 빼서 구한다 —
              열을 늘릴 때 여기를 또 잊어도 어긋나지 않는다.
            */}
            <td colSpan={4} style={{ textAlign: 'right' }}>합계 ({shown.length}건)</td>
            <td style={{ textAlign: 'right', color: cfg.accent }}>{won(totals.total)}</td>
            <td colSpan={midSpan}></td>
            <td style={{ textAlign: 'right' }}>{won(totals.supply)}</td>
            <td style={{ textAlign: 'right' }}>{won(totals.vat)}</td>
            <td colSpan={colCount - (7 + midSpan)}></td>
          </tr>
        </tfoot>
      </table>
    </EcListShell>
  )
}
