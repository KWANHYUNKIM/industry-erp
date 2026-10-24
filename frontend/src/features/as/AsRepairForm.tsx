import { useRef } from 'react'
import GridFindButton from '../../components/GridFindButton'
import CodePickerField from '../../components/CodePickerField'
import { EcWebUploadButton } from '../../components/EcGridToolbar'
import { ymd } from '../../components/EcPeriodPicks'
import type { useRequired } from '../../utils/useRequired'
import type { Item, Partner, Warehouse } from '../../types/api'

/**
 * 재고 II › A/S관리 › A/S수리 › <b>A/S수리입력</b>(E040605) 의 머리 칸 · 품목 격자.
 *
 * <p>메뉴의 입력 화면(AsRepairEntryPage)과 A/S수리조회의 [신규(F2)] · 수정 창이 같은 칸을 쓴다.
 * 2026-10-13 loginaa 에서 직접 넣어 보고 맞춘 것:
 * <ul>
 *   <li>빈 채로 [저장] 하면 <b>[담당자] · [창고] · [수리유형] · 품목코드 칸</b>이 빨갛다 — <b>[거래처]는 비워도 저장된다</b>.</li>
 *   <li>[A/S접수] 로 접수를 불러오면 접수의 거래처(없으면 빈 채로) · 창고 · 제목 · 접수내용 → 수리내용 · 품목 줄이 들어온다.</li>
 *   <li>저장하면 빈 입력으로 돌아가고 [담당자] · [창고]만 남는다. 수리 저장은 재고를 움직이지 않는다
 *       (부품은 수리조회 [생성한 전표] → 판매연결전표의 판매가 뺀다).</li>
 * </ul>
 */

export type RepairType = 'FREE_EXCHANGE' | 'FREE_REPAIR' | 'PAID_EXCHANGE' | 'PAID_REPAIR' | 'RETURN'
/* 원본 [수리유형] 코드도움 — 01 무상교환 · 02 무상수리 · 05 유상교환 · 06 유상수리 · 11 반품. */
export const REPAIR_TYPES: { value: RepairType; code: string; name: string }[] = [
  { value: 'FREE_EXCHANGE', code: '01', name: '무상교환' }, { value: 'FREE_REPAIR', code: '02', name: '무상수리' },
  { value: 'PAID_EXCHANGE', code: '05', name: '유상교환' }, { value: 'PAID_REPAIR', code: '06', name: '유상수리' },
  { value: 'RETURN', code: '11', name: '반품' },
]
export type RepairStatus = 'IN_PROGRESS' | 'COMPLETED'

export interface AsRepairDraft {
  repairDate: string; partnerId: string; charge: string; warehouseId: string; asRequestId: string
  repairType: RepairType | ''; title: string; content: string; status: RepairStatus
}
export type RepairFormLine = { itemId: string; quantity: string }
/** 불러올 접수 — /api/as-requests 응답에서 쓰는 것만. */
export interface AsReqPick {
  id: number; asNo: string; receiptDate: string; partnerId: number | null; partnerName: string | null
  title: string | null; symptom: string | null; warehouseId: number | null; lines: { itemId: number; quantity: number }[]
}

export const blankRepairLines = (): RepairFormLine[] => [{ itemId: '', quantity: '' }, { itemId: '', quantity: '' }, { itemId: '', quantity: '' }]
/** 새 수리 — 원본은 저장 뒤 [담당자] · [창고]를 남긴다. */
export const blankRepairDraft = (keep?: Pick<AsRepairDraft, 'charge' | 'warehouseId'>): AsRepairDraft => ({
  repairDate: ymd(new Date()), partnerId: '', charge: keep?.charge ?? '', warehouseId: keep?.warehouseId ?? '', asRequestId: '',
  repairType: '', title: '', content: '', status: 'IN_PROGRESS',
})

const yy = (d: string | null) => (d ? `${d.slice(2, 4)}/${d.slice(5, 7)}/${d.slice(8, 10)}` : '')
export const repairDateNo = (date: string, no: string | null) => {
  const seq = (no ?? '').split('-').pop() ?? ''
  return `${yy(date)}-${Number(seq) || seq}`
}

/** 필수칸 { 키: 채워졌나 } — 담당자 · 창고 · 수리유형 · 품목코드 칸을 한꺼번에 빨갛게(원본, 글 없이 테두리만). */
export function asRepairCheck(f: AsRepairDraft, lines: RepairFormLine[]): Record<string, boolean> {
  return { charge: !!f.charge.trim(), warehouse: !!f.warehouseId, type: !!f.repairType, item0: lines.some((l) => l.itemId) }
}

