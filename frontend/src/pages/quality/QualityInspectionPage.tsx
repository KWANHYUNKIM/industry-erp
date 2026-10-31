import { useEffect, useRef, useState } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import type { CommonCode, Item, QualityInspection } from '../../types/api'
import EcListShell from '../../components/EcListShell'
import Modal from '../../components/Modal'
import CodePickerField from '../../components/codepicker/CodePickerField'
import EcPeriodPicks, { QUOTATION_PICKS, periodOf } from '../../components/EcPeriodPicks'
import { EcCond } from '../../components/EcStatusPanel'
import { useCondPickers } from '../../utils/useCondPickers'
import { useShortcut } from '../../utils/useShortcut'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import EcRowCap, { capRows } from '../../components/EcRowCap'
import { printDocuments } from '../../utils/printDocument'
import { ecConfirm } from '../../components/EcDialog'
import QualityInspectionForm from '../../features/quality/components/QualityInspectionForm'
import { EcDateRange } from '../../components/ui/EcDateInput'

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

/*
 * 원본 알약(2026-10-04): 전체 · 확인 · 진행중(기본) · 완료. [확인]은 전표상태라 결재 없는 회사에서는 전체와 같다
 * (A/S접수조회 · 수리조회와 같음).
 */
type Tab = '전체' | '확인' | '진행중' | '완료'

