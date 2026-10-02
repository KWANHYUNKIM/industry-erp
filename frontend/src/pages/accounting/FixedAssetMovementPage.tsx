import { useEffect, useMemo, useRef, useState } from 'react'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import { api, extractErrorMessage } from '../../api/client'
import EcListShell from '../../components/EcListShell'
import { EcCond } from '../../components/EcStatusPanel'
import CodePickerField from '../../components/CodePickerField'
import EcPeriodPicks, { SETTLE_PICKS, periodOf } from '../../components/EcPeriodPicks'

const won = (n: number) => (n === 0 ? '' : Math.round(n).toLocaleString('ko-KR'))
/** 원본 소계 · 합계줄(2026-10-03 실측): 바탕 rgb(243,243,243) · 굵게 · 앞 다섯 칸(계정코드 … 취득일자)을 묶는다. */
const SUB_ROW: React.CSSProperties = { fontWeight: 700, background: 'rgb(243, 243, 243)' }

interface Asset {
  id: number; assetNo: string; name: string; assetAccountId: number; assetAccountCode: string; assetAccountName: string
  acquisitionDate: string; acquisitionCost: number; usefulLifeYears: number; method: string; declineRate: number | null
  accumulatedDepreciation: number; status: 'IN_USE' | 'DISPOSED'; disposalDate: string | null
}
interface Dep { assetId: number; depreciationDate: string; amount: number }
type Mode = '원가+충당금' | '취득원가' | '감가상각충당금'
interface Line {
  a: Asset
  openCost: number; openDep: number; incCost: number; incDep: number; decCost: number; decDep: number; endCost: number; endDep: number
}
const KEYS = ['openCost', 'openDep', 'incCost', 'incDep', 'decCost', 'decDep', 'endCost', 'endDep'] as const

/**
 * 회계 I &gt; 고정자산 &gt; 고정자산관련출력물 &gt; <b>고정자산증감대장</b>(E010617) — 2026-10-03 loginaa 실측(자료가 든 판).
 *
 * <p>조건: 구분(<b>원가+충당금</b> | 취득원가 | 감가상각충당금) · 기준일자(구간, 기본 금월(~오늘), 빠른선택 … 이번기수 · 직전기수 · 종료일) ·
 * 부서 · 고정자산계정 · 고정자산. 열: 고정자산계정코드 · 고정자산계정명 · 고정자산코드 · 고정자산명 · 취득일자 · 내용연수 · 내용연수단위 · 상각률 ·
 * 기초_원가 · 기초_충당금 · 기초_미상각잔액 · 증가_원가 · 증가_충당금 · 감소_원가 · 감소_충당금 · 기말_원가 · 기말_충당금 · 기말_미상각잔액.
 * 계정마다 '계정코드 계', 맨 끝 '합계'(앞 다섯 칸을 묶음). [구분]은 금액 열 중 원가 쪽 · 충당금 쪽만 남긴다.
 *
 * <p>기초 = 기간 첫날 전에 갖고 있던 것(그날 전 상각 합이 충당금), 증가 = 기간 안 취득 원가 · 기간 안 상각, 감소 = 기간 안 처분의 원가 ·
 * 그때까지의 충당금, 기말 = 기초 + 증가 − 감소. 상각률은 정액법이면 1/내용연수, 정률법이면 정한 상각률이다. 부서는 자산에 없다.
 */
