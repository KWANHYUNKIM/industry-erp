import { Fragment, useEffect, useMemo, useState } from 'react'
import EcListShell from '../../components/EcListShell'
import CodePickerField from '../../components/CodePickerField'
import { EcCond } from '../../components/EcStatusPanel'
import { ymd } from '../../components/EcPeriodPicks'
import { api, extractErrorMessage } from '../../api/client'
import type { Item } from '../../api/types'

/**
 * 생산관리 > 소요시간계산.
 *
 * <p>원본 실측(사본): 상단 조건이 일자 · 생산공장 · 생산품목 · [찾기(F3)] · 주문 · 바코드이고,
 * 그리드는 <b>생산품목코드 · 생산품목명 · 규격 · 추가수량 · 수량</b>, 아래에 [계산(F8)].
 * 즉 <b>만들 품목과 수량을 넣고 시간을 묻는</b> 화면이다.
 *
 * <p>우리 화면은 <b>공정</b>마다 수량을 넣어 표준시간을 곱하는 계산기였다. "이 제품 100개를
 * 만들면 몇 시간" 이 아니라 "절단 공정에 100개를 태우면 몇 분" 을 묻는 셈이라, 정작
 * 제품을 만들 때 몇 시간이 드는지는 사람이 공정을 하나씩 골라 더해야 했다.
 *
 * <p>이제 BOR(작업소요시간)이 있으니 품목 하나로 답이 나온다 — 그 품목이 거치는 작업의
 * 1개당 시간을 모두 더해 수량을 곱한다. BOR 이 없는 품목은 <b>0 이 아니라 '라우팅 없음'</b>
 * 이다. 0 시간이라고 하면 "안 걸린다" 로 읽힌다.
 *
 * <p>생산공장은 우리에게 없다(재고는 창고 단위다). 주문·바코드로 불러오는 것도 아직 없어
 * 칸을 만들지 않았다 — 없는 조건을 그려 두면 눌러도 아무 일이 없다.
 */
interface BorRow {
  productId: number
  processId: number
  processName: string
  seq: number
  workName: string
  hoursPerUnit: number
  active: boolean
}

/** 계산할 한 줄. 원본 그리드의 [생산품목 · 규격 · 추가수량 · 수량] 이다. */
interface CalcLine {
  key: number
  itemId: string
  /** 원본 [추가수량] — 불량 대비 등으로 더 만드는 수량. 소요시간은 수량+추가수량으로 잡는다. */
  extraQty: string
  qty: string
}

const hhmm = (hours: number): string => {
  const total = Math.round(hours * 60)
  const sign = total < 0 ? '-' : ''
  const abs = Math.abs(total)
  return `${sign}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`
}

let nextKey = 1

