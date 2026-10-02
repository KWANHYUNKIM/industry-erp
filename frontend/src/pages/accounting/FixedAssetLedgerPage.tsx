import { useEffect, useMemo, useRef, useState } from 'react'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import { api, extractErrorMessage } from '../../api/client'
import EcListShell from '../../components/EcListShell'
import { EcCond } from '../../components/EcStatusPanel'
import CodePickerField from '../../components/CodePickerField'
import EcPeriodPicks, { PRICE_REQUEST_PICKS, periodOf } from '../../components/EcPeriodPicks'

const won = (n: number) => (n === 0 ? '' : Math.round(n).toLocaleString('ko-KR'))
/** 원본 소계 · 합계줄(2026-10-03 실측): 바탕 rgb(243,243,243) · 굵게 · 앞 네 칸(계정명 · 코드 · 이름 · 취득일자)을 묶는다. */
const SUB_ROW: React.CSSProperties = { fontWeight: 700, background: 'rgb(243, 243, 243)' }

interface Asset {
  id: number; assetNo: string; name: string; assetAccountId: number; assetAccountName: string
  acquisitionDate: string; acquisitionCost: number; salvageValue: number
  status: 'IN_USE' | 'DISPOSED'; disposalDate: string | null; remark: string | null
}
interface Dep { assetId: number; depreciationDate: string; amount: number }

/**
 * 회계 I &gt; 고정자산 &gt; 고정자산관련출력물 &gt; <b>고정자산대장</b>(E010613) — 2026-10-03 loginaa 실측(자료가 든 판).
 *
 * <p>조건: 조회일자(<b>하루</b>, 기본 금일, 빠른선택 금일 … 전월 · 금년 · 전년 · 종료일) · 부서 · 고정자산계정 · 고정자산 ·
 * 감가상각계산여부(전체 | <b>계산</b> | 계산안함) · 상태(전체 · 보유 · 상각완료, 다 켜짐).
 * 열: 고정자산계정명 · 고정자산코드 · 고정자산명 · 취득일자 · 수량 · 취득원가 · 감가상각충당금 · 적요 · 상태 · 감가상각계산여부 · 상세내역.
 * 줄은 고정자산계정마다 묶이고 '계정명 계' · '합계' 줄이 붙는다(앞 네 칸을 묶음).
 *
 * <p>조회일자에 들고 있던 자산 — 그날까지 취득했고 그날 전에 처분하지 않은 것. 감가상각충당금은 그날까지 상각한 금액의 합이다.
 * 상태 '상각완료' 는 장부가가 잔존가치까지 내려간 것. 우리 자산은 모두 감가상각을 계산하므로 감가상각계산여부는 늘 '계산' 이다.
 * [수량]은 자산이 수량을 들지 않아, [부서]는 자산에 부서가 없어 두지 않았다.
 */
