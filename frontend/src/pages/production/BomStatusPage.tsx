import { useEffect, useMemo, useState } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import EcListShell from '../../components/EcListShell'
import { EcCond } from '../../components/EcStatusPanel'
import CodePickerField from '../../components/CodePickerField'
import type { Bom, Item } from '../../types/api'

/**
 * 생산관리 > BOM(소요량) > <b>BOM(소요량)현황</b>(E040402, 2026-10-02 loginaa 실측).
 *
 * <p>조건: 생산품목 · 소모품목 · 생산공정 · 기타([모든 BOM 버전 보기] · [사용중단품목포함]).
 * 결과(BOM현황): 생산품목코드 · 생산품목명 · 생산공정명 · BOM버전 · 소모품목코드 · 소모품목명 · 생산수량 · 소요량 —
 * BOM 한 줄이 한 줄이고, 생산품목코드는 그 BOM 의 첫 줄에만 찍는다. 기본은 <b>기본 BOM 만</b> 보인다.
 *
 * <p>우리 BOM 은 생산공정을 들지 않고 소요량을 <b>생산수량 1 기준</b>으로 적는다 — [생산공정] 조건·열은 없고
 * [생산수량] 은 늘 1 이다.
 */
export default function BomStatusPage() {
  const [boms, setBoms] = useState<Bom[]>([])
  const [items, setItems] = useState<Item[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [product, setProduct] = useState('')
  const [component, setComponent] = useState('')
  const [allVersions, setAllVersions] = useState(false)
  const [withInactive, setWithInactive] = useState(false)

  async function load() {
    setLoading(true); setError('')
    try {
      const [b, i] = await Promise.all([
        api.get<Bom[]>('/boms', { params: { versions: 'all' } }),
        api.get<Item[]>('/items'),
      ])
      setBoms(b.data); setItems(i.data)
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { void load() }, [])

  const activeOf = useMemo(() => new Map(items.map((i) => [i.id, i.active])), [items])
  const shown = useMemo(() => boms
    .filter((b) => allVersions || b.defaultVersion)
    .filter((b) => withInactive || activeOf.get(b.productId) !== false)
    .filter((b) => !product || String(b.productId) === product)
    .map((b) => ({ ...b, lines: b.lines.filter((l) => !component || String(l.componentId) === component) }))
    .filter((b) => b.lines.length > 0)
    .sort((a, b) => a.productCode.localeCompare(b.productCode) || Number(b.defaultVersion) - Number(a.defaultVersion)),
  [boms, allVersions, withInactive, product, component, activeOf])
  const rowCount = shown.reduce((n, b) => n + b.lines.length, 0)
  const picks = items.map((i) => ({ value: String(i.id), code: i.code, name: i.name, sub: i.categoryName ?? undefined }))
  const num = (v: number) => Number(v).toLocaleString('ko-KR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })

  return (
    <EcListShell
      title="BOM(소요량)현황"
      searchable={false}
      actions={[
        { label: '검색(F8)', primary: true, onClick: load },
        { label: '다시 작성', onClick: () => { setProduct(''); setComponent(''); setAllVersions(false); setWithInactive(false) } },
        { label: '인쇄' },
        { label: 'Excel' },
      ]}
    >
      {error && <p style={{ background: 'var(--ec-danger-bg)', color: 'var(--ec-danger)', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}
      <ul className="ec-cond" style={{ marginBottom: 8 }}>
        <EcCond label="생산품목" pick>
          <CodePickerField label="생산품목" hideLabel width={220} emptyLabel="전체" value={product} onChange={setProduct} items={picks} />
        </EcCond>
        <EcCond label="소모품목" pick>
          <CodePickerField label="소모품목" hideLabel width={220} emptyLabel="전체" value={component} onChange={setComponent} items={picks} />
        </EcCond>
        <EcCond label="기타">
          <label style={{ fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 4 }}>
            <input type="checkbox" checked={allVersions} onChange={(e) => setAllVersions(e.target.checked)} /> 모든 BOM 버전 보기
          </label>
          <label style={{ fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 4, marginLeft: 10 }}>
            <input type="checkbox" checked={withInactive} onChange={(e) => setWithInactive(e.target.checked)} /> 사용중단품목포함
          </label>
        </EcCond>
      </ul>

      <table className="w-full text-left">
        <thead>
          <tr>
            <th>생산품목코드</th>
            <th>생산품목명</th>
            <th>BOM버전</th>
            <th>소모품목코드</th>
            <th>소모품목명</th>
            <th style={{ textAlign: 'right' }}>생산수량</th>
            <th style={{ textAlign: 'right' }}>소요량</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--ec-text-hint)', padding: 20 }}>불러오는 중…</td></tr>
          ) : rowCount === 0 ? (
            <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--ec-text-hint)', padding: 20 }}>등록된 데이터가 없습니다.</td></tr>
          ) : shown.flatMap((b) => b.lines.map((l, i) => (
            <tr key={`${b.id}-${l.componentId}-${i}`} style={i === 0 ? { borderTop: '1px solid #d7dce3' } : undefined}>
              <td style={{ fontFamily: 'monospace' }}>{i === 0 ? b.productCode : ''}</td>
              <td>{b.productName}</td>
              <td>{b.versionName}{b.defaultVersion ? '' : ' (기본 아님)'}</td>
              <td style={{ fontFamily: 'monospace' }}>{l.componentCode}</td>
              <td>{l.componentName}</td>
              <td style={{ textAlign: 'right' }}>{num(1)}</td>
              <td style={{ textAlign: 'right' }}>{num(l.quantity)}</td>
            </tr>
          )))}
        </tbody>
      </table>
    </EcListShell>
  )
}
