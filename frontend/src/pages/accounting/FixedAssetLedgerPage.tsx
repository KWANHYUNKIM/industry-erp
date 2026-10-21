import { useEffect, useMemo, useRef, useState } from 'react'
import { asOf as movesAsOf, movesOf, type Move } from '../../features/fixedasset/movements'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import { api, extractErrorMessage } from '../../api/client'
import EcListShell from '../../components/EcListShell'
import { EcCond } from '../../components/EcStatusPanel'
import CodePickerField from '../../components/CodePickerField'
import EcPeriodPicks, { PRICE_REQUEST_PICKS, periodOf } from '../../components/EcPeriodPicks'
import { EcReportFoot, EcReportHead, reportDate } from '../../components/EcReportFrame'
import Modal from '../../components/Modal'
import { dateNo } from '../../utils/dateNo'

const won = (n: number) => (n === 0 ? '' : Math.round(n).toLocaleString('ko-KR'))
/** 원본 소계 · 합계줄(2026-10-03 실측): 바탕 rgb(243,243,243) · 굵게 · 앞 네 칸(계정명 · 코드 · 이름 · 취득일자)을 묶는다. */
const SUB_ROW: React.CSSProperties = { fontWeight: 700, background: 'rgb(243, 243, 243)' }

interface Asset {
  id: number; assetNo: string; name: string; assetAccountId: number; assetAccountName: string
  acquisitionDate: string; acquisitionCost: number; salvageValue: number
  status: 'IN_USE' | 'DISPOSED'; disposalDate: string | null; remark: string | null
  quantityManaged: boolean; quantity: number
  movements?: Move[]
}
interface Dep { assetId: number; depreciationDate: string; amount: number; calcId: number | null; journalDocNo: string | null }

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
 * [수량]은 수량관리하는 자산만 1.00 을 찍는다(2026-10-21 실측 — QA회계1-출력물 수량관리 사용안함은 빈칸) — 계 · 합계는 수량관리 자산의 수량만 더한다.
 * [상세내역]은 원본이 자산마다 [등록] 링크(부가 내역 창)를 둔다 — 우리는 부가 내역이 없어 칸만 둔다. [부서]는 자산에 부서가 없어 두지 않았다.
 * 감가상각충당금은 상각일(그달 말일)까지 — 원본도 10/21 조회에는 10월 상각이 안 들어간다.
 */