/** 원본이 빨갛게 막는 차례 그대로 — 담당자 · 창고 · 수리유형 · 품목. 거래처는 막지 않는다. */
export function asRepairBody(f: AsRepairDraft, lines: RepairFormLine[]): { error: string } | { body: Record<string, unknown> } {
  const filled = lines.filter((l) => l.itemId)
  if (!f.charge.trim()) return { error: '담당자를 입력하세요.' }
  if (!f.warehouseId) return { error: '창고를 선택하세요.' }
  if (!f.repairType) return { error: '수리유형을 선택하세요.' }
  if (filled.length === 0) return { error: '품목을 1개 이상 입력하세요.' }
  return {
    body: {
      repairDate: f.repairDate, partnerId: f.partnerId ? Number(f.partnerId) : null, charge: f.charge, warehouseId: Number(f.warehouseId),
      asRequestId: f.asRequestId ? Number(f.asRequestId) : null, repairType: f.repairType,
      title: f.title, content: f.content, status: f.status,
      lines: filled.map((l) => ({ itemId: Number(l.itemId), quantity: Number(l.quantity) || 1 })),
    },
  }
}

/** 원본 줄 도구 [A/S접수] — 접수의 거래처(없으면 빈 채로) · 창고 · 제목 · 접수내용 · 품목 줄을 불러온다. */
export function pullAsRequest(f: AsRepairDraft, a: AsReqPick): { f: AsRepairDraft; lines: RepairFormLine[] } {
  return {
    f: { ...f, asRequestId: String(a.id), partnerId: a.partnerId ? String(a.partnerId) : '',
      warehouseId: a.warehouseId ? String(a.warehouseId) : f.warehouseId, title: a.title ?? '', content: a.symptom ?? '' },
    lines: [...a.lines.map((l) => ({ itemId: String(l.itemId), quantity: String(l.quantity) })), { itemId: '', quantity: '' }],
  }
}

const won = (n: number) => Math.round(Number(n)).toLocaleString('ko-KR')

