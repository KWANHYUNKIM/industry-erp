import { useEffect, useMemo, useRef, useState } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import type { CommonCode, Item, QualityInspection, QualityInspectionLine } from '../../types/api'
import EcListShell from '../../components/EcListShell'
import Modal from '../../components/Modal'
import CodePickerField from '../../components/CodePickerField'
import EcPeriodPicks, { QUOTATION_PICKS, periodOf, ymd } from '../../components/EcPeriodPicks'
import { EcCond } from '../../components/EcStatusPanel'
import { useCondPickers } from '../../utils/useCondPickers'
import { useShortcut } from '../../utils/useShortcut'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import EcRowCap, { capRows } from '../../components/EcRowCap'

const today = () => ymd(new Date())
const qty0 = (n: number) => Math.round(n).toLocaleString('ko-KR')
const qty2 = (n: number) => n.toLocaleString('ko-KR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
/* 원본 [검사번호] '26/10/04-1' — 우리 번호 'QC-20261004-0001' 에서 일자와 끝 일련번호만 뗀다. */
const shortNo = (r: QualityInspection) => {
  const seq = Number(r.inspectionNo.split('-').pop()) || r.inspectionNo
  return `${r.inspectionDate.slice(2).replace(/-/g, '/')}-${seq}`
}
/* 원본 [품목] 'MSI BIG BANG Z77 MPOWER [1EA]' · 여러 줄이면 '… 외 1건'. */
const itemText = (r: QualityInspection) => {
  const first = r.lines[0]
  if (!first) return r.itemName
  if (r.lines.length > 1) return `${first.itemName} 외 ${r.lines.length - 1}건`
  return `${first.itemName}${first.spec ? ` [${first.spec}]` : ''}`
}

type Method = QualityInspectionLine['method']
type Pass = QualityInspectionLine['passResult']
interface LineForm { method: Method; itemId: string; quantity: string; sampleQty: string; defectQty: string; passResult: Pass; defectType: string }
const emptyLine = (): LineForm => ({ method: 'FULL', itemId: '', quantity: '', sampleQty: '', defectQty: '', passResult: 'NA', defectType: '' })
const emptyLines = () => [emptyLine(), emptyLine(), emptyLine()]
const num = (v: string) => Number(v || 0)
/* 전수면 시료 = 수량(원본은 시료 칸을 막고 수량을 그대로 찍는다). 적격 = 시료 − 부적격. */
const sampleOf = (l: LineForm) => (l.method === 'FULL' ? num(l.quantity) : num(l.sampleQty))

type Tab = '전체' | '진행중' | '완료'

/**
 * 재고 II &gt; 품질관리 &gt; 품질검사 &gt; <b>품질검사조회</b>(E040622) · <b>품질검사입력</b>(E040621) — 2026-10-04 loginaa 실측(자료가 든 판, 입력 · 완료 · 삭제까지).
 *
 * <ul>
 *   <li>알약 전체 · 확인 · 진행중 · 완료, 진행중을 보고 열린다. 열: 검사번호(26/10/04-1) · 품목('○○ [규격]', 여럿이면 '○○ 외 1건') ·
 *       수량(정수) · 시료 · 적격 · 부적격(소수 둘째, 0 이면 빈칸) · 출처 · 종결여부 · 인쇄.</li>
 *   <li>입력은 품목 줄을 든 전표다: 검사방법(전수 · 샘플링) · 품목 · 수량 · 시료 · 적격 · 부적격 · 합격여부(해당없음 · 합격 · 불합격).
 *       전수면 시료 = 수량이고 칸이 막힌다. 적격 = 시료 − 부적격. 부적격은 [부적격관리] 에서 불량유형마다 넣는다.</li>
 *   <li>빈 저장 — '자료를 입력 바랍니다.', 시료 &gt; 수량 — '시료는 수량보다 클 수 없습니다.'</li>
 *   <li>저장하면 [종결여부] 진행중, 목록의 진행중을 누르면 완료(주황)로 넘어간다. 완료도 [선택삭제] 로 지워진다 —
 *       '선택한 전표를 삭제 하겠습니까?', 고른 것이 없으면 '리스트에 선택된 자료가 없습니다.'</li>
 * </ul>
 * 예전 화면은 품목 하나짜리 검사성적(검사구분 · 로트 · 검사수량 · 불량수 · 판정)이라 줄도 시료도 종결여부도 없었다.
 * [확인] 알약(전표 확인 결재)과 [출처](검사요청 · 구매 … 에서 불러오기)는 아직 없다 — 출처 칸은 빈칸이다.
 * 조건 판은 원본 조건 대조표의 것(기준일자 · 품목 · 창고 · 프로젝트)을 그대로 둔다.
 */
export default function QualityInspectionPage() {
  const pickers = useCondPickers(['items', 'warehouses', 'projects'])
  const init = periodOf('최근30일(+1개월)')!
  const [from, setFrom] = useState(init.from)
  const [to, setTo] = useState(init.to)
  const [itemCond, setItemCond] = useState('')
  const [whCond, setWhCond] = useState('')
  const [projCond, setProjCond] = useState('')
  const [tab, setTab] = useState<Tab>('진행중')
  const [rows, setRows] = useState<QualityInspection[]>([])
  const [items, setItems] = useState<Item[]>([])
  const [defectTypes, setDefectTypes] = useState<CommonCode[]>([])
  const [keyword, setKeyword] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [picked, setPicked] = useState<Set<number>>(new Set())

  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<QualityInspection | null>(null)
  const [f, setF] = useState({ inspectionDate: today(), inspector: '', remark: '' })
  const [lines, setLines] = useState<LineForm[]>(emptyLines())
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)

  async function load() {
    setLoading(true)
    try {
      const [q, i, d] = await Promise.all([
        api.get<QualityInspection[]>('/quality-inspections', { params: { from, to } }),
        api.get<Item[]>('/items'),
        /* 원본 [부적격관리]의 불량유형 — 공통코드 그룹 DEFECT_TYPE. */
        api.get<CommonCode[]>('/codes/DEFECT_TYPE'),
      ])
      setRows(q.data); setItems(i.data); setDefectTypes(d.data)
      setPicked(new Set())
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load() }, [from, to])

  const itemById = useMemo(() => new Map(items.map((it) => [String(it.id), it])), [items])
  const itemPicks = useMemo(() => items.filter((it) => it.active !== false)
    .map((it) => ({ value: String(it.id), code: it.code, name: it.name, sub: it.spec, alias: it.searchKeyword })), [items])

  const shown = rows
    .filter((r) => tab === '전체' || (tab === '진행중' ? r.status === 'IN_PROGRESS' : r.status === 'COMPLETED'))
    .filter((r) => !itemCond || r.lines.some((l) => String(l.itemId) === itemCond))
    .filter((r) => !whCond || String(r.warehouseId) === whCond)
    .filter((r) => !projCond || String(r.projectId) === projCond)
    .filter((r) => !keyword || r.lines.some((l) => l.itemName.includes(keyword)) || r.inspectionNo.includes(keyword))
    .sort((a, b) => (a.inspectionDate < b.inspectionDate ? 1 : a.inspectionDate > b.inspectionDate ? -1 : b.id - a.id))
  /* 그리는 줄만 자른다 — 검사가 수천 줄이면 브라우저가 멈춘다(2026-09-10 실측 2,316줄). 거르는 것은 전부에서. */
  const capped = capRows(shown)
  const tableRef = useRef<HTMLTableElement>(null)
  useTableColumnCheck(tableRef, '품질검사조회', [shown.length])

  function openNew() {
    setEditing(null); setFormError('')
    setF({ inspectionDate: today(), inspector: '', remark: '' })
    setLines(emptyLines())
    setOpen(true)
  }
  function openEdit(r: QualityInspection) {
    setEditing(r); setFormError('')
    setF({ inspectionDate: r.inspectionDate, inspector: r.inspector ?? '', remark: r.remark ?? '' })
    setLines([...r.lines.map((l) => ({
      method: l.method, itemId: String(l.itemId), quantity: String(l.quantity), sampleQty: String(l.sampleQty),
      defectQty: l.defectQty ? String(l.defectQty) : '', passResult: l.passResult, defectType: l.defectType ?? '',
    })), emptyLine()])
    setOpen(true)
  }
  const setLine = (i: number, patch: Partial<LineForm>) =>
    setLines((ls) => {
      const next = ls.map((l, j) => (j === i ? { ...l, ...patch } : l))
      return next[next.length - 1].itemId ? [...next, emptyLine()] : next
    })
  const filled = lines.filter((l) => l.itemId)
  const sums = filled.reduce((s, l) => ({
    qty: s.qty + num(l.quantity), sample: s.sample + sampleOf(l),
    good: s.good + sampleOf(l) - num(l.defectQty), defect: s.defect + num(l.defectQty),
  }), { qty: 0, sample: 0, good: 0, defect: 0 })

  async function save() {
    setFormError('')
    if (filled.length === 0) return setFormError('자료를 입력 바랍니다.')
    if (filled.some((l) => sampleOf(l) > num(l.quantity))) return setFormError('시료는 수량보다 클 수 없습니다.')
    const body = {
      inspectionDate: f.inspectionDate,
      inspector: f.inspector || undefined,
      remark: f.remark || undefined,
      lines: filled.map((l) => ({
        itemId: Number(l.itemId), method: l.method, quantity: num(l.quantity),
        sampleQty: sampleOf(l), defectQty: num(l.defectQty), passResult: l.passResult,
        defectType: l.defectType || undefined,
      })),
    }
    setSaving(true)
    try {
      if (editing) await api.put(`/quality-inspections/${editing.id}`, body)
      else await api.post('/quality-inspections', body)
      setOpen(false)
      await load()
    } catch (err) {
      setFormError(extractErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }
  useShortcut('F8', save, open)
  useShortcut('F2', openNew, !open)

  async function removeIds(ids: number[]) {
    try {
      for (const id of ids) await api.delete(`/quality-inspections/${id}`)
      setOpen(false)
      await load()
    } catch (err) {
      setError(extractErrorMessage(err))
    }
  }
  function removeChecked() {
    const ids = [...picked]
    if (ids.length === 0) return setError('리스트에 선택된 자료가 없습니다.\n체크박스에 체크한 후 다시 시도 바랍니다.')
    if (window.confirm('선택한 전표를 삭제 하겠습니까?')) void removeIds(ids)
  }
  async function toggleStatus(r: QualityInspection) {
    try {
      await api.patch(`/quality-inspections/${r.id}/status`, { status: r.status === 'IN_PROGRESS' ? 'COMPLETED' : 'IN_PROGRESS' })
      await load()
    } catch (err) {
      setError(extractErrorMessage(err))
    }
  }

  const allPicked = capped.rows.length > 0 && capped.rows.every((r) => picked.has(r.id))

  return (
    <EcListShell
      onSearch={load}
      title="품질검사조회"
      search={keyword}
      onSearchChange={setKeyword}
      onNew={openNew}
      actions={[
        /* 원본은 누른 뒤 '리스트에 선택된 자료가 없습니다.' — 우리는 고른 줄이 없으면 미리 잠근다(저장소 규칙). */
        { label: '선택삭제', onClick: removeChecked, disabled: picked.size === 0 },
        { label: 'Excel' },
      ]}
    >
      {error && <p className="ec-alert ec-alert-danger mb-[8px] whitespace-pre-line">{error}</p>}

      <ul className="ec-cond mb-[8px]">
        <EcCond label="기준일자">
          <input type="date" className="ec-input w-[145px]" value={from} onChange={(e) => setFrom(e.target.value)} />
          <span className="my-0 mx-[4px]">~</span>
          <input type="date" className="ec-input w-[145px]" value={to} onChange={(e) => setTo(e.target.value)} />
          <span className="ml-[6px]">
            <EcPeriodPicks labels={QUOTATION_PICKS} currentFrom={from} onPick={(r) => { setFrom(r.from); setTo(r.to) }} />
          </span>
        </EcCond>
        <EcCond label="품목" pick>
          <CodePickerField label="품목" hideLabel width={220} emptyLabel="전체" value={itemCond} onChange={setItemCond} items={pickers.items} />
        </EcCond>
        <EcCond label="창고" pick>
          <CodePickerField label="창고" hideLabel width={200} emptyLabel="전체" value={whCond} onChange={setWhCond} items={pickers.warehouses} />
        </EcCond>
        <EcCond label="프로젝트" pick>
          <CodePickerField label="프로젝트" hideLabel width={200} emptyLabel="전체" value={projCond} onChange={setProjCond} items={pickers.projects} />
        </EcCond>
      </ul>

      <div className="ec-pills mb-[8px]">
        {(['전체', '진행중', '완료'] as const).map((t) => (
          <button key={t} type="button" className={`ec-pill no-ec${tab === t ? ' active' : ''}`} onClick={() => setTab(t)}>{t}</button>
        ))}
      </div>

      <EcRowCap capped={capped.capped} shown={capped.rows.length} total={capped.total} sums={false}
                hint="검색어로 좁혀 보세요 — 검색은 전부에서 찾습니다." />
      <table ref={tableRef} className="w-full text-left">
        <thead>
          <tr>
            <th className="w-[34px] text-center">
              <input type="checkbox" checked={allPicked} onChange={(e) =>
                setPicked(e.target.checked ? new Set(capped.rows.map((r) => r.id)) : new Set())} />
            </th>
            <th className="text-center">검사번호</th>
            <th>품목</th>
            <th className="text-right">수량</th>
            <th className="text-right">시료</th>
            <th className="text-right">적격</th>
            <th className="text-right">부적격</th>
            <th>출처</th>
            <th className="text-center">종결여부</th>
            <th className="text-center">인쇄</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={10} className="ec-empty">불러오는 중…</td></tr>
          ) : shown.length === 0 ? (
            <tr><td colSpan={10} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
          ) : capped.rows.map((r) => (
            <tr key={r.id}>
              <td className="text-center">
                <input type="checkbox" checked={picked.has(r.id)} onChange={() => setPicked((s) => {
                  const n = new Set(s)
                  if (n.has(r.id)) n.delete(r.id); else n.add(r.id)
                  return n
                })} />
              </td>
              <td className="text-center"><button type="button" className="ec-link" onClick={() => openEdit(r)}>{shortNo(r)}</button></td>
              <td>{itemText(r)}</td>
              <td className="text-right">{qty0(r.totalQuantity)}</td>
              <td className="text-right">{qty2(r.inspectedQty)}</td>
              <td className="text-right">{qty2(r.goodQty)}</td>
              <td className="text-right">{r.defectQty ? qty2(r.defectQty) : ''}</td>
              <td></td>
              <td className="text-center">
                <button type="button" className={`ec-link${r.status === 'COMPLETED' ? ' text-ec-warn' : ''}`}
                        onClick={() => toggleStatus(r)}>{r.statusName}</button>
              </td>
              <td className="text-center"><button type="button" className="ec-link" onClick={() => window.print()}>인쇄</button></td>
            </tr>
          ))}
        </tbody>
      </table>

      <Modal open={open} width={1080} error={formError} onClose={() => setOpen(false)}
             title={editing ? '품질검사수정' : '품질검사입력'}>
        <ul className="ec-form">
          <li><div className="title">일자</div><div className="form">
            {/* 수정 창은 일자를 잠근다 — 번호가 일자를 문다. */}
            <input type="date" className="ec-input w-[150px]" value={f.inspectionDate} disabled={!!editing}
                   onChange={(e) => setF((x) => ({ ...x, inspectionDate: e.target.value }))} />
          </div></li>
          <li><div className="title">담당자</div><div className="form">
            <input className="ec-input w-full" placeholder="담당자" value={f.inspector}
                   onChange={(e) => setF((x) => ({ ...x, inspector: e.target.value }))} />
          </div></li>
        </ul>

        <table className="w-full ec-head700 mt-[8px]">
          <thead><tr>
            <th className="w-[34px]"></th>
            <th className="w-[96px]">검사방법</th>
            <th className="w-[180px]">품목코드</th>
            <th>품목명</th>
            <th className="w-[80px] text-right">수량</th>
            <th className="w-[80px] text-right">시료</th>
            <th className="w-[70px] text-right">적격</th>
            <th className="w-[80px] text-right">부적격</th>
            <th className="w-[100px]">합격여부</th>
            <th className="w-[120px]">부적격관리</th>
          </tr></thead>
          <tbody>
            {lines.map((l, i) => {
              const it = itemById.get(l.itemId)
              const sample = sampleOf(l)
              return (
                <tr key={i}>
                  <td className="text-center">{i + 1}</td>
                  <td>
                    <select className="ec-input w-full" value={l.method} onChange={(e) => setLine(i, { method: e.target.value as Method })}>
                      <option value="FULL">전수</option>
                      <option value="SAMPLING">샘플링</option>
                    </select>
                  </td>
                  <td>
                    <CodePickerField label="품목" hideLabel fill emptyLabel="지우기" placeholder="품목코드" value={l.itemId}
                                     onChange={(v) => setLine(i, { itemId: v })} items={itemPicks} />
                  </td>
                  <td>{it ? it.name : ''}</td>
                  <td><input className="ec-input w-full text-right" value={l.quantity} disabled={!l.itemId}
                             onChange={(e) => setLine(i, { quantity: e.target.value })} /></td>
                  <td><input className="ec-input w-full text-right" disabled={!l.itemId || l.method === 'FULL'}
                             value={l.method === 'FULL' ? (l.quantity || '') : l.sampleQty}
                             onChange={(e) => setLine(i, { sampleQty: e.target.value })} /></td>
                  <td className="text-right">{l.itemId ? qty0(sample - num(l.defectQty)) : ''}</td>
                  <td><input className="ec-input w-full text-right" value={l.defectQty} disabled={!l.itemId}
                             onChange={(e) => setLine(i, { defectQty: e.target.value })} /></td>
                  <td>
                    <select className="ec-input w-full" value={l.passResult} disabled={!l.itemId}
                            onChange={(e) => setLine(i, { passResult: e.target.value as Pass })}>
                      <option value="NA">해당없음</option>
                      <option value="PASS">합격</option>
                      <option value="FAIL">불합격</option>
                    </select>
                  </td>
                  <td>
                    {/* 원본 [부적격관리] 는 불량유형마다 수량을 나눈다 — 우리는 주된 유형 하나를 고른다. */}
                    <select className="ec-input w-full" value={l.defectType} disabled={num(l.defectQty) <= 0}
                            onChange={(e) => setLine(i, { defectType: e.target.value })}>
                      <option value="">(불량유형)</option>
                      {defectTypes.map((d) => <option key={d.id} value={d.code}>{d.name}</option>)}
                    </select>
                  </td>
                </tr>
              )
            })}
          </tbody>
          <tfoot><tr>
            <td colSpan={4}></td>
            <td className="text-right">{qty0(sums.qty)}</td>
            <td className="text-right">{qty0(sums.sample)}</td>
            <td className="text-right">{qty0(sums.good)}</td>
            <td className="text-right">{qty0(sums.defect)}</td>
            <td colSpan={2}></td>
          </tr></tfoot>
        </table>

        <div className="flex gap-[4px] mt-[9px]">
          <button className="ec-btn ec-btn-primary" onClick={save} disabled={saving}>저장(F8)</button>
          {editing
            ? <button className="ec-btn" onClick={() => { if (window.confirm('선택한 전표를 삭제 하겠습니까?')) void removeIds([editing.id]) }}>삭제</button>
            : <button className="ec-btn" onClick={() => setLines(emptyLines())}>다시 작성</button>}
          <button className="ec-btn" onClick={() => setOpen(false)}>닫기</button>
        </div>
      </Modal>
    </EcListShell>
  )
}