export default function FixedAssetMovementPage() {
  const init = periodOf('금월(~오늘)')!
  const [mode, setMode] = useState<Mode>('원가+충당금')
  const [from, setFrom] = useState(init.from)
  const [to, setTo] = useState(init.to)
  const [account, setAccount] = useState('')
  const [asset, setAsset] = useState('')
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
        api.get<Dep[]>('/fixed-assets/depreciations', { params: { to } }),
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

  const groups = useMemo(() => {
    const depsOf = new Map<number, Dep[]>()
    for (const d of deps) depsOf.set(d.assetId, [...(depsOf.get(d.assetId) ?? []), d])
    const sum = (id: number, pred: (d: Dep) => boolean) => (depsOf.get(id) ?? []).filter(pred).reduce((s, d) => s + Number(d.amount), 0)
    const lines: Line[] = []
    for (const a of assets) {
      if (account && String(a.assetAccountId) !== account) continue
      if (asset && String(a.id) !== asset) continue
      if (a.acquisitionDate > to) continue
      const disposedBefore = a.status === 'DISPOSED' && !!a.disposalDate && a.disposalDate < from
      if (disposedBefore) continue
      const cost = Number(a.acquisitionCost)
      const held = a.acquisitionDate < from
      const openCost = held ? cost : 0
      const openDep = held ? sum(a.id, (d) => d.depreciationDate < from) : 0
      const incCost = held ? 0 : cost
      const incDep = sum(a.id, (d) => d.depreciationDate >= from && d.depreciationDate <= to)
      const out = a.status === 'DISPOSED' && !!a.disposalDate && a.disposalDate >= from && a.disposalDate <= to
      const decCost = out ? cost : 0
      const decDep = out ? openDep + incDep : 0
      lines.push({ a, openCost, openDep, incCost, incDep, decCost, decDep, endCost: openCost + incCost - decCost, endDep: openDep + incDep - decDep })
    }
    const by = new Map<string, Line[]>()
    for (const l of lines) by.set(l.a.assetAccountCode, [...(by.get(l.a.assetAccountCode) ?? []), l])
    return [...by.entries()].sort((x, y) => x[0].localeCompare(y[0])).map(([code, ls]) => {
      ls.sort((x, y) => x.a.assetNo.localeCompare(y.a.assetNo))
      const tot = Object.fromEntries(KEYS.map((k) => [k, ls.reduce((s, l) => s + l[k], 0)])) as Record<typeof KEYS[number], number>
      return { code, ls, tot }
    })
  }, [assets, deps, from, to, account, asset])
  const grand = Object.fromEntries(KEYS.map((k) => [k, groups.reduce((s, g) => s + g.tot[k], 0)])) as Record<typeof KEYS[number], number>
  const accounts = useMemo(() => {
    const m = new Map<number, string>()
    assets.forEach((a) => m.set(a.assetAccountId, a.assetAccountName))
    return [...m.entries()].map(([id, name]) => ({ value: String(id), name }))
  }, [assets])

  /* [구분] — 원가 쪽 · 충당금 쪽 열만 남긴다(미상각잔액은 둘 다 있어야 뜻이 있다). */
  const showCost = mode !== '감가상각충당금'
  const showDep = mode !== '취득원가'
  const showNet = mode === '원가+충당금'
  const money = (v: Record<typeof KEYS[number], number>) => [
    showCost && <td key="oc" style={{ textAlign: 'right' }}>{won(v.openCost)}</td>,
    showDep && <td key="od" style={{ textAlign: 'right' }}>{won(v.openDep)}</td>,
    showNet && <td key="on" style={{ textAlign: 'right' }}>{won(v.openCost - v.openDep)}</td>,
    showCost && <td key="ic" style={{ textAlign: 'right' }}>{won(v.incCost)}</td>,
    showDep && <td key="id" style={{ textAlign: 'right' }}>{won(v.incDep)}</td>,
    showCost && <td key="dc" style={{ textAlign: 'right' }}>{won(v.decCost)}</td>,
    showDep && <td key="dd" style={{ textAlign: 'right' }}>{won(v.decDep)}</td>,
    showCost && <td key="ec" style={{ textAlign: 'right' }}>{won(v.endCost)}</td>,
    showDep && <td key="ed" style={{ textAlign: 'right' }}>{won(v.endDep)}</td>,
    showNet && <td key="en" style={{ textAlign: 'right' }}>{won(v.endCost - v.endDep)}</td>,
  ]
  const moneyCols = (showCost ? 4 : 0) + (showDep ? 4 : 0) + (showNet ? 2 : 0)
  const cols = 8 + moneyCols
  const tableRef = useRef<HTMLTableElement>(null)
  useTableColumnCheck(tableRef, '고정자산증감대장', [groups.length, mode])

  return (
    <EcListShell
      title="고정자산증감대장"
      searchable={false}
      actions={[
        { label: '검색(F8)', primary: true, onClick: load },
        { label: '다시 작성', onClick: () => { setMode('원가+충당금'); setFrom(init.from); setTo(init.to); setAccount(''); setAsset('') } },
        { label: '인쇄' },
        { label: 'Excel' },
      ]}
    >
      {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}
      <ul className="ec-cond" style={{ marginBottom: 8 }}>
        <EcCond label="구분">
          {(['원가+충당금', '취득원가', '감가상각충당금'] as const).map((v) => (
            <label key={v} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, marginRight: 10, fontSize: 12.5 }}>
              <input type="radio" name="fa-mv-mode" checked={mode === v} onChange={() => setMode(v)} /> {v}
            </label>
          ))}
        </EcCond>
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

      <div style={{ overflowX: 'auto' }}>
        <table ref={tableRef} className="w-full text-left" style={{ whiteSpace: 'nowrap' }}>
          <thead>
            <tr>
              <th>고정자산계정코드</th><th>고정자산계정명</th><th>고정자산코드</th><th>고정자산명</th>
              <th style={{ textAlign: 'center' }}>취득일자</th>
              <th style={{ textAlign: 'right' }}>내용연수</th><th style={{ textAlign: 'center' }}>내용연수단위</th><th style={{ textAlign: 'right' }}>상각률</th>
              {showCost && <th style={{ textAlign: 'right' }}>기초_원가</th>}
              {showDep && <th style={{ textAlign: 'right' }}>기초_충당금</th>}
              {showNet && <th style={{ textAlign: 'right' }}>기초_미상각잔액</th>}
              {showCost && <th style={{ textAlign: 'right' }}>증가_원가</th>}
              {showDep && <th style={{ textAlign: 'right' }}>증가_충당금</th>}
              {showCost && <th style={{ textAlign: 'right' }}>감소_원가</th>}
              {showDep && <th style={{ textAlign: 'right' }}>감소_충당금</th>}
              {showCost && <th style={{ textAlign: 'right' }}>기말_원가</th>}
              {showDep && <th style={{ textAlign: 'right' }}>기말_충당금</th>}
              {showNet && <th style={{ textAlign: 'right' }}>기말_미상각잔액</th>}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={cols} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
            ) : groups.length === 0 ? (
              <tr><td colSpan={cols} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>등록된 데이터가 없습니다.</td></tr>
            ) : groups.flatMap((g) => [
              ...g.ls.map((l) => (
                <tr key={l.a.id}>
                  <td style={{ fontFamily: 'monospace' }}>{l.a.assetAccountCode}</td>
                  <td>{l.a.assetAccountName}</td>
                  <td style={{ fontFamily: 'monospace' }}>{l.a.assetNo}</td>
                  <td>{l.a.name}</td>
                  <td style={{ textAlign: 'center' }}>{l.a.acquisitionDate.replace(/-/g, '/')}</td>
                  <td style={{ textAlign: 'right' }}>{Number(l.a.usefulLifeYears).toFixed(2)}</td>
                  <td style={{ textAlign: 'center' }}>년</td>
                  <td style={{ textAlign: 'right' }}>{(l.a.declineRate != null && Number(l.a.declineRate) > 0 ? Number(l.a.declineRate) : 1 / Number(l.a.usefulLifeYears || 1)).toFixed(2)}</td>
                  {money(l)}
                </tr>
              )),
              <tr key={`sub-${g.code}`} style={SUB_ROW}>
                <td colSpan={5}>{g.code} 계</td>
                <td colSpan={3}></td>
                {money(g.tot)}
              </tr>,
            ])}
          </tbody>
          {groups.length > 0 && (
            <tfoot>
              <tr style={SUB_ROW}>
                <td colSpan={5}>합계</td>
                <td colSpan={3}></td>
                {money(grand)}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </EcListShell>
  )
}
