import { useEffect, useMemo, useState } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import EcListShell from '../../components/EcListShell'
import EcStatusPanel, { EcCond } from '../../components/EcStatusPanel'
import CodePickerField from '../../components/CodePickerField'
import { useCondPickers } from '../../utils/useCondPickers'
import { AS_CONSUMPTION_PICKS, periodOf } from '../../components/EcPeriodPicks'
import { usePartnerGroups } from '../../utils/partnerGroups'
import { useItemFlags } from '../../utils/useInactiveItems'
import { subtotalBy } from '../../utils/subtotalBy'
import { useItemMgmt } from '../../utils/itemMgmtItems'
import { EcReportHead, EcReportFoot, reportPeriod } from '../../components/EcReportFrame'
import { AsAggControls, AsAggregateTable, type AsAggKey, type AsAggLine, type AsAggValue } from '../../features/as/AsAggregate'

/**
 * 품질 > A/S소모현황 (이카운트 E040641 A/S소모현황)
 * A/S 수리에 소모된 부품 — 소모는 <b>A/S수리에 이어진 판매(판매연결전표)의 줄</b>이다(2026-10-03 원본 실측).
 * 백엔드 `GET /api/as-repairs/consumption` 이 줄을 준다.
 *
 * <p>2026-10-04 원본 실측 — [구분] ○집계는 A/S접수현황 · A/S수리현황과 같은 판이다([조건 | 수량] + 소계 · 합계,
 * features/as/AsAggregate). 다만 집계조건 창의 기준일자가 <b>일별 · 월별 · 연별</b> 셋뿐이고, 품목 묶음 이름이
 * <b>품목(소모)</b> — 품목명[규격]은 소모부품이다. [집계대상] 창에는 <b>수량</b> 하나뿐이다.
 * 예전 우리 집계([품목 · A/S 건수 · 소모수량 · 소모금액])와 그 위 요약 줄 · 안내 글은 원본에 없어 뺐다.
 * 출력물 머리글은 내역도 'A/S소모현황'(빗금 있음) · 꼬리 [P.1].
 */
/** 소모 화면의 집계조건 — 기준일자는 일별 · 월별 · 연별뿐이다(원본 창 그대로). */
const CONS_AGG_KEYS: AsAggKey[] = ['일별', '월별', '연별', '담당자', '창고', '관리항목', '거래처', '거래처그룹1', '품목명[규격]', '품목그룹1', '프로젝트']
/**
 * 원본 [구분]의 <b>[내역]</b> 한 줄 — 판매연결전표의 판매 줄 하나. [집계]도 이 줄을 합치므로 두 갈래의 합계가 어긋나지 않는다.
 */
interface Line {
  repairId: number; repairNo: string; repairDate: string
  repairItemId: number | null; repairItemName: string | null; charge: string
  repairType: string | null; status: 'IN_PROGRESS' | 'COMPLETED'; title: string | null; content: string | null; createdBy: string | null
  partnerId: number; partnerName: string; warehouseId: number
  receiptDate: string | null; receiptCharge: string | null; projectId: number | null
  salesId: number; salesDocNo: string; saleDate: string
  itemId: number; itemName: string
  quantity: number; unitPrice: number | null; supplyAmount: number | null; vatAmount: number | null
}
/* 원본 [수리유형] — A/S수리입력과 같은 코드. */
const REPAIR_TYPES: Record<string, string> = { FREE_EXCHANGE: '무상교환', FREE_REPAIR: '무상수리', PAID_EXCHANGE: '유상교환', PAID_REPAIR: '유상수리', RETURN: '반품' }
const STATUS_NAME = { IN_PROGRESS: '진행중', COMPLETED: '완료' } as const
const won = (n: number) => n.toLocaleString('ko-KR')

const initP = periodOf('금월(~오늘)')!

/** A/S 처리 상태(AsStatus)의 표시 이름. 원본 [수리진행상태]가 고르는 것이 이것이다. */
const AS_STATUSES = ['진행중', '완료'] as const