/** 원본 [인쇄] — 검사 한 건의 품목 줄(검사방법 · 수량 · 시료 · 적격 · 부적격 · 합격여부). 목록 [인쇄]는 고른 검사를 한 번에. */
async function printInspections(rs: QualityInspection[]) {
  await printDocuments(rs.map((r) => ({
    title: '품질검사서',
    docNo: r.inspectionNo,
    docDate: r.inspectionDate,
    hideAmounts: true,
    hideParties: true,
    supplier: { label: '', name: '' },
    customer: { label: '', name: '' },
    extra: [
      { label: '담당자', value: r.inspector },
      { label: '검사요청', value: r.requestNo },
      { label: '종결여부', value: r.statusName },
    ],
    remark: r.remark,
    lines: r.lines.map((l) => ({
      itemCode: l.itemCode, itemName: l.itemName, spec: l.spec ?? undefined,
      quantity: l.quantity, unitPrice: 0, supplyAmount: 0, vatAmount: 0,
      remark: `${l.methodName} · 시료 ${l.sampleQty} · 적격 ${l.goodQty} · 부적격 ${l.defectQty} · ${l.passResultName}`,
    })),
  })))
}

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
 * [출처] 는 빈칸이다(원본도 [검사요청] 으로 불러온 검사에 빈칸, 2026-10-14) — [확인] 알약(전표 확인 결재)은 아직 없다.
 * 조건 판은 원본 조건 대조표의 것(기준일자 · 품목 · 창고 · 프로젝트)을 그대로 둔다.
 * 입력 폼은 features/quality/components/QualityInspectionForm — 메뉴 [품질검사입력] 은 따로 된 입력 화면(QualityInspectionEntryPage)이고,
 * 여기 [신규(F2)] · 줄 누르기는 같은 폼을 창으로 연다.
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

  const shown = rows
    .filter((r) => tab === '전체' || tab === '확인' || (tab === '진행중' ? r.status === 'IN_PROGRESS' : r.status === 'COMPLETED'))
    .filter((r) => !itemCond || r.lines.some((l) => String(l.itemId) === itemCond))
    .filter((r) => !whCond || String(r.warehouseId) === whCond)
    .filter((r) => !projCond || String(r.projectId) === projCond)
    .filter((r) => !keyword || r.lines.some((l) => l.itemName.includes(keyword)) || r.inspectionNo.includes(keyword))
    .sort((a, b) => (a.inspectionDate < b.inspectionDate ? 1 : a.inspectionDate > b.inspectionDate ? -1 : b.id - a.id))
  /* 그리는 줄만 자른다 — 검사가 수천 줄이면 브라우저가 멈춘다(2026-09-10 실측 2,316줄). 거르는 것은 전부에서. */
  const capped = capRows(shown)
  const tableRef = useRef<HTMLTableElement>(null)
  useTableColumnCheck(tableRef, '품질검사조회', [shown.length])

  function openNew() { setEditing(null); setOpen(true) }
  function openEdit(r: QualityInspection) { setEditing(r); setOpen(true) }
  async function afterChange() { setOpen(false); await load() }
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
  async function removeChecked() {
    const ids = [...picked]
    if (ids.length === 0) return setError('리스트에 선택된 자료가 없습니다.\n체크박스에 체크한 후 다시 시도 바랍니다.')
    if ((await ecConfirm('선택한 전표를 삭제 하겠습니까?'))) void removeIds(ids)
  }
  /** 목록 [진행상태변경] — 고른 검사를 진행중 · 완료로. */
  const [statusOpen, setStatusOpen] = useState(false)
  async function changeStatus(status: 'IN_PROGRESS' | 'COMPLETED') {
    const results = await Promise.allSettled([...picked].map((id) => api.patch(`/quality-inspections/${id}/status`, { status })))
    const failed = results.filter((x) => x.status === 'rejected') as PromiseRejectedResult[]
    setStatusOpen(false)
    setPicked(new Set())
    setError(failed.map((x) => extractErrorMessage(x.reason)).join(' / '))
    await load()
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
        /* 원본 버튼줄: 신규(F2) · Email · 진행상태변경 · 보내기 · 인쇄 · 바코드(품목) · 다른전표생성 · 선택삭제 · Excel · 이력조회. */
        { label: '진행상태변경', onClick: () => setStatusOpen(true), selected: picked.size },
        { label: '인쇄', onClick: () => void printInspections(rows.filter((r) => picked.has(r.id))), disabled: picked.size === 0 },
        { label: '선택삭제', onClick: removeChecked, selected: picked.size },
        { label: 'Excel' },
      ]}
    >
      {error && <p className="ec-alert ec-alert-danger mb-[8px] whitespace-pre-line">{error}</p>}

      <ul className="ec-cond mb-[8px]">
        <EcCond label="기준일자">
          <EcDateRange from={{ className: "ec-input w-[145px]", value: from, onChange: (e) => setFrom(e.target.value) }} to={{ className: "ec-input w-[145px]", value: to, onChange: (e) => setTo(e.target.value) }} />
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
        {(['전체', '확인', '진행중', '완료'] as const).map((t) => (
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
              {/* 원본 [출처] — [검사요청] 으로 불러온 검사도 빈칸이었다(2026-10-14 실측, 26/10/14-1). 무엇을 찍는지는 아직 못 봄. */}
              <td></td>
              <td className="text-center">
                <button type="button" className={`ec-link${r.status === 'COMPLETED' ? ' text-ec-warn' : ''}`}
                        onClick={() => toggleStatus(r)}>{r.statusName}</button>
              </td>
              <td className="text-center"><button type="button" className="ec-link" onClick={() => void printInspections([r])}>인쇄</button></td>
            </tr>
          ))}
        </tbody>
      </table>


      <Modal open={open} width={1080} error={error} onClose={() => setOpen(false)} title={editing ? '품질검사수정' : '품질검사입력'}>
        {open && (
          <QualityInspectionForm editing={editing} items={items} defectTypes={defectTypes}
                                 onSaved={() => void afterChange()} onDeleted={() => void afterChange()}
                                 extraButtons={<button className="ec-btn" onClick={() => setOpen(false)}>닫기</button>} />
        )}
      </Modal>
      <Modal error={error} open={statusOpen} title="진행상태변경" onClose={() => setStatusOpen(false)} width={320}>
        <p className="mb-[8px]">진행상태</p>
        <div className="flex gap-[6px]">
          <button type="button" className="ec-btn" onClick={() => void changeStatus('IN_PROGRESS')}>진행중</button>
          <button type="button" className="ec-btn" onClick={() => void changeStatus('COMPLETED')}>완료</button>
        </div>
      </Modal>
    </EcListShell>
  )
}
