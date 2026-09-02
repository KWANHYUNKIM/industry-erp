import type { ApprovalField, ApprovalFieldColumn } from '../../api/types'

type Row = Record<string, unknown>
type FormData = Record<string, unknown>

/** 원본 본문 표는 7열 격자다(실측). 라벨은 2열, 값은 5열을 차지한다. */
const COLS = 7
const LABEL_SPAN = 2

const num = (v: unknown) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

const asRows = (v: unknown): Row[] => (Array.isArray(v) ? (v as Row[]) : [])

/**
 * `row` 가 같은 필드들을 한 줄로 묶는다 — 원본의 「신청일자 | 시작 ~ 종료」 배치.
 * `row` 가 없는 필드는 저마다 한 줄이다(기존 동작). 나온 순서를 지킨다.
 */
function groupRows(fields: ApprovalField[]): ApprovalField[][] {
  const out: ApprovalField[][] = []
  const byRow = new Map<number, ApprovalField[]>()
  for (const f of fields) {
    if (f.row == null) { out.push([f]); continue }
    const g = byRow.get(f.row)
    if (g) { g.push(f); continue }
    const started = [f]
    byRow.set(f.row, started)
    out.push(started)
  }
  return out
}

/**
 * 기안서 본문 — 원본은 양식을 **에디터 본문 안의 표**로 그린다.
 * 제목(자간을 벌린 「휴 가 신 청 서」) 아래로 라벨/값 행이 이어지는 문서 서식이고,
 * 값 칸에 직접 입력한다. 우리는 이 필드들을 에디터 **위에** 별도 폼으로 두고 에디터는 자유 본문이었다 —
 * 같은 데이터인데 사용자가 보는 모습이 전혀 달랐다.
 *
 * <p><b>모델 한계</b>: 원본은 양식마다 셀 배치(예: 신청내용·신청사유를 나란히 두기)를 따로 갖고 있는데
 * 우리 `field_schema` 는 <b>필드의 평면 목록</b>이라 배치 정보가 없다. 그래서 한 줄에 한 필드씩 그린다
 * (원본의 신청일자 행과 같은 모양). 배치까지 맞추려면 양식 마스터에 레이아웃을 넣어야 한다.
 */
export default function ApprovalFormFields({
  title,
  fields,
  value,
  onChange,
}: {
  /** 문서 제목 — 원본은 본문 맨 위에 자간을 벌려 크게 쓴다. */
  title: string
  fields: ApprovalField[]
  value: FormData
  onChange: (next: FormData) => void
}) {
  const set = (key: string, v: unknown) => onChange({ ...value, [key]: v })

  const setCell = (field: ApprovalField, rowIdx: number, colKey: string, v: unknown) => {
    const rows = asRows(value[field.key]).map((r, i) => (i === rowIdx ? { ...r, [colKey]: v } : r))
    set(field.key, rows)
  }

  const addRow = (field: ApprovalField) => set(field.key, [...asRows(value[field.key]), {}])

  const removeRow = (field: ApprovalField, rowIdx: number) =>
    set(field.key, asRows(value[field.key]).filter((_, i) => i !== rowIdx))

  return (
    <table className="ec-doc">
      <tbody>
        <tr>
          <td className="doc-title" colSpan={COLS}>{title}</td>
        </tr>
        {groupRows(fields).map((group) => {
          const head = group[0]
          return (
            <tr key={head.key}>
              <td className="doc-label" colSpan={LABEL_SPAN}>
                {head.rowLabel ?? head.label}
                {group.some((f) => f.required) && <span style={{ color: '#c60a2e', marginLeft: 2 }}>*</span>}
              </td>
              <td colSpan={COLS - LABEL_SPAN}>
                {group.length === 1 && head.type === 'table' ? (
                  <TableField
                    field={head}
                    rows={asRows(value[head.key])}
                    onCell={(i, c, v) => setCell(head, i, c, v)}
                    onAdd={() => addRow(head)}
                    onRemove={(i) => removeRow(head, i)}
                  />
                ) : (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {group.map((f, i) => (
                      <span key={f.key} style={{ display: 'contents' }}>
                        {i > 0 && f.sep && <span style={{ flex: '0 0 auto' }}>{f.sep}</span>}
                        <ScalarField field={f} value={value[f.key]} onChange={(v) => set(f.key, v)} />
                      </span>
                    ))}
                  </span>
                )}
              </td>
            </tr>
          )
        })}
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

  // 표 자체가 서식이라 셀 안에 입력칸 테두리를 또 그리지 않는다(원본도 그렇다).
  if (field.type === 'textarea') {
    return <textarea className="doc-input" value={str} onChange={(e) => onChange(e.target.value)} />
  }
  if (field.type === 'number') {
    return (
      <input
        className="doc-input"
        type="number"
        value={str}
        onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))}
        style={{ textAlign: 'right' }}
      />
    )
  }
  // datetime 은 백엔드가 LocalDateTime 문자열을 그대로 받으므로 초를 붙여 보낸다.
  const inputType = field.type === 'date' ? 'date' : field.type === 'datetime' ? 'datetime-local' : 'text'
  return (
    <input
      className="doc-input"
      type={inputType}
      value={field.type === 'datetime' ? str.slice(0, 16) : str}
      onChange={(e) => onChange(field.type === 'datetime' ? `${e.target.value}:00` : e.target.value)}
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