const qtyText = (n: number) => n.toLocaleString('ko-KR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

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
  /** [상세내역] [등록] — 그 자산의 고정자산내역리스트 창 */
  const [detail, setDetail] = useState<Asset | null>(null)

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
    /* 감소 전표의 누계(원본은 손으로 넣는다 — 0 이면 대장 충당금이 그대로다: 10/31 일부 감소 뒤 9.00 · 900,000 · 25,000) */
    for (const a of assets) { const dec = movesAsOf(a, asOf).decAccum; if (dec) m.set(a.id, (m.get(a.id) ?? 0) - dec) }
    return m
  }, [deps, asOf, assets])
  const stateOf = (a: Asset) => (Number(a.acquisitionCost) - (accumOf.get(a.id) ?? 0) <= Number(a.salvageValue) ? '상각완료' : '보유')
  const groups = useMemo(() => {
    /* 그날까지의 증가 − 감소로 남은 수량 · 취득가(원본: 남은 것이 없으면 줄이 빠진다) */
    const held = assets
      .filter((a) => movesAsOf(a, asOf).held)
      .map((a) => { const v = movesAsOf(a, asOf); return { ...a, acquisitionCost: v.cost, quantity: v.qty } })
      .filter((a) => !account || String(a.assetAccountId) === account)
      .filter((a) => !asset || String(a.id) === asset)
      .filter(() => calc !== '계산안함')
      .filter((a) => state[stateOf(a)])
    const by = new Map<string, Asset[]>()
    for (const a of held) by.set(a.assetAccountName, [...(by.get(a.assetAccountName) ?? []), a])
    return [...by.entries()].sort((x, y) => x[0].localeCompare(y[0])).map(([name, rs]) => {
      rs.sort((x, y) => x.assetNo.localeCompare(y.assetNo))
      return { name, rs, cost: rs.reduce((s, a) => s + Number(a.acquisitionCost), 0), qty: rs.reduce((s, a) => s + (a.quantityManaged ? Number(a.quantity) : 0), 0), accum: rs.reduce((s, a) => s + (accumOf.get(a.id) ?? 0), 0) }
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assets, asOf, account, asset, calc, state, accumOf])
  const total = groups.reduce((s, g) => ({ cost: s.cost + g.cost, qty: s.qty + g.qty, accum: s.accum + g.accum }), { cost: 0, qty: 0, accum: 0 })
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
      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
      <ul className="ec-cond" style={{ marginBottom: 8 }}>
        <EcCond label="조회일자">
          <input type="date" className="ec-input" value={asOf} onChange={(e) => setAsOf(e.target.value)} style={{ width: 145 }} />
          <span className="ml-[6px]">
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
            <label key={v} className="inline-flex items-center gap-[3px] mr-[10px] text-[12.5px]">
              <input type="radio" name="fa-calc" checked={calc === v} onChange={() => setCalc(v)} /> {v}
            </label>
          ))}
        </EcCond>
        <EcCond label="상태">
          <label className="inline-flex items-center gap-[3px] mr-[10px] text-[12.5px]">
            <input type="checkbox" checked={state.보유 && state.상각완료} onChange={(e) => setState({ 보유: e.target.checked, 상각완료: e.target.checked })} /> 전체
          </label>
          {(['보유', '상각완료'] as const).map((k) => (
            <label key={k} className="inline-flex items-center gap-[3px] mr-[10px] text-[12.5px]">
              <input type="checkbox" checked={state[k]} onChange={(e) => setState((s) => ({ ...s, [k]: e.target.checked }))} /> {k}
            </label>
          ))}
        </EcCond>
      </ul>

      <EcReportHead title="고정자산대장" period={reportDate(asOf)} />
      <table ref={tableRef} className="w-full text-left">
        <thead>
          <tr>
            <th>고정자산계정명</th>
            <th>고정자산코드</th>
            <th>고정자산명</th>
            <th className="text-center">취득일자</th>
            <th className="text-right">수량</th>
            <th className="text-right">취득원가</th>
            <th className="text-right">감가상각충당금</th>
            <th>적요</th>
            <th className="text-center">상태</th>
            <th className="text-center">감가상각계산여부</th>
            <th className="text-center">상세내역</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={11} className="ec-empty">불러오는 중…</td></tr>
          ) : groups.length === 0 ? (
            <tr><td colSpan={11} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
          ) : groups.flatMap((g) => [
            ...g.rs.map((a) => (
              <tr key={a.id}>
                <td>{a.assetAccountName}</td>
                <td>{a.assetNo}</td>
                <td>{a.name}</td>
                <td className="text-center">{a.acquisitionDate.replace(/-/g, '/')}</td>
                <td className="text-right">{a.quantityManaged ? qtyText(Number(a.quantity)) : ''}</td>
                <td className="text-right">{won(Number(a.acquisitionCost))}</td>
                <td className="text-right">{won(accumOf.get(a.id) ?? 0)}</td>
                <td>{a.remark ?? ''}</td>
                <td className="text-center">{stateOf(a)}</td>
                <td className="text-center">계산</td>
                <td className="text-center"><button type="button" className="no-ec ec-link" onClick={() => setDetail(a)}>등록</button></td>
              </tr>
            )),
            <tr key={`sub-${g.name}`} style={SUB_ROW}>
              <td colSpan={4}>{g.name} 계</td>
              <td className="text-right">{g.qty ? qtyText(g.qty) : ''}</td>
              <td className="text-right">{won(g.cost)}</td>
              <td className="text-right">{won(g.accum)}</td>
              <td></td><td></td><td></td><td></td>
            </tr>,
          ])}
        </tbody>
        {groups.length > 0 && (
          <tfoot>
            <tr style={SUB_ROW}>
              <td colSpan={4}>합계</td>
              <td className="text-right">{total.qty ? qtyText(total.qty) : ''}</td>
              <td className="text-right">{won(total.cost)}</td>
              <td className="text-right">{won(total.accum)}</td>
              <td></td><td></td><td></td><td></td>
            </tr>
          </tfoot>
        )}
      </table>
      <EcReportFoot />
      <Modal open={!!detail} title="고정자산내역리스트" width={780} onClose={() => setDetail(null)}>
        {detail && <AssetSlips asset={detail} deps={deps.filter((d) => d.assetId === detail.id)} onClose={() => setDetail(null)} />}
      </Modal>
    </EcListShell>
  )
}

