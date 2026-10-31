import { useRef, useState } from 'react'
import CodeSearchModal, { type CodeColumn } from './CodeSearchModal'
import EcIcon from '../ui/EcIcon'

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
  /**
   * 원본 [검색창내용] — <b>찾는 데만</b> 쓰고 화면에는 안 보이는 이름.
   * 공식 상호·품목명 말고 사람들이 실제로 부르는 이름(약칭·영문명·옛 상호)이다.
   */
  alias?: string | null
  /**
   * 화면에는 안 보이고 <b>찾는 데만</b> 쓰는 글자들.
   *
   * <p>원본 거래처검색 팝업은 탭 네 개에 대표자명·업태·종목·전화·모바일·주소·홈페이지·적요까지
   * 조건이 있다. 우리 코드도움은 코드와 이름 둘로만 찾아서, "대표가 함승학인 그 회사" 처럼
   * 사람이 실제로 기억하는 단서로는 찾을 수가 없었다. 창을 네 탭으로 늘리는 대신
   * <b>그 창이 찾던 항목들을 한 칸에서 다 찾게</b> 한다. (utils/codeItems)
   */
  extra?: string | null
  /** 사용중단된 것 — 창에서 [사용중단포함] 을 켜야 보인다. */
  stopped?: boolean
  /** 사원검색 조건 판([기본] 탭)이 거르는 값 — 입사일 · 퇴사일(yyyy-mm-dd). */
  hireDate?: string | null
  resignDate?: string | null
}

