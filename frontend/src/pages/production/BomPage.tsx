import { useEffect, useMemo, useState, type FormEvent, useRef} from 'react'
import { api, extractErrorMessage } from '../../api/client'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import type { Bom, Item } from '../../types/api'
import EcListShell from '../../components/EcListShell'
import Modal from '../../components/Modal'
import CodePickerField from '../../components/CodePickerField'

const inputCls = 'ec-input'

interface LineInput { componentId: string; quantity: string }
const emptyLine = (): LineInput => ({ componentId: '', quantity: '' })
/** 원본 BOM(소요량)조회 탭 — 우리 품목 구분에 있는 것만(세트 · 다공정품목은 없다). */
const CAT_TABS: { label: string; v: string | null }[] = [
  { label: '전체', v: null }, { label: '제품', v: 'FINISHED' }, { label: '반제품', v: 'SEMI_FINISHED' },
  { label: '원재료', v: 'RAW_MATERIAL' }, { label: '부재료', v: 'SUB_MATERIAL' },
]

/** 원본 BOM 정전개·역전개 한 줄. */
interface TreeRow {
  level: number; itemId: number; itemCode: string; itemName: string; spec: string | null; unit: string
  qty: number; totalQty: number; versionName: string | null; hasChildren: boolean
}

export default function BomPage() {
  const [boms, setBoms] = useState<Bom[]>([])
  const [items, setItems] = useState<Item[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  /** 저장 결과 안내 — 예전엔 창이 닫히고 목록만 다시 떴다(QA 22회차). */
  const [ok, setOk] = useState('')
  /**
   * 원본 BOM(소요량)조회 [조회] → <b>정전개 · 역전개 · 원재료리스트</b>.
   * 정전개는 제품에서 아래로 들여쓴 줄(반제품은 각자의 기본 BOM), 역전개는 이 품목을 쓰는 제품들을 위로,
   * 원재료리스트는 끝까지 푼 원재료만 합친 목록이다. [펼치기]·[접기]는 반제품 아래를 펴고 접는다.
   */
  const [tree, setTree] = useState<{ title: string; kind: 'F' | 'R' | 'L'; rows: TreeRow[] } | null>(null)
  const [folded, setFolded] = useState<Set<number>>(new Set())
  async function openTree(b: Bom, kind: 'F' | 'R' | 'L') {
    setError('')
    try {
      let rows: TreeRow[]
      if (kind === 'F') {
        rows = (await api.get<TreeRow[]>('/boms/tree', { params: { productId: b.productId, bomId: b.id } })).data
      } else if (kind === 'R') {
        rows = (await api.get<TreeRow[]>('/boms/where-used', { params: { itemId: b.productId } })).data
      } else {
        const r = await api.get<{ componentId: number; componentCode: string; componentName: string; componentSpec: string | null; unit: string; quantity: number }[]>(
          '/productions/bom-preview', { params: { productId: b.productId, qty: 1, level: 'ALL', bomId: b.id } })
        rows = r.data.map((m) => ({ level: 1, itemId: m.componentId, itemCode: m.componentCode, itemName: m.componentName,
          spec: m.componentSpec, unit: m.unit, qty: m.quantity, totalQty: m.quantity, versionName: null, hasChildren: false }))
      }
      setFolded(new Set())
      setTree({ title: `${kind === 'F' ? '정전개' : kind === 'R' ? '역전개' : '원재료리스트'} — ${b.productCode} ${b.productName} [${b.versionName}]`, kind, rows })
    } catch (err) {
      setError(extractErrorMessage(err))
    }
  }
  /** 접힌 줄 아래(더 깊은 줄)를 감춘다. */
  const visibleRows = (rows: TreeRow[]) => {
    const out: { r: TreeRow; i: number }[] = []
    let hideBelow: number | null = null
    rows.forEach((r, i) => {
      if (hideBelow != null && r.level > hideBelow) return
      hideBelow = folded.has(i) ? r.level : null
      out.push({ r, i })
    })
    return out
  }
  const [showForm, setShowForm] = useState(false)
  const [productId, setProductId] = useState('')
  const [remark, setRemark] = useState('')
  /** 원본 [BOM버전] — 같은 제품·같은 이름이면 그 버전을 고친다. 비우면 '기본'. */
  const [versionName, setVersionName] = useState('기본')
  const [makeDefault, setMakeDefault] = useState(false)
  const [lines, setLines] = useState<LineInput[]>([emptyLine()])

  async function load() {
    setLoading(true)
    try {
      const [b, i] = await Promise.all([api.get<Bom[]>('/boms', { params: { versions: 'all' } }), api.get<Item[]>('/items')])
      setBoms(b.data)
      setItems(i.data)
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  function openNew() {
    setProductId('')
    setRemark('')
    setVersionName('기본')
    setMakeDefault(false)
    setLines([emptyLine()])
    setShowForm(true)
  }

  function openNewFor(itemId: number) {
    openNew()
    setProductId(String(itemId))
  }

  function editBom(b: Bom) {
    setProductId(String(b.productId))
    setRemark(b.remark ?? '')
    setVersionName(b.versionName ?? '기본')
    setMakeDefault(b.defaultVersion)
    setLines(b.lines.map((l) => ({ componentId: String(l.componentId), quantity: String(l.quantity) })))
    setShowForm(true)
  }

  function updateLine(idx: number, field: keyof LineInput, value: string) {
    setLines((ls) => ls.map((l, i) => (i === idx ? { ...l, [field]: value } : l)))
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(''); setOk('')
    const validLines = lines
      .filter((l) => l.componentId && Number(l.quantity) > 0)
      .map((l) => ({ componentId: Number(l.componentId), quantity: Number(l.quantity) }))
    if (!productId) return setError('제품을 선택하세요.')
    if (validLines.length === 0) return setError('자재를 1개 이상 입력하세요.')
    try {
      const res = await api.post<{ productCode: string; productName: string }>('/boms', { productId: Number(productId), remark: remark || undefined, lines: validLines,
        versionName: versionName.trim() || '기본', defaultVersion: makeDefault })
      setOk(`[${res.data.productCode}] ${res.data.productName} BOM 저장 — 자재 ${validLines.length}종`)
      setShowForm(false)
      load()
    } catch (err) {
      setError(extractErrorMessage(err))
    }
  }

  async function remove(b: Bom) {
    if (!confirm(`'${b.productName}' BOM을 삭제할까요?`)) return
    try {
      await api.delete(`/boms/${b.id}`)
      load()
    } catch (err) {
      alert(extractErrorMessage(err))
    }
  }

  // 중단 품목은 빼되, 수정 중인 BOM 이 이미 쓰고 있는 것은 남긴다(안 남기면 칸이 비어 보인다)
  const itemCodes = items.filter((it) => it.active !== false || String(it.id) === productId
      || lines.some((l) => l.componentId === String(it.id)))
    .map((it) => ({ value: String(it.id), code: it.code, name: it.name, sub: it.spec, alias: it.searchKeyword }))


  /* 품목 한 줄 — 기본 BOM(없으면 첫 버전)을 붙인다. BOM 있는 품목이 먼저, 그다음 품목코드 차례(원본 실측). */
  const [catTab, setCatTab] = useState<string>('전체')
  const itemRows = useMemo(() => {
    const bomOf = new Map<number, Bom>()
    for (const b of boms) if (!bomOf.has(b.productId) || b.defaultVersion) bomOf.set(b.productId, b)
    const cat = CAT_TABS.find((t) => t.label === catTab)?.v
    return items
      .filter((it) => it.active !== false)
      .filter((it) => !cat || it.category === cat)
      .map((it) => ({ it, bom: bomOf.get(it.id) ?? null }))
      .sort((a, b) => (a.bom ? 0 : 1) - (b.bom ? 0 : 1) || a.it.code.localeCompare(b.it.code))
  }, [items, boms, catTab])

  /* 칸이 자료 따라 변하는 격자라 정적으로 못 센다 — 렌더된 표를 직접 잰다. */
  const tableRef = useRef<HTMLTableElement>(null)
  useTableColumnCheck(tableRef, 'BOM(소요량)조회', [itemRows.length])

  return (
    <EcListShell
      /* [검색(F8)]이 조건 판만 닫고 목록은 그대로였다 — 새로 넣은 전표가 안 보였다. 다시 읽는다. */
      onSearch={load}
      title="BOM(소요량)조회"
      onNew={showForm ? () => setShowForm(false) : openNew}
      actions={[{ label: 'Excel' }]}
    >
      {error && <p className="mb-2 rounded bg-ec-danger-bg px-3 py-2 text-sm text-ec-danger">{error}</p>}
      {ok && <p className="ec-alert ec-alert-success mb-[8px]">{ok}</p>}

      <Modal error={error} open={showForm} title="BOM(자재명세서) 등록" onClose={() => setShowForm(false)}>{(
        <form onSubmit={submit} style={{ marginTop: 8, marginBottom: 8, border: '1px solid var(--ec-border)', background: '#fff', padding: 14 }}>
          <div className="text-[13px] font-extrabold text-ec-navy mb-[8px]">BOM 등록 / 수정</div>
          <table className="w-full text-left mb-[10px] max-w-[720px]">
            <tbody>
              <tr>
                <th className="bg-ec-page font-bold w-[120px]">제품(생산 대상) *</th>
                <td>
                  {/* 긴 드롭다운이었다 — 코드도움으로(QA 21회차). */}
                  <CodePickerField label="제품" hideLabel width={240} placeholder="제품" emptyLabel="선택 해제"
                                   value={productId} onChange={setProductId} items={itemCodes} />
                </td>
                <th className="bg-ec-page font-bold w-[60px]">비고</th>
                <td><input className={inputCls} value={remark} onChange={(e) => setRemark(e.target.value)} style={{ minWidth: 200 }} /></td>
              </tr>
              <tr>
                {/* 원본 품목별BOM조회 [BOM버전] · [기본BOM]. 같은 이름이면 그 버전을 고치고, 새 이름이면 버전이 하나 는다. */}
                <th className="bg-ec-page font-bold">BOM버전</th>
                <td><input className={inputCls} value={versionName} onChange={(e) => setVersionName(e.target.value)} style={{ width: 160 }} /></td>
                <th className="bg-ec-page font-bold">기본BOM</th>
                <td>
                  <label className="flex items-center gap-[4px] text-[12.5px]">
                    <input type="checkbox" checked={makeDefault} onChange={(e) => setMakeDefault(e.target.checked)} />
                    이 버전을 기본으로(생산·불출·원가가 버전을 안 고르면 기본을 쓴다)
                  </label>
                </td>
              </tr>
            </tbody>
          </table>

          <div className="text-[12.5px] font-bold text-ec-label mt-[6px] mx-0 mb-[4px]">구성 자재 (제품 1단위당 소요량)</div>
          <table ref={tableRef} className="w-full text-left max-w-[720px]">
            <thead>
              <tr><th>자재</th><th className="w-[150px] text-right">소요량</th><th className="w-[40px]"></th></tr>
            </thead>
            <tbody>
              {lines.map((l, idx) => (
                <tr key={idx}>
                  <td>
                    <CodePickerField label="자재" hideLabel fill placeholder="자재" emptyLabel="선택 해제"
                                     value={l.componentId} onChange={(v) => updateLine(idx, 'componentId', v)}
                                     items={itemCodes.filter((c) => c.value !== productId)} />
                  </td>
                  <td><input type="number" step="any" className={inputCls} value={l.quantity} onChange={(e) => updateLine(idx, 'quantity', e.target.value)} style={{ width: '100%', textAlign: 'right' }} /></td>
                  <td className="text-center">
                    <button type="button" onClick={() => setLines((ls) => ls.length === 1 ? ls : ls.filter((_, i) => i !== idx))} className="no-ec" style={{ border: 'none', background: 'none', color: '#c0c5cc', cursor: 'pointer' }}>✕</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <button type="button" onClick={() => setLines((ls) => [...ls, emptyLine()])} className="ec-btn" style={{ marginTop: 6 }}>+ 자재 추가</button>

          <div className="mt-[12px] flex justify-end">
            <button type="submit" className="ec-btn ec-btn-primary">저장</button>
          </div>
        </form>
      )}</Modal>

      {/*
        원본 <b>BOM(소요량)조회</b>(E040401, 2026-10-03 실측)는 <b>품목 한 줄</b>이다 — BOM 이 있든 없든 품목이 다 서고,
        위 탭 전체 · 제품 · 반제품 · 세트 · 원재료 · 부재료 · 다공정품목으로 가른다. 열은 품목코드 · 품목명[규격] · 생산공정명 ·
        원재료갯수 · 파일관리 · BOM등록 · 조회. BOM 이 있는 품목이 먼저 선다. 세트 · 다공정품목은 우리 품목 구분에 없고
        파일관리는 품목에 파일을 붙이지 않아 그 탭 · 열을 두지 않았다. 원재료갯수는 기본 BOM 의 자재 줄 수다.
      */}
      <div className="flex gap-[2px] mt-[12px] mx-0 mb-[8px]">
        {CAT_TABS.map((t) => (
          <button key={t.label} onClick={() => setCatTab(t.label)} className="no-ec" style={{
            padding: '5px 12px', fontSize: 12.5, border: '1px solid var(--ec-border)', cursor: 'pointer', borderRadius: 3,
            background: catTab === t.label ? 'var(--ec-blue)' : '#fff', color: catTab === t.label ? '#fff' : 'var(--ec-text)', fontWeight: catTab === t.label ? 700 : 400,
          }}>{t.label}</button>
        ))}
      </div>
      <table ref={tableRef} className="w-full text-left">
        <thead>
          <tr>
            <th className="w-[110px]">품목코드</th>
            <th>품목명[규격]</th>
            <th className="w-[110px]">생산공정명</th>
            <th className="w-[90px] text-right">원재료갯수</th>
            <th className="w-[80px] text-center">BOM등록</th>
            <th className="w-[260px] text-center">조회</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={6} className="ec-empty">불러오는 중…</td></tr>
          ) : itemRows.length === 0 ? (
            <tr><td colSpan={6} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
          ) : itemRows.map(({ it, bom }) => (
            <tr key={it.id}>
              <td>{it.code}</td>
              <td>{it.name}{it.spec ? ` [${it.spec}]` : ''}</td>
              <td>{(it as { processName?: string | null }).processName ?? ''}</td>
              <td className="text-right">{bom ? bom.lines.length.toLocaleString('ko-KR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : ''}</td>
              <td className="text-center">
                <button onClick={() => (bom ? editBom(bom) : openNewFor(it.id))} className="no-ec" style={{ border: 'none', background: 'none', color: 'var(--ec-blue)', cursor: 'pointer', fontSize: 12 }}>{bom ? '수정' : '등록'}</button>
              </td>
              <td className="text-center whitespace-nowrap">
                {bom ? (<>
                  <button onClick={() => void openTree(bom, 'F')} className="no-ec" style={{ border: 'none', background: 'none', color: 'var(--ec-blue)', cursor: 'pointer', fontSize: 12 }}>정전개</button>
                  <button onClick={() => void openTree(bom, 'R')} className="no-ec" style={{ border: 'none', background: 'none', color: 'var(--ec-blue)', cursor: 'pointer', fontSize: 12 }}>역전개</button>
                  <button onClick={() => void openTree(bom, 'L')} className="no-ec" style={{ border: 'none', background: 'none', color: 'var(--ec-blue)', cursor: 'pointer', fontSize: 12 }}>원재료리스트</button>
                  <button onClick={() => remove(bom)} className="no-ec" style={{ border: 'none', background: 'none', color: 'var(--ec-danger)', cursor: 'pointer', fontSize: 12 }}>삭제</button>
                </>) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <Modal open={tree != null} title={tree?.title ?? ''} error={error} width={760} onClose={() => setTree(null)}>
        {tree && (
          <>
            {tree.kind !== 'L' && (
              <div className="flex gap-[4px] mb-[6px]">
                <button type="button" className="ec-btn ec-btn-sm" onClick={() => setFolded(new Set())}>펼치기</button>
                <button type="button" className="ec-btn ec-btn-sm"
                        onClick={() => setFolded(new Set(tree.rows.map((r, i) => (r.hasChildren && r.level > 0 ? i : -1)).filter((i) => i >= 0)))}>접기</button>
              </div>
            )}
            <div className="max-h-[60vh] overflow-y-auto">
              <table className="w-full text-left">
                <thead>
                  <tr>
                    <th>품목코드(품명,규격,단위포함)</th>
                    <th className="text-right w-[110px]">{tree.kind === 'R' ? '윗 품목당 소요량' : '소요량'}</th>
                    <th className="text-right w-[110px]">{tree.kind === 'L' ? '' : '누적 소요량'}</th>
                    <th className="w-[90px]">비고</th>
                  </tr>
                </thead>
                <tbody>
                  {tree.rows.length === 0 ? (
                    <tr><td colSpan={4} className="text-center text-ec-hint p-[16px]">등록된 데이터가 없습니다.</td></tr>
                  ) : visibleRows(tree.rows).map(({ r, i }) => (
                    <tr key={i}>
                      <td style={{ paddingLeft: 8 + r.level * 18 }}>
                        {r.hasChildren && r.level > 0 && tree.kind !== 'L' ? (
                          <button type="button" className="no-ec" style={{ border: 0, background: 'none', cursor: 'pointer', width: 14, padding: 0 }}
                                  onClick={() => setFolded((f) => { const n = new Set(f); if (n.has(i)) n.delete(i); else n.add(i); return n })}>
                            {folded.has(i) ? '+' : '−'}
                          </button>
                        ) : <span className="inline-block w-[14px]" />}
                        {r.itemCode} : {r.itemName}{r.spec ? ` [${r.spec}]` : ''} - {r.unit}
                      </td>
                      <td className="text-right">{r.level === 0 ? '' : Number(r.qty).toLocaleString('ko-KR', { maximumFractionDigits: 4 })}</td>
                      <td className="text-right">{r.level === 0 || tree.kind === 'L' ? '' : Number(r.totalQty).toLocaleString('ko-KR', { maximumFractionDigits: 4 })}</td>
                      <td className="text-ec-hint text-[12px]">{r.versionName ? `BOM ${r.versionName}` : ''}</td>
                    </tr>
                  ))}
                </tbody>
                {tree.kind === 'L' && (
                  <tfoot>
                    <tr>
                      <td className="text-right font-bold">합계</td>
                      <td className="text-right font-bold">{tree.rows.reduce((n, r) => n + Number(r.qty), 0).toLocaleString('ko-KR', { maximumFractionDigits: 4 })}</td>
                      <td colSpan={2} />
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </>
        )}
      </Modal>
    </EcListShell>
  )
}
