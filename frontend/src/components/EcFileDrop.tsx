import { useRef, useState, type DragEvent } from 'react'
import { planDrop } from '../utils/dropFiles'

/**
 * 첨부 자리 — 원본의 <b>[여기에 파일 놓기]</b>.
 *
 * <p>원본은 첨부가 있는 화면마다 이 자리를 둔다(사본 실측: 기안서작성 · 설문조사입력 ·
 * 업무관리게시판 · 작업지시서입력). 우리에겐 <b>드래그앤드롭이 한 곳도 없었다</b> —
 * 파일 고르기 버튼 하나뿐이라, 메일이나 탐색기에서 끌어다 놓는 사람은 갈 곳이 없었다.
 *
 * <p>버튼도 그대로 둔다. 끌어다 놓기만 되면 파일 선택창을 기대한 사람이 막힌다 —
 * 원본도 둘 다 있다.
 *
 * <p><b>여러 개를 떨어뜨렸을 때</b>가 조용히 틀리기 쉬운 자리다. 호출부가 한 개만
 * 받는데 말없이 첫 개만 올리면, 사람은 다섯을 놓고 다섯이 올라간 줄 안다.
 * {@code multiple} 이 아니면 <b>몇 개를 빼고 올렸는지 화면에 적는다.</b>
 */
export default function EcFileDrop({
  onFiles,
  disabled,
  multiple,
  busy,
  hint = '여기에 파일 놓기',
  children,
}: {
  onFiles: (files: File[]) => void
  disabled?: boolean
  /** 여러 개를 받는 호출부만 켠다. 끄면 첫 개만 올리고 나머지는 몇 개인지 알린다. */
  multiple?: boolean
  busy?: boolean
  hint?: string
  /** 이미 붙은 파일 표시 등, 자리 안에 같이 그릴 것. */
  children?: React.ReactNode
}) {
  const [over, setOver] = useState(false)
  const [skipped, setSkipped] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const take = (list: FileList | null) => {
    // 규칙은 utils/dropFiles 에 있다 — 말없이 첫 개만 올리는 실패가 화면에 안 드러나서다.
    const { accepted, skipped: dropped } = planDrop(Array.from(list ?? []), !!multiple)
    if (accepted.length === 0) return
    setSkipped(dropped)
    onFiles(accepted)
  }

  const stop = (e: DragEvent) => { e.preventDefault(); e.stopPropagation() }

  return (
    <div
      onDragOver={(e) => { stop(e); if (!disabled) setOver(true) }}
      onDragLeave={(e) => { stop(e); setOver(false) }}
      onDrop={(e) => {
        stop(e)
        setOver(false)
        if (disabled) return
        take(e.dataTransfer.files)
      }}
      style={{
        border: `1px dashed ${over ? 'var(--ec-blue)' : 'var(--ec-border)'}`,
        background: over ? '#eef3ff' : '#fbfcfd',
        padding: '10px 12px',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        flexWrap: 'wrap',
        opacity: disabled ? 0.6 : 1,
      }}
    >
      <span style={{ fontSize: 12, color: over ? 'var(--ec-blue-dark)' : '#8a929c' }}>{hint}</span>
      <button
        type="button" className="ec-btn" disabled={disabled}
        onClick={() => inputRef.current?.click()}
      >
        파일 선택
      </button>
      <input
        ref={inputRef} type="file" multiple={multiple} style={{ display: 'none' }}
        onChange={(e) => { take(e.target.files); e.target.value = '' }}
      />
      {busy && <span style={{ fontSize: 11.5, color: '#8a929c' }}>올리는 중…</span>}
      {skipped > 0 && (
        <span style={{ fontSize: 11.5, color: '#c07a00' }}>
          이 자리는 한 개만 받습니다 — {skipped}개는 올리지 않았습니다.
        </span>
      )}
      {children}
    </div>
  )
}
