import { useEffect, useMemo, useRef, useState } from 'react'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import { api, extractErrorMessage } from '../../api/client'
import EcListShell from '../../components/EcListShell'
import { EcCond } from '../../components/EcStatusPanel'
import CodePickerField from '../../components/CodePickerField'
import EcPeriodPicks, { SETTLE_PICKS, periodOf } from '../../components/EcPeriodPicks'

const won = (n: number) => (n === 0 ? '' : Math.round(n).toLocaleString('ko-KR'))
/** 원본 고정자산 출력물의 소계 · 합계줄 모양(고정자산대장 실측): 바탕 rgb(243,243,243) · 굵게. */
const SUB_ROW: React.CSSProperties = { fontWeight: 700, background: 'rgb(243, 243, 243)' }

interface Asset {
  id: number; assetNo: string; name: string; assetAccountId: number; assetAccountCode: string; assetAccountName: string
  acquisitionDate: string; acquisitionCost: number; accumulatedDepreciation: number
  status: 'IN_USE' | 'DISPOSED'; disposalDate: string | null; disposalAmount: number | null; remark: string | null
}

/**
 * 회계 I &gt; 고정자산 &gt; 고정자산관련출력물 &gt; <b>고정자산증가내역</b>(E010614) · <b>고정자산감소내역</b>(E010615) — 2026-10-03 loginaa 실측(빈 판).
 *
 * <p>두 화면 조건이 같다: 기준일자(구간, 기본 <b>금월(~오늘)</b>, 빠른선택 … 전월 · 이번기수 · 직전기수 · 종료일) · 부서 · 고정자산계정 · 고정자산.
 * 증가 열: 계정코드 · 계정명 · 자산코드 · 자산명 · 취득일자 · 수량 · 취득원가 · 적요 — 기간 안에 취득한 자산.
 * 감소 열: 계정코드 · 계정명 · 자산코드 · 자산명 · 감소일자 · 수량 · 취득원가 · 감가상각충당금 · 매매가액 — 기간 안에 처분한 자산.
 * 원본 판이 비어 소계 · 합계줄 모양은 고정자산대장(같은 출력물 묶음)에서 잰 것을 따른다 — 계정마다 '계정명 계' · 합계.
 *
 * <p>[수량]은 자산이 수량을 들지 않아, [부서]는 자산에 부서가 없어 두지 않았다. 감소의 감가상각충당금은 처분 때까지 쌓인 값이다.
 */