/**
 * 대장 [상세내역 › 등록] 창 '고정자산내역리스트'(2026-10-22 실측) — 열 일자-No. · 전표유형 · 수량 · 취득원가 · 감가상각충당금 · 처분금액,
 * 일자 내림차순. 감가상각은 묶음(감가상각계산) 한 번에 한 줄로(수량 빈칸 · 취득원가 0), 증가 · 감소는 전표마다 한 줄.
 */
function AssetSlips({ asset, deps, onClose }: { asset: Asset; deps: Dep[]; onClose: () => void }) {
  interface R { key: string; date: string; no: string; type: string; qty: string; cost: number; accum: number; sold: number | null }
  const rows: R[] = []
  for (const m of movesOf(asset)) {
    if (m.kind === 'INCREASE') {
      rows.push({ key: `i${m.id}`, date: m.slipDate, no: m.journalDocNo ?? String(m.id), type: '자산증가',
        qty: asset.quantityManaged ? qtyText(Number(m.quantity)) : '', cost: Number(m.amount), accum: 0, sold: null })
    } else {
      rows.push({ key: `o${m.id}`, date: m.slipDate, no: m.journalDocNo ?? String(m.id), type: m.disposalType === 'SCRAP' ? '폐기' : '매각',
        qty: asset.quantityManaged ? qtyText(Number(m.quantity)) : '', cost: Number(m.amount), accum: Number(m.accumAmount), sold: Number(m.saleAmount) })
    }
  }
  const byCalc = new Map<string, Dep[]>()
  for (const d of deps) byCalc.set(d.calcId ? `c${d.calcId}` : `d${d.depreciationDate}`, [...(byCalc.get(d.calcId ? `c${d.calcId}` : `d${d.depreciationDate}`) ?? []), d])
  for (const [k, ds] of byCalc) {
    const last = ds.reduce((a, b) => (a.depreciationDate >= b.depreciationDate ? a : b))
    rows.push({ key: k, date: last.depreciationDate, no: last.journalDocNo ?? (last.calcId ? String(last.calcId) : '1'), type: '감가상각', qty: '', cost: 0,
      accum: ds.reduce((s, d) => s + Number(d.amount), 0), sold: null })
  }
  rows.sort((x, y) => (x.date < y.date ? 1 : x.date > y.date ? -1 : y.no.localeCompare(x.no)))
  return (
    <div>
      <table className="w-full text-center">
        <thead><tr><th>일자-No.</th><th>전표유형</th><th className="text-right">수량</th><th className="text-right">취득원가</th><th className="text-right">감가상각충당금</th><th className="text-right">처분금액</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key}>
              <td>{dateNo(r.date, r.no)}</td><td>{r.type}</td><td className="text-right">{r.qty}</td>
              <td className="text-right">{Math.round(r.cost).toLocaleString('ko-KR')}</td>
              <td className="text-right">{Math.round(r.accum).toLocaleString('ko-KR')}</td>
              <td className="text-right">{r.sold === null ? '' : won(r.sold)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-[8px]"><button className="ec-btn" onClick={onClose}>닫기</button></div>
    </div>
  )
}
