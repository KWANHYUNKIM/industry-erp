import { useEffect, useRef, useState } from 'react'
import { extractErrorMessage } from '../../../api/client'
import Modal from '../../../components/Modal'
import { useShortcut } from '../../../utils/useShortcut'
import { useTableSort } from '../../../utils/useTableSort'
import { exportTableToXlsx } from '../../../utils/excel'
import {
  createApprovalGroup, deleteApprovalGroup, fetchApprovalGroups, nextGroupCode, setApprovalGroupActive, updateApprovalGroup,
  type ApprovalGroup,
} from '../groups'

/** 원본 [사용중단/재사용 ▲] — 펴는 항목을 넘겨받는다(목록: 사용중단 · 재사용, 수정 창: 사용중단 · 삭제). */
function DropUp({ label, items, disabled, onPick }: {
  label: string
  items: [string, string][]
  disabled?: boolean
  onPick: (key: string) => void
}) {
  const [open, setOpen] = useState(false)
  return (
    <span className="relative">
      <button type="button" className="ec-btn disabled:opacity-45" disabled={disabled} onClick={() => setOpen((v) => !v)}>{label} ▴</button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute bottom-full left-0 mb-[2px] z-[41] min-w-[120px] p-[4px] bg-ec-panel border border-ec-line border-solid rounded-ec">
            {items.map(([k, l]) => (
              <button key={k} type="button" className="no-ec block w-full text-left py-[6px] px-[8px] text-[12px] bg-transparent border-0 cursor-pointer"
                      onClick={() => { setOpen(false); onPick(k) }}>{l}</button>
            ))}
          </div>
        </>
      )}
    </span>
  )
}

/**
 * 원본 공통양식 › 입력화면설정 › 기본값설정 › [구분] 코드도움이 여는 '구분검색' 창(loginaa E070107, 2026-10-12 · 10-13 실측).
 *
 * <p><b>고르기 모드</b>: 머리 '구분검색' + [입력 후 [Enter]][Search(F3)], 격자 [그룹코드▼][그룹명▼], 줄을 누르면 고르고 닫힌다.
 * 하단 [신규(F2)][수정][닫기].
 * <p><b>[수정] 모드</b>: 같은 창에서 앞에 행번호 · 고르기 칸이 붙고 하단이 [신규(F2)][이전][사용중단/재사용 ▲][Excel][닫기] 가 된다.
 * 코드나 이름을 누르면 '구분검색수정'(그룹코드는 글자, 그룹명만 고침) — [저장(F8) ▲][사용중단/재사용 ▲(사용중단 · 삭제)][닫기].
 * <p>'구분검색등록': 그룹코드(기본 '00001' — 비어 있는 다섯 자리 번호) · 그룹명, [저장(F8) ▲(저장/내용유지 · 저장/신규)][닫기].
 * 비우면 '그룹코드를 입력 바랍니다.' · '그룹명칭을 입력 바랍니다.', 같은 코드는 '이미 존재하는 코드 입니다. 다른 코드를 입력 바랍니다.'
 * 저장하면 창이 닫히고 목록에 그 줄이 선다. 삭제는 '삭제하겠습니까?' 를 묻는다.
 */
