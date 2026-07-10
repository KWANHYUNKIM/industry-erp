import type { CSSProperties } from 'react'
import type { ApprovalField, ApprovalFieldColumn } from '../../api/types'

type Row = Record<string, unknown>
type FormData = Record<string, unknown>

const TH: CSSProperties = { width: 130, background: '#f5f7fa', whiteSpace: 'nowrap' }
const REQ: CSSProperties = { color: '#c60a2e', marginLeft: 2 }

const num = (v: unknown) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

const asRows = (v: unknown): Row[] => (Array.isArray(v) ? (v as Row[]) : [])

/** 양식 마스터의 field_schema 를 읽어 입력 폼을 그린다. 값은 그대로 formData 로 저장된다. */
export default function ApprovalFormFields({
  fields,
  value,
  onChange,
}: {
  fields: ApprovalField[]
  value: FormData
  onChange: (next: FormData) => void
}) {
  if (fields.length === 0) return null

  const set = (key: string, v: unknown) => onChange({ ...value, [key]: v })

  const setCell = (field: ApprovalField, rowIdx: number, colKey: string, v: unknown) => {
    const rows = asRows(value[field.key]).map((r, i) => (i === rowIdx ? { ...r, [colKey]: v } : r))
    set(field.key, rows)
  }

  const addRow = (field: ApprovalField) => set(field.key, [...asRows(value[field.key]), {}])

  const removeRow = (field: ApprovalField, rowIdx: number) =>
    set(field.key, asRows(value[field.key]).filter((_, i) => i !== rowIdx))

  return (
    <table className="w-full text-left" style={{ marginBottom: 12 }}>
      <tbody>
        {fields.map((f) =>
          f.type === 'table' ? (
            <tr key={f.key}>
              <th style={TH}>
                {f.label}
                {f.required && <span style={REQ}>*</span>}
              </th>
              <td>
                <TableField
                  field={f}
                  rows={asRows(value[f.key])}
                  onCell={(i, c, v) => setCell(f, i, c, v)}
                  onAdd={() => addRow(f)}
                  onRemove={(i) => removeRow(f, i)}
                />
              </td>
            </tr>
          ) : (
            <tr key={f.key}>
              <th style={TH}>
                {f.label}
                {f.required && <span style={REQ}>*</span>}
              </th>
              <td>
                <ScalarField field={f} value={value[f.key]} onChange={(v) => set(f.key, v)} />
              </td>
            </tr>
          ),
        )}
      </tbody>
    </table>
  )
}

function ScalarField({
  field,
  value,
  onChange,
}: {
  field: ApprovalField
  value: unknown
  onChange: (v: unknown) => void
}) {
  const str = value == null ? '' : String(value)

  if (field.type === 'textarea') {
    return (
      <textarea
        className="ec-input"
        value={str}
        onChange={(e) => onChange(e.target.value)}
        style={{ width: '100%', height: 64, resize: 'vertical', padding: 6 }}
      />
    )
  }
  if (field.type === 'number') {
    return (
      <input
        className="ec-input"
        type="number"
        value={str}
        onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))}
        style={{ width: 160, textAlign: 'right' }}
      />
    )
  }
  // datetime 은 백엔드가 LocalDateTime 문자열을 그대로 받으므로 초를 붙여 보낸다.
  const inputType = field.type === 'date' ? 'date' : field.type === 'datetime' ? 'datetime-local' : 'text'
  return (
    <input
      className="ec-input"
      type={inputType}
      value={field.type === 'datetime' ? str.slice(0, 16) : str}
      onChange={(e) => onChange(field.type === 'datetime' ? `${e.target.value}:00` : e.target.value)}
      style={{ width: inputType === 'text' ? '100%' : 220 }}
    />
  )
}

function TableField({
  field,
  rows,
  onCell,
  onAdd,
  onRemove,
}: {
  field: ApprovalField
  rows: Row[]
  onCell: (rowIdx: number, colKey: string, v: unknown) => void
  onAdd: () => void
  onRemove: (rowIdx: number) => void
}) {
  const columns: ApprovalFieldColumn[] = field.columns ?? []
  const total = field.totalOf ? rows.reduce((sum, r) => sum + num(r[field.totalOf!]), 0) : null

  return (
    <div>
      <table className="w-full text-left" style={{ marginBottom: 4 }}>
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key}>{c.label}</th>
            ))}
            <th style={{ width: 40 }} />
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={columns.length + 1} style={{ textAlign: 'center', color: '#9aa1ab', padding: 10 }}>
                행을 추가하세요.
              </td>
            </tr>
          )}
          {rows.map((row, i) => (
            <tr key={i}>
              {columns.map((c) => (
                <td key={c.key}>
                  <input
                    className="ec-input"
                    type={c.type === 'number' ? 'number' : c.type === 'date' ? 'date' : 'text'}
                    value={row[c.key] == null ? '' : String(row[c.key])}
                    onChange={(e) =>
                      onCell(i, c.key, c.type === 'number' ? (e.target.value === '' ? '' : Number(e.target.value)) : e.target.value)
                    }
                    style={{ width: '100%', textAlign: c.type === 'number' ? 'right' : 'left' }}
                  />
                </td>
              ))}
              <td style={{ textAlign: 'center' }}>
                <button className="ec-btn" onClick={() => onRemove(i)} title="행 삭제">
                  ×
                </button>
              </td>
            </tr>
          ))}
          {total !== null && (
            <tr>
              <td colSpan={Math.max(1, columns.length - 1)} style={{ textAlign: 'right', fontWeight: 700, background: '#f5f7fa' }}>
                {field.totalLabel ?? '합계'}
              </td>
              <td style={{ textAlign: 'right', fontWeight: 700, background: '#f5f7fa' }}>
                {total.toLocaleString()}
              </td>
              <td style={{ background: '#f5f7fa' }} />
            </tr>
          )}
        </tbody>
      </table>
      <button className="ec-btn" onClick={onAdd}>+ 행 추가</button>
    </div>
  )
}