export default function TimeCalcPage() {
  const [items, setItems] = useState<Item[]>([])
  const [bor, setBor] = useState<BorRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [baseDate, setBaseDate] = useState(ymd(new Date()))
  const [lines, setLines] = useState<CalcLine[]>([{ key: nextKey++, itemId: '', extraQty: '', qty: '' }])
  /** [계산(F8)] 을 눌러야 결과가 나온다 — 원본도 그렇다. */
  const [calculated, setCalculated] = useState(false)
  const [openKey, setOpenKey] = useState<number | null>(null)

  async function load() {
    setLoading(true)
    setError('')
    try {
      const [i, b] = await Promise.all([
        api.get<Item[]>('/items'),
        api.get<BorRow[]>('/bor'),
      ])
      setItems(i.data)
      setBor(b.data)
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { load() }, [])

  /** 품목 → 작업들(활성만). 순서대로. */
  const opsOf = useMemo(() => {
    const m = new Map<number, BorRow[]>()
    for (const o of bor) {
      if (!o.active) continue
      const cur = m.get(o.productId) ?? []
      cur.push(o)
      m.set(o.productId, cur)
    }
    for (const list of m.values()) list.sort((a, b) => a.seq - b.seq)
    return m
  }, [bor])

  const itemOf = useMemo(() => new Map(items.map((i) => [i.id, i])), [items])

  const results = useMemo(() => lines.map((l) => {
    const id = Number(l.itemId)
    const item = itemOf.get(id)
    const qty = (Number(l.qty) || 0) + (Number(l.extraQty) || 0)
    const ops = opsOf.get(id) ?? []
    const perUnit = ops.reduce((n, o) => n + o.hoursPerUnit, 0)
    return {
      line: l,
      item,
      qty,
      ops,
      /** 라우팅이 없으면 null — 0 시간이 아니다. */
      hours: ops.length === 0 ? null : perUnit * qty,
      perUnit: ops.length === 0 ? null : perUnit,
    }
  }), [lines, itemOf, opsOf])

  const totalHours = results.reduce((n, r) => n + (r.hours ?? 0), 0)
  const unknown = results.filter((r) => r.item && r.hours == null).length

  const setLine = (key: number, patch: Partial<CalcLine>) =>
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)))

  return (
    <EcListShell
      title="소요시간계산"
      searchable={false}
      actions={[
        { label: '계산(F8)', primary: true, onClick: () => setCalculated(true) },
        { label: '줄 추가', onClick: () => setLines((p) => [...p, { key: nextKey++, itemId: '', extraQty: '', qty: '' }]) },
        { label: '다시 작성', onClick: () => { setLines([{ key: nextKey++, itemId: '', extraQty: '', qty: '' }]); setCalculated(false) } },
        { label: '새로고침', onClick: load },
      ]}
    >
      {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}

      <ul className="ec-cond" style={{ marginBottom: 8 }}>
        <EcCond label="일자">
          <input className="ec-input" type="date" value={baseDate}
                 onChange={(e) => setBaseDate(e.target.value)} style={{ width: 150 }} />
        </EcCond>
      </ul>

      <div className="overflow-x-auto">
        <table className="ec-grid w-full text-left">
          <thead>
            <tr>
              <th style={{ width: 34 }}></th>
              <th style={{ width: 230 }}>생산품목</th>
              <th style={{ width: 120 }}>생산품목코드</th>
              <th>규격</th>
              <th style={{ width: 110, textAlign: 'right' }}>추가수량</th>
              <th style={{ width: 110, textAlign: 'right' }}>수량</th>
              <th style={{ width: 120, textAlign: 'right' }}>1개당(H)</th>
              <th style={{ width: 130, textAlign: 'right' }}>소요시간</th>
              <th style={{ width: 90, textAlign: 'center' }}>공정</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={9} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
            ) : results.map((r, i) => (
              /* map 이 돌려주는 바깥 요소에 key 를 단다. <> 에는 key 를 못 달아
                 React 가 "unique key" 경고를 낸다 — 조각이라도 Fragment 로 적는다. */
              <Fragment key={r.line.key}>
                <tr>
                  <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
                  <td>
                    <CodePickerField
                      label="생산품목" hideLabel width={210} placeholder="품목 선택"
                      value={r.line.itemId} onChange={(v) => { setLine(r.line.key, { itemId: v }); setCalculated(false) }}
                      items={items.map((it) => ({ value: String(it.id), code: it.code, name: it.name, alias: it.searchKeyword, sub: it.categoryName }))}
                    />
                  </td>
                  <td style={{ fontFamily: 'monospace' }}>{r.item?.code ?? ''}</td>
                  <td style={{ color: '#5a626e' }}>{r.item?.spec ?? ''}</td>
                  <td style={{ textAlign: 'right' }}>
                    <input className="ec-input text-right" type="number" style={{ width: 90 }}
                           value={r.line.extraQty}
                           onChange={(e) => { setLine(r.line.key, { extraQty: e.target.value }); setCalculated(false) }} />
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <input className="ec-input text-right" type="number" style={{ width: 90 }}
                           value={r.line.qty}
                           onChange={(e) => { setLine(r.line.key, { qty: e.target.value }); setCalculated(false) }} />
                  </td>
                  <td style={{ textAlign: 'right', color: '#5a626e' }}>
                    {calculated && r.perUnit != null ? r.perUnit.toFixed(4) : ''}
                  </td>
                  <td style={{ textAlign: 'right', fontWeight: 700 }}>
                    {!calculated ? '' : r.hours == null
                      ? (r.item ? <span style={{ color: '#c07a00' }}>라우팅 없음</span> : '')
                      : `${hhmm(r.hours)} (${r.hours.toFixed(2)}H)`}
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    {calculated && r.ops.length > 0 ? (
                      <button onClick={() => setOpenKey(openKey === r.line.key ? null : r.line.key)}
                              style={{ color: 'var(--ec-blue)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12 }}>
                        {openKey === r.line.key ? '접기' : `${r.ops.length}개`}
                      </button>
                    ) : <span style={{ color: '#c9ced6' }}>-</span>}
                  </td>
                </tr>
                {calculated && openKey === r.line.key && r.ops.map((o) => (
                  <tr key={`${r.line.key}-${o.seq}`} style={{ background: '#fafbfc' }}>
                    <td></td>
                    <td colSpan={3} style={{ paddingLeft: 18, color: '#5a626e' }}>
                      └ {o.seq}. {o.workName} <span style={{ color: '#8a929c' }}>({o.processName})</span>
                    </td>
                    <td colSpan={2}></td>
                    <td style={{ textAlign: 'right', color: '#5a626e' }}>{o.hoursPerUnit.toFixed(4)}</td>
                    <td style={{ textAlign: 'right', color: '#5a626e' }}>{hhmm(o.hoursPerUnit * r.qty)}</td>
                    <td></td>
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
          {calculated && (
            <tfoot>
              <tr style={{ fontWeight: 700, background: 'var(--ec-body-bg)' }}>
                <td colSpan={7} style={{ textAlign: 'right' }}>
                  합계 ({results.filter((r) => r.item).length}품목)
                  {unknown > 0 && (
                    <span style={{ color: '#c07a00', fontWeight: 400 }}> · 라우팅 없는 {unknown}품목은 뺐습니다</span>
                  )}
                </td>
                <td style={{ textAlign: 'right', color: 'var(--ec-blue-dark)' }}>
                  {hhmm(totalHours)} ({totalHours.toFixed(2)}H)
                </td>
                <td></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      <p style={{ marginTop: 8, fontSize: 11.5, color: '#8a929c' }}>
        * 소요시간은 BOR(작업소요시간)에 적힌 <b>1개당 작업시간 × (수량 + 추가수량)</b> 입니다.
        라우팅을 세우지 않은 품목은 계산하지 않습니다 — 0 시간으로 두면 "안 걸린다" 로 읽힙니다.
      </p>
    </EcListShell>
  )
}
