import { useEffect, useRef, useState, type ReactNode } from 'react'

/**
 * 전표입력 화면 셸 — 이카운트 `page page-fluid page-modal` 구조를 그대로 옮긴 것.
 *
 * 원본(판매입력 ESD006M)의 뼈대는 목록 화면(EcListShell)과 다르다.
 *
 * ```
 * .header.header-fixed  →  ☆화면명  ...  [Option] [도움말]
 * .wrapper-toolbar      →  "…에 임시저장된 내역이 있습니다."  [적용] [삭제]     (있을 때만)
 * ul.nav.nav-tabs       →  기본(수정불가)▾ · 매출전표 I · 생산입고 I · 출하지시서 · [+]
 * .contents             →  헤더 항목 폼 + 명세 그리드                            (children)
 * .footer               →  [저장(F8)▴] [저장/전표(F7)] … [닫기]   ...  임시저장 시각
 * ```
 *
 * 원본에서 배운 것 두 가지를 지킨다.
 * - <b>양식 탭에는 캐럿(▾)이 붙는다.</b> 탭 자체가 "이 전표를 어느 양식으로 입력할지" 고르는
 *   드롭다운이다(원본 `data-function-id="tab_addon"`). 탭을 늘리는 게 아니라 양식을 바꾼다.
 * - <b>연결전표 탭은 저장 전에는 못 누른다.</b> 원본도 `hidden` 이거나 비활성이다.
 *   전표가 없는데 매출전표를 만들 수는 없기 때문이다.
 */

export interface SlipMenuItem {
  label: string
  onClick?: () => void
}

export interface SlipAction {
  label: string
  onClick?: () => void
  primary?: boolean
  /** form 의 submit 버튼으로 만든다(저장 버튼). */
  submit?: boolean
  disabled?: boolean
  /** 원본의 group 버튼 — 본체 오른쪽에 ▴ 화살표가 붙고 눌러서 부가 동작을 고른다. */
  menu?: SlipMenuItem[]
  /** 비활성 사유. disabled 일 때 title 로 보여 준다. */
  disabledReason?: string
}

export interface SlipTab {
  id: string
  label: string
  /** 저장 전에는 못 누르는 연결전표 탭 */
  disabled?: boolean
  disabledReason?: string
  onSelect?: () => void
}

/** ▴/▾ 드롭다운이 달린 버튼. 푸터·툴바·탭이 공유한다. */
function MenuButton({
  label, items, className = 'ec-btn', up, onMain, disabled, title,
}: {
  label: ReactNode
  items: SlipMenuItem[]
  className?: string
  /** 푸터 버튼은 위로 열린다(원본 btn-arrow-up). */
  up?: boolean
  onMain?: () => void
  disabled?: boolean
  title?: string
}) {
  const [open, setOpen] = useState(false)
  return (
    <span style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        type="button"
        className={className}
        disabled={disabled}
        title={title}
        onClick={() => (onMain ? onMain() : setOpen((v) => !v))}
      >
        {label}
      </button>
      <button
        type="button"
        className={`${className} ec-btn-arrow`}
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        aria-label={`${typeof label === 'string' ? label : ''} 부가기능`}
      >
        {up ? '▴' : '▾'}
      </button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />
          <div
            style={{
              position: 'absolute', zIndex: 41, minWidth: 158, padding: 4,
              ...(up ? { bottom: '100%', marginBottom: 4 } : { top: '100%', marginTop: 4 }),
              left: 0, background: '#fff', border: '1px solid #c9d1da', borderRadius: 3,
              boxShadow: '0 4px 12px rgba(0,0,0,.14)',
            }}
          >
            {items.map((m) => (
              <button
                key={m.label}
                type="button"
                onClick={() => { setOpen(false); m.onClick?.() }}
                disabled={!m.onClick}
                style={{
                  display: 'block', width: '100%', textAlign: 'left', padding: '6px 8px',
                  fontSize: 12, background: 'none', border: 0,
                  cursor: m.onClick ? 'pointer' : 'default', color: m.onClick ? '#3c4553' : '#b0b7c0',
                  whiteSpace: 'nowrap',
                }}
              >
                {m.label}
              </button>
            ))}
          </div>
        </>
      )}
    </span>
  )
}

