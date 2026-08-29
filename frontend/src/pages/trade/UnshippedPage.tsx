import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, extractErrorMessage } from '../../api/client'
import EcListShell from '../../components/EcListShell'
import EcStatusPanel, { EcCond } from '../../components/EcStatusPanel'
import EcBarChart from '../../components/EcBarChart'
import { INQUIRY_PICKS } from '../../components/EcPeriodPicks'
import CodePickerField from '../../components/CodePickerField'
import { useCondPickers } from '../../utils/useCondPickers'
import { useTableSort } from '../../utils/useTableSort'

/**
 * 영업관리 > 미출하현황 (이카운트 E040228)
 * 접수·진행중 주문의 라인별 미출하 잔량 (백엔드 /sales-orders/unshipped 연동).
 *
 * 원본은 조회 조건 패널이 화면의 본체다: 기준일자 · 출하지시No. · 출하예정일 · 창고 · 프로젝트 ·
 * 관리항목 · 거래처 · 품목 · 담당자 · 거래처관리담당자 · 미출하수량(범위).
 * 우리 화면은 조건이 검색어 한 칸뿐이었다 — 미출하가 쌓이면 못 쓴다.
 *
 * 창고·프로젝트·관리항목·담당자·거래처관리담당자·출하지시No. 는 UnshippedLine 에 없어
 * **의도적 제외**(값 없는 컨트롤을 흉내내지 않는다). 대신 우리 데이터로 실제 거를 수 있는
 * 납기일 구간·거래처·품목·주문번호·미출하수량 범위를 둔다.
 *
 * <p>원본 결과 열 실측(사본): 일자-No. · 품목명(규격) · 수량 · 미출하수량 · <b>창고명</b> ·
 * 거래처명 · <b>적요</b> · 출하예정일. 적요는 이제 싣는다 — 주문서에 적어 둔 말이
 * 미출하현황에서 사라지면, 왜 아직 안 나갔는지 적어 둬도 그 화면에서는 볼 수가 없다.
 *
 * <p>[창고명]은 아직 없다. 주문서에 창고 칸이 없어서인데, <b>원본 주문서 화면 사본이 없어</b>
 * 그 칸이 주문의 것인지 품목 기본창고인지 확인하지 못했다. 짐작으로 만들지 않는다.
 */
/**
 * 원본 미출하현황의 [구분] 은 <b>품목별 · 라인별</b> 둘이다(원본 사본 실측).
 * 우리는 라인별 하나뿐이었다. 품목별은 같은 품목의 미출하수량을 주문서를 가로질러 모은다 —
 * "이 품목을 얼마나 더 내보내야 하나"를 보는 쪽이다.
 */
type Mode = '품목별' | '라인별'
const MODES = ['품목별', '라인별'] as const

interface UnshippedLine {
  orderId: number
  orderNo: string
  orderLineId: number
  partnerId: number
  partnerName: string
  orderDate: string
  dueDate: string | null
  status: 'RECEIVED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELED'
  statusName: string
  itemId: number
  itemCode: string
  itemName: string
  unit: string
  orderQty: number
  shippedQty: number
  unshippedQty: number
  /** 적요. 원본 미출하현황의 열 — 주문서에 적어 둔 말이 여기서 사라지면 안 된다. */
  remark: string | null
}

const statusColor = (s: UnshippedLine['status']) => (s === 'IN_PROGRESS' ? '#b6791b' : '#1c6fb5')