export default function ApprovalGroupSearchModal({ onPick, onClose }: {
  onPick: (g: ApprovalGroup) => void
  onClose: () => void
}) {
  const [groups, setGroups] = useState<ApprovalGroup[]>([])
  const [keyword, setKeyword] = useState('')
  const [applied, setApplied] = useState('')
  /** [수정] 을 누른 뒤 — 행번호 · 고르기 칸, 사용중단 · Excel. [이전] 으로 돌아간다. */
  const [manage, setManage] = useState(false)
  const [checked, setChecked] = useState<Set<number>>(new Set())
  const [error, setError] = useState('')
  /** 열어 둔 등록 · 수정 창. group 이 있으면 '구분검색수정'. */
  const [edit, setEdit] = useState<{ group: ApprovalGroup | null; code: string; name: string } | null>(null)
  /** 빈 칸 · 겹친 코드 — 칸 위에 뜨는 말풍선 문구. */
  const [tip, setTip] = useState<{ field: 'code' | 'name'; text: string } | null>(null)
  const tableRef = useRef<HTMLTableElement>(null)

  async function load() {
    try { setGroups(await fetchApprovalGroups()) } catch (err) { setError(extractErrorMessage(err)) }
  }
  useEffect(() => { void load() }, [])

  const shown = groups.filter((g) => (manage || g.active !== false) && (!applied || g.code.includes(applied) || g.name.includes(applied)))
  const sort = useTableSort(shown, { 그룹코드: (g) => g.code, 그룹명: (g) => g.name })

  const openNew = () => { setTip(null); setError(''); setEdit({ group: null, code: nextGroupCode(groups), name: '' }) }
  const openEdit = (g: ApprovalGroup) => { setTip(null); setError(''); setEdit({ group: g, code: g.code, name: g.name }) }
  useShortcut('F2', openNew, !edit)
  useShortcut('F3', () => setApplied(keyword.trim()), !edit)
  useShortcut('F8', () => void save('close'), !!edit)

  async function save(then: 'close' | 'keep' | 'new') {
    if (!edit) return
    setError(''); setTip(null)
    if (!edit.code.trim()) return setTip({ field: 'code', text: '그룹코드를 입력 바랍니다.' })
    if (!edit.name.trim()) return setTip({ field: 'name', text: '그룹명칭을 입력 바랍니다.' })
    if (!edit.group && groups.some((g) => g.code === edit.code.trim())) {
      return setTip({ field: 'code', text: '이미 존재하는 코드 입니다. 다른 코드를 입력 바랍니다.' })
    }
    try {
      const saved = edit.group
        ? await updateApprovalGroup(edit.group, edit.name.trim())
        : await createApprovalGroup(edit.code.trim(), edit.name.trim())
      const next = await fetchApprovalGroups()
      setGroups(next)
      if (then === 'close') setEdit(null)
      else if (then === 'keep') setEdit({ group: saved, code: saved.code, name: saved.name })
      else setEdit({ group: null, code: nextGroupCode(next), name: '' })
    } catch (err) { setError(extractErrorMessage(err)) }
  }

  async function act(ids: number[], a: string) {
    setError('')
    try {
      if (a === 'delete') {
        if (!window.confirm('삭제하겠습니까?')) return
        for (const id of ids) await deleteApprovalGroup(id)
      } else {
        for (const id of ids) await setApprovalGroupActive(id, a === 'reuse')
      }
      setChecked(new Set())
      setEdit(null)
      await load()
    } catch (err) { setError(extractErrorMessage(err)) }
  }

  const toggle = (id: number) => setChecked((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const allChecked = sort.sorted.length > 0 && sort.sorted.every((g) => checked.has(g.id))

  const field = (key: 'code' | 'name', label: string, value: string, set: (v: string) => void, max: number) => (
    <>
      <span>{label}</span>
      <span className="relative">
        {tip?.field === key && (
          <span role="tooltip" className="absolute left-1/2 bottom-full mb-[4px] -translate-x-1/2 z-10 whitespace-pre py-[6px] px-[12px] text-[12px] bg-ec-panel border border-ec-line border-solid rounded-ec-panel">
            {tip.text.replace('입니다. ', '입니다.\n')}
          </span>
        )}
        <input className={`ec-input w-full ${tip?.field === key ? 'border-ec-danger' : ''}`} aria-label={label} placeholder={label}
               maxLength={max} value={value} onChange={(e) => { set(e.target.value); setTip(null) }} />
      </span>
    </>
  )

  return (
    <>
      <Modal open title="구분검색" width={616} error={edit ? null : error} onClose={onClose}>
        <div className="flex items-center mb-[8px]">
          <span className="text-[14px] font-bold">구분검색</span>
          <div className="ml-auto flex gap-[4px]">
            <input className="ec-input w-[105px]" placeholder="입력 후 [Enter]" aria-label="구분 검색" value={keyword}
                   onChange={(e) => setKeyword(e.target.value)}
                   onKeyDown={(e) => { if (e.key === 'Enter') setApplied(keyword.trim()) }} />
            <button type="button" className="ec-btn ec-btn-primary" onClick={() => setApplied(keyword.trim())}>Search(F3)</button>
          </div>
        </div>
        <table ref={tableRef} className="w-full table-fixed">
          <thead>
            <tr>
              {manage && (
                <th className="w-[40px] text-center">
                  <input type="checkbox" aria-label="전체 고르기" checked={allChecked}
                         onChange={() => setChecked(allChecked ? new Set() : new Set(sort.sorted.map((g) => g.id)))} />
                </th>
              )}
              <th className="cursor-pointer text-ec-navy text-center" onClick={() => sort.toggle('그룹코드')}>그룹코드 {sort.mark('그룹코드')}</th>
              <th className="cursor-pointer text-ec-navy text-center" onClick={() => sort.toggle('그룹명')}>그룹명 {sort.mark('그룹명')}</th>
            </tr>
          </thead>
          <tbody>
            {sort.sorted.length === 0 ? (
              <tr><td colSpan={manage ? 3 : 2} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
            ) : sort.sorted.map((g, i) => {
              const choose = () => (manage ? openEdit(g) : onPick(g))
              return (
                <tr key={g.id} className={g.active === false ? 'text-ec-hint' : ''}>
                  {manage && (
                    <td className={`text-center cursor-pointer select-none ${checked.has(g.id) ? 'bg-ec-blue-wash text-ec-navy font-bold' : 'text-ec-hint'}`}
                        aria-label={`${g.code} 고르기`} onClick={() => toggle(g.id)}>{i + 1}</td>
                  )}
                  <td>
                    <button type="button" className="no-ec bg-transparent border-0 p-0 cursor-pointer text-ec-navy" onClick={choose}>{g.code}</button>
                  </td>
                  <td>
                    <button type="button" className="no-ec bg-transparent border-0 p-0 cursor-pointer text-ec-navy" onClick={choose}>{g.name}</button>
                    {g.active === false && <span className="ml-[6px] text-[11px]">(사용중단)</span>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        <div className="flex gap-[6px] mt-[14px]">
          <button type="button" className="ec-btn" onClick={openNew}>신규(F2)</button>
          {manage ? (
            <>
              <button type="button" className="ec-btn" onClick={() => { setManage(false); setChecked(new Set()) }}>이전</button>
              <DropUp label="사용중단/재사용" disabled={checked.size === 0} items={[['stop', '사용중단'], ['reuse', '재사용']]}
                      onPick={(a) => void act([...checked], a)} />
              <button type="button" className="ec-btn" onClick={() => { if (tableRef.current) void exportTableToXlsx(tableRef.current, '구분검색') }}>Excel</button>
            </>
          ) : (
            <button type="button" className="ec-btn" onClick={() => setManage(true)}>수정</button>
          )}
          <button type="button" className="ec-btn" onClick={onClose}>닫기</button>
        </div>
      </Modal>

      {edit && (
        <Modal open title={edit.group ? '구분검색수정' : '구분검색등록'} width={756} error={error} onClose={() => setEdit(null)}>
          <div className="text-[14px] font-bold mb-[8px]">{edit.group ? '구분검색수정' : '구분검색등록'}</div>
          <div className="ec-form">
            <div className="grid grid-cols-[130px_1fr] gap-y-[6px] items-center text-[12px]">
              {edit.group
                ? <><span>그룹코드</span><span>{edit.code}</span></>
                : field('code', '그룹코드', edit.code, (v) => setEdit({ ...edit, code: v }), 20)}
              {field('name', '그룹명', edit.name, (v) => setEdit({ ...edit, name: v }), 50)}
            </div>
          </div>
          <div className="flex gap-[6px] mt-[14px]">
            <span className="ec-btn-group">
              <button type="button" className="ec-btn ec-btn-primary" onClick={() => void save('close')}>저장(F8)</button>
              <DropUp label="" items={[['keep', '저장/내용유지'], ['new', '저장/신규']]} onPick={(k) => void save(k as 'keep' | 'new')} />
            </span>
            {edit.group && (
              <DropUp label="사용중단/재사용" items={edit.group.active === false ? [['reuse', '재사용'], ['delete', '삭제']] : [['stop', '사용중단'], ['delete', '삭제']]}
                      onPick={(a) => void act([edit.group!.id], a)} />
            )}
            <button type="button" className="ec-btn" onClick={() => setEdit(null)}>닫기</button>
          </div>
        </Modal>
      )}
    </>
  )
}

/**
 * [구분] 코드도움 칸 — 고른 구분의 이름 + 🔍(구분검색 창) + ×(지우기).
 * 칸을 눌러도 창이 열린다. 선택상자 대신 원본처럼 창에서 고르고, 그 창에서 구분을 늘리고 고친다.
 */
export function ApprovalGroupField({ value, onChange, className = 'w-[240px]' }: {
  /** 지금 고른 구분 — 이름으로 보인다. */
  value: { code?: string | null; name?: string | null } | null
  onChange: (g: ApprovalGroup | null) => void
  /** 칸 폭(Tailwind) — 화면 코드에 px 를 인라인으로 쓰지 않는다. */
  className?: string
}) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <div className={`ec-code flex-none ${className}`}>
        <input className="ec-input name cursor-pointer" readOnly aria-label="구분" placeholder="구분"
               value={value?.name ?? ''} title={value?.code ? `${value.code} ${value.name ?? ''}` : ''}
               onClick={() => setOpen(true)} />
        <button type="button" className="ec-btn" title="구분 코드도움" aria-label="구분검색" onClick={() => setOpen(true)}>🔍</button>
        {!!value?.name && (
          <button type="button" className="ec-btn text-ec-danger" title="선택 해제" onClick={() => onChange(null)}>×</button>
        )}
      </div>
      {open && <ApprovalGroupSearchModal onClose={() => setOpen(false)} onPick={(g) => { setOpen(false); onChange(g) }} />}
    </>
  )
}