/**
 * 원본 [정렬/소계기준]. 축은 [설정] 창에서 고르는데 그 창은 <b>값을 저장</b>하므로 열지 않았다
 * (조회 화면만 연다는 규칙). 이 표의 줄은 <b>소모부품 품목</b> 하나뿐이라 그 품목이 들고 있는
 * 값으로만 축을 둔다 — 지어내지 않는다.
 */
const SUBTOTALS = ['없음', '품목구분', '품목그룹1'] as const

/**
 * 원본 [구분]. <b>기본이 [내역]</b> 이다(2026-09-09 E040641 실측) — 열면 소모부품이
 * 한 줄씩 뜨고, [집계]로 바꿔야 묶는다.
 */
const MODES = ['내역', '집계'] as const

export default function AsConsumptionPage() {
  const [lines, setLines] = useState<Line[]>([])
  /* 원본 [접수담당자] · [수리유형] — 수리 전표가 생기면서 거를 수 있게 됐다. */
  const [receiptCharge, setReceiptCharge] = useState('')
  const [repairType, setRepairType] = useState('')
  /* 원본 [접수일자] — 기본 [사용안함]. 비워 두면 안 거른다. */
  const [recvFrom, setRecvFrom] = useState('')
  const [recvTo, setRecvTo] = useState('')
  const [mode, setMode] = useState<'내역' | '집계'>('내역')
  const [agg, setAgg] = useState<AsAggValue>({ agg1: '', agg2: '', codeIncl: false })
  const [keyword, setKeyword] = useState('')
  /*
   * 원본 A/S소모현황(E040641) 조건 <b>실측(2026-09-01 원본 직접 확인)</b>:
   * 구분(내역/집계+단위) · <b>기준일자</b> · <b>접수일자(기본 [사용안함])</b> · 창고 ·
   * 프로젝트 · 수리담당자 · 접수담당자 · 수리유형 · 거래처 · 수리품목.
   *
   * <p>사본에서 옮겨 적을 때 첫 조건을 [접수일자] 로 적어 두었는데, 원본을 열어 보니
   * <b>[기준일자]가 먼저고 [접수일자]는 따로</b> 있는 보조 조건이다(끄고 열린다).
   * 우리 기간은 접수일로 거르므로 라벨은 [접수일자] 가 맞다 — 다만 <b>원본이 주 조건으로
   * 쓰는 기준일자(수리·소모한 날)로는 아직 못 거른다.</b> 서버가 품목별로 합쳐 주기 때문에
   * 그 축을 넣으려면 집계를 고쳐야 한다.
   *
   * <p>기간 빠른선택도 달랐다 — 우리는 [전월+금월] 을 달아 두었는데 원본에는 없고,
   * 원본이 주는 [최근30일(+1개월)] 이 우리에게 없었다. AS_CONSUMPTION_PICKS 로 맞췄다.
   *
   * <p>우리 화면은 <b>조건이 하나도 없었다</b> — 서버가 전체를 품목별로 합쳐 주는 것을
   * 그대로 받아 품목명 검색만 했다. 언제 쓴 부품인지, 어느 창고에서 나갔는지로
   * 좁힐 수가 없었다. 우리가 가진 넷을 서버에 넘긴다 — <b>합친 뒤에는 못 거른다.</b>
   * [프로젝트]·[수리유형]은 A/S 전표에 그 값이 없고, 담당자는 우리 쪽이 하나뿐이라
   * 원본의 수리·접수 둘로 가를 수 없다.
   */
  /* 원본 A/S소모현황은 <b>금월</b>을 보고 열린다(사본 실측). 우리는 <b>올해 1월 1일</b>부터라 */
  /* 한 해치 소모가 한 화면에 뭉쳐 이번 달 소모가 얼마인지 읽히지 않았다. */
  const [from, setFrom] = useState(initP.from)
  const [to, setTo] = useState(initP.to)
  const [warehouseId, setWarehouseId] = useState('')
  const [partnerId, setPartnerId] = useState('')
  const [repairItemId, setRepairItemId] = useState('')
  /* A/S 접수에 프로젝트 칸을 만들면서 이 조건도 만들 수 있게 됐다. */
  const [projectId, setProjectId] = useState('')
  /*
   * 2026-09-09 원본(E040641) 실측 — 조건이 <b>서른</b>이다(사본은 열). 아래 일곱은
   * <b>서버에 넘겨야</b> 한다. 이 화면의 응답은 품목별로 <b>이미 합쳐진</b> 줄이라
   * 거래처도 상태도 제목도 남아 있지 않다 — 합친 뒤에는 화면에서 거를 수가 없다.
   */
  const [partnerGroup, setPartnerGroup] = useState('')
  const [itemCategory, setItemCategory] = useState('')
  const [itemGroup, setItemGroup] = useState('')
  const [status, setStatus] = useState('')
  const [title, setTitle] = useState('')
  const [remark, setRemark] = useState('')
  const [createdBy, setCreatedBy] = useState('')
  /*
   * 원본 <b>[수리담당자]</b>. [내역] 격자에 이 열을 그리기 시작하면서 <b>볼 수는 있는데
   * 거를 수는 없는</b> 칸이 됐다. 원본은 수리·접수 담당자를 갈라 두지만 우리 A/S 는
   * 담당자가 하나라 그 하나로 건다 — 합친 뒤에는 못 거르므로 서버에 넘긴다.
   */
  const [charge, setCharge] = useState('')
  const [subtotal, setSubtotal] = useState<typeof SUBTOTALS[number]>('없음')
  const pgroup = usePartnerGroups()
  const { categoryOf, groupOf, categories, groups } = useItemFlags()
  const pickers = useCondPickers(['warehouses', 'partners', 'items', 'projects'])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  /*
   * 2026-10-03 원본 실측: 소모 = <b>수리에 이어진 판매(판매연결전표)의 줄</b>이다. 예전 우리는 A/S 소모부품(AsPart)을
   * 재고에서 바로 빼고 그것을 모았다 — 판매가 없어 [소모(판매)번호]·[부가세]를 못 냈다. 이제 수리 · 판매연결 기준이다.
   * 기준일자(수리일자)로 받아 나머지 조건은 그 줄로 거른다.
   */
  async function load() {
    setLoading(true); setError('')
    try { setLines((await api.get<Line[]>('/as-repairs/consumption', { params: { from, to } })).data) }
    catch (err) { setError(extractErrorMessage(err)); setLines([]) }
    finally { setLoading(false) }
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load() }, [from, to])

  const filtered = useMemo(() => lines
    .filter((l) => !warehouseId || String(l.warehouseId) === warehouseId)
    .filter((l) => !partnerId || String(l.partnerId) === partnerId)
    .filter((l) => !repairItemId || String(l.repairItemId) === repairItemId)
    .filter((l) => !projectId || String(l.projectId) === projectId)
    .filter((l) => !partnerGroup || pgroup.groupOfName(l.partnerName) === partnerGroup)
    .filter((l) => !itemCategory || (l.repairItemId != null && categoryOf(l.repairItemId) === itemCategory))
    .filter((l) => !itemGroup || (l.repairItemId != null && groupOf(l.repairItemId) === itemGroup))
    .filter((l) => !status || STATUS_NAME[l.status] === status)
    .filter((l) => !title || (l.title ?? '').includes(title))
    .filter((l) => !remark || (l.content ?? '').includes(remark))
    .filter((l) => !createdBy || (l.createdBy ?? '').includes(createdBy))
    .filter((l) => !charge || l.charge.includes(charge))
    .filter((l) => !receiptCharge || (l.receiptCharge ?? '').includes(receiptCharge))
    .filter((l) => !repairType || l.repairType === repairType)
    .filter((l) => !recvFrom || (l.receiptDate ?? '') >= recvFrom)
    .filter((l) => !recvTo || (l.receiptDate != null && l.receiptDate <= recvTo)),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [lines, warehouseId, partnerId, repairItemId, projectId, partnerGroup, itemCategory, itemGroup, status, title, remark, createdBy, charge, receiptCharge, repairType, recvFrom, recvTo])
  /* 검색어는 <b>소모부품명</b>에 건다. */
  const shownLines = useMemo(
    () => filtered.filter((l) => !keyword || l.itemName.includes(keyword)), [filtered, keyword])
  const lineTotals = useMemo(() => shownLines.reduce(
    (a, l) => ({ qty: a.qty + Number(l.quantity), amount: a.amount + Number(l.supplyAmount ?? 0), vat: a.vat + Number(l.vatAmount ?? 0) }),
    { qty: 0, amount: 0, vat: 0 }), [shownLines])

  /* [코드포함] · 품목명[규격] 의 코드 · 규격 — 소모 줄에는 id 만 있어 마스터에서 잇는다. */
  const mgmt = useItemMgmt()
  const [masters, setMasters] = useState<{ wh: Map<number, string>; pa: Map<number, string>; pj: Map<number, string>; it: Map<number, { code: string; spec: string | null; name: string }> }>(
    { wh: new Map(), pa: new Map(), pj: new Map(), it: new Map() })
  useEffect(() => {
    type C = { id: number; code: string; name: string; spec?: string | null }
    const get = (u: string) => api.get<C[]>(u).then((r) => r.data).catch(() => [] as C[])
    Promise.all([get('/warehouses'), get('/partners'), get('/projects'), get('/items')]).then(([wh, pa, pj, it]) => setMasters({
      wh: new Map(wh.map((x) => [x.id, x.code])), pa: new Map(pa.map((x) => [x.id, x.code])), pj: new Map(pj.map((x) => [x.id, x.code])),
      it: new Map(it.map((x) => [x.id, { code: x.code, spec: x.spec ?? null, name: x.name }])),
    }))
  }, [])
  const warehouseName = (id: number) => pickers.warehouses.find((w) => w.value === String(id))?.name ?? ''
  const projectName = (id: number | null) => (id == null ? '' : pickers.projects.find((w) => w.value === String(id))?.name ?? '')
  /** ○집계가 읽는 줄 — 소모(판매) 줄마다 하나. 품목은 <b>소모부품</b>이다. */
  const aggLines: AsAggLine[] = shownLines.map((l) => ({
    date: l.repairDate, charge: l.charge ?? '',
    warehouse: [warehouseName(l.warehouseId), masters.wh.get(l.warehouseId) ?? ''],
    mgmt: mgmt.nameOf(l.itemId) ?? '',
    partner: [l.partnerName, masters.pa.get(l.partnerId) ?? ''], partnerGroup: pgroup.groupOfName(l.partnerName) ?? '',
    itemName: l.itemName, itemSpec: masters.it.get(l.itemId)?.spec ?? null, itemCode: masters.it.get(l.itemId)?.code ?? '',
    itemGroup: mgmt.groupOf(l.itemId) ?? '',
    project: [projectName(l.projectId), l.projectId != null ? masters.pj.get(l.projectId) ?? '' : ''],
    qty: Number(l.quantity),
  }))

  return (
    <EcListShell title="A/S소모현황" search={keyword} onSearchChange={setKeyword} onSearch={load}
      onNew={undefined} actions={[{ label: '새로고침', onClick: load }, { label: 'Excel' }, { label: '인쇄' }]}>
      <EcStatusPanel from={from} to={to} onPeriod={(r) => { setFrom(r.from); setTo(r.to) }}
        picks={AS_CONSUMPTION_PICKS} dateLabel="기준일자"
        subtotal={subtotal} subtotals={SUBTOTALS}
        onSubtotalChange={(v) => setSubtotal(v as typeof SUBTOTALS[number])}>
        {/* 원본 조건 판의 첫 칸이 [구분]이다. */}
        <EcCond label="구분">
          <span className="inline-flex flex-wrap items-center gap-[8px]">
            {MODES.map((m) => (
              <label key={m} className="inline-flex items-center gap-[3px]">
                <input type="radio" name="asc-gubun" checked={mode === m} onChange={() => setMode(m)} /> {m}
              </label>
            ))}
            {mode === '내역' ? <span className="text-ec-label">라인별</span>
              : <AsAggControls value={agg} onChange={(p) => setAgg((v) => ({ ...v, ...p }))} keys={CONS_AGG_KEYS} />}
          </span>
        </EcCond>
        <EcCond label="접수일자" span={2}>
          <input type="date" className="ec-input" value={recvFrom} onChange={(e) => setRecvFrom(e.target.value)} /> ~
          <input type="date" className="ec-input" value={recvTo} onChange={(e) => setRecvTo(e.target.value)} />
        </EcCond>
        <EcCond label="창고" pick>
          <CodePickerField label="창고" hideLabel width={170} emptyLabel="전체"
                           value={warehouseId} onChange={setWarehouseId} items={pickers.warehouses} />
        </EcCond>
        {/* 원본 A/S소모현황 차례: 접수일자 · 창고 · <b>프로젝트</b> · … · 거래처 · 수리품목 */}
        <EcCond label="프로젝트" pick>
          <CodePickerField label="프로젝트" hideLabel width={170} emptyLabel="전체"
                           value={projectId} onChange={setProjectId} items={pickers.projects} />
        </EcCond>
        {/* 원본 차례: … 프로젝트 · <b>수리담당자</b> · 접수담당자 · 수리유형 · 거래처 … */}
        <EcCond label="수리담당자">
          <input className="ec-input" value={charge} onChange={(e) => setCharge(e.target.value)}
                 style={{ width: 120 }} placeholder="전체" />
        </EcCond>
        <EcCond label="접수담당자">
          <input className="ec-input w-[120px]" value={receiptCharge} onChange={(e) => setReceiptCharge(e.target.value)} placeholder="전체" />
        </EcCond>
        <EcCond label="수리유형">
          <select className="ec-input w-[120px]" value={repairType} onChange={(e) => setRepairType(e.target.value)}>
            <option value="">전체</option>
            {Object.entries(REPAIR_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </EcCond>
        <EcCond label="거래처" pick>
          <CodePickerField label="거래처" hideLabel width={170} emptyLabel="전체"
                           value={partnerId} onChange={setPartnerId} items={pickers.partners} />
        </EcCond>
        {/* 원본 차례: [거래처] 다음이 [거래처그룹1]이다(2026-09-09 실측). */}
        <EcCond label="거래처그룹1" pick>
          <CodePickerField label="거래처그룹1" hideLabel width={150} emptyLabel="전체"
                           value={partnerGroup} onChange={setPartnerGroup}
                           items={pgroup.groupOptions.map((g) => ({ value: g, name: g }))} />
        </EcCond>
        <EcCond label="수리품목" pick>
          <CodePickerField label="수리품목" hideLabel width={170} emptyLabel="전체"
                           value={repairItemId} onChange={setRepairItemId} items={pickers.items} />
        </EcCond>
        {/* [품목구분]·[품목그룹1]은 <b>수리품목</b>의 값이다 — 소모부품이 아니다(원본 차례가 그렇다). */}
        <EcCond label="품목구분">
          <select className="ec-input" value={itemCategory} style={{ width: 130 }}
                  onChange={(e) => setItemCategory(e.target.value)}>
            <option value="">전체</option>
            {categories.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
        </EcCond>
        <EcCond label="품목그룹1">
          <select className="ec-input" value={itemGroup} style={{ width: 150 }}
                  onChange={(e) => setItemGroup(e.target.value)}>
            <option value="">전체</option>
            {groups.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
        </EcCond>
        <EcCond label="수리진행상태" pick>
          <select className="ec-input" value={status} style={{ width: 120 }}
                  onChange={(e) => setStatus(e.target.value)}>
            <option value="">전체</option>
            {AS_STATUSES.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
        </EcCond>
        <EcCond label="제목">
          <input className="ec-input" placeholder="제목 일부" value={title}
                 onChange={(e) => setTitle(e.target.value)} style={{ width: 180 }} />
        </EcCond>
        {/* 원본 [적요]. A/S 전표의 적요는 수리내역이다 — A/S접수조회가 이미 그렇게 건다. */}
        <EcCond label="적요">
          <input className="ec-input" placeholder="적요 일부" value={remark}
                 onChange={(e) => setRemark(e.target.value)} style={{ width: 180 }} />
        </EcCond>
        <EcCond label="최초작성자">
          <input className="ec-input" placeholder="작성자 일부" value={createdBy}
                 onChange={(e) => setCreatedBy(e.target.value)} style={{ width: 140 }} />
        </EcCond>
      </EcStatusPanel>

      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}

      {mode === '내역' ? (
      /*
        <b>원본 격자(2026-09-09 E040641 실측)</b> —
        [수리번호 · 수리품목명 · 수리담당자 · 소모(판매)번호 · 소모부품명 · 수량 · 단가 ·
        공급가액 · 부가세]. 2026-10-03 부터 소모가 판매연결전표의 판매 줄이라 둘 다 판매에서 온다.
      */
      <>
      <EcReportHead title="A/S소모현황" period={reportPeriod(from, to)} />
      <table className="w-full ec-head700">
        <thead>
          <tr>
            <th className="w-[34px]"></th>
            <th className="w-[110px] text-center">수리번호</th>
            <th>수리품목명</th>
            <th className="w-[100px]">수리담당자</th>
            <th className="w-[150px]">소모(판매)번호</th>
            <th>소모부품명</th>
            <th className="text-right w-[90px]">수량</th>
            <th className="text-right w-[110px]">단가</th>
            <th className="text-right w-[120px]">공급가액</th>
            <th className="text-right w-[110px]">부가세</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={10} className="ec-empty">불러오는 중…</td></tr>
          ) : shownLines.length === 0 ? (
            <tr><td colSpan={10} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
          ) : shownLines.map((l, i) => (
            <tr key={`${l.salesId}-${i}`}>
              <td className="text-center text-ec-hint">{i + 1}</td>
              <td className="text-center">{`${l.repairDate.slice(2).replace(/-/g, '/')}-${Number(l.repairNo.split('-').pop())}`}</td>
              <td>{l.repairItemName ?? ''}</td>
              <td>{l.charge}</td>
              <td>{l.salesDocNo}</td>
              <td>{l.itemName}</td>
              <td className="text-right">{won(Number(l.quantity))}</td>
              <td className="text-right">{l.unitPrice != null ? won(Number(l.unitPrice)) : ''}</td>
              <td className="text-right">{l.supplyAmount != null ? won(Number(l.supplyAmount)) : ''}</td>
              <td className="text-right">{l.vatAmount != null ? won(Number(l.vatAmount)) : ''}</td>
            </tr>
          ))}
        </tbody>
        {shownLines.length > 0 && (
          <tfoot>
            <tr className="font-bold bg-ec-page">
              <td colSpan={6} className="text-right">합계</td>
              <td className="text-right">{won(lineTotals.qty)}</td>
              <td></td>
              <td className="text-right">{won(lineTotals.amount)}</td>
              <td className="text-right">{won(lineTotals.vat)}</td>
            </tr>
          </tfoot>
        )}
      </table>
        <EcReportFoot />
      </>
      ) : (
        <AsAggregateTable
          /* 조건을 바꾸면 표를 새로 세운다(열 수가 바뀐다). */
          key={`${agg.agg1}|${agg.agg2}|${agg.codeIncl}`}
          title="A/S소모현황" period={reportPeriod(from, to)} lines={aggLines} value={agg} />
      )}

      {mode === '내역' && subtotal !== '없음' && shownLines.length > 0 && (() => {
        /* 소계 축은 소모부품 품목 마스터의 값이라 줄에서 바로 못 읽는다 — itemId 로 되짚는다. */
        const keyOf = (l: Line) => (subtotal === '품목구분' ? categoryOf(l.itemId) : groupOf(l.itemId))
        const groupsOf = subtotalBy(shownLines, keyOf, {
          qty: (l) => Number(l.quantity), amount: (l) => Number(l.supplyAmount ?? 0),
        })
        return (
          <>
            <h3 className="text-[13px] font-bold mt-[16px] mx-0 mb-[6px]">{subtotal} 소계</h3>
            <table className="w-full text-left">
              <thead><tr>
                <th>{subtotal}</th>
                <th className="w-[90px] text-right">품목수</th>
                <th className="w-[130px] text-right">소모수량</th>
                <th className="w-[150px] text-right">소모금액</th>
              </tr></thead>
              <tbody>
                {groupsOf.map((g) => (
                  <tr key={g.label}>
                    <td className="font-semibold">{g.label}</td>
                    <td className="text-right">{g.count}</td>
                    <td className="text-right text-ec-warn">{won(g.sums.qty)}</td>
                    <td className="text-right font-bold text-ec-blue">
                      {won(g.sums.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )
      })()}
    </EcListShell>
  )
}