export default function CodePickerField({
  /*
   * 안내 문구(placeholder)는 <b>그 항목 이름</b>이다 — 원본 코드도움 칸이 그렇게 적는다
   * (사본 실측: placeholder=프로젝트 · 거래처 · 창고 · 담당자 …). 우리는 111곳이 '전체'
   * 였는데, 칸이 여럿 늘어서면 <b>어느 칸이 무엇인지</b>를 라벨에서만 읽어야 했다.
   * 안 고르면 전체라는 뜻은 [전체] 지우기 항목(emptyLabel)이 말해 준다.
   */
  label, value, onChange, items, width = 170, placeholder, emptyLabel = '전체', disabled,
  hideLabel, multiple, values, onChangeMulti, fill, pair, nameValue, onNameChange, columns, popupTitle, onNew, plain, hideNew, showCode, invalid,
  employeeSearch, onPickMany, checkApply,
}: {
  /** 여럿 고르기 창을 원본 조건 창 꼴(체크칸 + 번호 · [적용(F8)] [닫기] · TIP)로 — CodeSearchModal checkApply. multiple 과 같이. */
  checkApply?: boolean
  /** 빈 필수칸 — 칸 줄을 원본 has-error 빨간 테두리(`.ec-invalid`)로 두른다. 보통 useRequired 훅의 on(키, 채워졌나). */
  invalid?: boolean
  /** 고른 뒤 칸에 이름 대신 코드를 적는다(원본 기타원천세입력 업종구분코드 940909 · 소득코드 62 — 이름은 옆 열이 보인다). */
  showCode?: boolean
  /** 코드도움 창의 격자 열(대상마다 다르다 — CodeSearchModal). 없으면 항목 모양을 보고 고른다. */
  columns?: CodeColumn[]
  /** 창 제목(기본 `${label}검색`) */
  popupTitle?: string
  /** 창의 [신규(F2)] — 없으면 이름으로 등록 화면을 짐작해 새 창으로 연다 */
  onNew?: () => void
  /** 사원검색 꼴 — [사용중단포함] · [Option] 없음 */
  plain?: boolean
  /** 창의 [신규(F2)] 를 안 그린다 */
  hideNew?: boolean
  label: string
  /** 단일 선택 값. multiple 이면 쓰지 않는다. */
  value?: string
  onChange?: (value: string, item: CodeItem | null) => void
  items: CodeItem[]
  width?: number
  placeholder?: string
  /** 선택 해제 행의 라벨. 필수 조건이면 이 값을 주지 말고 required 처럼 쓰지 않는다. */
  emptyLabel?: string
  disabled?: boolean
  /** 호출부가 이미 라벨을 그리고 있을 때(가로 배치 화면) 라벨 줄을 생략한다. */
  hideLabel?: boolean
  /** 표 셀 안처럼 남는 폭을 채워야 할 때(width 대신 100%). */
  fill?: boolean
  /**
   * 전표입력 화면의 코드칸 모양 — 원본 `.form-control-code` 조합을 그대로 낸다:
   * `[코드][🔍][명칭][×]`. 목록 화면의 조회조건은 명칭 한 칸이면 되지만, 전표는
   * 코드를 직접 쳐서 넣는 사용자가 있어 코드칸이 앞에 따로 있다.
   */
  pair?: boolean
  /**
   * pair 의 명칭칸을 고칠 수 있게 연다 — 원본 [임의거래처](12341234)를 고르면 거래처 이름 칸이 열린다(2026-10-28 실측).
   * 주면 명칭칸이 이 값을 보이고, 고친 글자를 onNameChange 로 넘긴다(비면 고른 항목 이름).
   */
  nameValue?: string
  onNameChange?: (name: string) => void
  /** 다중 선택 — 원본의 tags-input 에 해당. values/onChangeMulti 와 함께 쓴다. */
  multiple?: boolean
  values?: string[]
  onChangeMulti?: (values: string[], items: CodeItem[]) => void
  /**
   * 사원검색 창 꼴(인사발령입력 사번 2026-10-22 실측): [퇴사자포함] · 빠른검색칸 · Search(F3)(조건 판) · Option, 격자 체크칸 + 번호,
   * [적용(F8)] 로 여러 사원을 한꺼번에 고른다. 적용하면 고른 항목들이 onPickMany 로 간다(칸 자체는 단일 값).
   */
  employeeSearch?: boolean
  onPickMany?: (items: CodeItem[]) => void
}) {
  const [open, rawSetOpen] = useState(false)
  /*
   * <b>고르자마자 다시 열리던 것</b>(QA 55회차). 팝업(Modal)은 portal 이 아니라 이 칸 자리에 그려진다 —
   * 그래서 칸을 <code>&lt;label&gt;</code> 로 감싼 화면(기타이동·은행카드·특별단가 등 15곳)에서는 팝업 안을
   * 누르면 브라우저가 label 의 '연결된 칸 누르기' 를 한 번 더 일으켜, 방금 닫은 팝업이 바로 다시 열렸다.
   * 그 가짜 클릭은 detail 이 0 이다. 닫은 직후의 detail 0 클릭만 무시한다 — 키보드(Enter·Space)로 여는 것은 그대로다.
   */
  const closedAt = useRef(0)
  const setOpen = (v: boolean) => { if (!v) closedAt.current = Date.now(); rawSetOpen(v) }
  const openFrom = (e: React.MouseEvent) => {
    if (e.detail === 0 && Date.now() - closedAt.current < 400) return
    setOpen(true)
  }
  const [q, setQ] = useState('')
  /**
   * 전표 코드칸(pair)에 <b>직접 친 글자</b>. 원본 판매입력 [거래처]·[출하창고]는 코드칸에 바로 쳐서 Enter 한다 —
   * 2026-10-06 loginaa 실측: 걸리는 것이 한 건이면 바로 고르고(창고 '10'… 은 100·101·102 셋이라 창),
   * 정확히 같은 코드가 있어도 다른 코드에 함께 걸리면(거래처 '00001' → 00001 · 0000000000001 · SG00001) 고르지 않고
   * 그 검색어로 목록 창을 연다. 없으면 빈 목록 창. 예전엔 코드칸이 읽기 전용이라 먼저 창부터 열렸다.
   */
  const [typed, setTyped] = useState<string | null>(null)
  function submitTyped(blurOnly = false) {
    const needle = (typed ?? '').trim()
    setTyped(null)
    if (!needle) { if (!blurOnly) setOpen(true); return }
    const low = needle.toLowerCase()
    // 직접 쳐서 Enter 할 때는 사용 중인 것만 맞춘다 — 사용중단은 창에서 [사용중단포함] 을 켜야 보인다(원본 동작을 가정, 미실측)
    const hits = items.filter((i) => !i.stopped && `${i.code ?? ''} ${i.name}`.toLowerCase().includes(low))
    // 코드가 쳐 넣은 글자와 정확히 같은 것이 하나면 그것을 고른다('S01' 은 S01 · AS01 에 함께 걸려도 S01)
    const exact = hits.filter((i) => (i.code ?? '').trim().toLowerCase() === low)
    if (exact.length === 1) { pick(exact[0]); return }
    if (hits.length === 1) { pick(hits[0]); return }
    // Tab 으로 떠날 때는 딱 하나 걸린 경우만 채운다 — 여럿이거나 없으면 창을 띄우지 않고 원래 값으로 돌아간다
    if (blurOnly) return
    // 아무것도 안 걸리면 바꾸려던 이전 값은 무효 — 비운다(안 비우면 창을 닫았을 때 옛 값으로 저장된다)
    if (hits.length === 0 && value) onChange?.('', null)
    setQ(needle)
    setOpen(true)
  }

  const picked = values ?? []
  const selected = items.find((i) => i.value === value) ?? null
  const pickedItems = items.filter((i) => picked.includes(i.value))
  /**
   * 고른 뒤 칸에 적는 이름. 같은 이름의 후보가 또 있으면 <b>규격(sub)이나 코드를 덧붙인다.</b>
   * 조건 값이 id 라 거르는 건 정확한데, 칸에는 이름만 남아 '어느 QA동명상사를 골랐는지'
   * 다시 볼 길이 없었다(이름이 같고 규격만 다른 품목이 제조업에선 정상이다).
   */
  const labelOf = (i: CodeItem) => {
    const twins = items.filter((x) => x.name === i.name && x.value !== i.value)
    if (!twins.length) return i.name
    const subUnique = i.sub && twins.every((x) => x.sub !== i.sub)
    return subUnique ? `${i.name} [${i.sub}]` : `${i.name} (${i.code ?? i.value})`
  }
  const display = multiple
    ? (pickedItems.length === 0 ? ''
      : pickedItems.length === 1 ? labelOf(pickedItems[0])
      : `${labelOf(pickedItems[0])} 외 ${pickedItems.length - 1}명`)
    : (selected ? (showCode ? (selected.code ?? selected.value) : labelOf(selected)) : '')
  /** 단일 선택 — 고르는 즉시 닫는다. */
  function pick(item: CodeItem | null) {
    onChange?.(item ? item.value : '', item)
    setOpen(false)
    setQ('')
  }
  /*
   * 창에서 고른 뒤 포커스를 이 칸으로 돌린다 — 창이 닫히면 포커스가 body 로 떨어져, 출하입력 머리에서 담당자를 코드 + Enter 로
   * 고른 다음 Tab · 출하창고 코드 + Enter 가 아무 데도 안 갔다(두 번째에야 됐다, 2026-10-29 QA). 칸에서 Enter 나 글자를 치면 창이 열린다.
   */
  const fieldRef = useRef<HTMLInputElement>(null)
  const pickFromPopup = (item: CodeItem | null) => {
    pick(item)
    requestAnimationFrame(() => fieldRef.current?.focus())
  }
  const openByKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (disabled || e.ctrlKey || e.metaKey || e.altKey) return
    if (e.key === 'Enter') { e.preventDefault(); setOpen(true); return }
    if (e.key.length === 1 && e.key !== ' ') { e.preventDefault(); setQ(e.key); setOpen(true) }
  }

  /** 다중 선택 — 체크만 하고 팝업은 열어 둔다(여러 개를 연달아 고르는 게 목적이므로). */
  function toggle(item: CodeItem) {
    const next = picked.includes(item.value)
      ? picked.filter((v) => v !== item.value)
      : [...picked, item.value]
    onChangeMulti?.(next, items.filter((i) => next.includes(i.value)))
  }

  function clearAll() {
    if (multiple) onChangeMulti?.([], [])
    else pick(null)
  }

  // <label> 로 감싸면 안 된다 — 팝업이 이 요소 안에 렌더되므로, 팝업 안의 클릭이 label 을 통해
  // 입력칸으로 전달돼 행 선택이 먹히지 않고 팝업이 닫히지 않는다(실제로 그렇게 동작했다).
  return (
    <div style={{ fontSize: 12.5, width: fill ? "100%" : undefined }}>
      {!hideLabel && <div className="text-ec-label mb-[3px]">{label}</div>}

      {pair ? (
        /* 전표 코드칸: [코드][🔍][명칭][×] — 원본 .control > .form-control-code */
        <div className={invalid ? 'ec-code ec-invalid' : 'ec-code'}>
          <input
            ref={fieldRef}
            className="ec-input code"
            disabled={disabled}
            value={typed ?? selected?.code ?? ''}
            placeholder={label}
            onChange={(e) => setTyped(e.target.value)}
            // <form> 안에서 Enter 가 바깥 폼을 제출하지 않게 막는다
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submitTyped() } }}
            // Tab 으로 떠나도 코드가 정확히 하나를 가리키면 그것을 고른다. 아니면 친 글자를 버리고 원래 값으로 돌아간다
            onBlur={() => { if (typed !== null) submitTyped(true) }}
            style={{ background: disabled ? '#f4f5f7' : undefined }}
          />
          <button
            type="button"
            className="ec-btn"
            disabled={disabled}
            onClick={openFrom}
            title={`${label} 코드도움`}
          >
            <EcIcon name="search" />
          </button>
          <input
            className="ec-input name"
            readOnly={!onNameChange}
            disabled={disabled}
            value={onNameChange ? (nameValue ?? selected?.name ?? '') : (selected?.name ?? '')}
            onChange={onNameChange ? (e) => onNameChange(e.target.value) : undefined}
            placeholder=""
            onClick={(e) => !disabled && !onNameChange && openFrom(e)}
            title={selected ? `${selected.code ?? ''} ${selected.name}`.trim() : ''}
            style={{ background: disabled ? '#f4f5f7' : '#fff', cursor: disabled ? 'default' : onNameChange ? 'text' : 'pointer' }}
          />
          {!!selected && !disabled && (
            <button type="button" className="ec-btn" onClick={clearAll} title="선택 해제" style={{ color: 'var(--ec-danger)' }}>
              ×
            </button>
          )}
        </div>
      ) : (
      /* 조건 코드도움 칸: [🔍][이름][×] — 돋보기가 칸 <b>왼쪽</b>이다(원본 판매조회 · 작업지시서 · 창고이동 · 일별이익현황 2026-10-31 loginad 실측).
         붙는 쪽 모서리만 각지다(.ec-pick — 전표 코드칸 .ec-code 와 같은 규칙). */
      <div className={`ec-pick${fill ? ' fill' : ''}${invalid ? ' ec-invalid' : ''}`}>
        <button
          type="button"
          className="ec-btn text-ec-icon"
          disabled={disabled}
          onClick={openFrom}
          title={`${label} 선택`}
        >
          <EcIcon name="search" />
        </button>
        <input
          ref={fieldRef}
          className="ec-input ec-pick-input"
          readOnly
          onKeyDown={multiple ? undefined : openByKey}
          disabled={disabled}
          value={display}
          placeholder={placeholder ?? label}
          onClick={(e) => !disabled && openFrom(e)}
          style={{ width: fill ? '100%' : width, flex: fill ? 1 : undefined,
                   cursor: disabled ? 'default' : 'pointer', background: disabled ? '#f4f5f7' : undefined }}
          title={multiple ? pickedItems.map((i) => i.name).join(', ') : (selected ? `${selected.code ?? ''} ${selected.name}`.trim() : (placeholder ?? label))}
        />
        {(multiple ? picked.length > 0 : !!selected) && !disabled && (
          <button
            type="button"
            className="ec-btn ec-pick-clear"
            onClick={clearAll}
            title="선택 해제"
          >
            ×
          </button>
        )}
      </div>
      )}

      <CodeSearchModal
        open={open}
        label={label}
        title={popupTitle}
        items={items}
        columns={columns}
        value={value}
        emptyLabel={emptyLabel}
        initialQuery={q}
        onPick={pickFromPopup}
        onClose={() => { setOpen(false); setQ('') }}
        multiple={multiple}
        picked={picked}
        onToggle={toggle}
        onClearAll={clearAll}
        onApply={() => { setOpen(false); setQ('') }}
        onNew={onNew}
        plain={plain}
        hideNew={hideNew}
        employeeSearch={employeeSearch}
        checkApply={checkApply}
        onApplyMany={(its) => { onPickMany?.(its); setOpen(false); setQ('') }}
      />
    </div>
  )
}
