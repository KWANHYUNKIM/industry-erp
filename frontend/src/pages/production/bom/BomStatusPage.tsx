import { useEffect, useMemo, useState } from 'react'
import { api, extractErrorMessage } from '../../../api/client'
import EcListShell from '../../../components/EcListShell'
import { EcCond } from '../../../components/EcStatusPanel'
import CodePickerField from '../../../components/codepicker/CodePickerField'
import { EcReportFoot, EcReportHead } from '../../../components/EcReportFrame'
import type { Bom, BomLine, Item } from '../../../types/api'

/** 서버 응답에는 원본 [생산수량] · 입력 [수량] · [생산공정] 이 있다(V427) — 공용 타입엔 아직 없어 여기서 넓힌다. */
type BomRow = Omit<Bom, 'lines'> & {
  produceQty: number | null; processId: number | null; processName: string | null
  lines: (BomLine & { inputQty: number | null })[]
}
interface Proc { id: number; code: string; name: string }

/**
 * 생산관리 > BOM(소요량) > <b>BOM(소요량)현황</b>(E040402, 2026-10-02 loginaa 실측).
 *
 * <p>조건: 생산품목 · 소모품목 · 생산공정 · 기타([모든 BOM 버전 보기] · [사용중단품목포함]).
 * 결과(BOM현황): 생산품목코드 · 생산품목명 · 생산공정명 · BOM버전 · 소모품목코드 · 소모품목명 · 생산수량 · 소요량 —
 * BOM 한 줄이 한 줄이고, 생산품목코드는 그 BOM 의 첫 줄에만 찍는다. 기본은 <b>기본 BOM 만</b> 보인다.
 *
 * <p>2026-10-21 재고1 실측(D-FX-0260 버전 2 · 생산수량 10 · A002 20 · A003 10): [생산수량] 은 BOM 머리의 생산수량 10,
 * [소요량] 은 <b>입력한 수량 그대로</b>(20 · 10 — 1단위당 2 · 1 이 아니다). 합계 줄은 없고, 생산품목코드 칸은 그 BOM 의
 * 줄 수만큼 세로로 합쳐 있다(생산품목명은 줄마다). 버전 이름은 기본 버전이면 '기본', 아니면 번호 — 덧말 없음.
 * 결과는 출력물 꼴: 'BOM현황' 제목 · 회사명 · 격자 · [P.1] 과 출력한 때, 아래 인쇄 · Excel. [검색(F8)] 전엔 결과가 없다.
 */
export default function BomStatusPage() {
  const [boms, setBoms] = useState<BomRow[]>([])
  const [procs, setProcs] = useState<Proc[]>([])
  const [process, setProcess] = useState('')
  const [searched, setSearched] = useState(false)
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
      const [b, i, p] = await Promise.all([
        api.get<BomRow[]>('/boms', { params: { versions: 'all' } }),
        api.get<Item[]>('/items'),
        api.get<Proc[]>('/processes'),
      ])
      setBoms(b.data); setItems(i.data); setProcs(p.data)
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
    .filter((b) => !process || String(b.processId) === process)
    .map((b) => ({ ...b, lines: b.lines.filter((l) => !component || String(l.componentId) === component) }))
    .filter((b) => b.lines.length > 0)
    .sort((a, b) => a.productCode.localeCompare(b.productCode) || Number(b.defaultVersion) - Number(a.defaultVersion)),
  [boms, allVersions, withInactive, product, component, process, activeOf])
  const rowCount = shown.reduce((n, b) => n + b.lines.length, 0)
  const picks = items.map((i) => ({ value: String(i.id), code: i.code, name: i.name, sub: i.categoryName ?? undefined }))
  const procPicks = procs.map((p) => ({ value: String(p.id), code: p.code, name: p.name }))
  const num = (v: number) => Number(v).toLocaleString('ko-KR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })

  return (
    <EcListShell
      title="BOM(소요량)현황"
      searchable={false}
      actions={[
        { label: '검색(F8)', primary: true, onClick: () => { setSearched(true); void load() } },
        { label: '다시 작성', onClick: () => { setProduct(''); setComponent(''); setProcess(''); setAllVersions(false); setWithInactive(false) } },
        { label: '인쇄' },
        { label: 'Excel' },
      ]}
    >
      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
      <ul className="ec-cond" style={{ marginBottom: 8 }}>
        <EcCond label="생산품목" pick>
          <CodePickerField label="생산품목" hideLabel width={220} emptyLabel="전체" value={product} onChange={setProduct} items={picks} />
        </EcCond>
        <EcCond label="소모품목" pick>
          <CodePickerField label="소모품목" hideLabel width={220} emptyLabel="전체" value={component} onChange={setComponent} items={picks} />
        </EcCond>
        <EcCond label="생산공정" pick>
          <CodePickerField label="생산공정" hideLabel width={220} emptyLabel="전체" value={process} onChange={setProcess} items={procPicks} />
        </EcCond>
        <EcCond label="기타">
          <label className="text-[12.5px] flex items-center gap-[4px]">
            <input type="checkbox" checked={allVersions} onChange={(e) => setAllVersions(e.target.checked)} /> 모든 BOM 버전 보기
          </label>
          <label className="text-[12.5px] flex items-center gap-[4px] ml-[10px]">
            <input type="checkbox" checked={withInactive} onChange={(e) => setWithInactive(e.target.checked)} /> 사용중단품목포함
          </label>
        </EcCond>
      </ul>

      {searched && (
        <div className="overflow-x-auto"><div className="ec-report-frame">
          <EcReportHead title="BOM현황" period="" />
          <table className="text-left ec-report">
            <thead>
              <tr>
                <th>생산품목코드</th>
                <th>생산품목명</th>
                <th>생산공정명</th>
                <th>BOM버전</th>
                <th>소모품목코드</th>
                <th>소모품목명</th>
                <th className="text-right">생산수량</th>
                <th className="text-right">소요량</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} className="ec-empty">불러오는 중…</td></tr>
              ) : rowCount === 0 ? (
                <tr><td colSpan={8} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
              ) : shown.flatMap((b) => b.lines.map((l, i) => (
                <tr key={`${b.id}-${l.componentId}-${i}`}>
                  {i === 0 && <td rowSpan={b.lines.length}>{b.productCode}</td>}
                  <td>{b.productName}</td>
                  <td>{b.processName ?? ''}</td>
                  <td>{b.versionName}</td>
                  <td>{l.componentCode}</td>
                  <td>{l.componentName}</td>
                  <td className="text-right">{num(b.produceQty ?? 1)}</td>
                  <td className="text-right">{num(l.inputQty ?? l.quantity * (b.produceQty ?? 1))}</td>
                </tr>
              )))}
            </tbody>
          </table>
          <EcReportFoot />
        </div></div>
      )}
    </EcListShell>
  )
}
