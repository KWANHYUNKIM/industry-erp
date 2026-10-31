import { useMemo, useRef, useState } from 'react'
import CodePickerField from '../../components/CodePickerField'
import GridFindButton from '../../components/GridFindButton'
import { EcWebUploadButton } from '../../components/EcGridToolbar'
import type { useRequired } from '../../utils/useRequired'
import type { Item, Partner, Warehouse } from '../../types/api'
import EcDateInput from '../../components/ui/EcDateInput'
import { todayYmd } from '../../utils/periods'
import { fmtNumber } from '../../utils/format'

/**
 * 재고 II › A/S관리 › A/S접수 › <b>A/S접수입력</b>(E040601) 의 머리 칸 · 품목 격자.
 *
 * <p>메뉴의 입력 화면(AsReceiptEntryPage)과 A/S접수조회의 [신규(F2)] · 수정 창이 같은 칸을 쓴다.
 * 2026-10-13 loginaa 에서 직접 넣어 보고 맞춘 것:
 * <ul>
 *   <li>빈 채로 [저장] 하면 <b>[창고] · 품목코드 칸</b>만 빨갛다 — <b>[거래처]는 비워도 저장된다</b>.</li>
 *   <li>품목을 고르면 [수량]은 <b>빈칸</b>이다. 빈칸 · 0 이면 수량 칸이 빨갛고, <b>-1 은 그대로 저장</b>된다(합계줄 -1).</li>
 *   <li>[접수진행상태]는 새 접수에서도 고른다(기본 000 접수). 수정 창은 일자만 잠근다.</li>
 * </ul>
 */

export type AsStatus = 'RECEIVED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELED'
/* 원본 접수진행상태 — 000 접수 · 200 수리중 · 300 완료. [취소]는 우리 것이다. */
export const AS_STAGE_LABEL: Record<AsStatus, string> = { RECEIVED: '접수', IN_PROGRESS: '수리중', COMPLETED: '완료', CANCELED: '취소' }
export const AS_STAGES: AsStatus[] = ['RECEIVED', 'IN_PROGRESS', 'COMPLETED', 'CANCELED']

export interface AsReceiptDraft {
  receiptDate: string; partnerId: string; charge: string; warehouseId: string; status: AsStatus
  scheduledDate: string; projectId: string; title: string; symptom: string
  /** 원본 머리 [새로운 항목 추가] 한 줄 글(자리표시 '다양한 내역을 입력해보세요'). */
  extraNote: string
}
/** note = 원본 격자 [새로운 항목 추가] 열의 줄 적요('설치기사 부주의로 인한 반품', 2026-10-29 실측). */
export type AsFormLine = { itemId: string; quantity: string; note: string }
export const emptyAsLine = (): AsFormLine => ({ itemId: '', quantity: '', note: '' })

export const emptyAsLines = (): AsFormLine[] => [emptyAsLine(), emptyAsLine(), emptyAsLine()]
/** 원본은 저장 뒤 새 창에 [창고]를 그대로 남긴다 — 같은 창고로 잇달아 받는다. */
export const blankAsDraft = (warehouseId = ''): AsReceiptDraft => ({
  receiptDate: todayYmd(), partnerId: '', charge: '', warehouseId, status: 'RECEIVED',
  scheduledDate: todayYmd(), projectId: '', title: '', symptom: '', extraNote: '',
})

const qtyOk = (s: string) => s.trim() !== '' && Number.isFinite(Number(s)) && Number(s) !== 0

/** 필수칸 { 키: 채워졌나 } — useRequired.check 에 넘긴다. 빈 칸 [창고] · 품목코드 칸(· 고른 품목의 수량)을 한꺼번에 빨갛게 한다(원본, 글 없이 테두리만). */
export function asReceiptCheck(f: AsReceiptDraft, lines: AsFormLine[]): Record<string, boolean> {
  const r: Record<string, boolean> = { warehouse: !!f.warehouseId, item0: lines.some((l) => l.itemId) }
  lines.forEach((l, i) => { if (l.itemId) r[`qty${i}`] = qtyOk(l.quantity) })
  return r
}

/** 저장할 몸통. 원본처럼 빨간 칸이 될 자리를 문구로 알린다(원본은 글 없이 테두리만 빨갛다). */
export function asReceiptBody(f: AsReceiptDraft, lines: AsFormLine[]): { error: string } | { body: Record<string, unknown> } {
  const filled = lines.filter((l) => l.itemId)
  if (!f.warehouseId) return { error: '창고를 선택하세요.' }
  if (filled.length === 0) return { error: '품목을 1개 이상 입력하세요.' }
  if (filled.some((l) => !qtyOk(l.quantity))) return { error: '수량을 입력하세요.' }
  return {
    body: {
      partnerId: f.partnerId ? Number(f.partnerId) : undefined,
      warehouseId: Number(f.warehouseId),
      projectId: f.projectId ? Number(f.projectId) : undefined,
      title: f.title, scheduledDate: f.scheduledDate || undefined, symptom: f.symptom, charge: f.charge,
      status: f.status, extraNote: f.extraNote,
      lines: filled.map((l) => ({ itemId: Number(l.itemId), quantity: Number(l.quantity), note: l.note })),
    },
  }
}

