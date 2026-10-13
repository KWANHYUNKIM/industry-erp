import { useState } from 'react'
import Modal from './Modal'
import { extractErrorMessage } from '../api/client'

export interface BulkField {
  key: string
  label: string
  kind: 'text' | 'date' | 'number' | 'select'
  options?: [string, string][]
}
export type BulkDraft = Record<string, string>

/**
 * 리스트 [변경](원본 사원리스트 · 일용근로 사원리스트, 2026-10-04 실측) — 체크한 줄들의 항목을 한 번에 고친다.
 * ① [항목검색] 창에서 바꿀 항목을 고르고 [적용](닫기를 눌러도 성명만 든 채로 다음 창으로 간다)
 * → ② [변경] 창: [변경항목선택] · 위 줄(항목 고르기 · 값 · 적용)로 모든 줄에 같은 값, 격자(코드 · 첫 항목 · 고른 항목)를 줄마다 고친 뒤 [저장(F8)].
 * 첫 항목(fields[0], 성명)은 늘 격자에 있다.
 */
export default function BulkChangeModal<R extends { id: number; code: string }>({
  rows, codeLabel, fields, initial, saveRow, onClose, onSaved,
}: {
  rows: R[]
  codeLabel: string
  fields: BulkField[]
  initial: (row: R) => BulkDraft
  /** 한 줄 저장 — 막아야 하면 문구를 던진다 */
  saveRow: (row: R, draft: BulkDraft) => Promise<void>
  onClose: () => void
  onSaved: () => void
}) {
  const [step, setStep] = useState<'pick' | 'edit'>('pick')
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [drafts, setDrafts] = useState<BulkDraft[]>(() => rows.map(initial))
  const [allKey, setAllKey] = useState(fields[0].key)
  const [allValue, setAllValue] = useState('')
  const [error, setError] = useState('')
  const editable = [fields[0], ...fields.slice(1).filter((f) => picked.has(f.key))]
  const allField = editable.find((f) => f.key === allKey) ?? fields[0]

  function editor(f: BulkField, value: string, onChange: (v: string) => void) {
    if (f.kind === 'select') {
      return (
        <select className="ec-input w-full" value={value} onChange={(e) => onChange(e.target.value)}>
          <option value=""></option>
          {f.options!.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      )
    }
    return (
      <input type={f.kind === 'date' ? 'date' : 'text'} inputMode={f.kind === 'number' ? 'decimal' : undefined}
             className={`ec-input w-full${f.kind === 'number' ? ' text-right' : ''}`} value={value}
             onChange={(e) => onChange(f.kind === 'number' ? e.target.value.replace(/[^0-9.,]/g, '') : e.target.value)} />
    )
  }

  function toEdit() {
    const first = fields.slice(1).find((f) => picked.has(f.key))
    setAllKey(first?.key ?? fields[0].key); setAllValue(''); setStep('edit')
  }

  async function save() {
    setError('')
    try {
      for (const [i, r] of rows.entries()) await saveRow(r, drafts[i])
      onSaved()
    } catch (err) {
      setError(extractErrorMessage(err))
    }
  }

  if (step === 'pick') {
    return (
      <Modal open title="항목검색" width={520} onClose={toEdit}>
        <p className="text-ec-hint mb-[6px]">기본항목 선택</p>
        <table className="w-full text-left">
          <thead><tr><th className="w-[34px]"></th><th>항목명</th></tr></thead>
          <tbody>
            {fields.slice(1).map((f) => (
              <tr key={f.key}>
                <td className="text-center">
                  <input type="checkbox" aria-label={f.label} checked={picked.has(f.key)} onChange={() => {
                    const n = new Set(picked); if (n.has(f.key)) n.delete(f.key); else n.add(f.key); setPicked(n)
                  }} />
                </td>
                <td>{f.label}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="flex gap-[6px] mt-[12px]">
          <button type="button" className="ec-btn ec-btn-primary" onClick={toEdit}>적용(F8)</button>
          <button type="button" className="ec-btn" onClick={toEdit}>닫기</button>
        </div>
      </Modal>
    )
  }

  return (
    <Modal open title="변경" width={Math.min(1100, 360 + (editable.length - 1) * 160)} error={error} onClose={onClose}>
      <div className="flex flex-wrap items-center gap-[6px] mb-[8px]">
        <button type="button" className="ec-btn ec-btn-sm" onClick={() => setStep('pick')}>변경항목선택</button>
      </div>
      <div className="ec-form flex flex-wrap items-center gap-[6px] mb-[8px]">
        <select className="ec-input w-[140px]" value={allField.key} onChange={(e) => { setAllKey(e.target.value); setAllValue('') }}>
          {editable.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
        </select>
        <div className="w-[260px]">{editor(allField, allValue, setAllValue)}</div>
        <button type="button" className="ec-btn" onClick={() => setDrafts((ds) => ds.map((d) => ({ ...d, [allField.key]: allValue })))}>적용</button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr>
              <th className="w-[34px]"></th>
              <th>{codeLabel}</th>
              {editable.map((f) => <th key={f.key}>{f.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.id}>
                <td className="text-center text-ec-hint">{i + 1}</td>
                <td>{r.code}</td>
                {editable.map((f) => (
                  <td key={f.key}>{editor(f, drafts[i][f.key] ?? '', (v) => setDrafts((ds) => ds.map((d, j) => (j === i ? { ...d, [f.key]: v } : d))))}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex gap-[6px] mt-[12px]">
        <button type="button" className="ec-btn ec-btn-primary" onClick={save}>저장(F8)</button>
        <button type="button" className="ec-btn" onClick={onClose}>닫기</button>
      </div>
    </Modal>
  )
}