export default function EcSlipShell({
  title, formTabs = [], activeFormTab, onFormTab,
  relatedTabs = [], onAddTab,
  tempSave, savedAt, options = [], actions = [], help, children,
}: {
  title: string
  /** 양식 탭 (원본: 기본(수정불가) / 적요). 캐럿으로 양식 목록이 열린다. */
  formTabs?: SlipTab[]
  activeFormTab?: string
  onFormTab?: (id: string) => void
  /** 연결전표 탭 (원본: 매출전표 I / 생산입고 I / 출하지시서) */
  relatedTabs?: SlipTab[]
  onAddTab?: () => void
  /** 임시저장 내역이 있을 때 상단에 뜨는 안내줄 */
  tempSave?: { onApply: () => void; onDelete: () => void } | null
  /** 푸터 오른쪽 "오후 1:59 임시저장되었습니다." */
  savedAt?: string
  /** Option 드롭다운 항목 (원본: 입력항목설정 / 필터설정 / 즐겨찾기코드 …) */
  options?: SlipMenuItem[]
  /** 푸터 버튼줄 */
  actions?: SlipAction[]
  help?: ReactNode
  children: ReactNode
}) {
  const [helpOpen, setHelpOpen] = useState(false)
  const [optionOpen, setOptionOpen] = useState(false)
  const [bookmarked, setBookmarked] = useState(true)   // 원본은 page-bookmark-added 상태로 뜬다
  const footerRef = useRef<HTMLDivElement>(null)

  // 저장(F8) — 원본과 같은 단축키. 입력칸 안에서도 먹어야 하므로 window 에 건다.
  useEffect(() => {
    const save = actions.find((a) => a.submit && !a.disabled)
    if (!save) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'F8') return
      e.preventDefault()
      // submit 버튼을 실제로 눌러 form 의 검증·onSubmit 을 그대로 태운다
      footerRef.current?.querySelector<HTMLButtonElement>('button[type="submit"]')?.click()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [actions])

  const tab = (t: SlipTab, active: boolean, caret?: boolean) => (
    <li
      key={t.id}
      className={`ec-tab${active ? ' active' : ''}`}
      title={t.disabled ? (t.disabledReason ?? '저장 후에 쓸 수 있습니다.') : undefined}
      style={t.disabled ? { color: '#b0b7c0', cursor: 'default' } : undefined}
      onClick={() => { if (!t.disabled) { onFormTab?.(t.id); t.onSelect?.() } }}
    >
      {t.label}
      {caret && <span className="caret">▾</span>}
    </li>
  )

  return (
    <div className="ec-slip">
      {/* .header.header-fixed */}
      <div className="ec-slip-title">
        <button
          type="button"
          onClick={() => setBookmarked((v) => !v)}
          title={bookmarked ? '북마크 해제' : '북마크 추가'}
          className="no-ec"
          style={{ border: 0, background: 'none', cursor: 'pointer', color: '#f5b301', fontSize: 14, padding: 0, marginRight: 2 }}
        >
          {bookmarked ? '★' : '☆'}
        </button>
        <span className="name">{title}</span>

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 4, position: 'relative' }}>
          {options.length > 0 && (
            <MenuButton label="Option" items={options} />
          )}
          <button type="button" className="ec-btn" onClick={() => setHelpOpen(true)}>도움말</button>
          {optionOpen && <div onClick={() => setOptionOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />}
        </div>
      </div>

      {/* 임시저장 안내줄 */}
      {tempSave && (
        <div className="ec-slip-tempbar">
          <span>{title}에 임시저장된 내역이 있습니다.</span>
          <a onClick={tempSave.onApply}>적용</a>
          <a onClick={tempSave.onDelete}>삭제</a>
        </div>
      )}

      {/* ul.nav.nav-tabs */}
      {(formTabs.length > 0 || relatedTabs.length > 0) && (
        <ul className="ec-tabs">
          {formTabs.map((t) => tab(t, t.id === activeFormTab, true))}
          {relatedTabs.map((t) => tab(t, false))}
          {onAddTab && (
            <li className="ec-tab ec-tab-add" title="탭 추가" onClick={onAddTab}>+</li>
          )}
        </ul>
      )}

      {/* .contents */}
      <div style={{ flex: 1, minHeight: 0, paddingTop: 8 }}>{children}</div>

      {/* .footer */}
      <div className="ec-slip-footer" ref={footerRef}>
        {actions.map((a) => {
          const cls = `ec-btn${a.primary ? ' ec-btn-primary' : ''}`
          if (a.menu && a.menu.length > 0) {
            return (
              <MenuButton
                key={a.label}
                label={a.label}
                items={a.menu}
                className={cls}
                up
                onMain={a.onClick}
                disabled={a.disabled}
                title={a.disabled ? a.disabledReason : undefined}
              />
            )
          }
          return (
            <button
              key={a.label}
              type={a.submit ? 'submit' : 'button'}
              className={cls}
              onClick={a.onClick}
              disabled={a.disabled}
              title={a.disabled ? a.disabledReason : undefined}
            >
              {a.label}
            </button>
          )
        })}
        {savedAt && (
          <span style={{ marginLeft: 'auto', fontSize: 11.5, color: '#8a929c' }}>{savedAt}</span>
        )}
      </div>

      {helpOpen && (
        <div
          onClick={() => setHelpOpen(false)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,.35)', zIndex: 50,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ background: '#fff', borderRadius: 4, width: 480, maxWidth: '90vw', boxShadow: '0 10px 30px rgba(0,0,0,.2)' }}
          >
            <div style={{ padding: '10px 14px', borderBottom: '1px solid #e6eaef', fontWeight: 800, fontSize: 14, display: 'flex', alignItems: 'center' }}>
              <span>{title} · 도움말</span>
              <button type="button" className="ec-btn" style={{ marginLeft: 'auto' }} onClick={() => setHelpOpen(false)}>닫기</button>
            </div>
            <div style={{ padding: 14, fontSize: 12.5, lineHeight: 1.7, color: '#3c4553', maxHeight: '60vh', overflowY: 'auto' }}>
              {help}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
