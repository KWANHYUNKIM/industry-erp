import { useEffect, useMemo, useRef, useState } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import Modal from '../../components/Modal'

export interface OrderAccount { id: number; code: string; name: string; parentId: number | null; displayOrder: number | null }

/** 표시순서가 비어 있으면 원본 처음 값처럼 계정코드 × 10([1010]자산 → 10100, 숫자 아닌 코드는 0). */
export const orderOf = (a: OrderAccount) => a.displayOrder ?? (/^\d+$/.test(a.code) ? Number(a.code) * 10 : 0)

/**
 * 계정등록 [변경 ▲ 표시순서변경] → 창 '표시순서설정'(2026-10-22 loginaa 실측): 안내 두 줄 · [찾기(F3)] · 표 순번 · 계정(들여쓴 [코드]이름) · 표시순서,
 * 아래 [저장(F8)] [표시순서 직접입력] [계정표시방법2] [닫기]. 계정을 끌어 놓으면 앞뒤 사이 번호를 받는다.
 */
export default function AccountOrderModal({ open, accounts, onClose, onSaved }: {
  open: boolean
  accounts: OrderAccount[]
  onClose: () => void
  onSaved: () => void
}) {
  const [orders, setOrders] = useState<Record<number, number>>({})
  const [direct, setDirect] = useState(false)
  const [find, setFind] = useState('')
  const [drag, setDrag] = useState<number | null>(null)
  const [error, setError] = useState('')
  const bodyRef = useRef<HTMLTableSectionElement>(null)

  useEffect(() => {
    if (!open) return
    setOrders(Object.fromEntries(accounts.map((a) => [a.id, orderOf(a)]))); setDirect(false); setFind(''); setError('')
  }, [open, accounts])

  const rows = useMemo(() => {
    const byId = new Map(accounts.map((a) => [a.id, a]))
    const depth = (a: OrderAccount) => { let d = 0; for (let p = a.parentId ? byId.get(a.parentId) : undefined; p && d < 10; p = p.parentId ? byId.get(p.parentId) : undefined) d++; return d }
    return [...accounts].map((a) => ({ a, depth: depth(a), order: orders[a.id] ?? orderOf(a) }))
      .sort((x, y) => x.order - y.order || x.a.code.localeCompare(y.a.code))
  }, [accounts, orders])

  function dropOn(targetId: number) {
    if (drag == null || drag === targetId) return
    const list = rows.filter((r) => r.a.id !== drag)
    const idx = list.findIndex((r) => r.a.id === targetId)
    const prev = idx > 0 ? list[idx - 1].order : list[idx].order - 20
    const next = list[idx].order
    let mid = Math.floor((prev + next) / 2)
    if (mid <= prev || mid >= next) {
      // 사이가 없으면 끌어 놓은 자리부터 10 씩 다시 매긴다
      const re: Record<number, number> = { ...orders }
      const seq = [...list.slice(0, idx).map((r) => r.a.id), drag, ...list.slice(idx).map((r) => r.a.id)]
      seq.forEach((id, i) => { re[id] = (i + 1) * 10 })
      setOrders(re); setDrag(null); return
    }
    setOrders({ ...orders, [drag]: mid }); setDrag(null)
  }
  function findNext() {
    if (!find.trim()) return
    const i = rows.findIndex((r) => r.a.code.includes(find) || r.a.name.includes(find))
    if (i >= 0) bodyRef.current?.children[i]?.scrollIntoView({ block: 'center' })
  }
  async function save() {
    try {
      for (const a of accounts) {
        const o = orders[a.id]
        if (o != null && o !== orderOf(a)) await api.patch(`/accounts/${a.id}`, { displayOrder: o })
      }
      onSaved(); onClose()
    } catch (e) { setError(extractErrorMessage(e)) }
  }

  return (
    <Modal open={open} title="표시순서설정" width={784} error={error} onClose={onClose}>
      <div onKeyDown={(e) => {
        if (e.key === 'F8') { e.preventDefault(); void save() }
        if (e.key === 'F3') { e.preventDefault(); findNext() }
      }}>
        <h3 className="text-[14px] font-bold mb-[6px]">표시순서설정</h3>
        <p className="mb-[2px]">주요 재무제표 및 합계잔액시산표에 적용할 표시순서를 설정합니다.</p>
        <p className="mb-[8px]">계정을 선택하고 드래그하여 원하는 위치로 이동할 수 있습니다.</p>
        <div className="flex gap-[4px] mb-[6px]">
          <input className="ec-input w-[200px]" aria-label="찾을 계정" value={find} onChange={(e) => setFind(e.target.value)}
                 onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); findNext() } }} />
          <button type="button" className="ec-btn" onClick={findNext}>찾기(F3)</button>
        </div>
        <div className="max-h-[420px] overflow-auto mb-[10px]">
          <table className="w-full text-left">
            <thead><tr><th className="w-[50px]"></th><th>계정</th><th className="w-[140px] text-right">표시순서</th></tr></thead>
            <tbody ref={bodyRef}>
              {rows.map(({ a, depth, order }, i) => (
                <tr key={a.id} draggable={!direct} onDragStart={() => setDrag(a.id)} onDragOver={(e) => e.preventDefault()} onDrop={() => dropOn(a.id)}
                    className={drag === a.id ? 'bg-ec-page' : undefined}>
                  <td className="text-center">{i + 1}</td>
                  <td className="whitespace-pre">{'    '.repeat(depth)}[{a.code}]{a.name}</td>
                  <td className="text-right">
                    {direct ? (
                      <input className="ec-input w-[110px] text-right" inputMode="numeric" aria-label={`${a.code} 표시순서`} value={String(order)}
                             onChange={(e) => setOrders({ ...orders, [a.id]: Number(e.target.value.replace(/\D/g, '')) || 0 })} />
                    ) : order}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex gap-[4px]">
          <button type="button" className="ec-btn ec-btn-primary" onClick={() => void save()}>저장(F8)</button>
          <button type="button" className={`ec-btn${direct ? ' active' : ''}`} onClick={() => setDirect(!direct)}>표시순서 직접입력</button>
          <button type="button" className="ec-btn" onClick={onClose}>닫기</button>
        </div>
      </div>
    </Modal>
  )
}
