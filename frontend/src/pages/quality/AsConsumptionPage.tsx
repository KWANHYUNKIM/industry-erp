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

/**
 * 품질 > A/S소모현황 (이카운트 E040641 A/S소모현황)
 * A/S 수리에 소모된 부품을 품목별로 집계 — 소모수량·소모금액·해당 A/S 건수.
 * 소스: A/S 접수·수리 관리(AsManagePage)에서 등록한 소모부품(재고 차감분).
 * 백엔드 `GET /api/as-requests/parts/consumption` (품목별 집계).
 */
interface Row { itemId: number; itemName: string; asCount: number; totalQty: number; totalAmount: number }
/**
 * 원본 [구분]의 <b>[내역]</b> 한 줄 — 소모부품 하나. 서버가 <code>/parts/consumption/lines</code>
 * 로 준다. 거름망은 [집계]와 <b>같은 것</b>이라 두 갈래의 합계가 어긋나지 않는다.
 */
interface Line {
  partId: number; asNo: string; repairItemName: string; charge: string | null
  itemId: number; itemName: string
  quantity: number; unitPrice: number | null; supplyAmount: number | null
}
const won = (n: number) => n.toLocaleString('ko-KR')

const initP = periodOf('금월(~오늘)')!

/** A/S 처리 상태(AsStatus)의 표시 이름. 원본 [수리진행상태]가 고르는 것이 이것이다. */
const AS_STATUSES = ['접수', '처리중', '완료', '취소'] as const

/**
 * 원본 [정렬/소계기준]. 축은 [설정] 창에서 고르는데 그 창은 <b>값을 저장</b>하므로 열지 않았다
 * (조회 화면만 연다는 규칙). 이 표의 줄은 <b>소모부품 품목</b> 하나뿐이라 그 품목이 들고 있는
 * 값으로만 축을 둔다 — 지어내지 않는다.
 */
const SUBTOTALS = ['없음', '품목구분', '품목그룹1'] as const

/**
 * 원본 [구분]. <b>기본이 [내역]</b> 이다(2026-09-09 E040641 실측) — 열면 소모부품이
 * 한 줄씩 뜨고, [집계]로 바꿔야 품목별로 합친다. 우리는 <b>집계만</b> 내고 있어서
 * "어느 수리에 무엇이 몇 개 들어갔나" 를 이 화면에서 볼 수 없었다.
 */
const MODES = ['내역', '집계'] as const

