import { useEffect, useState } from 'react'
import Modal from '../../components/Modal'
import { ALL_KINDS, KIND_TREE } from './kinds'

/** 원본 [종류검색] 창 — 모듈 › 분류 › 종류 트리, 머리 체크로 전체 선택, [적용(F8)] · [닫기]. */
export default function KindPickerModal({ open, value, onApply, onClose }: { open: boolean; value: string[]; onApply: (v: string[]) => void; onClose: () => void }) {
  const [draft, setDraft] = useState<string[]>(value)
  useEffect(() => { if (open) setDraft(value) }, [open, value])
  const toggle = (k: string) => setDraft((d) => (d.includes(k) ? d.filter((x) => x !== k) : [...d, k]))
  const all = draft.length === ALL_KINDS.length
  return (
    <Modal open={open} title="종류검색" onClose={onClose} width={520}>
      <table className="w-full text-left">
        <thead>
          <tr>
            <th colSpan={2}>구분</th>
            <th><label className="inline-flex items-center gap-1"><input type="checkbox" checked={all} onChange={() => setDraft(all ? [] : [...ALL_KINDS])} /> 검색</label></th>
          </tr>
        </thead>
        <tbody>
          {KIND_TREE.flatMap((m, mi) => m.groups.flatMap((g, gi) => g.kinds.map((k, ki) => (
            <tr key={k}>
              {gi === 0 && ki === 0 && <td rowSpan={m.groups.reduce((n, x) => n + x.kinds.length, 0)}>{mi + 1} {m.module}</td>}
              {ki === 0 && <td rowSpan={g.kinds.length}>{g.name}</td>}
              <td><label className="inline-flex items-center gap-1"><input type="checkbox" checked={draft.includes(k)} onChange={() => toggle(k)} /> {k}</label></td>
            </tr>
          ))))}
        </tbody>
      </table>
      <div className="mt-2 flex gap-1.5">
        <button type="button" className="ec-btn ec-btn-primary" onClick={() => onApply(draft)}>적용(F8)</button>
        <button type="button" className="ec-btn" onClick={onClose}>닫기</button>
      </div>
    </Modal>
  )
}