export default function AsReceiptScreen({
  f, setF, lines, setLines, editing, partners, warehouses, projects, items, req,
}: {
  f: AsReceiptDraft
  setF: (fn: (x: AsReceiptDraft) => AsReceiptDraft) => void
  lines: AsFormLine[]
  setLines: (fn: (x: AsFormLine[]) => AsFormLine[]) => void
  editing: boolean
  partners: Partner[]
  warehouses: Warehouse[]
  projects: { id: number; code: string; name: string }[]
  items: Item[]
  /** 빈 필수칸 표시 — 원본처럼 그 칸에 빨간 테두리를 친다. */
  req: ReturnType<typeof useRequired>
}) {
  const setFv = (k: keyof AsReceiptDraft, v: string) => setF((x) => ({ ...x, [k]: v }))
  const customers = useMemo(() => partners.filter((p) => p.type === 'CUSTOMER' || p.type === 'BOTH'), [partners])
  const itemPicks = useMemo(() => items.map((x) => ({ value: String(x.id), code: x.code, name: x.name, sub: x.spec })), [items])
  const itemById = useMemo(() => new Map(items.map((x) => [String(x.id), x])), [items])
  const setLine = (i: number, patch: Partial<AsFormLine>) => setLines((ls) => {
    const n = ls.map((l, k) => (k === i ? { ...l, ...patch } : l))
    /* 마지막 줄을 채우면 빈 줄을 하나 더 단다(원본 격자처럼). */
    if (n[n.length - 1].itemId) n.push(emptyAsLine())
    return n
  })
  const tableRef = useRef<HTMLTableElement>(null)
  const [picked, setPicked] = useState<ReadonlySet<number>>(() => new Set())
  const toggle = (i: number) => setPicked((p) => { const n = new Set(p); if (!n.delete(i)) n.add(i); return n })
  const removePicked = () => {
    setLines((ls) => { const n = ls.filter((_, i) => !picked.has(i)); return n.length ? n : emptyAsLines() })
    setPicked(new Set())
  }
  const totalQty = lines.filter((l) => l.itemId).reduce((a, l) => a + (Number(l.quantity) || 0), 0)

  return (
    <>
      <ul className="ec-form">
        <li><div className="title">일자</div><div className="form">
          {/* 원본 수정 창은 일자를 잠근다. */}
          <EcDateInput className="ec-input w-[150px]" value={f.receiptDate} disabled={editing} onChange={(e) => setFv('receiptDate', e.target.value)} />
        </div></li>
        <li><div className="title">거래처</div><div className="form">
          <CodePickerField label="거래처" hideLabel fill emptyLabel="" placeholder="거래처" value={f.partnerId}
                           onChange={(v) => setFv('partnerId', v)}
                           items={customers.map((x) => ({ value: String(x.id), code: x.code, name: x.name }))} />
        </div></li>
        <li><div className="title">담당자</div><div className="form">
          <input className="ec-input w-full" placeholder="담당자" value={f.charge} onChange={(e) => setFv('charge', e.target.value)} />
        </div></li>
        <li><div className="title">창고</div><div className={`form ${req.cls('warehouse', !!f.warehouseId)}`}>
          <CodePickerField label="창고" hideLabel fill emptyLabel="" placeholder="창고" value={f.warehouseId}
                           onChange={(v) => setFv('warehouseId', v)}
                           items={warehouses.map((x) => ({ value: String(x.id), code: x.code, name: x.name }))} />
        </div></li>
        <li><div className="title">접수진행상태</div><div className="form">
          <select className="ec-input w-[150px]" value={f.status} aria-label="접수진행상태"
                  onChange={(e) => setFv('status', e.target.value)}>
            {AS_STAGES.map((s) => <option key={s} value={s}>{AS_STAGE_LABEL[s]}</option>)}
          </select>
        </div></li>
        <li><div className="title">수리예정일자</div><div className="form">
          <EcDateInput className="ec-input w-[150px]" value={f.scheduledDate} onChange={(e) => setFv('scheduledDate', e.target.value)} />
        </div></li>
        <li><div className="title">프로젝트</div><div className="form">
          <CodePickerField label="프로젝트" hideLabel fill emptyLabel="선택 안 함" placeholder="프로젝트" value={f.projectId}
                           onChange={(v) => setFv('projectId', v)}
                           items={projects.map((x) => ({ value: String(x.id), code: x.code, name: x.name }))} />
        </div></li>
        <li className="wide"><div className="title">제목</div><div className="form">
          <input className="ec-input w-full" placeholder="제목" value={f.title} onChange={(e) => setFv('title', e.target.value)} />
        </div></li>
        <li className="wide"><div className="title">접수내용</div><div className="form">
          <textarea className="ec-input w-full h-[52px]" placeholder="접수내용" value={f.symptom} onChange={(e) => setFv('symptom', e.target.value)} />
        </div></li>
        <li className="wide"><div className="title">새로운 항목 추가</div><div className="form">
          <input className="ec-input w-full" aria-label="새로운 항목 추가" placeholder="다양한 내역을 입력해보세요" maxLength={200}
                 value={f.extraNote} onChange={(e) => setFv('extraNote', e.target.value)} />
        </div></li>
      </ul>

      {/* 원본 격자 위 도구줄 차례(2026-10-13 loginaa 실측, plans 재고2:44): 찾기 · 정렬 · 거래내역보기 · My품목 · 판매 · 연결전표 · 바코드 · 검증 · 전표불러오기.
          바깥 연동 · 전표 쪽은 모양만 둔다(눌러도 아무 일 없음). 단추 이름은 이 파일에 글자로 적는다(버튼 검사). */}
      <div className="ec-toolbar mt-[8px] mb-[4px]">
        <GridFindButton tableRef={tableRef} />
        <button type="button" className="ec-btn ec-btn-sm">정렬</button>
        <button type="button" className="ec-btn ec-btn-sm">거래내역보기(A/S접수)</button>
        <button type="button" className="ec-btn ec-btn-sm">My품목</button>
        <button type="button" className="ec-btn ec-btn-sm">판매</button>
        <button type="button" className="ec-btn ec-btn-sm">연결전표</button>
        <button type="button" className="ec-btn ec-btn-sm">바코드</button>
        <button type="button" className="ec-btn ec-btn-sm">전표 바코드</button>
        <button type="button" className="ec-btn ec-btn-sm">검증</button>
        <button type="button" className="ec-btn ec-btn-sm">전표불러오기</button>
        <button type="button" className="ec-btn ec-btn-sm" disabled={picked.size === 0} onClick={removePicked}>선택삭제</button>
      </div>
      <table ref={tableRef} className="w-full ec-head700">
        <thead><tr>
          <th className="w-[34px]">
            <input type="checkbox" aria-label="전체선택" checked={lines.length > 0 && picked.size === lines.length}
                   onChange={(e) => setPicked(e.target.checked ? new Set(lines.map((_, i) => i)) : new Set())} />
          </th>
          <th className="w-[200px]">품목코드</th>
          <th>품목명</th>
          <th className="w-[120px] text-right">수량</th>
          <th className="w-[220px]">새로운 항목 추가</th>
        </tr></thead>
        <tbody>
          {lines.map((l, i) => {
            const it = itemById.get(l.itemId)
            return (
              <tr key={i}>
                <td className="text-center"><input type="checkbox" aria-label={`선택${i + 1}`} checked={picked.has(i)} onChange={() => toggle(i)} /></td>
                <td className={i === 0 ? req.cls('item0', lines.some((x) => x.itemId)) : ''}>
                  {/* 원본은 품목을 골라도 수량을 비워 둔다 — 사람이 넣어야 저장된다. */}
                  {/* 원본: 고른 뒤 칸에는 코드(G001), 이름은 [품목명] 열 */}
                  <CodePickerField label="품목" hideLabel fill showCode emptyLabel="지우기" placeholder="품목코드" value={l.itemId}
                                   onChange={(v) => setLine(i, { itemId: v })} items={itemPicks} />
                </td>
                <td>{it ? `${it.name}${it.spec ? ` [${it.spec}]` : ''}` : ''}</td>
                <td className={req.cls(`qty${i}`, qtyOk(l.quantity))}>
                  <input className="ec-input w-full text-right" value={l.quantity} disabled={!l.itemId} aria-label={`수량${i + 1}`}
                         onChange={(e) => setLine(i, { quantity: e.target.value })} />
                </td>
                <td>
                  <input className="ec-input w-full" aria-label={`새로운 항목 추가${i + 1}`} maxLength={200} value={l.note}
                         disabled={!l.itemId} onChange={(e) => setLine(i, { note: e.target.value })} />
                </td>
              </tr>
            )
          })}
        </tbody>
        <tfoot><tr><td colSpan={3}></td><td className="text-right">{fmtNumber(totalQty)}</td><td></td></tr></tfoot>
      </table>
      <EcWebUploadButton />
    </>
  )
}
