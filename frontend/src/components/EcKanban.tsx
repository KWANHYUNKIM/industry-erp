import { useState, type ReactNode } from 'react'
import LabelChip from '../features/board/components/LabelChip'

/**
 * 원본 칸반 판(table.table-kanban — 2026-10-14 loginaa 실측).
 * - 🔸 칸반보드 활용 예시 🔸 (E200190): 게시판 목록이 이 판이다. 열 = 진행상태, 줄 하나.
 * - 📅 프로젝트 진행현황 칸반 (E200072): 글 View 본문이 이 판이다. 열 = 간판제작 [프로젝트], 줄 = 진행상태(lanes).
 *
 * 열 머리 = 이름(굵게) + 회색 동그라미 건수 + 열 전체 고르기 체크칸. 카드 = [라벨 칩] 제목 [답글 수] N / 아랫줄 + 오른쪽 위 체크칸.
 * 카드 색은 그 열(진행상태)의 색이다. 카드를 다른 칸으로 끌어 놓으면 onMove — 원본 '칸반 항목을 드래그하여 진행상태 변경이 가능합니다.'
 */
export type KanbanTone = 'pink' | 'yellow' | 'plain'
export type KanbanColumn = { key: string; name: string; tone?: KanbanTone; closed?: boolean }
export type KanbanLane = { key: string; name: string; tone?: KanbanTone }
export type KanbanCard = {
  id: number
  col: string
  /** 줄(lanes) 이 있는 판에서 이 카드의 줄. */
  lane?: string
  title: string
  chips?: { name: string; color?: string | null }[]
  /** 답글 수 — 있을 때만 '[n]'. */
  replies?: number
  /** 빨간 N(새 글). */
  isNew?: boolean
  /** 제목 굵게(공지글). */
  bold?: boolean
  /** 아랫줄(담당자 …). 없으면 줄을 그리지 않는다. */
  sub?: ReactNode
}

export default function EcKanban({
  columns, lanes, cards, selected, onToggle, onOpen, onMove, hideSub = false,
}: {
  columns: KanbanColumn[]
  lanes?: KanbanLane[]
  cards: KanbanCard[]
  selected: Set<number>
  /** ids 를 모두 켜거나(on) 끈다. 카드 체크칸 · 열 체크칸이 같이 쓴다. */
  onToggle: (ids: number[], on: boolean) => void
  onOpen: (card: KanbanCard) => void
  onMove?: (card: KanbanCard, col: string, lane?: string) => void
  /** 원본 [카드접기] — 아랫줄을 접는다. */
  hideSub?: boolean
}) {
  const [dragId, setDragId] = useState<number | null>(null)
  const [over, setOver] = useState<string | null>(null)
  const rows = lanes ?? [{ key: '', name: '' }]
  const inCol = (c: string) => cards.filter((x) => x.col === c)

  const cell = (col: KanbanColumn, lane: KanbanLane) => {
    const here = cards.filter((x) => x.col === col.key && (!lanes || x.lane === lane.key))
    const tone = lane.tone ?? col.tone ?? 'plain'
    const id = `${col.key}\u0000${lane.key}`
    return (
      <td key={col.key} className={over === id ? 'drop-over' : ''}
          onDragOver={(e) => { if (onMove && dragId != null) { e.preventDefault(); setOver(id) } }}
          onDragLeave={() => setOver((o) => (o === id ? null : o))}
          onDrop={(e) => {
            e.preventDefault()
            setOver(null)
            const card = cards.find((x) => x.id === dragId)
            setDragId(null)
            if (card && onMove && (card.col !== col.key || (lanes && card.lane !== lane.key))) onMove(card, col.key, lanes ? lane.key : undefined)
          }}>
        {here.map((c) => (
          <div key={c.id} data-card={c.id}
               className={`ec-kanban-card tone-${tone}${col.closed ? ' closed' : ''}${dragId === c.id ? ' dragging' : ''}`}
               draggable={!!onMove}
               onDragStart={(e) => { setDragId(c.id); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(c.id)) }}
               onDragEnd={() => { setDragId(null); setOver(null) }}>
            <div className="ec-kanban-line">
              {(c.chips ?? []).map((l) => <LabelChip key={l.name} name={l.name} color={l.color} className="mr-[4.5px]" />)}
              <button type="button" className={`ec-kanban-title no-ec${c.bold ? ' bold' : ''}`} onClick={() => onOpen(c)}>{c.title}</button>
              {!!c.replies && <span className="ec-kanban-reply">[{c.replies}]</span>}
              {c.isNew && <span className="ec-kanban-new">N</span>}
            </div>
            {!hideSub && c.sub != null && c.sub !== '' && <div className="ec-kanban-line">{c.sub}</div>}
            <span className="ec-kanban-option">
              <input type="checkbox" aria-label={`${c.title} 선택`} checked={selected.has(c.id)}
                     onChange={(e) => onToggle([c.id], e.target.checked)} />
            </span>
          </div>
        ))}
      </td>
    )
  }

  return (
    <table className="ec-kanban no-ec">
      <thead>
        <tr>
          {lanes && <th className="lane" />}
          {columns.map((col) => {
            const ids = inCol(col.key).map((x) => x.id)
            return (
              <th key={col.key}>
                <div className="ec-kanban-head">
                  <span className="name">{col.name}</span>
                  <span className="ec-kanban-count">{ids.length}</span>
                  <input type="checkbox" aria-label={`${col.name} 전체 선택`}
                         checked={ids.length > 0 && ids.every((x) => selected.has(x))}
                         onChange={(e) => onToggle(ids, e.target.checked)} />
                </div>
              </th>
            )
          })}
        </tr>
      </thead>
      <tbody>
        {rows.map((lane) => (
          <tr key={lane.key}>
            {lanes && <td className="lane">{lane.name}</td>}
            {columns.map((col) => cell(col, lane))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}
