import { useEffect, useMemo, useState } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import type { PurchaseOrder, PurchaseOrderStatus } from '../../api/types'
import EcListShell from '../../components/EcListShell'
import CodePickerField from '../../components/CodePickerField'
import { EcCond } from '../../components/EcStatusPanel'
import { useCondPickers } from '../../utils/useCondPickers'
import { useTableSort } from '../../utils/useTableSort'

/**
 * 구매관리 > 단가요청진행단계 (이카운트 E040323)
 * 단가요청(=발주 파이프라인 문서)이 지금 어느 단계인지 문서 단위로 추적한다.
 * 발주요청→발주계획→단가확정→발주확정→입고전환 스테퍼로 현재 단계를 표시.
 * 단가요청현황(PurchaseRequestStatusPage)이 '상태별로 묶어 라인 목록'을 보여주는 반면,
 * 이 화면은 '문서 하나가 파이프라인 어디까지 왔나'를 한 줄로 본다.
 * 백엔드 무변경(GET /api/purchase-orders). 원본의 수취금액·이력 컬럼은 별도 추적 테이블이
 * 없어 제외(확정금액=현재 전표금액만), 구매현황 선례와 동일한 의도적 제외.
 */
const PIPELINE: PurchaseOrderStatus[] = ['REQUESTED', 'PLANNED', 'PRICED', 'ORDERED', 'RECEIVED']
const LABEL: Record<PurchaseOrderStatus, string> = {
  REQUESTED: '발주요청', PLANNED: '발주계획', PRICED: '단가확정',
  ORDERED: '발주확정', RECEIVED: '입고전환', CANCELLED: '취소',
}
const COLOR: Record<PurchaseOrderStatus, string> = {
  REQUESTED: '#c07a00', PLANNED: '#8a929c', PRICED: '#7a5bb5',
  ORDERED: 'var(--ec-blue)', RECEIVED: '#1c7c3c', CANCELLED: '#c60a2e',
}
/** 오늘보다 지난 날짜인가. 목록에 날짜만 적어 두면 지났는지를 <b>사람이 세어야</b> 한다. */
const expired = (d: string | null) => !!d && d < new Date().toISOString().slice(0, 10)

const won = (n: number) => n.toLocaleString('ko-KR')

/** 원본 [이력] 한 줄 — 언제 어느 단계로 넘어갔나. */
interface HistoryRow {
  changedAt: string
  fromStatusName: string | null
  toStatusName: string
  changedBy: string | null
  note: string | null
}

/** 문서의 파이프라인 진행 위치를 점으로 표시. 취소는 별도 표기. */
function Stepper({ status }: { status: PurchaseOrderStatus }) {
  if (status === 'CANCELLED') return <span style={{ color: COLOR.CANCELLED, fontWeight: 700 }}>취소됨</span>
  const idx = PIPELINE.indexOf(status)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
      {PIPELINE.map((st, i) => (
        <span key={st} style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
          <span title={LABEL[st]} style={{
            width: 9, height: 9, borderRadius: '50%',
            background: i <= idx ? COLOR[status] : '#e2e6eb',
            border: i === idx ? `2px solid ${COLOR[status]}` : 'none',
            boxSizing: 'content-box',
          }} />
          {i < PIPELINE.length - 1 && <span style={{ width: 14, height: 2, background: i < idx ? COLOR[status] : '#e2e6eb' }} />}
        </span>
      ))}
      <span style={{ marginLeft: 6, fontSize: 12, fontWeight: 700, color: COLOR[status] }}>{LABEL[status]}</span>
    </div>
  )
}

