import { useEffect, useMemo, useState, useRef, type ReactElement } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import type { Bom, BomLine, Item } from '../../types/api'
import EcListShell from '../../components/EcListShell'
import Modal from '../../components/Modal'
import CodePickerField from '../../components/CodePickerField'
import GridCode from '../../components/GridCode'
import GridFindButton from '../../components/GridFindButton'
import { ecAlert, ecConfirm } from '../../components/EcDialog'
import { EcHistoryModal } from '../../components/EcHistory'
import { matrixToXlsx } from '../../utils/excel'

/** 원본 BOM등록 창이 더 보내 주는 값 — 생산수량 · 생산공정, 줄의 입력수량(생산수량 기준) · 생산공정 · 위치 · 적요(V427). */
type BomLineX = BomLine & {
  componentSpec: string | null; inputQty: number | null; processId: number | null; processName: string | null
  location: string | null; remark: string | null
}
type BomX = Omit<Bom, 'lines'> & { lines: BomLineX[]; produceQty: number | null; processId: number | null; processName: string | null }
interface Proc { id: number; code: string; name: string; active: boolean }

interface LineInput { key: number; componentId: string; quantity: string; processId: string; location: string; remark: string }
let lineKey = 0
const emptyLine = (): LineInput => ({ key: ++lineKey, componentId: '', quantity: '', processId: '', location: '', remark: '' })
/** 원본 격자는 빈 줄을 늘 몇 줄 더 둔다(새 창 3줄 · 자재 2줄짜리 수정 창 5줄, 2026-10-21 실측). */
const withBlanks = (ls: LineInput[]) => {
  const filled = ls.filter((l) => l.componentId)
  return [...filled, ...Array.from({ length: 3 }, emptyLine)]
}
const num = (v: number | null | undefined) => (v == null ? '' : String(Number(v)))

/** 원본 BOM(소요량)조회 탭(2026-10-21 실측 전체 · 제품 · 반제품 · 세트 · 원재료 · 부재료 · 다공정품목). 다공정품목은 우리 품목에 없다. */
const CAT_TABS: { label: string; test: ((it: Item) => boolean) | null }[] = [
  { label: '전체', test: null },
  { label: '제품', test: (it) => it.category === 'FINISHED' },
  { label: '반제품', test: (it) => it.category === 'SEMI_FINISHED' },
  { label: '세트', test: (it) => it.setItem },
  { label: '원재료', test: (it) => it.category === 'RAW_MATERIAL' },
  { label: '부재료', test: (it) => it.category === 'SUB_MATERIAL' },
]
/** 원본 [BOM등록] 칸은 제품 · 반제품(· 세트)에만 선다 — 원재료 A004 줄은 비어 있다(실측). */
const canHaveBom = (it: Item) => it.category === 'FINISHED' || it.category === 'SEMI_FINISHED' || it.setItem

/** 원본 BOM 정전개·역전개 한 줄. */
interface TreeRow {
  level: number; itemId: number; itemCode: string; itemName: string; spec: string | null; unit: string
  qty: number; totalQty: number; versionName: string | null; hasChildren: boolean
}

/** 원본 목록 칸의 [조회 ▾] 같은 작은 펼침 단추. */
function MenuButton({ label, items }: { label: string; items: { label: string; run: () => void }[] }) {
  const [open, setOpen] = useState(false)
  return (
    <span className="relative inline-block" onMouseLeave={() => setOpen(false)}>
      <button type="button" className="ec-btn ec-btn-sm" onClick={() => setOpen((v) => !v)}>{label} ▾</button>
      {open && (
        <span className="absolute right-0 top-full z-20 flex flex-col min-w-[96px] bg-white border border-ec-line rounded-ec py-[3px] text-left">
          {items.map((m) => (
            <button key={m.label} type="button" className="no-ec ec-link px-[9px] py-[3px] text-left text-[12px] whitespace-nowrap"
                    onClick={() => { setOpen(false); m.run() }}>{m.label}</button>
          ))}
        </span>
      )}
    </span>
  )
}