export default function AsRepairScreen({ f, setF, lines, setLines, editing, saleAmount = 0, partners, warehouses, items, asReqs, req }: {
  f: AsRepairDraft; setF: (fn: (x: AsRepairDraft) => AsRepairDraft) => void
  lines: RepairFormLine[]; setLines: (fn: (x: RepairFormLine[]) => RepairFormLine[]) => void
  editing: boolean; saleAmount?: number
  partners: Partner[]; warehouses: Warehouse[]; items: Item[]; asReqs: AsReqPick[]
  req: ReturnType<typeof useRequired>
}) {
  const setFv = (k: keyof AsRepairDraft, v: string) => setF((x) => ({ ...x, [k]: v }))
  const itemPicks = items.map((x) => ({ value: String(x.id), code: x.code, name: x.name, sub: x.spec }))
  const itemById = new Map(items.map((x) => [String(x.id), x]))
  const setLine = (i: number, patch: Partial<RepairFormLine>) => setLines((ls) => {
    const n = ls.map((l, k) => (k === i ? { ...l, ...patch } : l))
    if (n[n.length - 1].itemId) n.push({ itemId: '', quantity: '' })
    return n
  })
  function pull(id: string) {
    const a = asReqs.find((x) => String(x.id) === id)
    if (!a) return setFv('asRequestId', id)
    const r = pullAsRequest(f, a)
    setF(() => r.f); setLines(() => r.lines)
  }
  const filled = lines.filter((l) => l.itemId)
  const tableRef = useRef<HTMLTableElement>(null)
  return (<>
    <ul className="ec-form">
      <li><div className="title">일자</div><div className="form">
        <input type="date" className="ec-input w-[150px]" value={f.repairDate} disabled={editing} onChange={(e) => setFv('repairDate', e.target.value)} />
      </div></li>
      <li><div className="title">거래처</div><div className="form">
        <CodePickerField label="거래처" hideLabel fill emptyLabel="" placeholder="거래처" value={f.partnerId} onChange={(v) => setFv('partnerId', v)}
                         items={partners.map((x) => ({ value: String(x.id), code: x.code, name: x.name }))} />
      </div></li>
      <li><div className="title">담당자</div><div className={`form ${req.cls('charge', !!f.charge.trim())}`}>
        <input className="ec-input w-full" placeholder="담당자" value={f.charge} onChange={(e) => setFv('charge', e.target.value)} />
      </div></li>
      <li><div className="title">창고</div><div className={`form ${req.cls('warehouse', !!f.warehouseId)}`}>
        <CodePickerField label="창고" hideLabel fill emptyLabel="" placeholder="창고" value={f.warehouseId} onChange={(v) => setFv('warehouseId', v)}
                         items={warehouses.map((x) => ({ value: String(x.id), code: x.code, name: x.name }))} />
      </div></li>
      <li><div className="title">접수일자</div><div className="form">
        <CodePickerField label="A/S접수" hideLabel fill emptyLabel="선택 안 함" placeholder="A/S접수" value={f.asRequestId} onChange={pull}
                         items={asReqs.map((a) => ({ value: String(a.id), code: repairDateNo(a.receiptDate, a.asNo), name: `${a.partnerName ?? ''} ${a.title ?? ''}`.trim() }))} />
      </div></li>
      <li><div className="title">수리유형</div><div className={`form ${req.cls('type', !!f.repairType)}`}>
        <CodePickerField label="수리유형" hideLabel fill emptyLabel="" placeholder="수리유형" value={f.repairType} onChange={(v) => setFv('repairType', v)}
                         items={REPAIR_TYPES.map((t) => ({ value: t.value, code: t.code, name: t.name }))} />
      </div></li>
      <li className="wide"><div className="title">제목</div><div className="form">
        <input className="ec-input w-full" placeholder="제목" value={f.title} onChange={(e) => setFv('title', e.target.value)} />
      </div></li>
      <li className="wide"><div className="title">소모(판매)금액</div><div className="form">{won(saleAmount)}</div></li>
      <li className="wide"><div className="title">수리내용</div><div className="form">
        <textarea className="ec-input w-full h-[52px]" placeholder="수리내용" value={f.content} onChange={(e) => setFv('content', e.target.value)} />
      </div></li>
      <li><div className="title">수리진행상태</div><div className="form">
        <select className="ec-input w-[150px]" value={f.status} onChange={(e) => setFv('status', e.target.value)}>
          <option value="IN_PROGRESS">진행중</option><option value="COMPLETED">완료</option>
        </select>
      </div></li>
    </ul>
    {/* 원본 격자 위 도구줄(2026-10-21 실측): 찾기(F3) · 정렬 · 거래내역보기(A/S수리) · My품목 · A/S접수 · 연결전표 · 바코드 · 검증 · 전표불러오기 — 모양만. */}
    <div className="ec-toolbar mt-[8px] mb-[4px]">
      <GridFindButton tableRef={tableRef} />
      <button type="button" className="ec-btn ec-btn-sm">정렬</button>
      <button type="button" className="ec-btn ec-btn-sm">거래내역보기(A/S수리)</button>
      <button type="button" className="ec-btn ec-btn-sm">My품목</button>
      <button type="button" className="ec-btn ec-btn-sm">A/S접수</button>
      <button type="button" className="ec-btn ec-btn-sm">연결전표</button>
      <button type="button" className="ec-btn ec-btn-sm">바코드</button>
      <button type="button" className="ec-btn ec-btn-sm">검증</button>
      <button type="button" className="ec-btn ec-btn-sm">전표불러오기</button>
    </div>
    <table ref={tableRef} className="w-full ec-head700">
      <thead><tr><th className="w-[34px]"></th><th className="w-[200px]">품목코드</th><th>품목명</th><th className="w-[160px]">규격</th><th className="w-[110px] text-right">수량</th><th className="w-[110px]">새로운 항목 추가</th></tr></thead>
      <tbody>
        {lines.map((l, i) => {
          const it = itemById.get(l.itemId)
          return (
            <tr key={i}>
              <td className="text-center">{i + 1}</td>
              <td className={i === 0 ? req.cls('item0', filled.length > 0) : ''}><CodePickerField label="품목" hideLabel fill emptyLabel="지우기" placeholder="품목코드" value={l.itemId}
                                   onChange={(v) => setLine(i, { itemId: v, quantity: l.quantity || (v ? '1' : '') })} items={itemPicks} /></td>
              <td>{it?.name ?? ''}</td>
              <td>{it?.spec ?? ''}</td>
              <td><input className="ec-input w-full text-right" value={l.quantity} disabled={!l.itemId} onChange={(e) => setLine(i, { quantity: e.target.value })} /></td>
              <td></td>
            </tr>
          )
        })}
      </tbody>
      <tfoot><tr><td colSpan={4}></td><td className="text-right">{won(filled.reduce((a, l) => a + (Number(l.quantity) || 0), 0))}</td><td></td></tr></tfoot>
    </table>
    <EcWebUploadButton />
  </>)
}