export default function PriceRequestProgressPage() {
  const [rows, setRows] = useState<PurchaseOrder[]>([])
  const [statusFilter, setStatusFilter] = useState<'ALL' | PurchaseOrderStatus>('ALL')
  const [keyword, setKeyword] = useState('')
  /*
   * 원본 단가요청진행단계의 조건 차례는 <b>유효기간 · 진행상태 · 거래처 · 품목 ·
   * 프로젝트 · 담당자 · 거래처관리담당자 · 적요</b> 다(사본 실측).
   * 넷을 만든다 — 값은 이미 응답에 다 있었다. 눈에는 보이는데 그것으로 좁힐 수가 없었다.
   */
  /*
   * 원본 [유효기간] — 셀렉트가 <b>[사용안함]</b> 으로 서 있고, 켜면 기간 두 칸이 나온다
   * (사본 실측: ddlTSYear 셀렉트 + 숨어 있는 datepicker-range). 기본이 '안 거른다' 이므로
   * 처음 연 사람에게는 아무것도 안 사라진다.
   */
  const [validUse, setValidUse] = useState<'사용안함' | '기간지정'>('사용안함')
  const [validFrom, setValidFrom] = useState('')
  const [validTo, setValidTo] = useState('')
  const [partnerCond, setPartnerCond] = useState('')
  const [itemCond, setItemCond] = useState('')
  const [empCond, setEmpCond] = useState('')
  const [remarkCond, setRemarkCond] = useState('')
  /*
   * 원본 단가요청진행단계 조건의 <b>[거래처관리담당자]</b>. [담당자]는 <b>우리 쪽 담당</b>이고
   * 이것은 <b>그 거래처를 맡은 사람</b>이다 — 거래처 마스터가 들고 있다.
   * "내가 맡은 거래처의 단가요청" 을 한 번에 보려면 이것으로 걸러야 한다.
   */
  /* 발주서에 프로젝트 칸을 만들면서 이 조건도 만들 수 있게 됐다. */
  const [projCond, setProjCond] = useState('')
  const [partnerMgrCond, setPartnerMgrCond] = useState('')
  const [partnerMgrs, setPartnerMgrs] = useState<Map<string, string>>(new Map())
  const pickers = useCondPickers(['partners', 'items', 'employees', 'projects'])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  /*
   * 원본 격자의 <b>[이력]</b> — 그 발주가 밟아 온 자취를 그 자리에서 편다.
   * 우리는 <b>지금 상태만</b> 들고 있어서 "언제 단가확정으로 넘어갔나", "누가 취소했나" 를
   * 물을 수가 없었다 — 늦어진 발주를 두고 어디서 멈춰 있었는지 아무도 답하지 못했다.
   *
   * <p>펼친 발주만 가져온다. 목록에 끼워 넣으면 <b>보지도 않을 자취까지</b> 실어 나른다.
   */
  const [openHistory, setOpenHistory] = useState<number | null>(null)
  const [history, setHistory] = useState<HistoryRow[]>([])
  async function toggleHistory(id: number) {
    if (openHistory === id) { setOpenHistory(null); return }
    setOpenHistory(id)
    setHistory([])
    try { setHistory((await api.get<HistoryRow[]>(`/purchase-orders/${id}/history`)).data) }
    catch (err) { setError(extractErrorMessage(err)) }
  }

  async function load() {
    setLoading(true); setError('')
    try { setRows((await api.get<PurchaseOrder[]>('/purchase-orders')).data) }
    catch (err) { setError(extractErrorMessage(err)); setRows([]) }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])
  /* 거래처 마스터에서 [관리담당자]를 가져와 거래처명으로 잇는다 — 전표는 이름만 들고 온다. */
  useEffect(() => {
    api.get<{ name: string; manager: string | null }[]>('/partners')
      .then((r) => setPartnerMgrs(new Map(r.data.map((p) => [p.name, p.manager ?? '']))))
      .catch(() => {})
  }, [])

  const shown = useMemo(() => rows
    .filter((r) => statusFilter === 'ALL' || r.status === statusFilter)
    .filter((r) => !keyword || r.partnerName.includes(keyword) || r.orderNo.includes(keyword) || r.lines.some((l) => l.itemName.includes(keyword)))
    .filter((r) => !partnerCond || r.partnerName.includes(partnerCond))
    .filter((r) => !itemCond || r.lines.some((l) => l.itemName.includes(itemCond)))
    .filter((r) => !projCond || r.projectName === projCond)
    .filter((r) => !empCond || (r.employeeName ?? '').includes(empCond))
    .filter((r) => !partnerMgrCond || partnerMgrs.get(r.partnerName) === partnerMgrCond)
    .filter((r) => !remarkCond || (r.remark ?? '').includes(remarkCond))
    /*
     * 원본 [유효기간] — [사용안함]이면 안 거른다. 켰을 때 <b>유효기간이 없는 요청은 빠진다</b>:
     * 기간으로 물었는데 기간이 없는 것을 끼워 주면 무엇으로 걸린 목록인지 알 수 없다.
     */
    .filter((r) => validUse === '사용안함'
      || (r.priceValidUntil != null
        && (!validFrom || r.priceValidUntil >= validFrom)
        && (!validTo || r.priceValidUntil <= validTo)))
    .sort((a, b) => b.orderDate.localeCompare(a.orderDate) || b.id - a.id),
  [rows, statusFilter, keyword, partnerCond, itemCond, empCond, remarkCond, partnerMgrCond, partnerMgrs, projCond,
    validUse, validFrom, validTo])

  /*
   * 두 칸에 <b>▼ 만 그려 놓고</b> 정렬은 없었다. 머리를 안 누른 동안은 위의 기본 차례
   * (요청일 내림차순)를 그대로 쓴다.
   */
  const sort = useTableSort(shown, {
    단가요청번호: (r) => r.orderNo,
    요청일: (r) => r.orderDate,
  })

  const count = (s: 'ALL' | PurchaseOrderStatus) => (s === 'ALL' ? rows.length : rows.filter((r) => r.status === s).length)
  const totalAmount = useMemo(() => shown.reduce((a, r) => a + r.totalAmount, 0), [shown])

  return (
    <EcListShell title="단가요청진행단계" search={keyword} onSearchChange={setKeyword} onSearch={load}
      actions={[{ label: '새로고침', onClick: load }, { label: 'Excel' }, { label: '인쇄' }]}>
      {/* 원본은 이 알약 줄에 <b>[진행상태]</b> 라는 이름표를 붙인다 — 이름이 없으면
          무엇을 고르는 알약인지 화면만 보고는 알 수 없다. */}
      <div style={{ display: 'flex', gap: 2, marginBottom: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: 12.5, color: 'var(--ec-label)', marginRight: 6 }}>진행상태</span>
        {(['ALL', ...PIPELINE, 'CANCELLED'] as const).map((s) => (
          <button key={s} onClick={() => setStatusFilter(s)} className="no-ec" style={{
            padding: '5px 12px', fontSize: 12.5, border: '1px solid var(--ec-border)', cursor: 'pointer', borderRadius: 3,
            background: statusFilter === s ? 'var(--ec-blue)' : '#fff', color: statusFilter === s ? '#fff' : '#3a4453', fontWeight: statusFilter === s ? 700 : 400,
          }}>{s === 'ALL' ? '전체' : LABEL[s]} ({count(s)})</button>
        ))}
        <span style={{ marginLeft: 'auto', alignSelf: 'center', fontSize: 12.5, color: '#5a626e' }}>
          확정금액 합계 <b style={{ color: 'var(--ec-blue)', fontSize: 14 }}>{won(totalAmount)}</b>
        </span>
      </div>

      {/* 원본 조건 차례: 진행상태 · 거래처 · 품목 · 담당자 · 적요 */}
      <ul className="ec-cond" style={{ marginBottom: 8 }}>
        {/* 원본 차례는 <b>[유효기간]이 맨 앞</b>이다(사본 실측). */}
        <EcCond label="유효기간">
          <select className="ec-input" value={validUse} style={{ width: 100 }}
                  onChange={(e) => setValidUse(e.target.value as '사용안함' | '기간지정')}>
            <option>사용안함</option><option>기간지정</option>
          </select>
          {validUse === '기간지정' && (
            <>
              <input type="date" className="ec-input" value={validFrom}
                     onChange={(e) => setValidFrom(e.target.value)} style={{ width: 145 }} />
              <span style={{ margin: '0 4px' }}>~</span>
              <input type="date" className="ec-input" value={validTo}
                     onChange={(e) => setValidTo(e.target.value)} style={{ width: 145 }} />
            </>
          )}
        </EcCond>
        <EcCond label="거래처" pick>
          <CodePickerField label="거래처" hideLabel width={170} emptyLabel="전체"
                           value={partnerCond} onChange={setPartnerCond} items={pickers.partners} />
        </EcCond>
        <EcCond label="품목" pick>
          <CodePickerField label="품목" hideLabel width={170} emptyLabel="전체"
                           value={itemCond} onChange={setItemCond} items={pickers.items} />
        </EcCond>
        {/* 원본 차례: … 거래처 · 품목 · <b>프로젝트</b> · 담당자 · 거래처관리담당자 · 적요 */}
        <EcCond label="프로젝트" pick>
          <CodePickerField label="프로젝트" hideLabel width={170} emptyLabel="전체"
                           value={projCond} onChange={setProjCond} items={pickers.projects} />
        </EcCond>
        <EcCond label="담당자" pick>
          <CodePickerField label="담당자" hideLabel width={170} emptyLabel="전체"
                           value={empCond} onChange={setEmpCond} items={pickers.employees} />
        </EcCond>
        <EcCond label="거래처관리담당자" pick>
          {/* 마스터를 고르는 칸은 코드도움이다. 후보는 <b>실제로 거래처를 맡은 사람들</b>에서 뽑는다. */}
          <CodePickerField label="거래처관리담당자" hideLabel width={150} emptyLabel="전체"
                           value={partnerMgrCond} onChange={setPartnerMgrCond}
                           items={[...new Set(partnerMgrs.values())].filter(Boolean).sort()
                             .map((m) => ({ value: m, name: m }))} />
        </EcCond>
        <EcCond label="적요">
          <input className="ec-input" value={remarkCond}
                 onChange={(e) => setRemarkCond(e.target.value)} style={{ width: 170 }} />
        </EcCond>
      </ul>

      {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}

      <table className="w-full text-left">
        <thead>
          <tr>
            <th style={{ width: 34 }}></th>
            {/* 원본 실측: [단가요청번호]는 가운데다. */}
            <th style={{ cursor: 'pointer', textAlign: 'center' }} onClick={() => sort.toggle('단가요청번호')}>단가요청번호 {sort.mark('단가요청번호')}</th><th style={{ cursor: 'pointer' }} onClick={() => sort.toggle('요청일')}>요청일 {sort.mark('요청일')}</th>{/* 원본 차례: 단가요청번호 · 품목 · 진행단계 · <b>거래처명</b> · 확정금액 —
                거래처명이 진행단계 뒤다. 우리는 맨 앞에 두어 어긋나 있었다. */}
            <th>품목</th>
            <th style={{ width: 320 }}>진행단계</th>
            <th>거래처명</th>
            <th style={{ textAlign: 'right' }}>확정금액</th>
            {/*
              원본 격자에도 [유효기간] 열이 있다(stby_price_req.expire_date, 사본 실측).
              지난 것은 붉게 적는다 — 목록에 날짜만 적어 두면 <b>지났는지를 사람이 세어야</b> 한다.
            */}
            <th style={{ width: 110, textAlign: 'center' }}>유효기간</th><th>담당</th>
            {/* 원본 격자의 마지막 열 [이력]. */}
            <th style={{ width: 60, textAlign: 'center' }}>이력</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={10} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
          ) : shown.length === 0 ? (
            <tr><td colSpan={10} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>등록된 데이터가 없습니다.</td></tr>
          ) : sort.sorted.map((r, i) => [
            <tr key={r.id}>
              <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
              <td style={{ fontFamily: 'monospace', textAlign: 'center', color: 'var(--ec-blue-dark)', fontWeight: 600 }}>{r.orderNo}</td>
              <td style={{ fontFamily: 'monospace' }}>{r.orderDate}</td>
              <td>{r.lines[0]?.itemName}{r.lines.length > 1 ? ` 외 ${r.lines.length - 1}건` : ''}</td>
              <td><Stepper status={r.status} /></td>
              <td>{r.partnerName}</td>
              <td style={{ textAlign: 'right', fontWeight: 600, color: 'var(--ec-blue)' }}>{won(r.totalAmount)}</td>
              <td style={{ textAlign: 'center', fontFamily: 'monospace',
                           color: expired(r.priceValidUntil) ? '#c60a2e' : '#5a626e',
                           fontWeight: expired(r.priceValidUntil) ? 700 : 400 }}>
                {r.priceValidUntil ?? ''}
              </td>
              <td>{r.employeeName ?? ''}</td>
              <td style={{ textAlign: 'center' }}>
                <button onClick={() => toggleHistory(r.id)}
                        style={{ color: 'var(--ec-blue)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12 }}>
                  {openHistory === r.id ? '접기' : '펼치기'}
                </button>
              </td>
            </tr>,
            openHistory === r.id ? (
              <tr key={`${r.id}-history`}>
                <td colSpan={10} style={{ background: '#fbfcfe', padding: '8px 14px' }}>
                  {history.length === 0 ? (
                    <span style={{ fontSize: 12, color: '#9aa1ab' }}>자취가 없습니다.</span>
                  ) : (
                    <table className="w-full text-left" style={{ maxWidth: 720 }}>
                      <thead><tr>
                        <th style={{ width: 34 }}></th><th style={{ width: 150 }}>일시</th>
                        <th style={{ width: 180 }}>단계</th><th style={{ width: 100 }}>바꾼 사람</th><th>비고</th>
                      </tr></thead>
                      <tbody>
                        {history.map((h, k) => (
                          <tr key={`${h.changedAt}-${k}`}>
                            <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{k + 1}</td>
                            <td style={{ fontFamily: 'monospace' }}>{h.changedAt.slice(0, 16).replace('T', ' ')}</td>
                            <td>
                              {h.fromStatusName ? `${h.fromStatusName} → ` : ''}
                              <b style={{ color: 'var(--ec-blue-dark)' }}>{h.toStatusName}</b>
                            </td>
                            <td style={{ color: '#5a626e' }}>{h.changedBy ?? ''}</td>
                            <td style={{ color: '#8a929c' }}>{h.note ?? ''}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </td>
              </tr>
            ) : null,
          ]).flat()}
        </tbody>
      </table>
    </EcListShell>
  )
}
