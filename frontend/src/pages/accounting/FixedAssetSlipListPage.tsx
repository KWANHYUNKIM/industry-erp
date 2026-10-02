import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import { api, extractErrorMessage } from '../../api/client'
import EcListShell from '../../components/EcListShell'
import { EcCond } from '../../components/EcStatusPanel'
import CodePickerField from '../../components/CodePickerField'
import EcPeriodPicks, { QUOTATION_PICKS, periodOf } from '../../components/EcPeriodPicks'

const won = (n: number) => (n === 0 ? '' : Math.round(n).toLocaleString('ko-KR'))

interface Asset {
  id: number; assetNo: string; name: string; assetAccountId: number; assetAccountName: string
  acquisitionDate: string; acquisitionCost: number; accumulatedDepreciation: number
  status: 'IN_USE' | 'DISPOSED'; disposalDate: string | null; disposalAmount: number | null; remark: string | null
}
interface Dep { id: number; assetId: number; depreciationDate: string; amount: number; journalDocNo: string | null; period: string }
type Kind = '자산증가' | '매각' | '폐기' | '감가상각'
const KINDS: Kind[] = ['자산증가', '매각', '폐기', '감가상각']
interface Row { key: string; date: string; no: string; kind: Kind; a: Asset; cost: number; dep: number; sold: number; remark: string }

/**
 * 회계 I &gt; 고정자산 &gt; <b>고정자산전표조회</b>(E010619) — 2026-10-03 loginaa 실측(빈 판).
 *
 * <p>조건: 기준일자(구간, 기본 <b>최근30일(+1개월)</b>) · 고정자산계정 · 고정자산 · 구분(전체 · 자산증가 · 매각 · 폐기 · 감가상각, 다 켜짐) ·
 * 기타(수정순). 열: 일자-No. · 구분 · 자산계정명 · 수량 · 원가 · 감가상각충당금 · 처분금액 · 적요. 버튼 고정자산증가 · 내역등록 · 선택삭제.
 *
 * <p>우리 고정자산은 따로 전표를 두지 않아, 자산이 남긴 일 셋을 한 줄씩 세운다 — 취득(자산증가, 번호는 자산코드),
 * 처분(처분금액이 있으면 매각 · 없으면 폐기), 감가상각(그 분개 번호). [수량]은 자산이 수량을 들지 않아,
 * [수정순]은 응답이 고친 시각을 싣지 않아 두지 않았다.
 */