export default function BomPage() {
  const [boms, setBoms] = useState<BomX[]>([])
  const [items, setItems] = useState<Item[]>([])
  const [procs, setProcs] = useState<Proc[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  /**
   * 원본 BOM(소요량)조회 [조회] → <b>정전개 · 역전개 · 원재료리스트</b>.
   * 정전개는 제품에서 아래로 들여쓴 줄(반제품은 각자의 기본 BOM), 역전개는 이 품목을 쓰는 제품들을 위로,
   * 원재료리스트는 끝까지 푼 원재료만 합친 목록이다. [펼치기]·[접기]는 반제품 아래를 펴고 접는다.
   */
  const [tree, setTree] = useState<{ title: string; kind: 'F' | 'R' | 'L'; rows: TreeRow[] } | null>(null)
  const [folded, setFolded] = useState<Set<number>>(new Set())
  async function openTree(it: Item, b: BomX | null, kind: 'F' | 'R' | 'L') {
    setError('')
    try {
      let rows: TreeRow[]
      if (kind === 'F' && b) {
        rows = (await api.get<TreeRow[]>('/boms/tree', { params: { productId: b.productId, bomId: b.id } })).data
      } else if (kind === 'R') {
        rows = (await api.get<TreeRow[]>('/boms/where-used', { params: { itemId: it.id } })).data
      } else if (b) {
        const r = await api.get<{ componentId: number; componentCode: string; componentName: string; componentSpec: string | null; unit: string; quantity: number }[]>(
          '/productions/bom-preview', { params: { productId: b.productId, qty: 1, level: 'ALL', bomId: b.id } })
        rows = r.data.map((m) => ({ level: 1, itemId: m.componentId, itemCode: m.componentCode, itemName: m.componentName,
          spec: m.componentSpec, unit: m.unit, qty: m.quantity, totalQty: m.quantity, versionName: null, hasChildren: false }))
      } else return
      setFolded(new Set())
      setTree({ title: `${kind === 'F' ? '정전개' : kind === 'R' ? '역전개' : '원재료리스트'} — ${it.code} ${it.name}${b ? ` [${b.versionName}]` : ''}`, kind, rows })
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

  /* ── 원본 'BOM등록' / 'BOM수정' 창(2026-10-21 실측) ── */
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<BomX | null>(null)
  const [productId, setProductId] = useState('')
  const [processId, setProcessId] = useState('')
  const [remark, setRemark] = useState('')
  const [versionName, setVersionName] = useState('기본')
  const [makeDefault, setMakeDefault] = useState(false)
  const [produceQty, setProduceQty] = useState('1')
  const [lines, setLines] = useState<LineInput[]>(withBlanks([]))
  /** 원본은 빈 칸을 글 없이 빨간 테두리 + 그 칸에 커서로만 알린다 — 생산수량 · 줄의 품목코드 · 수량. */
  const [bad, setBad] = useState<{ produceQty?: boolean; code?: number; qty?: number }>({})
  const [stopMenu, setStopMenu] = useState(false)
  /** 수정 창 [H] — BomService.HISTORY_TARGET 'BOM'. */
  const [historyOpen, setHistoryOpen] = useState(false)
  /** 원본 [전체단계보기] ↔ [1단계보기] — 켜면 [펼치기] · [접기] · '보기' 열이 생기고, 자기 BOM 이 있는 자재 아래에 그 BOM 줄이 들어선다. */
  const [fullLevel, setFullLevel] = useState(false)
  const [expanded, setExpanded] = useState<Set<number>>(new Set())
  /**
   * 원본 수정 저장 → '생산입고1로 입력된 과거 전표도 재계산하시겠습니까?' 창(2026-10-21 실측 — 줄을 바꿨을 때만 뜬다,
   * 안 바꾸고 저장하면 말 없이 닫힘). ☐재계산 을 켜면 기준일자(이달 1일 ~ 오늘)가 나온다.
   */
  const [recalc, setRecalc] = useState<{ on: boolean; from: string; to: string } | null>(null)
  const snapshot = useRef('')
  const gridRef = useRef<HTMLTableElement>(null)
  const formRef = useRef<HTMLDivElement>(null)
  /* 원본처럼 빨간 칸으로 커서를 옮긴다. */
  useEffect(() => {
    if (bad.produceQty == null && bad.code == null && bad.qty == null) return
    formRef.current?.querySelector<HTMLInputElement>('.ec-invalid input')?.focus()
  }, [bad])

  /* 원본 [다중버전] → '품목별BOM(소요량)조회' 창: 버전 목록 · [사용중단포함] · 신규(F2) · 닫기. */
  const [versionsOf, setVersionsOf] = useState<Item | null>(null)
  const [withStopped, setWithStopped] = useState(false)

  async function load() {
    setLoading(true)
    try {
      const [b, i, p] = await Promise.all([api.get<BomX[]>('/boms', { params: { versions: 'all' } }), api.get<Item[]>('/items'),
        api.get<Proc[]>('/processes')])
      setBoms(b.data)
      setItems(i.data)
      setProcs(p.data)
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const versionsFor = (pid: number) => boms.filter((b) => b.productId === pid).sort((a, b) => a.id - b.id)

  function openNew(it: Item) {
    const vs = versionsFor(it.id)
    setEditing(null)
    setProductId(String(it.id))
    setProcessId('')
    setRemark('')
    // 원본: 첫 BOM 은 '기본', 다음 버전은 번호(D-FX-0260 의 둘째 버전 '2').
    setVersionName(vs.length === 0 ? '기본' : String(vs.length + 1))
    setMakeDefault(vs.length === 0)
    setProduceQty('1')
    setLines(withBlanks([]))
    setBad({}); setError(''); setStopMenu(false); setFullLevel(false); setExpanded(new Set())
    setShowForm(true)
  }

  function editBom(b: BomX) {
    setEditing(b)
    setProductId(String(b.productId))
    setProcessId(b.processId ? String(b.processId) : '')
    setRemark(b.remark ?? '')
    setVersionName(b.versionName ?? '기본')
    setMakeDefault(b.defaultVersion)
    setProduceQty(num(b.produceQty ?? 1))
    setLines(withBlanks(b.lines.map((l) => ({ key: ++lineKey, componentId: String(l.componentId),
      quantity: num(l.inputQty ?? l.quantity), processId: l.processId ? String(l.processId) : '', location: l.location ?? '', remark: l.remark ?? '' }))))
    snapshot.current = shape(num(b.produceQty ?? 1), b.lines.map((l) => ({ componentId: String(l.componentId), quantity: num(l.inputQty ?? l.quantity) })))
    setBad({}); setError(''); setStopMenu(false); setFullLevel(false); setExpanded(new Set())
    setShowForm(true)
  }

  /** 원본 [BOM등록 ▾] 기본버전 — 기본 BOM 이 있으면 그 수정 창, 없으면 새 창. */
  function openDefault(it: Item) {
    const vs = versionsFor(it.id)
    const b = vs.find((v) => v.defaultVersion) ?? vs[0]
    if (b) editBom(b); else openNew(it)
  }

  function updateLine(idx: number, patch: Partial<LineInput>) {
    setLines((ls) => {
      const next = ls.map((l, i) => (i === idx ? { ...l, ...patch } : l))
      // 끝 줄에 품목을 넣으면 빈 줄을 하나 더(원본 격자처럼 늘 빈 줄이 남는다).
      if (patch.componentId && idx === ls.length - 1) next.push(emptyLine())
      return next
    })
    setBad({})
  }

  /** 재계산을 물을 만큼 바뀌었나 — 생산수량 · 자재 · 수량(원본은 적요만 바꾸면 안 묻는지 못 쟀다, 그래서 소모에 닿는 것만 본다). */
  const shape = (pq: string, ls: { componentId: string; quantity: string }[]) =>
    JSON.stringify([Number(pq), ls.filter((l) => l.componentId).map((l) => [l.componentId, Number(l.quantity)])])

  async function submit(asked = false) {
    setError('')
    const pq = Number(produceQty)
    if (!produceQty.trim() || !(pq > 0)) { setBad({ produceQty: true }); return }
    const filled = lines.map((l, i) => ({ l, i })).filter(({ l }) => l.componentId)
    if (filled.length === 0) { setBad({ code: 0 }); return }
    const noQty = filled.find(({ l }) => !(Number(l.quantity) > 0))
    if (noQty) { setBad({ qty: noQty.i }); return }
    if (editing && !asked && shape(produceQty, lines) !== snapshot.current) {
      const t = new Date()
      const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      setRecalc({ on: false, from: ymd(new Date(t.getFullYear(), t.getMonth(), 1)), to: ymd(t) })
      return
    }
    const wantRecalc = recalc?.on ?? false
    setRecalc(null)
    try {
      await api.post('/boms', {
        productId: Number(productId), remark: remark || undefined, versionName: versionName.trim() || '기본', defaultVersion: makeDefault,
        produceQty: pq, processId: processId ? Number(processId) : null,
        lines: filled.map(({ l }) => ({ componentId: Number(l.componentId), quantity: Number(l.quantity),
          processId: l.processId ? Number(l.processId) : null, location: l.location || null, remark: l.remark || null })),
      })
      // 원본: 저장하면 말 없이 창이 닫히고 목록 [원재료갯수] 가 바뀐다.
      setShowForm(false)
      load()
      // 우리는 생산입고 I 저장 때 소모를 적어 둔다 — 과거 전표 재계산은 아직 없다(원본 재계산 숫자를 못 쟀다). 말 없이 넘기지 않는다.
      if (wantRecalc) void ecAlert('BOM 은 저장했습니다. 과거 생산입고1 전표의 소모 재계산은 아직 지원하지 않습니다.')
    } catch (err) {
      setError(extractErrorMessage(err))
    }
  }

  async function setActive(b: BomX, active: boolean) {
    setStopMenu(false)
    try {
      await api.patch(`/boms/${b.id}/active`, null, { params: { active } })
      setShowForm(false)
      load()
    } catch (err) {
      setError(extractErrorMessage(err))
    }
  }

  async function remove(b: BomX) {
    setStopMenu(false)
    if (!(await ecConfirm('삭제하겠습니까?'))) return
    try {
      await api.delete(`/boms/${b.id}`)
      setShowForm(false)
      load()
    } catch (err) {
      void ecAlert(extractErrorMessage(err))
    }
  }

  // 중단 품목은 빼되, 수정 중인 BOM 이 이미 쓰고 있는 것은 남긴다(안 남기면 칸이 비어 보인다)
  const itemCodes = items.filter((it) => it.active !== false || String(it.id) === productId
      || lines.some((l) => l.componentId === String(it.id)))
    .map((it) => ({ value: String(it.id), code: it.code, name: it.name, sub: it.spec, alias: it.searchKeyword }))
  const itemById = useMemo(() => new Map(items.map((it) => [String(it.id), it])), [items])
  const procCodes = procs.filter((p) => p.active || String(p.id) === processId || lines.some((l) => l.processId === String(p.id)))
    .map((p) => ({ value: String(p.id), code: p.code, name: p.name }))
  const product = itemById.get(productId)

  /** [전체단계보기] — 자재가 제품 · 반제품이면 그 기본 BOM(사용중단 아닌 것). */
  const subBom = (componentId: string) =>
    componentId ? boms.find((x) => String(x.productId) === componentId && x.defaultVersion && x.active) : undefined
  /** 하위 BOM 줄 — 읽기 전용, 품목코드를 단계만큼 들여 쓴다. 고리(자기를 다시 부르는 BOM)는 10단계에서 끊는다. */
  const subRows = (b: BomX, depth: number, key: string): ReactElement[] => depth > 10 ? [] : b.lines.flatMap((m, i) => {
    const child = subBom(String(m.componentId))
    return [
      <tr key={`${key}-${i}`} className="text-ec-hint">
        <td></td>
        <td style={{ paddingLeft: 6 + depth * 12 }}>{m.componentCode}</td>
        <td></td>
        <td>{m.componentName}</td>
        <td>{m.componentSpec ?? ''}</td>
        <td>{m.unit}</td>
        <td className="text-right">{num(m.inputQty ?? m.quantity)}</td>
        <td>{m.processName ?? ''}</td>
        <td>{m.location ?? ''}</td>
        <td>{m.remark ?? ''}</td>
      </tr>,
      ...(child ? subRows(child, depth + 1, `${key}-${i}`) : []),
    ]
  })

  /* 품목 한 줄 — 기본 BOM(없으면 첫 버전)을 붙인다. BOM 있는 품목이 먼저, 그다음 품목코드 차례(원본 실측). */
  const [catTab, setCatTab] = useState<string>('전체')
  const itemRows = useMemo(() => {
    const bomOf = new Map<number, BomX>()
    for (const b of boms) if (!bomOf.has(b.productId) || b.defaultVersion) bomOf.set(b.productId, b)
    const test = CAT_TABS.find((t) => t.label === catTab)?.test
    return items
      .filter((it) => it.active !== false)
      .filter((it) => !test || test(it))
      .map((it) => ({ it, bom: bomOf.get(it.id) ?? null }))
      .sort((a, b) => (a.bom ? 0 : 1) - (b.bom ? 0 : 1) || a.it.code.localeCompare(b.it.code))
  }, [items, boms, catTab])

  /* 칸이 자료 따라 변하는 격자라 정적으로 못 센다 — 렌더된 표를 직접 잰다. */
  const tableRef = useRef<HTMLTableElement>(null)
  useTableColumnCheck(tableRef, 'BOM(소요량)조회', [itemRows.length])

  const versionRows = versionsOf ? versionsFor(versionsOf.id).filter((b) => withStopped || b.active) : []

  return (
    <EcListShell
      /* [검색(F8)]이 조건 판만 닫고 목록은 그대로였다 — 새로 넣은 전표가 안 보였다. 다시 읽는다. */
      onSearch={load}
      title="BOM(소요량)조회"
      actions={[{ label: 'Excel' }]}
    >
      {error && !showForm && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}

      <Modal error={error} open={showForm} width={980} title={editing ? 'BOM수정' : 'BOM등록'} onClose={() => setShowForm(false)}>
        <div ref={formRef}>
        <div className="ec-form mb-[8px]">
          <table className="w-full text-left">
            <tbody>
              <tr>
                <th className="w-[110px]">생산품목</th>
                <td><input className="ec-input w-full" readOnly value={product ? `${product.code} ${product.name}${product.spec ? ` [${product.spec}]` : ''}` : ''} aria-label="생산품목" /></td>
                <th className="w-[110px]">생산공정</th>
                <td>
                  <CodePickerField label="생산공정" hideLabel fill placeholder="생산공정" emptyLabel="선택 해제"
                                   value={processId} onChange={setProcessId} items={procCodes} />
                </td>
              </tr>
              <tr>
                <th>BOM버전</th>
                <td>
                  <span className="flex items-center gap-[6px]">
                    {/* 같은 제품 · 같은 이름이면 그 버전을 고친다 — 수정 창에서는 이름을 못 바꾼다(바꾸면 새 버전이 된다). */}
                    <input className="ec-input w-[200px]" aria-label="BOM버전" value={versionName} readOnly={!!editing}
                           onChange={(e) => setVersionName(e.target.value)} />
                    <label className="flex items-center gap-[3px] text-[12px]">
                      <input type="checkbox" checked={makeDefault} disabled={editing?.defaultVersion}
                             onChange={(e) => setMakeDefault(e.target.checked)} />기본
                    </label>
                  </span>
                </td>
                <th>생산수량</th>
                <td>
                  <span className={`block${bad.produceQty ? ' ec-invalid' : ''}`}>
                    <input className="ec-input w-full text-right" aria-label="생산수량" inputMode="decimal" value={produceQty}
                           onChange={(e) => { setProduceQty(e.target.value); setBad({}) }} />
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="flex gap-[4px] mb-[4px]">
          <GridFindButton tableRef={gridRef} />
          <button type="button" className="ec-btn ec-btn-sm"
                  onClick={() => setLines((ls) => withBlanks([...ls].sort((a, b) =>
                    (itemById.get(a.componentId)?.code ?? '').localeCompare(itemById.get(b.componentId)?.code ?? ''))))}>정렬</button>
          {fullLevel && (
            <>
              <button type="button" className="ec-btn ec-btn-sm"
                      onClick={() => setExpanded(new Set(lines.map((l, i) => (subBom(l.componentId) ? i : -1)).filter((i) => i >= 0)))}>펼치기</button>
              <button type="button" className="ec-btn ec-btn-sm" onClick={() => setExpanded(new Set())}>접기</button>
            </>
          )}
        </div>
        <div className="max-h-[50vh] overflow-y-auto">
          <table ref={gridRef} className="w-full text-left">
            <thead>
              <tr>
                <th className="w-[32px] text-center"></th>
                <th className="w-[130px]">품목코드</th>
                {fullLevel && <th className="w-[40px] text-center">보기</th>}
                <th>품목명</th>
                <th className="w-[100px]">규격명</th>
                <th className="w-[50px]">단위</th>
                <th className="w-[90px] text-right">수량</th>
                <th className="w-[130px]">생산공정</th>
                <th className="w-[90px]">위치</th>
                <th className="w-[120px]">적요</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l, idx) => {
                const c = itemById.get(l.componentId)
                const sub = fullLevel ? subBom(l.componentId) : undefined
                return [
                  <tr key={l.key}>
                    <td className="text-center">{idx + 1}</td>
                    <td className={bad.code === idx ? 'ec-invalid' : undefined}>
                      <GridCode title="품목" codeHead="품목코드" nameHead="품목명"
                                items={itemCodes.filter((x) => x.value !== productId)}
                                value={l.componentId} onPick={(v) => updateLine(idx, { componentId: v })} />
                    </td>
                    {fullLevel && (
                      <td className="text-center">
                        {sub && (
                          <button type="button" className="no-ec ec-link" aria-label="하위 BOM 보기"
                                  onClick={() => setExpanded((s) => { const n = new Set(s); if (n.has(idx)) n.delete(idx); else n.add(idx); return n })}>
                            {expanded.has(idx) ? '−' : '+'}
                          </button>
                        )}
                      </td>
                    )}
                    <td>{c?.name ?? ''}</td>
                    <td>{c?.spec ?? ''}</td>
                    <td>{c?.unit ?? ''}</td>
                    <td className={bad.qty === idx ? 'ec-invalid' : undefined}>
                      <input className="ec-input w-full text-right" aria-label="수량" inputMode="decimal" value={l.quantity} onChange={(e) => updateLine(idx, { quantity: e.target.value })} />
                    </td>
                    <td>
                      <CodePickerField label="생산공정" hideLabel fill placeholder="" emptyLabel="선택 해제"
                                       value={l.processId} onChange={(v) => updateLine(idx, { processId: v })} items={procCodes} />
                    </td>
                    <td><input className="ec-input w-full" aria-label="위치" value={l.location} onChange={(e) => updateLine(idx, { location: e.target.value })} /></td>
                    <td><input className="ec-input w-full" aria-label="적요" value={l.remark} onChange={(e) => updateLine(idx, { remark: e.target.value })} /></td>
                  </tr>,
                  ...(sub && expanded.has(idx) ? subRows(sub, 1, `${l.key}`) : []),
                ]
              })}
            </tbody>
          </table>
        </div>

        {/* 원본 아래 줄: 저장(F8) · 전체단계보기 · (수정 창만) 사용중단/재사용 ▲ › 사용중단|재사용 · 삭제 · Excel · 닫기 */}
        <div className="mt-[10px] flex gap-[4px] items-center">
          <button type="button" className="ec-btn ec-btn-primary" onClick={() => void submit()}>저장(F8)</button>
          <button type="button" className="ec-btn" onClick={() => { setFullLevel((v) => !v); setExpanded(new Set()) }}>
            {fullLevel ? '1단계보기' : '전체단계보기'}
          </button>
          {editing && (
            <span className="relative inline-block">
              <button type="button" className="ec-btn" onClick={() => setStopMenu((v) => !v)}>사용중단/재사용 ▲</button>
              {stopMenu && (
                <span className="absolute left-0 bottom-full z-20 flex flex-col min-w-[110px] bg-white border border-ec-line rounded-ec py-[3px]">
                  <button type="button" className="no-ec ec-link px-[9px] py-[3px] text-left text-[12px]"
                          onClick={() => void setActive(editing, !editing.active)}>{editing.active ? '사용중단' : '재사용'}</button>
                  <button type="button" className="no-ec ec-link px-[9px] py-[3px] text-left text-[12px]"
                          onClick={() => void remove(editing)}>삭제</button>
                </span>
              )}
            </span>
          )}
          {editing && (
            <button type="button" className="ec-btn" onClick={() => void matrixToXlsx({
              headers: ['품목코드', '품목명', '규격명', '단위', '수량', '생산공정', '위치', '적요'],
              rows: lines.filter((l) => l.componentId).map((l) => {
                const c = itemById.get(l.componentId)
                return [c?.code ?? '', c?.name ?? '', c?.spec ?? '', c?.unit ?? '', Number(l.quantity) || 0,
                  procs.find((x) => String(x.id) === l.processId)?.name ?? '', l.location, l.remark]
              }),
            }, `BOM_${editing.productCode}`)}>Excel</button>
          )}
          <button type="button" className="ec-btn" onClick={() => setShowForm(false)}>닫기</button>
          {editing && <button type="button" className="ec-btn" onClick={() => setHistoryOpen(true)}>H</button>}
        </div>
        </div>
      </Modal>
      {historyOpen && editing && <EcHistoryModal url={`/change-history?target=BOM&id=${editing.id}`} onClose={() => setHistoryOpen(false)} />}

      <Modal error={error} open={recalc != null} width={460} title="알림" onClose={() => setRecalc(null)}>
        {recalc && (
          <>
            <p className="leading-[1.7]">
              생산입고1로 입력된 과거 전표도 재계산하시겠습니까?<br />
              재계산 시 기존 입력된 전표의 소모내역이 변경되어 재고수불이 다르게 나타납니다.<br />
              재계산 체크 후 확인버튼 클릭 시 기준일자 기간만큼 생산입고1 전표의 소모내역이 재계산됩니다.<br />
              체크하지 않는 경우 기존 전표에 소모내역은 영향을 받지 않습니다.
            </p>
            <label className="flex items-center gap-[4px] mt-[8px]">
              <input type="checkbox" checked={recalc.on} onChange={(e) => setRecalc({ ...recalc, on: e.target.checked })} />재계산
            </label>
            {recalc.on && (
              <div className="flex items-center gap-[6px] mt-[6px]">
                <span>기준일자</span>
                <input type="date" className="ec-input" aria-label="기준일자 시작" value={recalc.from}
                       onChange={(e) => setRecalc({ ...recalc, from: e.target.value })} />
                <span>~</span>
                <input type="date" className="ec-input" aria-label="기준일자 끝" value={recalc.to}
                       onChange={(e) => setRecalc({ ...recalc, to: e.target.value })} />
              </div>
            )}
            <div className="mt-[12px] flex justify-center gap-[4px]">
              <button type="button" className="ec-btn ec-btn-primary" onClick={() => void submit(true)}>확인</button>
              <button type="button" className="ec-btn" onClick={() => setRecalc(null)}>취소</button>
            </div>
          </>
        )}
      </Modal>

      <Modal error={error} open={versionsOf != null && !showForm} width={760} title="품목별BOM(소요량)조회" onClose={() => setVersionsOf(null)}>
        {versionsOf && (
          <>
            <div className="flex justify-end mb-[6px]">
              <button type="button" className={`ec-btn ec-btn-sm${withStopped ? ' ec-btn-primary' : ''}`}
                      onClick={() => setWithStopped((v) => !v)}>사용중단포함</button>
            </div>
            <table className="w-full text-left">
              <thead>
                <tr>
                  <th className="w-[70px]">BOM번호</th><th className="w-[90px]">BOM버전</th><th className="w-[110px]">품목코드</th>
                  <th>품목명[규격]</th><th className="w-[70px] text-right">원재료 수</th><th className="w-[70px] text-center">기타</th>
                  <th className="w-[70px] text-center">기본BOM</th>
                </tr>
              </thead>
              <tbody>
                {versionRows.length === 0 ? (
                  <tr><td colSpan={7} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
                ) : versionRows.map((b) => (
                  <tr key={b.id}>
                    <td><button type="button" className="no-ec ec-link" onClick={() => editBom(b)}>{versionsFor(b.productId).indexOf(b) + 1}</button></td>
                    <td>{b.versionName}</td>
                    <td>{versionsOf.code}</td>
                    <td>{versionsOf.name}{versionsOf.spec ? ` [${versionsOf.spec}]` : ''}</td>
                    <td className="text-right">{b.lines.length}</td>
                    <td className="text-center"><button type="button" className="no-ec ec-link" onClick={() => void openTree(versionsOf, b, 'F')}>조회</button></td>
                    <td className="text-center">{b.defaultVersion ? '기본' : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mt-[10px] flex gap-[4px]">
              <button type="button" className="ec-btn ec-btn-primary" onClick={() => openNew(versionsOf)}>신규(F2)</button>
              <button type="button" className="ec-btn" onClick={() => setVersionsOf(null)}>닫기</button>
            </div>
          </>
        )}
      </Modal>

      {/*
        원본 <b>BOM(소요량)조회</b>(E040401, 2026-10-21 실측)는 <b>품목 한 줄</b>이다 — BOM 이 있든 없든 품목이 다 서고,
        위 탭 전체 · 제품 · 반제품 · 세트 · 원재료 · 부재료 · 다공정품목으로 가른다. 열은 품목코드 · 품목명[규격] · 생산공정명 ·
        원재료갯수 · 파일관리 · BOM등록 · 조회. [BOM등록] 은 제품 · 반제품에만 서고 [조회 ▾] 기본버전 · 다중버전,
        [조회] 는 BOM 있는 품목이면 정전개 · 역전개 · 원재료리스트, 없으면 역전개만. 다공정품목 · 파일관리는 우리 품목에 없다.
      */}
      <div className="ec-pills mt-[12px] mb-[8px]">
        {CAT_TABS.map((t) => (
          <button key={t.label} type="button" onClick={() => setCatTab(t.label)} className={`ec-pill${catTab === t.label ? ' active' : ''}`}>{t.label}</button>
        ))}
      </div>
      <table ref={tableRef} className="w-full text-left">
        <thead>
          <tr>
            <th className="w-[110px]">품목코드</th>
            <th>품목명[규격]</th>
            <th className="w-[110px]">생산공정명</th>
            <th className="w-[90px] text-right">원재료갯수</th>
            <th className="w-[90px] text-center">BOM등록</th>
            <th className="w-[90px] text-center">조회</th>
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
              <td>{bom?.processName ?? (it as { processName?: string | null }).processName ?? ''}</td>
              <td className="text-right">{bom ? bom.lines.length.toLocaleString('ko-KR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : ''}</td>
              <td className="text-center">
                {canHaveBom(it) || bom ? (
                  <MenuButton label="조회" items={[
                    { label: '기본버전', run: () => openDefault(it) },
                    { label: '다중버전', run: () => { setWithStopped(false); setVersionsOf(it) } },
                  ]} />
                ) : null}
              </td>
              <td className="text-center whitespace-nowrap">
                <MenuButton label="조회" items={bom ? [
                  { label: '정전개', run: () => void openTree(it, bom, 'F') },
                  { label: '역전개', run: () => void openTree(it, bom, 'R') },
                  { label: '원재료리스트', run: () => void openTree(it, bom, 'L') },
                ] : [{ label: '역전개', run: () => void openTree(it, null, 'R') }]} />
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
                          <button type="button" className="no-ec inline-block w-[14px] p-0"
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
