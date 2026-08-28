import { useEffect, useMemo, useState, useRef} from 'react'
import EcListShell from '../../components/EcListShell'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import { EcCond } from '../../components/EcStatusPanel'
import { api, extractErrorMessage } from '../../api/client'

/**
 * 영업 > 오더관리진행단계.
 *
 * <p>원본 열 실측(사본): 오더관리번호 · 오더관리명 · 오더관리유형명 · 기준일자 ·
 * 진행단계 · 상세. 버튼은 신규(F2) · 사용중단/재사용 · <b>전체단계완료</b> · 선택상세보기.
 * 즉 이 화면은 <b>실제 오더들이 지금 어디까지 갔나</b>를 보는 자리다.
 *
 * <p>우리 화면은 <b>단계 마스터</b>(단계코드·단계명·순서)를 등록하는 자리였다. 원본에는
 * 그런 화면이 없다 — 단계는 오더관리유형등록의 [1단계]~[10단계]에서 정한다.
 * 그래서 정작 "이 오더가 어디까지 갔나" 는 어디에도 없었다.
 *
 * <p>우리 오더는 <b>수주</b>다(SalesOrder 가 유형·단계를 이미 들고 있었는데 응답에
 * 빠져 있어 아무도 못 봤다). 그래서 수주를 오더로 놓고 진행을 보여 준다.
 */
interface Order {
  id: number
  orderNo: string
  partnerName: string
  orderDate: string
  dueDate: string | null
  statusName: string
  totalAmount: number
  orderTypeId: number | null
  orderTypeName: string | null
  stageId: number | null
  stageName: string | null
  lines: { itemName: string; quantity: number }[]
}

interface Step { seq: number; stageId: number; stageName: string }
interface OrderType { id: number; name: string; steps: Step[]; active: boolean }

const won = (n: number) => n.toLocaleString('ko-KR')

