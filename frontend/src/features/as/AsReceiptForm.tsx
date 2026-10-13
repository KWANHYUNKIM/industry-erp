import { useMemo } from 'react'
import CodePickerField from '../../components/CodePickerField'
import { ymd } from '../../components/EcPeriodPicks'
import type { Item, Partner, Warehouse } from '../../types/api'

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
}
export type AsFormLine = { itemId: string; quantity: string }

const today = () => ymd(new Date())
export const emptyAsLines = (): AsFormLine[] => [{ itemId: '', quantity: '' }, { itemId: '', quantity: '' }, { itemId: '', quantity: '' }]
/** 원본은 저장 뒤 새 창에 [창고]를 그대로 남긴다 — 같은 창고로 잇달아 받는다. */
export const blankAsDraft = (warehouseId = ''): AsReceiptDraft => ({
  receiptDate: today(), partnerId: '', charge: '', warehouseId, status: 'RECEIVED',
  scheduledDate: today(), projectId: '', title: '', symptom: '',
})

const won = (n: number) => n.toLocaleString('ko-KR')
const qtyOk = (s: string) => s.trim() !== '' && Number.isFinite(Number(s)) && Number(s) !== 0

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
      status: f.status,
      lines: filled.map((l) => ({ itemId: Number(l.itemId), quantity: Number(l.quantity) })),
    },
  }
}

export default function AsReceiptScreen({
  f, setF, lines, setLines, editing, partners, warehouses, projects, items, invalid,
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
  /** 마지막 [저장]이 막힌 까닭 — 원본처럼 그 칸에 빨간 테두리를 친다. */
  invalid?: string
}) {
  const setFv = (k: keyof AsReceiptDraft, v: string) => setF((x) => ({ ...x, [k]: v }))
  const customers = useMemo(() => partners.filter((p) => p.type === 'CUSTOMER' || p.type === 'BOTH'), [partners])
  const itemPicks = useMemo(() => items.map((x) => ({ value: String(x.id), code: x.code, name: x.name, sub: x.spec })), [items])
  const itemById = useMemo(() => new Map(items.map((x) => [String(x.id), x])), [items])
  const setLine = (i: number, patch: Partial<AsFormLine>) => setLines((ls) => {
    const n = ls.map((l, k) => (k === i ? { ...l, ...patch } : l))
    /* 마지막 줄을 채우면 빈 줄을 하나 더 단다(원본 격자처럼). */
    if (n[n.length - 1].itemId) n.push({ itemId: '', quantity: '' })
    return n
  })
  const totalQty = lines.filter((l) => l.itemId).reduce((a, l) => a + (Number(l.quantity) || 0), 0)
  const RED = 'outline outline-1 outline-ec-danger rounded-ec'
  const bad = (k: string) => (invalid === k ? RED : '')

  return (
    <>
      <ul className="ec-form">
        <li><div className="title">일자</div><div className="form">
          {/* 원본 수정 창은 일자를 잠근다. */}
          <input type="date" className="ec-input w-[150px]" value={f.receiptDate} disabled={editing}
                 onChange={(e) => setFv('receiptDate', e.target.value)} />
        </div></li>
        <li><div className="title">거래처</div><div className="form">
          <CodePickerField label="거래처" hideLabel fill emptyLabel="" placeholder="거래처" value={f.partnerId}
                           onChange={(v) => setFv('partnerId', v)}
                           items={customers.map((x) => ({ value: String(x.id), code: x.code, name: x.name }))} />
        </div></li>
        <li><div className="title">담당자</div><div className="form">
          <input className="ec-input w-full" placeholder="담당자" value={f.charge} onChange={(e) => setFv('charge', e.target.value)} />
        </div></li>
        <li><div className="title">창고</div><div className={`form ${bad('창고를 선택하세요.')}`}>
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
          <input type="date" className="ec-input w-[150px]" value={f.scheduledDate} onChange={(e) => setFv('scheduledDate', e.target.value)} />
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
      </ul>

      <table className="w-full ec-head700 mt-[8px]">
        <thead><tr>
          <th className="w-[34px]"></th>
          <th className="w-[200px]">품목코드</th>
          <th>품목명</th>
          <th className="w-[120px] text-right">수량</th>
        </tr></thead>
        <tbody>
          {lines.map((l, i) => {
            const it = itemById.get(l.itemId)
            const qtyBad = invalid === '수량을 입력하세요.' && !!l.itemId && !qtyOk(l.quantity)
            return (
              <tr key={i}>
                <td className="text-center">{i + 1}</td>
                <td className={i === 0 ? bad('품목을 1개 이상 입력하세요.') : ''}>
                  {/* 원본은 품목을 골라도 수량을 비워 둔다 — 사람이 넣어야 저장된다. */}
                  <CodePickerField label="품목" hideLabel fill emptyLabel="지우기" placeholder="품목코드" value={l.itemId}
                                   onChange={(v) => setLine(i, { itemId: v })} items={itemPicks} />
                </td>
                <td>{it ? `${it.name}${it.spec ? ` [${it.spec}]` : ''}` : ''}</td>
                <td className={qtyBad ? RED : ''}>
                  <input className="ec-input w-full text-right" value={l.quantity} disabled={!l.itemId} aria-label={`수량${i + 1}`}
                         onChange={(e) => setLine(i, { quantity: e.target.value })} />
                </td>
              </tr>
            )
          })}
        </tbody>
        <tfoot><tr><td colSpan={3}></td><td className="text-right">{won(totalQty)}</td></tr></tfoot>
      </table>
    </>
  )
}
