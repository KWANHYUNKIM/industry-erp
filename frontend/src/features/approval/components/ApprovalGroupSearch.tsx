import { useEffect, useState } from 'react'
import { extractErrorMessage } from '../../../api/client'
import Modal from '../../../components/Modal'
import { useShortcut } from '../../../utils/useShortcut'
import { useTableSort } from '../../../utils/useTableSort'
import { createApprovalGroup, fetchApprovalGroups, updateApprovalGroup, type ApprovalGroup } from '../groups'

/**
 * 원본 공통양식 › 입력화면설정 › 기본값설정 › [구분] 코드도움이 여는 '구분검색' 창(2026-10-12 loginaa E070107 실측).
 * 격자 [그룹코드▼][그룹명▼](01 지출결의서 · 02 휴가신청서 · 03 신청서 · 04 출장보고서), 하단 [신규(F2)][수정][닫기].
 * 줄을 누르면 그 구분을 골라 창이 닫힌다.
 *
 * <p>그때까지 우리는 구분 마스터를 API 로만 늘리고 고칠 수 있었다(d2a2af10) — 칸은 선택상자였다.
 * [수정]은 고른 줄(행번호 칸)의 그룹명만 바꾼다. 그룹코드는 양식이 가리키고 있어 막는다(서버도 코드는 안 바꾼다).
 */
export default function ApprovalGroupSearchModal({ onPick, onClose }: {
  onPick: (g: ApprovalGroup) => void
  onClose: () => void
}) {
  const [groups, setGroups] = useState<ApprovalGroup[]>([])
  const [checked, setChecked] = useState<number | null>(null)
  const [error, setError] = useState('')
  /** 열어 둔 등록 · 수정 창. id 가 있으면 수정. */
  const [edit, setEdit] = useState<{ group: ApprovalGroup | null; code: string; name: string } | null>(null)
  const [invalid, setInvalid] = useState(false)
  const sort = useTableSort(groups, { 그룹코드: (g) => g.code, 그룹명: (g) => g.name })

  async function load() {
    try { setGroups(await fetchApprovalGroups()) } catch (err) { setError(extractErrorMessage(err)) }
  }
  useEffect(() => { void load() }, [])

  const openNew = () => { setInvalid(false); setError(''); setEdit({ group: null, code: '', name: '' }) }
  const openEdit = () => {
    const g = groups.find((x) => x.id === checked)
    if (!g) return
    setInvalid(false); setError(''); setEdit({ group: g, code: g.code, name: g.name })
  }
  useShortcut('F2', openNew, !edit)
  useShortcut('F8', () => void save(), !!edit)

  async function save() {
    if (!edit) return
    setError('')
    if (!edit.code.trim() || !edit.name.trim()) return setInvalid(true)
    try {
      if (edit.group) await updateApprovalGroup(edit.group, edit.name.trim())
      else await createApprovalGroup(edit.code.trim(), edit.name.trim())
      setEdit(null)
      await load()
    } catch (err) { setError(extractErrorMessage(err)) }
  }

  return (
    <>
      <Modal open title="구분검색" width={560} error={edit ? null : error} onClose={onClose}>
        <table className="w-full table-fixed">
          <thead>
            <tr>
              <th className="w-[34px]" />
              <th className="cursor-pointer text-ec-navy" onClick={() => sort.toggle('그룹코드')}>그룹코드 {sort.mark('그룹코드')}</th>
              <th className="cursor-pointer text-ec-navy" onClick={() => sort.toggle('그룹명')}>그룹명 {sort.mark('그룹명')}</th>
            </tr>
          </thead>
          <tbody>
            {sort.sorted.length === 0 ? (
              <tr><td colSpan={3} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
            ) : sort.sorted.map((g, i) => (
              <tr key={g.id}>
                <td className={`text-center cursor-pointer select-none ${checked === g.id ? 'bg-ec-blue-wash text-ec-navy font-bold' : 'bg-ec-stripe text-ec-hint'}`}
                    aria-label={`${g.code} 고르기`}
                    onClick={() => setChecked((c) => (c === g.id ? null : g.id))}>{i + 1}</td>
                <td>
                  <button type="button" className="no-ec bg-transparent border-0 p-0 cursor-pointer text-ec-navy"
                          onClick={() => onPick(g)}>{g.code}</button>
                </td>
                <td>
                  <button type="button" className="no-ec bg-transparent border-0 p-0 cursor-pointer text-ec-navy"
                          onClick={() => onPick(g)}>{g.name}</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="flex gap-[6px] mt-[14px]">
          <button type="button" className="ec-btn ec-btn-primary" onClick={openNew}>신규(F2)</button>
          <button type="button" className="ec-btn disabled:opacity-45" disabled={checked == null} onClick={openEdit}>수정</button>
          <button type="button" className="ec-btn" onClick={onClose}>닫기</button>
        </div>
      </Modal>

      {edit && (
        <Modal open title={edit.group ? '구분수정' : '구분등록'} width={480} error={error} onClose={() => setEdit(null)}>
          <div className="ec-form">
            <div className="grid grid-cols-[100px_1fr] gap-y-[6px] items-center text-[12px]">
              <span>그룹코드</span>
              {edit.group
                ? <span>{edit.code}</span>
                : <input className={`ec-input ${invalid && !edit.code.trim() ? 'border-ec-danger' : ''}`} aria-label="그룹코드" placeholder="그룹코드"
                         maxLength={20} value={edit.code} onChange={(e) => setEdit({ ...edit, code: e.target.value })} />}
              <span>그룹명</span>
              <input className={`ec-input ${invalid && !edit.name.trim() ? 'border-ec-danger' : ''}`} aria-label="그룹명" placeholder="그룹명"
                     maxLength={50} value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
            </div>
          </div>
          <div className="flex gap-[6px] mt-[14px]">
            <button type="button" className="ec-btn ec-btn-primary" onClick={() => void save()}>저장(F8)</button>
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
