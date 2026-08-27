import { useEffect, useMemo, useState } from 'react'
import EcListShell from '../../components/EcListShell'
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
 * 그런 화면이 없다 — 단계는 오더관리유형리스트의 [1단계]~[10단계]에서 정한다.
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
  const [typeFilter, setTypeFilter] = useState('전체')
  const [onlyOpen, setOnlyOpen] = useState(false)
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
    if (typeFilter !== '전체' && (o.orderTypeName ?? '(미지정)') !== typeFilter) return false
    if (onlyOpen) {
      const steps = o.orderTypeId != null ? (stepsOf.get(o.orderTypeId) ?? []) : []
      const last = steps.length > 0 ? steps[steps.length - 1].stageId : null
      if (last != null && o.stageId === last) return false
    }
    return true
  })

  const detail = detailId != null ? orders.find((o) => o.id === detailId) ?? null : null

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
        <EcCond label="기타">
          <label style={{ fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 4 }}>
            <input type="checkbox" checked={onlyOpen} onChange={(e) => setOnlyOpen(e.target.checked)} />
            진행중만 (마지막 단계 제외)
          </label>
        </EcCond>
      </ul>

      <div className="overflow-x-auto">
        <table className="ec-grid w-full text-left">
          <thead>
            <tr>
              <th style={{ width: 34 }}></th>
              <th style={{ width: 170 }}>오더관리번호</th>
              <th>오더관리명</th>
              <th style={{ width: 130 }}>오더관리유형명</th>
              <th style={{ width: 100 }}>기준일자</th>
              <th>진행단계</th>
              <th style={{ width: 150, textAlign: 'center' }}>상세</th>
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