export default function OrderStagePage() {
  const [orders, setOrders] = useState<Order[]>([])
  const [types, setTypes] = useState<OrderType[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [keyword, setKeyword] = useState('')
  /*
   * 원본 오더관리진행단계의 조건 차례는 <b>오더관리유형 · 오더관리번호 · …</b> 다(사본 실측).
   * [오더관리번호]가 없었다 — 표 첫 칸에 찍히는데 그것으로 찾을 수가 없었다.
   */
  const [orderNoCond, setOrderNoCond] = useState('')
  /*
   * 원본 조건의 <b>[검색창내용]</b> — 화면에는 안 보이고 <b>찾는 데만</b> 쓰는 이름이다
   * (약칭·옛 상호 같은 것). 거래처 마스터가 그 값을 들고 있는데 여기서 못 썼다.
   */
  const [searchKeywordCond, setSearchKeywordCond] = useState('')
  /* 검색창내용은 거래처 마스터가 들고 있다 — 오더 전표는 거래처 이름만 들고 온다. */
  const [partnerAlias, setPartnerAlias] = useState<Map<string, string>>(new Map())
  const [typeFilter, setTypeFilter] = useState('전체')
  /*
   * 원본 [진행] — <b>전체 · 진행중 · 완료</b> 3단이다(사본 실측). 우리는 체크박스 하나로
   * "진행중만" 을 켜고 끄기만 해서, <b>끝난 것만 보는 길이 없었다.</b>
   */
  const [progress, setProgress] = useState<'전체' | '진행중' | '완료'>('전체')
  /** 원본 [사용여부] — 오더관리유형이 사용중단된 것을 볼지. 기본은 쓰는 것만. */
  const [useTab, setUseTab] = useState<'전체' | '사용' | '사용중단'>('사용')
  const [detailId, setDetailId] = useState<number | null>(null)

  async function load() {
    setLoading(true)
    setError('')
    try {
      const [o, t] = await Promise.all([
        api.get<Order[]>('/sales-orders'),
        api.get<OrderType[]>('/order-types'),
      ])
      setOrders(o.data)
      setTypes(t.data)
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { load() }, [])
  useEffect(() => {
    api.get<{ name: string; searchKeyword: string | null }[]>('/partners')
      .then((r) => setPartnerAlias(new Map(r.data.map((p) => [p.name, p.searchKeyword ?? '']))))
      .catch(() => {})
  }, [])

  const stepsOf = useMemo(
    () => new Map(types.map((t) => [t.id, t.steps])), [types])

  async function patch(o: Order, query: string) {
    setError('')
    try {
      await api.patch(`/sales-orders/${o.id}/stage${query}`)
      load()
    } catch (err) {
      setError(extractErrorMessage(err))
    }
  }

  const shown = orders.filter((o) => {
    if (keyword && !(o.orderNo.includes(keyword) || o.partnerName.includes(keyword))) return false
    if (searchKeywordCond && !(partnerAlias.get(o.partnerName) ?? '').includes(searchKeywordCond)) return false
    if (orderNoCond && !o.orderNo.includes(orderNoCond)) return false
    if (typeFilter !== '전체' && (o.orderTypeName ?? '(미지정)') !== typeFilter) return false
    if (progress !== '전체') {
      const steps = o.orderTypeId != null ? (stepsOf.get(o.orderTypeId) ?? []) : []
      const last = steps.length > 0 ? steps[steps.length - 1].stageId : null
      // 마지막 단계에 와 있으면 '완료', 아니면 '진행중'. 단계가 없는 유형은 늘 진행중으로 본다.
      const done = last != null && o.stageId === last
      if (progress === '진행중' && done) return false
      if (progress === '완료' && !done) return false
    }
    if (useTab !== '전체') {
      const t = o.orderTypeId != null ? types.find((x) => x.id === o.orderTypeId) : undefined
      // 유형이 없는 건은 사용중단으로 몰지 않는다 — 내린 유형이 아니라 아예 안 정한 것이다.
      const on = t ? t.active : true
      if (useTab === '사용' && !on) return false
      if (useTab === '사용중단' && on) return false
    }
    return true
  })

  const detail = detailId != null ? orders.find((o) => o.id === detailId) ?? null : null


  /* 칸이 자료 따라 변하는 격자라 정적으로 못 센다 — 렌더된 표를 직접 잰다. */
  const tableRef = useRef<HTMLTableElement>(null)
  useTableColumnCheck(tableRef, '오더관리진행단계', [])

  return (
    <EcListShell
      title="오더관리진행단계"
      search={keyword}
      onSearchChange={setKeyword}
      onSearch={load}
      searchable
      actions={[{ label: '새로고침', onClick: load }, { label: 'Excel' }]}
    >
      {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}

      <ul className="ec-cond" style={{ marginBottom: 8 }}>
        <EcCond label="오더관리유형" pick>
          <select className="ec-input" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} style={{ width: 160 }}>
            <option>전체</option>
            <option>(미지정)</option>
            {types.map((t) => <option key={t.id}>{t.name}</option>)}
          </select>
        </EcCond>
        {/* 원본 [진행] — 전체·진행중·완료. 마지막 단계에 와 있으면 완료로 본다. */}
        {/* 원본은 [오더관리유형] 바로 다음이 [오더관리번호]다. */}
        <EcCond label="오더관리번호">
          <input className="ec-input" value={orderNoCond}
                 onChange={(e) => setOrderNoCond(e.target.value)} style={{ width: 160 }} />
        </EcCond>
        <EcCond label="검색창내용">
          <input className="ec-input" value={searchKeywordCond} placeholder="검색창내용"
                 onChange={(e) => setSearchKeywordCond(e.target.value)} style={{ width: 160 }} />
        </EcCond>
        <EcCond label="진행">
          <div className="ec-pills">
            {(['전체', '진행중', '완료'] as const).map((t) => (
              <button key={t} type="button" className={`ec-pill no-ec${progress === t ? ' active' : ''}`}
                      onClick={() => setProgress(t)}>{t}</button>
            ))}
          </div>
        </EcCond>
        {/* 원본 [사용여부] — 내린 오더관리유형의 건을 볼지. 기본은 [사용]이 켜진 채 뜬다. */}
        <EcCond label="사용여부">
          <div className="ec-pills">
            {(['전체', '사용', '사용중단'] as const).map((t) => (
              <button key={t} type="button" className={`ec-pill no-ec${useTab === t ? ' active' : ''}`}
                      onClick={() => setUseTab(t)}>{t}</button>
            ))}
          </div>
        </EcCond>
      </ul>

      <div className="overflow-x-auto">
        <table ref={tableRef} className="ec-grid w-full text-left">
          <thead>
            <tr>
              <th style={{ width: 34 }}></th>
              <th style={{ width: 170 }}>오더관리번호</th>
              <th>오더관리명</th>
              <th style={{ width: 100 }}>오더관리유형명</th>
              <th style={{ width: 100 }}>기준일자</th>
              <th>진행단계</th>
              {/* 원본 폭 실측: [오더관리유형명] 100 · [상세] 50 — 상세는 링크 한 칸이라 좁다. */}
              <th style={{ width: 50, textAlign: 'center' }}>상세</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
            ) : shown.length === 0 ? (
              <tr><td colSpan={7} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>등록된 데이터가 없습니다.</td></tr>
            ) : shown.slice(0, 200).map((o, i) => {
              const steps = o.orderTypeId != null ? (stepsOf.get(o.orderTypeId) ?? []) : []
              const at = steps.findIndex((s) => s.stageId === o.stageId)
              const done = steps.length > 0 && at === steps.length - 1
              return (
                <tr key={o.id}>
                  <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
                  <td style={{ fontFamily: 'monospace' }}>{o.orderNo}</td>
                  <td>
                    {o.partnerName}
                    <span style={{ color: '#8a929c', fontSize: 11.5 }}>
                      {o.lines.length > 0 && ` · ${o.lines[0].itemName}${o.lines.length > 1 ? ` 외 ${o.lines.length - 1}` : ''}`}
                    </span>
                  </td>
                  <td>
                    {o.orderTypeName ?? <span style={{ color: '#c9ced6' }}>(미지정)</span>}
                  </td>
                  <td style={{ fontFamily: 'monospace' }}>{o.orderDate.replace(/-/g, '/')}</td>
                  <td>
                    {/* 유형에 적힌 순서를 늘어놓고 현재 위치를 짚는다. 단계 이름만 보여 주면
                        "다음이 무엇인지" 를 알 수 없다. */}
                    {steps.length === 0 ? (
                      <span style={{ color: '#c9ced6' }}>유형에 단계가 없습니다</span>
                    ) : steps.map((s, k) => (
                      <span key={s.seq}>
                        {k > 0 && <span style={{ color: '#c9ced6', margin: '0 3px' }}>›</span>}
                        <span style={{
                          fontWeight: s.stageId === o.stageId ? 700 : 400,
                          color: s.stageId === o.stageId ? 'var(--ec-blue-dark)'
                            : (at >= 0 && k < at ? '#1c7c3c' : '#9aa1ab'),
                        }}>{s.stageName}</span>
                      </span>
                    ))}
                  </td>
                  <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                    {o.orderTypeId == null ? (
                      <select className="ec-input" style={{ width: 120, fontSize: 11.5 }} defaultValue=""
                              onChange={(e) => e.target.value && patch(o, `?orderTypeId=${e.target.value}`)}>
                        <option value="">유형 지정…</option>
                        {types.filter((t) => t.active).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                      </select>
                    ) : (
                      <>
                        <button onClick={() => patch(o, '')} disabled={done}
                                style={{ color: done ? '#c9ced6' : 'var(--ec-blue)', marginRight: 6, background: 'none', border: 'none', cursor: done ? 'default' : 'pointer', fontSize: 12 }}>
                          다음단계
                        </button>
                        <button onClick={() => patch(o, '?complete=true')} disabled={done}
                                style={{ color: done ? '#c9ced6' : '#1c7c3c', marginRight: 6, background: 'none', border: 'none', cursor: done ? 'default' : 'pointer', fontSize: 12 }}>
                          전체단계완료
                        </button>
                      </>
                    )}
                    <button onClick={() => setDetailId(o.id)}
                            style={{ color: '#5a626e', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12 }}>
                      상세
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {shown.length > 200 && (
          <p style={{ fontSize: 11.5, color: '#c07a00', marginTop: 6 }}>
            * 앞의 200건만 보여 줍니다({shown.length}건 중). 조건을 좁혀 주세요.
          </p>
        )}
      </div>

      {detail && (
        <div onClick={() => setDetailId(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.35)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: 4, width: 520, maxWidth: '92vw', boxShadow: '0 10px 30px rgba(0,0,0,.2)' }}>
            <div style={{ padding: '10px 14px', borderBottom: '1px solid #e6eaef', fontWeight: 800, fontSize: 14, display: 'flex', alignItems: 'center' }}>
              <span>오더 상세 · {detail.orderNo}</span>
              <button className="ec-btn" style={{ marginLeft: 'auto' }} onClick={() => setDetailId(null)}>닫기</button>
            </div>
            <div style={{ padding: 14, fontSize: 12.5, lineHeight: 1.9 }}>
              <div>거래처 <b>{detail.partnerName}</b></div>
              <div>기준일자 {detail.orderDate} · 납기 {detail.dueDate ?? '-'}</div>
              <div>유형 {detail.orderTypeName ?? '(미지정)'} · 진행단계 <b>{detail.stageName ?? '(없음)'}</b></div>
              <div>수주상태 {detail.statusName} · 합계 {won(detail.totalAmount)}</div>
              <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid #e6eaef' }}>
                {detail.lines.map((l, k) => (
                  <div key={k}>{l.itemName} <span style={{ color: '#8a929c' }}>{won(l.quantity)}</span></div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </EcListShell>
  )
}