export default function FixedAssetSlipListPage() {
  const navigate = useNavigate()
  const init = periodOf('최근30일(+1개월)')!
  const [from, setFrom] = useState(init.from)
  const [to, setTo] = useState(init.to)
  const [account, setAccount] = useState('')
  const [asset, setAsset] = useState('')
  const [kinds, setKinds] = useState<Record<Kind, boolean>>({ 자산증가: true, 매각: true, 폐기: true, 감가상각: true })
  const [assets, setAssets] = useState<Asset[]>([])
  const [deps, setDeps] = useState<Dep[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function load() {
    setLoading(true)
    setError('')
    try {
      const [a, d] = await Promise.all([
        api.get<Asset[]>('/fixed-assets', { params: { to } }),
        api.get<Dep[]>('/fixed-assets/depreciations', { params: { from, to } }),
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
  useEffect(() => { void load() }, [from, to])

  const rows = useMemo(() => {
    const byId = new Map(assets.map((a) => [a.id, a]))
    const out: Row[] = []
    for (const a of assets) {
      out.push({ key: `a${a.id}`, date: a.acquisitionDate, no: a.assetNo, kind: '자산증가', a, cost: Number(a.acquisitionCost), dep: 0, sold: 0, remark: a.remark ?? '' })
      if (a.status === 'DISPOSED' && a.disposalDate) {
        const sold = Number(a.disposalAmount ?? 0)
        out.push({ key: `x${a.id}`, date: a.disposalDate, no: a.assetNo, kind: sold > 0 ? '매각' : '폐기', a,
          cost: Number(a.acquisitionCost), dep: Number(a.accumulatedDepreciation), sold, remark: a.remark ?? '' })
      }
    }
    for (const d of deps) {
      const a = byId.get(d.assetId)
      if (!a) continue
      out.push({ key: `d${d.id}`, date: d.depreciationDate, no: d.journalDocNo ?? '', kind: '감가상각', a, cost: 0, dep: Number(d.amount), sold: 0, remark: `${d.period} 감가상각` })
    }
    return out
      .filter((r) => r.date >= from && r.date <= to)
      .filter((r) => kinds[r.kind])
      .filter((r) => !account || String(r.a.assetAccountId) === account)
      .filter((r) => !asset || String(r.a.id) === asset)
      .sort((x, y) => (x.date > y.date ? -1 : x.date < y.date ? 1 : y.no.localeCompare(x.no)))
  }, [assets, deps, from, to, kinds, account, asset])
  const accounts = useMemo(() => {
    const m = new Map<number, string>()
    assets.forEach((a) => m.set(a.assetAccountId, a.assetAccountName))
    return [...m.entries()].map(([id, name]) => ({ value: String(id), name }))
  }, [assets])
  const tableRef = useRef<HTMLTableElement>(null)
  useTableColumnCheck(tableRef, '고정자산전표조회', [rows.length])
  const allOn = KINDS.every((k) => kinds[k])

  return (
    <EcListShell
      title="고정자산전표조회"
      searchable={false}
      actions={[
        { label: '검색(F8)', primary: true, onClick: load },
        { label: '다시 작성', onClick: () => { setFrom(init.from); setTo(init.to); setAccount(''); setAsset(''); setKinds({ 자산증가: true, 매각: true, 폐기: true, 감가상각: true }) } },
        { label: '고정자산증가', onClick: () => navigate('/accounting/fixed-assets') },
        { label: 'Excel' },
      ]}
    >
      {error && <p style={{ background: 'var(--ec-danger-bg)', color: 'var(--ec-danger)', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}
      <ul className="ec-cond" style={{ marginBottom: 8 }}>
        <EcCond label="기준일자">
          <input type="date" className="ec-input" value={from} onChange={(e) => setFrom(e.target.value)} style={{ width: 145 }} />
          <span style={{ margin: '0 4px' }}>~</span>
          <input type="date" className="ec-input" value={to} onChange={(e) => setTo(e.target.value)} style={{ width: 145 }} />
          <span style={{ marginLeft: 6 }}>
            <EcPeriodPicks labels={QUOTATION_PICKS} currentFrom={from} onPick={(r) => { setFrom(r.from); setTo(r.to) }} />
          </span>
        </EcCond>
        <EcCond label="고정자산계정" pick>
          <CodePickerField label="고정자산계정" hideLabel width={180} emptyLabel="전체" value={account} onChange={setAccount} items={accounts} />
        </EcCond>
        <EcCond label="고정자산" pick>
          <CodePickerField label="고정자산" hideLabel width={200} emptyLabel="전체" value={asset} onChange={setAsset}
                           items={assets.map((a) => ({ value: String(a.id), code: a.assetNo, name: a.name }))} />
        </EcCond>
        <EcCond label="구분">
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 3, marginRight: 10, fontSize: 12.5 }}>
            <input type="checkbox" checked={allOn} onChange={(e) => setKinds({ 자산증가: e.target.checked, 매각: e.target.checked, 폐기: e.target.checked, 감가상각: e.target.checked })} /> 전체
          </label>
          {KINDS.map((k) => (
            <label key={k} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, marginRight: 10, fontSize: 12.5 }}>
              <input type="checkbox" checked={kinds[k]} onChange={(e) => setKinds((s) => ({ ...s, [k]: e.target.checked }))} /> {k}
            </label>
          ))}
        </EcCond>
      </ul>

      <table ref={tableRef} className="w-full text-left">
        <thead>
          <tr>
            <th style={{ width: 34 }}></th>
            <th style={{ textAlign: 'center' }}>일자-No.</th>
            <th style={{ textAlign: 'center' }}>구분</th>
            <th>자산계정명</th>
            <th style={{ textAlign: 'right' }}>원가</th>
            <th style={{ textAlign: 'right' }}>감가상각충당금</th>
            <th style={{ textAlign: 'right' }}>처분금액</th>
            <th>적요</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={8} style={{ textAlign: 'center', color: 'var(--ec-text-hint)', padding: 20 }}>불러오는 중…</td></tr>
          ) : rows.length === 0 ? (
            <tr><td colSpan={8} style={{ textAlign: 'center', color: 'var(--ec-text-hint)', padding: 20 }}>등록된 데이터가 없습니다.</td></tr>
          ) : rows.map((r, i) => (
            <tr key={r.key}>
              <td style={{ textAlign: 'center', color: 'var(--ec-text-hint)' }}>{i + 1}</td>
              <td style={{ textAlign: 'center', fontFamily: 'monospace' }}>{r.date.replace(/-/g, '/')} {r.no}</td>
              <td style={{ textAlign: 'center' }}>{r.kind}</td>
              <td>{r.a.assetAccountName}</td>
              <td style={{ textAlign: 'right' }}>{won(r.cost)}</td>
              <td style={{ textAlign: 'right' }}>{won(r.dep)}</td>
              <td style={{ textAlign: 'right' }}>{won(r.sold)}</td>
              <td>{r.remark}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </EcListShell>
  )
}