export default function FixedAssetFlowPage({ flow }: { flow: '증가' | '감소' }) {
  const inc = flow === '증가'
  const title = inc ? '고정자산증가내역' : '고정자산감소내역'
  const init = periodOf('금월(~오늘)')!
  const [from, setFrom] = useState(init.from)
  const [to, setTo] = useState(init.to)
  const [account, setAccount] = useState('')
  const [asset, setAsset] = useState('')
  const [assets, setAssets] = useState<Asset[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  /* 증가는 취득일로 서버가 자른다. 감소는 처분일로 걸어야 해 기간 끝날까지 취득한 자산을 다 받아 화면에서 거른다. */
  async function load() {
    setLoading(true)
    setError('')
    try {
      const r = await api.get<Asset[]>('/fixed-assets', { params: inc ? { from, to } : { to } })
      setAssets(r.data)
    } catch (e) {
      setError(extractErrorMessage(e))
    } finally {
      setLoading(false)
    }
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void load() }, [from, to, flow])

  const dayOf = (a: Asset) => (inc ? a.acquisitionDate : a.disposalDate ?? '')
  const groups = useMemo(() => {
    const rows = assets
      .filter((a) => inc || a.status === 'DISPOSED')
      .filter((a) => { const d = dayOf(a); return !!d && d >= from && d <= to })
      .filter((a) => !account || String(a.assetAccountId) === account)
      .filter((a) => !asset || String(a.id) === asset)
    const by = new Map<string, Asset[]>()
    for (const a of rows) by.set(a.assetAccountCode, [...(by.get(a.assetAccountCode) ?? []), a])
    return [...by.entries()].sort((x, y) => x[0].localeCompare(y[0])).map(([code, rs]) => {
      rs.sort((x, y) => (dayOf(x) < dayOf(y) ? -1 : dayOf(x) > dayOf(y) ? 1 : x.assetNo.localeCompare(y.assetNo)))
      return {
        code, name: rs[0].assetAccountName, rs,
        cost: rs.reduce((s, a) => s + Number(a.acquisitionCost), 0),
        accum: rs.reduce((s, a) => s + Number(a.accumulatedDepreciation), 0),
        sold: rs.reduce((s, a) => s + Number(a.disposalAmount ?? 0), 0),
      }
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assets, flow, from, to, account, asset])
  const total = groups.reduce((s, g) => ({ cost: s.cost + g.cost, accum: s.accum + g.accum, sold: s.sold + g.sold }), { cost: 0, accum: 0, sold: 0 })
  const accounts = useMemo(() => {
    const m = new Map<number, string>()
    assets.forEach((a) => m.set(a.assetAccountId, a.assetAccountName))
    return [...m.entries()].map(([id, name]) => ({ value: String(id), name }))
  }, [assets])
  const cols = inc ? 7 : 8
  const tableRef = useRef<HTMLTableElement>(null)
  useTableColumnCheck(tableRef, title, [groups.length, flow])

  return (
    <EcListShell
      title={title}
      searchable={false}
      actions={[
        { label: '검색(F8)', primary: true, onClick: load },
        { label: '다시 작성', onClick: () => { setFrom(init.from); setTo(init.to); setAccount(''); setAsset('') } },
        { label: '인쇄' },
        { label: 'Excel' },
      ]}
    >
      {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}
      <ul className="ec-cond" style={{ marginBottom: 8 }}>
        <EcCond label="기준일자">
          <input type="date" className="ec-input" value={from} onChange={(e) => setFrom(e.target.value)} style={{ width: 145 }} />
          <span style={{ margin: '0 4px' }}>~</span>
          <input type="date" className="ec-input" value={to} onChange={(e) => setTo(e.target.value)} style={{ width: 145 }} />
          <span style={{ marginLeft: 6 }}>
            <EcPeriodPicks labels={SETTLE_PICKS} currentFrom={from} onPick={(r) => { setFrom(r.from); setTo(r.to) }} />
          </span>
        </EcCond>
        <EcCond label="고정자산계정" pick>
          <CodePickerField label="고정자산계정" hideLabel width={180} emptyLabel="전체" value={account} onChange={setAccount} items={accounts} />
        </EcCond>
        <EcCond label="고정자산" pick>
          <CodePickerField label="고정자산" hideLabel width={200} emptyLabel="전체" value={asset} onChange={setAsset}
                           items={assets.map((a) => ({ value: String(a.id), code: a.assetNo, name: a.name }))} />
        </EcCond>
      </ul>

      <table ref={tableRef} className="w-full text-left">
        <thead>
          <tr>
            <th>계정코드</th>
            <th>계정명</th>
            <th>자산코드</th>
            <th>자산명</th>
            <th style={{ textAlign: 'center' }}>{inc ? '취득일자' : '감소일자'}</th>
            <th style={{ textAlign: 'right' }}>취득원가</th>
            {inc ? <th>적요</th> : <th style={{ textAlign: 'right' }}>감가상각충당금</th>}
            {!inc && <th style={{ textAlign: 'right' }}>매매가액</th>}
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={cols} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
          ) : groups.length === 0 ? (
            <tr><td colSpan={cols} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>등록된 데이터가 없습니다.</td></tr>
          ) : groups.flatMap((g) => [
            ...g.rs.map((a) => (
              <tr key={a.id}>
                <td style={{ fontFamily: 'monospace' }}>{a.assetAccountCode}</td>
                <td>{a.assetAccountName}</td>
                <td style={{ fontFamily: 'monospace' }}>{a.assetNo}</td>
                <td>{a.name}</td>
                <td style={{ textAlign: 'center' }}>{dayOf(a).replace(/-/g, '/')}</td>
                <td style={{ textAlign: 'right' }}>{won(Number(a.acquisitionCost))}</td>
                {inc ? <td>{a.remark ?? ''}</td> : <td style={{ textAlign: 'right' }}>{won(Number(a.accumulatedDepreciation))}</td>}
                {!inc && <td style={{ textAlign: 'right' }}>{won(Number(a.disposalAmount ?? 0))}</td>}
              </tr>
            )),
            <tr key={`sub-${g.code}`} style={SUB_ROW}>
              <td colSpan={5}>{g.name} 계</td>
              <td style={{ textAlign: 'right' }}>{won(g.cost)}</td>
              {inc ? <td></td> : <td style={{ textAlign: 'right' }}>{won(g.accum)}</td>}
              {!inc && <td style={{ textAlign: 'right' }}>{won(g.sold)}</td>}
            </tr>,
          ])}
        </tbody>
        {groups.length > 0 && (
          <tfoot>
            <tr style={SUB_ROW}>
              <td colSpan={5}>합계</td>
              <td style={{ textAlign: 'right' }}>{won(total.cost)}</td>
              {inc ? <td></td> : <td style={{ textAlign: 'right' }}>{won(total.accum)}</td>}
              {!inc && <td style={{ textAlign: 'right' }}>{won(total.sold)}</td>}
            </tr>
          </tfoot>
        )}
      </table>
    </EcListShell>
  )
}