export default function AsConsumptionPage() {
  const [rows, setRows] = useState<Row[]>([])
  const [lines, setLines] = useState<Line[]>([])
  const [mode, setMode] = useState<'내역' | '집계'>('내역')
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

  async function load() {
    setLoading(true); setError('')
    try {
      const params = { from, to, warehouseId: warehouseId || undefined,
        partnerId: partnerId || undefined, repairItemId: repairItemId || undefined,
        projectId: projectId || undefined,
        partnerGroup: partnerGroup || undefined, itemCategory: itemCategory || undefined,
        itemGroup: itemGroup || undefined, status: status || undefined,
        title: title || undefined, remark: remark || undefined,
        createdBy: createdBy || undefined, charge: charge || undefined }
      /* 갈래가 바뀌면 <b>둘 다</b> 새로 받는다 — 위쪽 요약이 늘 보이는 표와 같은 자료여야 한다. */
      const [agg, det] = await Promise.all([
        api.get<Row[]>('/as-requests/parts/consumption', { params }),
        api.get<Line[]>('/as-requests/parts/consumption/lines', { params }),
      ])
      setRows(agg.data); setLines(det.data)
    }
    catch (err) { setError(extractErrorMessage(err)); setRows([]); setLines([]) }
    finally { setLoading(false) }
  }
  /*
   * 원본은 이 화면에 <b>[검색(F8)] 이 없다</b> — 조건을 바꾸면 바로 반영된다.
   * 우리는 조건을 서버에 넘기면서도 다시 부르지 않아, <b>창고를 골라도 표가 그대로</b>였다
   * ([새로고침]을 눌러야 바뀌었다). 조건이 바뀌면 다시 부른다.
   */
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load() }, [from, to, warehouseId, partnerId, repairItemId, projectId,
    partnerGroup, itemCategory, itemGroup, status, title, remark, createdBy, charge])

  const shown = useMemo(() => rows.filter((r) => !keyword || r.itemName.includes(keyword)), [rows, keyword])
  /* 검색어는 <b>소모부품명</b>에 건다 — 집계 쪽과 같은 칸이다. */
  const shownLines = useMemo(
    () => lines.filter((l) => !keyword || l.itemName.includes(keyword)), [lines, keyword])
  const lineTotals = useMemo(() => shownLines.reduce(
    (a, l) => ({ qty: a.qty + l.quantity, amount: a.amount + (l.supplyAmount ?? 0) }),
    { qty: 0, amount: 0 }), [shownLines])
  const totals = useMemo(() => shown.reduce((a, r) => ({ qty: a.qty + r.totalQty, amount: a.amount + r.totalAmount }), { qty: 0, amount: 0 }), [shown])

  return (
    <EcListShell title="A/S소모현황" search={keyword} onSearchChange={setKeyword} onSearch={load}
      onNew={undefined} actions={[{ label: '새로고침', onClick: load }, { label: 'Excel' }, { label: '인쇄' }]}>
      <EcStatusPanel from={from} to={to} onPeriod={(r) => { setFrom(r.from); setTo(r.to) }}
        picks={AS_CONSUMPTION_PICKS} dateLabel="접수일자"
        subtotal={subtotal} subtotals={SUBTOTALS}
        onSubtotalChange={(v) => setSubtotal(v as typeof SUBTOTALS[number])}>
        {/* 원본 조건 판의 첫 칸이 [구분]이다. */}
        <EcCond label="구분">
          <select className="ec-input" value={mode} style={{ width: 100 }}
                  onChange={(e) => setMode(e.target.value as typeof MODES[number])}>
            {MODES.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
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

      <div style={{ marginBottom: 8, fontSize: 12.5, color: '#5a626e', display: 'flex', alignItems: 'center' }}>
        <span style={{ color: '#9aa1ab' }}>A/S 수리에 소모된 부품을 품목별로 집계. 소모부품은 A/S 관리에서 등록합니다.</span>
        <span style={{ marginLeft: 'auto' }}>
          품목 <b style={{ color: '#3c4553' }}>{shown.length}</b>
          <span style={{ margin: '0 6px', color: '#c9ced6' }}>|</span>
          소모수량 <b style={{ color: '#c07a00', fontSize: 14 }}>{won(totals.qty)}</b>
          <span style={{ margin: '0 6px', color: '#c9ced6' }}>|</span>
          소모금액 <b style={{ color: 'var(--ec-blue)', fontSize: 14 }}>{won(totals.amount)}</b>
        </span>
      </div>

      {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}

      {mode === '내역' ? (
      /*
        <b>원본 격자(2026-09-09 E040641 실측)</b> —
        [수리번호 · 수리품목명 · 수리담당자 · 소모(판매)번호 · 소모부품명 · 수량 · 단가 ·
        공급가액 · 부가세]. [소모(판매)번호]와 [부가세]는 못 낸다:
        원본은 소모부품을 <b>판매 전표로 청구</b>하며 그 번호를 달아 두는데 우리 A/S 는
        부품을 재고에서 빼기만 하고 판매를 만들지 않는다. 부가세도 소모부품 줄
        (<code>AsPart</code>)에 칸이 없다 — 열에 0 을 찍으면 면세로 읽힌다.
      */
      <table className="w-full text-left">
        <thead>
          <tr>
            <th style={{ width: 34 }}></th>
            <th style={{ width: 150 }}>수리번호</th>
            <th>수리품목명</th>
            <th style={{ width: 100 }}>수리담당자</th>
            <th>소모부품명</th>
            <th style={{ textAlign: 'right', width: 90 }}>수량</th>
            <th style={{ textAlign: 'right', width: 110 }}>단가</th>
            <th style={{ textAlign: 'right', width: 120 }}>공급가액</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={8} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
          ) : shownLines.length === 0 ? (
            <tr><td colSpan={8} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>등록된 데이터가 없습니다.</td></tr>
          ) : shownLines.map((l, i) => (
            <tr key={l.partId}>
              <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
              <td style={{ fontFamily: 'monospace' }}>{l.asNo}</td>
              <td>{l.repairItemName}</td>
              <td style={{ color: l.charge ? undefined : '#c5cbd3' }}>{l.charge || ''}</td>
              <td>{l.itemName}</td>
              <td style={{ textAlign: 'right', fontWeight: 700, color: '#c07a00' }}>{won(l.quantity)}</td>
              <td style={{ textAlign: 'right', color: '#5a626e' }}>{l.unitPrice != null ? won(l.unitPrice) : ''}</td>
              <td style={{ textAlign: 'right', fontWeight: 600, color: 'var(--ec-blue)' }}>{l.supplyAmount != null ? won(l.supplyAmount) : ''}</td>
            </tr>
          ))}
        </tbody>
        {shownLines.length > 0 && (
          <tfoot>
            <tr style={{ fontWeight: 700, background: '#f7f9fb' }}>
              <td colSpan={5} style={{ textAlign: 'right' }}>합계</td>
              <td style={{ textAlign: 'right', color: '#c07a00' }}>{won(lineTotals.qty)}</td>
              <td></td>
              <td style={{ textAlign: 'right', color: 'var(--ec-blue)' }}>{won(lineTotals.amount)}</td>
            </tr>
          </tfoot>
        )}
      </table>
      ) : (
      <table className="w-full text-left">
        <thead>
          <tr>
            <th style={{ width: 34 }}></th>
            <th>품목</th>
            <th style={{ textAlign: 'right' }}>A/S 건수</th>
            <th style={{ textAlign: 'right' }}>소모수량</th>
            <th style={{ textAlign: 'right' }}>소모금액</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={5} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
          ) : shown.length === 0 ? (
            <tr><td colSpan={5} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>등록된 데이터가 없습니다.</td></tr>
          ) : shown.map((r, i) => (
            <tr key={r.itemId}>
              <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
              <td>{r.itemName}</td>
              <td style={{ textAlign: 'right' }}>{won(r.asCount)}</td>
              <td style={{ textAlign: 'right', fontWeight: 700, color: '#c07a00' }}>{won(r.totalQty)}</td>
              <td style={{ textAlign: 'right', fontWeight: 600, color: 'var(--ec-blue)' }}>{won(r.totalAmount)}</td>
            </tr>
          ))}
        </tbody>
        {shown.length > 0 && (
          <tfoot>
            <tr style={{ fontWeight: 700, background: '#f7f9fb' }}>
              <td colSpan={3} style={{ textAlign: 'right' }}>합계</td>
              <td style={{ textAlign: 'right', color: '#c07a00' }}>{won(totals.qty)}</td>
              <td style={{ textAlign: 'right', color: 'var(--ec-blue)' }}>{won(totals.amount)}</td>
            </tr>
          </tfoot>
        )}
      </table>
      )}

      {mode === '집계' && subtotal !== '없음' && shown.length > 0 && (() => {
        /* 소계 축은 품목 마스터의 값이라 줄에서 바로 못 읽는다 — itemId 로 되짚는다. */
        const keyOf = (r: Row) => (subtotal === '품목구분' ? categoryOf(r.itemId) : groupOf(r.itemId))
        const groupsOf = subtotalBy(shown, keyOf, {
          qty: (r) => r.totalQty, amount: (r) => r.totalAmount,
        })
        return (
          <>
            <h3 style={{ fontSize: 13, fontWeight: 700, margin: '16px 0 6px' }}>{subtotal} 소계</h3>
            <table className="w-full text-left">
              <thead><tr>
                <th>{subtotal}</th>
                <th style={{ width: 90, textAlign: 'right' }}>품목수</th>
                <th style={{ width: 130, textAlign: 'right' }}>소모수량</th>
                <th style={{ width: 150, textAlign: 'right' }}>소모금액</th>
              </tr></thead>
              <tbody>
                {groupsOf.map((g) => (
                  <tr key={g.label}>
                    <td style={{ fontWeight: 600 }}>{g.label}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>{g.count}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'monospace', color: '#c07a00' }}>{won(g.sums.qty)}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'monospace', fontWeight: 700, color: 'var(--ec-blue)' }}>
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