export default function FixedAssetLedgerPage() {
  const init = periodOf('금일')!
  const [asOf, setAsOf] = useState(init.to)
  const [account, setAccount] = useState('')
  const [asset, setAsset] = useState('')
  const [calc, setCalc] = useState<'전체' | '계산' | '계산안함'>('계산')
  const [state, setState] = useState({ 보유: true, 상각완료: true })
  const [assets, setAssets] = useState<Asset[]>([])
  const [deps, setDeps] = useState<Dep[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function load() {
    setLoading(true)
    setError('')
    try {
      const [a, d] = await Promise.all([
        api.get<Asset[]>('/fixed-assets', { params: { to: asOf } }),
        api.get<Dep[]>('/fixed-assets/depreciations', { params: { to: asOf } }),
      ])
      setAssets(a.data)
      setDeps(d.data)
    } catch (e) {
      setError(extractErrorMessage(e))
    } finally {
      setLoading(false)
    }
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void load() }, [asOf])

  const accumOf = useMemo(() => {
    const m = new Map<number, number>()
    for (const d of deps) if (d.depreciationDate <= asOf) m.set(d.assetId, (m.get(d.assetId) ?? 0) + Number(d.amount))
    return m
  }, [deps, asOf])
  const stateOf = (a: Asset) => (Number(a.acquisitionCost) - (accumOf.get(a.id) ?? 0) <= Number(a.salvageValue) ? '상각완료' : '보유')
  const groups = useMemo(() => {
    const held = assets
      .filter((a) => a.acquisitionDate <= asOf && !(a.status === 'DISPOSED' && a.disposalDate && a.disposalDate <= asOf))
      .filter((a) => !account || String(a.assetAccountId) === account)
      .filter((a) => !asset || String(a.id) === asset)
      .filter(() => calc !== '계산안함')
      .filter((a) => state[stateOf(a)])
    const by = new Map<string, Asset[]>()
    for (const a of held) by.set(a.assetAccountName, [...(by.get(a.assetAccountName) ?? []), a])
    return [...by.entries()].sort((x, y) => x[0].localeCompare(y[0])).map(([name, rs]) => {
      rs.sort((x, y) => x.assetNo.localeCompare(y.assetNo))
      return { name, rs, cost: rs.reduce((s, a) => s + Number(a.acquisitionCost), 0), accum: rs.reduce((s, a) => s + (accumOf.get(a.id) ?? 0), 0) }
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assets, asOf, account, asset, calc, state, accumOf])
  const total = groups.reduce((s, g) => ({ cost: s.cost + g.cost, accum: s.accum + g.accum }), { cost: 0, accum: 0 })
  const accounts = useMemo(() => {
    const m = new Map<number, string>()
    assets.forEach((a) => m.set(a.assetAccountId, a.assetAccountName))
    return [...m.entries()].map(([id, name]) => ({ value: String(id), name }))
  }, [assets])
  const tableRef = useRef<HTMLTableElement>(null)
  useTableColumnCheck(tableRef, '고정자산대장', [groups.length])

  return (
    <EcListShell
      title="고정자산대장"
      searchable={false}
      actions={[
        { label: '검색(F8)', primary: true, onClick: load },
        { label: '다시 작성', onClick: () => { setAsOf(init.to); setAccount(''); setAsset(''); setCalc('계산'); setState({ 보유: true, 상각완료: true }) } },
        { label: '인쇄' },
        { label: 'Excel' },
      ]}
    >
      {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}
      <ul className="ec-cond" style={{ marginBottom: 8 }}>
        <EcCond label="조회일자">
          <input type="date" className="ec-input" value={asOf} onChange={(e) => setAsOf(e.target.value)} style={{ width: 145 }} />
          <span style={{ marginLeft: 6 }}>
            <EcPeriodPicks labels={PRICE_REQUEST_PICKS} currentFrom={asOf} onPick={(r) => setAsOf(r.to)} />
          </span>
        </EcCond>
        <EcCond label="고정자산계정" pick>
          <CodePickerField label="고정자산계정" hideLabel width={180} emptyLabel="전체" value={account} onChange={setAccount} items={accounts} />
        </EcCond>
        <EcCond label="고정자산" pick>
          <CodePickerField label="고정자산" hideLabel width={200} emptyLabel="전체" value={asset} onChange={setAsset}
                           items={assets.map((a) => ({ value: String(a.id), code: a.assetNo, name: a.name }))} />
        </EcCond>
        <EcCond label="감가상각계산여부">
          {(['전체', '계산', '계산안함'] as const).map((v) => (
            <label key={v} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, marginRight: 10, fontSize: 12.5 }}>
              <input type="radio" name="fa-calc" checked={calc === v} onChange={() => setCalc(v)} /> {v}
            </label>
          ))}
        </EcCond>
        <EcCond label="상태">
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 3, marginRight: 10, fontSize: 12.5 }}>
            <input type="checkbox" checked={state.보유 && state.상각완료} onChange={(e) => setState({ 보유: e.target.checked, 상각완료: e.target.checked })} /> 전체
          </label>
          {(['보유', '상각완료'] as const).map((k) => (
            <label key={k} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, marginRight: 10, fontSize: 12.5 }}>
              <input type="checkbox" checked={state[k]} onChange={(e) => setState((s) => ({ ...s, [k]: e.target.checked }))} /> {k}
            </label>
          ))}
        </EcCond>
      </ul>

      <table ref={tableRef} className="w-full text-left">
        <thead>
          <tr>
            <th>고정자산계정명</th>
            <th>고정자산코드</th>
            <th>고정자산명</th>
            <th style={{ textAlign: 'center' }}>취득일자</th>
            <th style={{ textAlign: 'right' }}>취득원가</th>
            <th style={{ textAlign: 'right' }}>감가상각충당금</th>
            <th>적요</th>
            <th style={{ textAlign: 'center' }}>상태</th>
            <th style={{ textAlign: 'center' }}>감가상각계산여부</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={9} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
          ) : groups.length === 0 ? (
            <tr><td colSpan={9} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>등록된 데이터가 없습니다.</td></tr>
          ) : groups.flatMap((g) => [
            ...g.rs.map((a) => (
              <tr key={a.id}>
                <td>{a.assetAccountName}</td>
                <td style={{ fontFamily: 'monospace' }}>{a.assetNo}</td>
                <td>{a.name}</td>
                <td style={{ textAlign: 'center' }}>{a.acquisitionDate.replace(/-/g, '/')}</td>
                <td style={{ textAlign: 'right' }}>{won(Number(a.acquisitionCost))}</td>
                <td style={{ textAlign: 'right' }}>{won(accumOf.get(a.id) ?? 0)}</td>
                <td>{a.remark ?? ''}</td>
                <td style={{ textAlign: 'center' }}>{stateOf(a)}</td>
                <td style={{ textAlign: 'center' }}>계산</td>
              </tr>
            )),
            <tr key={`sub-${g.name}`} style={SUB_ROW}>
              <td colSpan={4}>{g.name} 계</td>
              <td style={{ textAlign: 'right' }}>{won(g.cost)}</td>
              <td style={{ textAlign: 'right' }}>{won(g.accum)}</td>
              <td colSpan={3}></td>
            </tr>,
          ])}
        </tbody>
        {groups.length > 0 && (
          <tfoot>
            <tr style={SUB_ROW}>
              <td colSpan={4}>합계</td>
              <td style={{ textAlign: 'right' }}>{won(total.cost)}</td>
              <td style={{ textAlign: 'right' }}>{won(total.accum)}</td>
              <td colSpan={3}></td>
            </tr>
          </tfoot>
        )}
      </table>
    </EcListShell>
  )
}
