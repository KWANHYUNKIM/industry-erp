import { useMemo, useState } from 'react'
import Modal from './Modal'

/**
 * 코드도움 — 이카운트의 `code.openpopup` 패턴.
 *
 * 원본 화면에서 거래처·품목·담당자 같은 <b>마스터 참조 조건</b>은 드롭다운이 아니라
 * <b>[선택] 버튼 → 검색 팝업</b>이다(DOM 의 `btn-code-search` / `data-function-id="code.openpopup"`).
 * 마스터가 수백 건이 되면 드롭다운은 찾을 수가 없어서 검색이 필요하기 때문이다.
 *
 * 우리 화면은 그동안 전부 `<select>` 였다. 이 컴포넌트가 그 자리를 대신한다 —
 * 선택된 값을 보여주는 읽기 전용 칸 + 돋보기 버튼, 누르면 코드·명으로 검색하는 팝업이 뜬다.
 *
 * 데이터는 <b>화면이 이미 불러온 목록</b>을 넘겨받아 거른다(추가 요청 없음).
 */
export interface CodeItem {
  /** 선택 시 onChange 로 돌려줄 값 */
  value: string
  /** 코드(있으면 좌측에 표시하고 검색 대상에 포함) */
  code?: string | null
  name: string
  /** 우측에 흐리게 붙는 부가 정보(구분·그룹 등) */
  sub?: string | null
}

export default function CodePickerField({
  label, value, onChange, items, width = 170, placeholder = '전체', emptyLabel = '전체', disabled,
}: {
  label: string
  value: string
  onChange: (value: string, item: CodeItem | null) => void
  items: CodeItem[]
  width?: number
  placeholder?: string
  /** 선택 해제 행의 라벨. 필수 조건이면 이 값을 주지 말고 required 처럼 쓰지 않는다. */
  emptyLabel?: string
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')

  const selected = items.find((i) => i.value === value) ?? null
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return items
    return items.filter((i) =>
      `${i.code ?? ''} ${i.name} ${i.sub ?? ''}`.toLowerCase().includes(needle))
  }, [items, q])

  function pick(item: CodeItem | null) {
    onChange(item ? item.value : '', item)
    setOpen(false)
    setQ('')
  }

  // <label> 로 감싸면 안 된다 — 팝업이 이 요소 안에 렌더되므로, 팝업 안의 클릭이 label 을 통해
  // 입력칸으로 전달돼 행 선택이 먹히지 않고 팝업이 닫히지 않는다(실제로 그렇게 동작했다).
  return (
    <div style={{ fontSize: 12.5 }}>
      <div style={{ color: '#5a626e', marginBottom: 3 }}>{label}</div>
      <div style={{ display: 'flex' }}>
        <input
          className="ec-input"
          readOnly
          disabled={disabled}
          value={selected ? (selected.code ? `${selected.name}` : selected.name) : ''}
          placeholder={placeholder}
          onClick={() => !disabled && setOpen(true)}
          style={{ width, cursor: disabled ? 'default' : 'pointer', background: disabled ? '#f4f5f7' : undefined }}
          title={selected ? `${selected.code ?? ''} ${selected.name}`.trim() : placeholder}
        />
        <button
          type="button"
          className="ec-btn"
          disabled={disabled}
          onClick={() => setOpen(true)}
          title={`${label} 선택`}
          style={{ marginLeft: -1, padding: '0 7px' }}
        >
          🔍
        </button>
        {selected && !disabled && (
          <button
            type="button"
            className="ec-btn"
            onClick={() => pick(null)}
            title="선택 해제"
            style={{ marginLeft: -1, padding: '0 6px', color: '#c60a2e' }}
          >
            ×
          </button>
        )}
      </div>

      <Modal open={open} title={`${label} 선택`} width={520} onClose={() => setOpen(false)}>
        <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
          <input
            className="ec-input"
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && shown.length === 1) pick(shown[0]) }}
            placeholder="코드 또는 이름으로 검색"
            style={{ flex: 1 }}
          />
          <span style={{ fontSize: 12.5, color: '#8a929c', alignSelf: 'center' }}>{shown.length}건</span>
        </div>

        <div style={{ maxHeight: 320, overflowY: 'auto', border: '1px solid var(--ec-border)' }}>
          <table className="w-full text-left">
            <thead><tr>
              <th style={{ width: 120 }}>코드</th>
              <th>이름</th>
              <th style={{ width: 120 }}></th>
            </tr></thead>
            <tbody>
              <tr onClick={() => pick(null)} style={{ cursor: 'pointer' }}>
                <td colSpan={3} style={{ color: '#8a929c' }}>({emptyLabel})</td>
              </tr>
              {shown.length === 0 ? (
                <tr><td colSpan={3} style={{ textAlign: 'center', color: '#9aa1ab', padding: 16 }}>
                  검색 결과가 없습니다.
                </td></tr>
              ) : shown.map((i) => (
                <tr
                  key={i.value}
                  onClick={() => pick(i)}
                  style={{ cursor: 'pointer', background: i.value === value ? 'var(--ec-blue-light)' : undefined }}
                >
                  <td style={{ fontFamily: 'monospace' }}>{i.code ?? ''}</td>
                  <td style={{ fontWeight: 600 }}>{i.name}</td>
                  <td style={{ color: '#8a929c' }}>{i.sub ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Modal>
    </div>
  )
}