export default function UnshippedPage() {
  const navigate = useNavigate()
  /* 원본은 조건 판의 창고·거래처·품목·프로젝트를 모두 코드도움으로 둔다. */
  const pickers = useCondPickers(['partners', 'items'])
  const [rows, setRows] = useState<UnshippedLine[]>([])
  const [keyword, setKeyword] = useState('')
  /** 원본 조건 판에 해당하는 값들. 고치면 바로 반영된다(원본도 그렇다). */
  /*
   * 원본 미출하현황 조건 차례: 구분 · 기준일자(영업주기) · 출하지시No. · <b>출하예정일</b> ·
   * 창고 · 프로젝트 · 관리항목 · 거래처 · 품목 · 담당자 · <b>거래처관리담당자</b> · 미출하수량.
   *
   * <p>[출하예정일]은 <b>줄에 이미 실려 오는데</b>(납기일) 거를 수가 없었다 —
   * "이번 주까지 나가야 할 미출하" 를 보려면 표를 눈으로 훑어야 했다.
   * [거래처관리담당자]는 거래처 마스터가 든다 — "내가 맡은 거래처의 미출하" 를 못 봤다.
   */
  const [cond, setCond] = useState({ from: '', to: '', partner: '', item: '', orderNo: '',
    dueFrom: '', dueTo: '', partnerMgr: '', qtyFrom: '', qtyTo: '' })
  const [partnerMgrs, setPartnerMgrs] = useState<Map<string, string>>(new Map())
  const setC = (patch: Partial<typeof cond>) => setCond((c) => ({ ...c, ...patch }))
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  /** 라인별 출하지시 수량 입력값 (기본값: 미출하 잔량) */
  const [shipQty, setShipQty] = useState<Record<number, string>>({})
  const [busyLine, setBusyLine] = useState<number | null>(null)

  async function load() {
    setLoading(true)
    setError('')
    try {
      const res = await api.get<UnshippedLine[]>('/sales-orders/unshipped')
      setRows(res.data)
      setShipQty({})
    } catch (err) {
      setError(extractErrorMessage(err))
      setRows([])
    } finally {
      setLoading(false)
    }
  }

  /** 주문 라인에서 출하지시를 생성한다. 출하완료 처리는 출하 화면에서. */
  async function ship(r: UnshippedLine) {
    const raw = shipQty[r.orderLineId] ?? String(r.unshippedQty)
    const qty = Number(raw)
    if (!Number.isFinite(qty) || qty <= 0) {
      setError('출하수량을 0보다 크게 입력하세요.')
      return
    }
    if (qty > r.unshippedQty) {
      setError(`출하수량이 미출하 잔량(${r.unshippedQty.toLocaleString()})을 초과합니다.`)
      return
    }

    setBusyLine(r.orderLineId)
    setError('')
    setNotice('')
    try {
      const res = await api.post<{ shipNo: string }>(`/sales-orders/${r.orderId}/ship`, {
        lines: [{ orderLineId: r.orderLineId, qty }],
      })
      setNotice(`출하지시 ${res.data.shipNo} 생성됨 · 출하지시서에서 출하완료 처리하면 미출하수량이 줄어듭니다.`)
      await load()
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setBusyLine(null)
    }
  }

  useEffect(() => {
    load()
  }, [])

  /* [거래처관리담당자]는 거래처 마스터가 든다 — 미출하 줄은 거래처 <b>이름만</b> 들고 온다. */
  useEffect(() => {
    api.get<{ name: string; manager: string | null }[]>('/partners')
      .then((r) => setPartnerMgrs(new Map(r.data.map((p) => [p.name, p.manager ?? '']))))
      .catch(() => {})
  }, [])

  const shownRows = rows.filter(
    (r) => !keyword || r.partnerName.includes(keyword) || r.orderNo.includes(keyword) || r.itemName.includes(keyword),
  )
    /*
     * <b>기준일자는 주문일이고, 출하예정일은 납기일이다.</b>
     *
     * <p>예전에는 [기준일자]를 <b>납기일로 읽었다</b> — 원본의 [출하예정일]이 우리에게 없어서
     * "언제까지 나가야 하는데 안 나갔나" 를 물을 길이 그것뿐이었기 때문이다.
     * 이제 [출하예정일]을 따로 만들었으니 그 절충이 필요 없다. 둘 다 제 뜻으로 돌린다.
     */
    .filter((r) => !cond.from || r.orderDate >= cond.from)
    .filter((r) => !cond.to || r.orderDate <= cond.to)
    .filter((r) => !cond.dueFrom || (r.dueDate ?? '') >= cond.dueFrom)
    .filter((r) => !cond.dueTo || (r.dueDate ?? '') <= cond.dueTo)
    .filter((r) => !cond.partnerMgr || partnerMgrs.get(r.partnerName) === cond.partnerMgr)
    .filter((r) => !cond.partner || r.partnerName.includes(cond.partner))
    .filter((r) => !cond.item || r.itemName.includes(cond.item))
    .filter((r) => !cond.orderNo || r.orderNo.includes(cond.orderNo))
    .filter((r) => !cond.qtyFrom || r.unshippedQty >= Number(cond.qtyFrom))
    .filter((r) => !cond.qtyTo || r.unshippedQty <= Number(cond.qtyTo))

  /*
   * 다섯 칸에 <b>▼ 만 그려 놓고</b> 정렬은 없었다 — 눌러도 아무 일이 없었다.
   * 수량 두 칸은 원본에도 표시가 없어 그대로 뒀다.
   * [일자-No.] 는 화면에 찍히는 대로 '일자 번호' 를 이어 붙여 견준다 — 일자가 같은 건은
   * 번호 차례로 선다.
   */
  const sort = useTableSort(shownRows, {
    '일자-No.': (r) => `${r.orderDate} ${r.orderNo}`,
    '품목명(규격)': (r) => r.itemName,
    거래처명: (r) => r.partnerName,
    출하예정일: (r) => r.dueDate,
    상태: (r) => r.statusName,
  })
  const shown = sort.sorted
  const [mode, setMode] = useState<Mode>('라인별')
  const [view, setView] = useState<'표' | '그래프'>('표')

  /** 품목별 — 주문서를 가로질러 같은 품목을 모은다. */
  const byItem = useMemo(() => {
    const m = new Map<number, {
      itemId: number; itemCode: string; itemName: string; unit: string
      orderQty: number; unshippedQty: number; orderCount: number
    }>()
    for (const r of shown) {
      const cur = m.get(r.itemId)
      if (!cur) {
        m.set(r.itemId, {
          itemId: r.itemId, itemCode: r.itemCode, itemName: r.itemName, unit: r.unit,
          orderQty: r.orderQty, unshippedQty: r.unshippedQty, orderCount: 1,
        })
      } else {
        cur.orderQty += r.orderQty
        cur.unshippedQty += r.unshippedQty
        cur.orderCount += 1
      }
    }
    return [...m.values()].sort((a, b) => b.unshippedQty - a.unshippedQty)
  }, [shown])

  const totalUnshipped = useMemo(() => shown.reduce((s, r) => s + r.unshippedQty, 0), [shown])

  /* 원본 [데이터 보기형식] · [그래프로 보기]. 미출하는 '어느 품목이 밀렸나' 를 보는 화면이다. */
  const chartRows = useMemo(() =>
    mode === '품목별'
      ? byItem.map((r) => ({ label: r.itemName, value: r.unshippedQty }))
      : shown.map((r) => ({ label: `${r.itemName}`, value: r.unshippedQty })),
    [mode, byItem, shown])

  const reset = () => {
    setCond({ from: '', to: '', partner: '', item: '', orderNo: '',
      dueFrom: '', dueTo: '', partnerMgr: '', qtyFrom: '', qtyTo: '' })
    setKeyword('')
  }

  return (
    <EcListShell
      title="미출하현황"
      search={keyword}
      onSearchChange={setKeyword}
      onSearch={load}
      onNew={undefined}
      searchable={false}
      actions={[
        { label: '검색(F8)', primary: true, onClick: load },
        { label: '다시 작성', onClick: reset },
        { label: '인쇄' },
        { label: 'Excel(화면)' },
      ]}
    >
      <EcStatusPanel
        from={cond.from} to={cond.to}
        onPeriod={(r) => setC({ from: r.from, to: r.to })}
        picks={INQUIRY_PICKS}
        modes={MODES} mode={mode} onModeChange={(m) => setMode(m as Mode)}
        view={view} onViewChange={setView}
      >
        <EcCond label="출하예정일">
          <input type="date" className="ec-input" value={cond.dueFrom}
                 onChange={(e) => setC({ dueFrom: e.target.value })} style={{ width: 140 }} />
          <span style={{ color: 'var(--ec-label)' }}>~</span>
          <input type="date" className="ec-input" value={cond.dueTo}
                 onChange={(e) => setC({ dueTo: e.target.value })} style={{ width: 140 }} />
        </EcCond>
        <EcCond label="거래처" pick>
          <CodePickerField label="거래처" hideLabel width={200} emptyLabel="전체"
                           value={cond.partner} onChange={(v) => setC({ partner: v })}
                           items={pickers.partners} />
        </EcCond>
        <EcCond label="품목" pick>
          <CodePickerField label="품목" hideLabel width={200} emptyLabel="전체"
                           value={cond.item} onChange={(v) => setC({ item: v })}
                           items={pickers.items} />
        </EcCond>
        <EcCond label="주문번호" pick>
          <input className="ec-input" placeholder="주문번호 일부" value={cond.orderNo}
                 onChange={(e) => setC({ orderNo: e.target.value })} style={{ width: 220 }} />
        </EcCond>
        <EcCond label="거래처관리담당자" pick>
          {/* 후보는 <b>실제로 거래처를 맡은 사람들</b>에서 뽑는다 — 아무 거래처도 안 맡은
              사원을 고를 수 있게 두면 골라도 아무것도 안 나온다. */}
          <CodePickerField label="거래처관리담당자" hideLabel width={150} emptyLabel="전체"
                           value={cond.partnerMgr} onChange={(v) => setC({ partnerMgr: v })}
                           items={[...new Set(partnerMgrs.values())].filter(Boolean).sort()
                             .map((m) => ({ value: m, name: m }))} />
        </EcCond>
        <EcCond label="미출하수량">
          <input className="ec-input" type="number" value={cond.qtyFrom}
                 onChange={(e) => setC({ qtyFrom: e.target.value })} style={{ width: 100 }} />
          <span style={{ color: 'var(--ec-label)' }}>~</span>
          <input className="ec-input" type="number" value={cond.qtyTo}
                 onChange={(e) => setC({ qtyTo: e.target.value })} style={{ width: 100 }} />
        </EcCond>
      </EcStatusPanel>

      <div style={{ marginBottom: 8, fontSize: 12.5, color: '#5a626e', textAlign: 'right' }}>
        미출하 라인 <b style={{ color: 'var(--ec-blue-dark)', fontSize: 14 }}>{shown.length}</b>건
        <span style={{ margin: '0 6px', color: '#c9ced6' }}>|</span>
        미출하수량 합계 <b style={{ color: '#c60a2e', fontSize: 14 }}>{totalUnshipped.toLocaleString()}</b>
      </div>

      {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}
      {notice && (
        <p style={{ background: '#eef5ff', color: '#2b5b91', border: '1px solid #cfe0f5', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8, display: 'flex', alignItems: 'center' }}>
          {notice}
          <button className="ec-btn" style={{ marginLeft: 'auto' }} onClick={() => navigate('/sales/shipment-order')}>출하지시서로 이동</button>
        </p>
      )}

      {view === '그래프' ? (
        <EcBarChart rows={chartRows} unit=" 개" emptyText="미출하 잔량이 없습니다." />
      ) : mode === '품목별' ? (
        <table className="w-full text-left">
          <thead>
            <tr>
              <th style={{ width: 34 }}></th>
              <th style={{ width: 130 }}>품목코드</th>
              <th>품목명(규격)</th>
              <th style={{ width: 90, textAlign: 'right' }}>주문건수</th>
              <th style={{ width: 110, textAlign: 'right' }}>수량</th>
              <th style={{ width: 110, textAlign: 'right' }}>미출하수량</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
            ) : byItem.length === 0 ? (
              <tr><td colSpan={6} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>등록된 데이터가 없습니다.</td></tr>
            ) : byItem.map((g, i) => (
              <tr key={g.itemId}>
                <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
                <td style={{ fontFamily: 'monospace' }}>{g.itemCode}</td>
                <td>{g.itemName}</td>
                <td style={{ textAlign: 'right', color: '#8a929c' }}>{g.orderCount.toLocaleString()}</td>
                <td style={{ textAlign: 'right' }}>{g.orderQty.toLocaleString()} {g.unit}</td>
                <td style={{ textAlign: 'right', fontWeight: 700, color: g.unshippedQty > 0 ? '#c60a2e' : '#8a929c' }}>
                  {g.unshippedQty.toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ fontWeight: 700, background: 'var(--ec-body-bg)' }}>
              <td colSpan={3} style={{ textAlign: 'right' }}>합계 ({byItem.length}품목)</td>
              <td style={{ textAlign: 'right' }}>{byItem.reduce((a, g) => a + g.orderCount, 0).toLocaleString()}</td>
              <td style={{ textAlign: 'right' }}>{byItem.reduce((a, g) => a + g.orderQty, 0).toLocaleString()}</td>
              <td style={{ textAlign: 'right', color: '#c60a2e' }}>{totalUnshipped.toLocaleString()}</td>
            </tr>
          </tfoot>
        </table>
      ) : (
      <table className="w-full text-left">
        <thead>
          <tr>
            {/* 칸 순서·이름은 원본 미출하현황 격자 그대로:
                일자-No. · 품목명(규격) · 수량 · 미출하수량 · 거래처명 · 출하예정일.
                원본의 창고명·적요는 우리 주문서에 그 값이 없어 칸을 만들지 않는다.
                맨 끝 [출하지시] 는 우리 화면의 것이다 — 여기서 바로 출하지시서를 낸다. */}
            <th style={{ width: 34 }}></th>
            <th style={{ width: 170, cursor: 'pointer' }} onClick={() => sort.toggle('일자-No.')}>일자-No. {sort.mark('일자-No.')}</th>
            <th style={{ cursor: 'pointer' }} onClick={() => sort.toggle('품목명(규격)')}>품목명(규격) {sort.mark('품목명(규격)')}</th>
            <th style={{ width: 90, textAlign: 'right' }}>수량</th>
            <th style={{ width: 90, textAlign: 'right' }}>미출하수량</th>
            <th style={{ cursor: 'pointer' }} onClick={() => sort.toggle('거래처명')}>거래처명 {sort.mark('거래처명')}</th>
            <th style={{ width: 150 }}>적요</th>
            <th style={{ width: 100, cursor: 'pointer' }} onClick={() => sort.toggle('출하예정일')}>출하예정일 {sort.mark('출하예정일')}</th>
            <th style={{ width: 80, textAlign: 'center', cursor: 'pointer' }} onClick={() => sort.toggle('상태')}>상태 {sort.mark('상태')}</th>
            <th style={{ width: 150, textAlign: 'center' }}>출하지시</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={10} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
          ) : shown.length === 0 ? (
            <tr><td colSpan={10} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>등록된 데이터가 없습니다.</td></tr>
          ) : shown.map((r, i) => (
            <tr key={`${r.orderId}-${r.itemId}-${i}`}>
              <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
              <td style={{ fontFamily: 'monospace' }}>{r.orderDate} {r.orderNo}</td>
              <td>[{r.itemCode}] {r.itemName}</td>
              <td style={{ textAlign: 'right' }}>{r.orderQty.toLocaleString()} {r.unit}</td>
              <td style={{ textAlign: 'right', fontWeight: 700, color: r.unshippedQty > 0 ? '#c60a2e' : '#8a929c' }}>{r.unshippedQty.toLocaleString()}</td>
              <td>{r.partnerName}</td>
              <td style={{ color: '#8a929c' }}>{r.remark ?? ''}</td>
              <td style={{ fontFamily: 'monospace', color: r.dueDate ? 'var(--ec-text)' : '#9aa1ab' }}>{r.dueDate ?? '-'}</td>
              <td style={{ textAlign: 'center', color: statusColor(r.status), fontWeight: 700 }}>{r.statusName}</td>
              <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                <input
                  className="ec-input"
                  type="number"
                  min={0}
                  max={r.unshippedQty}
                  style={{ width: 66, textAlign: 'right' }}
                  value={shipQty[r.orderLineId] ?? String(r.unshippedQty)}
                  onChange={(e) => setShipQty((p) => ({ ...p, [r.orderLineId]: e.target.value }))}
                />
                <button
                  className="ec-btn ec-btn-primary"
                  style={{ marginLeft: 4 }}
                  disabled={busyLine === r.orderLineId || r.unshippedQty <= 0}
                  onClick={() => ship(r)}
                >
                  {busyLine === r.orderLineId ? '처리중…' : '출하지시'}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      )}
    </EcListShell>
  )
}
