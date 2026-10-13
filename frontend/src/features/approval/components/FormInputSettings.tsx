import { useEffect, useState } from 'react'
import { api, extractErrorMessage } from '../../../api/client'
import Modal from '../../../components/Modal'
import { useShortcut } from '../../../utils/useShortcut'

export type ViewTiming = 'DEFAULT' | 'BEFORE' | 'AFTER'
export type UserPerm = 'GROUP' | 'ALLOW' | 'DENY'

/** 공통양식 응답에 붙는 입력화면설정 값(서버 FormTemplateResponse). types/api.ts 는 공용이라 여기서 덧붙인다. */
export interface WithInputSettings {
  referenceViewTiming?: ViewTiming
  shareViewTiming?: ViewTiming
  /** 사용자 id → ALLOW · DENY. 없는 사람은 권한그룹. */
  userPermissions?: Record<string, 'ALLOW' | 'DENY'>
}

/**
 * 원본 공통양식 입력화면설정 › [기안서확인시점설정] '설정'(E070107, 2026-10-13 loginaa 실측).
 * ⊙ 수신참조 확인시점 — '참조자가 문서를 확인할 수 있는 시기를 설정합니다.' ◉기본설정(결재완료후) ○결재완료전 ○결재완료후
 * ⊙ 공유문서 확인시점 — '공유자가 문서를 확인할 수 있는 시기를 설정합니다.' ◉기본설정(결재완료전) ○결재완료전 ○결재완료후
 * 하단 [적용(F8)][닫기]. 적용은 입력화면설정 창의 값만 바꾸고, 저장은 그 창의 [저장(F8)] 이 한다.
 */
export function ViewTimingModal({ reference, share, onApply, onClose }: {
  reference: ViewTiming; share: ViewTiming
  onApply: (v: { reference: ViewTiming; share: ViewTiming }) => void; onClose: () => void
}) {
  const [ref, setRef] = useState(reference)
  const [sh, setSh] = useState(share)
  useShortcut('F8', () => onApply({ reference: ref, share: sh }))
  const group = (title: string, desc: string, defLabel: string, name: string, v: ViewTiming, set: (t: ViewTiming) => void) => (
    <div className="mb-[14px]">
      <div className="text-[12px] mb-[6px]">⊙ {title}</div>
      <p className="text-[12px] mt-0 mb-[6px] ml-[8px]">{desc}</p>
      <div className="flex gap-[12px] ml-[8px] text-[12px]">
        {([['DEFAULT', defLabel], ['BEFORE', '결재완료전'], ['AFTER', '결재완료후']] as const).map(([k, l]) => (
          <label key={k} className="inline-flex items-center gap-[4px] cursor-pointer">
            <input type="radio" name={name} aria-label={`${title} ${l}`} checked={v === k} onChange={() => set(k)} />{l}
          </label>
        ))}
      </div>
    </div>
  )
  return (
    <Modal open title="기안서확인시점설정" width={780} onClose={onClose}>
      <div className="text-[14px] font-bold mb-[12px]">기안서확인시점설정</div>
      {group('수신참조 확인시점', '참조자가 문서를 확인할 수 있는 시기를 설정합니다.', '기본설정(결재완료후)', 'refTiming', ref, setRef)}
      {group('공유문서 확인시점', '공유자가 문서를 확인할 수 있는 시기를 설정합니다.', '기본설정(결재완료전)', 'shareTiming', sh, setSh)}
      <div className="flex gap-[6px] mt-[60px]">
        <button type="button" className="ec-btn ec-btn-primary" onClick={() => onApply({ reference: ref, share: sh })}>적용(F8)</button>
        <button type="button" className="ec-btn" onClick={onClose}>닫기</button>
      </div>
    </Modal>
  )
}

interface UserLite { id: number; username: string; name: string }

/**
 * 원본 공통양식 입력화면설정 › [사용자별권한] '설정' → '대상자선택'(2026-10-13 실측).
 * [찾기(F3)] · 격자 [사용자][권한그룹][사용허가][사용불가] — 사람마다 셋 중 하나(처음엔 모두 권한그룹), 사용자 칸은 '이름(아이디)'.
 * 하단 [저장(F8)][닫기]. 사용불가면 그 사람의 기안서작성 양식 목록에서 이 양식이 빠지고, 서버도 기안을 막는다.
 * 원본 [권한그룹별권한](권한그룹 × 사용허가/사용불가)은 원본 권한그룹과 우리 역할이 맞지 않아 두지 않는다.
 */
export function UserPermissionModal({ value, onApply, onClose }: {
  value: Record<string, 'ALLOW' | 'DENY'>; onApply: (v: Record<string, 'ALLOW' | 'DENY'>) => void; onClose: () => void
}) {
  const [users, setUsers] = useState<UserLite[]>([])
  const [error, setError] = useState('')
  const [perm, setPerm] = useState<Record<string, 'ALLOW' | 'DENY'>>(value)
  const [keyword, setKeyword] = useState('')
  const [finding, setFinding] = useState(false)
  useEffect(() => { api.get<UserLite[]>('/users').then((r) => setUsers(r.data)).catch((err) => setError(extractErrorMessage(err))) }, [])
  useShortcut('F8', () => onApply(perm))
  useShortcut('F3', () => setFinding((v) => !v))
  const set = (id: number, p: UserPerm) => setPerm((m) => {
    const n = { ...m }
    if (p === 'GROUP') delete n[String(id)]
    else n[String(id)] = p
    return n
  })
  const shown = users.filter((u) => !keyword || u.name.includes(keyword) || u.username.includes(keyword))
  return (
    <Modal open title="대상자선택" width={780} error={error} onClose={onClose}>
      <div className="text-[14px] font-bold mb-[8px]">대상자선택</div>
      <div className="flex items-center gap-[6px] mb-[6px]">
        <button type="button" className="no-ec bg-transparent border-0 p-0 cursor-pointer text-[12px]" onClick={() => setFinding((v) => !v)}>찾기(F3)</button>
        {finding && <input className="ec-input w-[160px]" aria-label="사용자 찾기" value={keyword} autoFocus onChange={(e) => setKeyword(e.target.value)} />}
      </div>
      <div className="max-h-[360px] overflow-y-auto">
        <table className="w-full table-fixed">
          <thead>
            <tr><th>사용자</th><th className="w-[80px]">권한그룹</th><th className="w-[80px]">사용허가</th><th className="w-[80px]">사용불가</th></tr>
          </thead>
          <tbody>
            {shown.length === 0 ? (
              <tr><td colSpan={4} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
            ) : shown.map((u) => {
              const cur: UserPerm = perm[String(u.id)] ?? 'GROUP'
              return (
                <tr key={u.id}>
                  <td>{u.name}({u.username})</td>
                  {(['GROUP', 'ALLOW', 'DENY'] as const).map((p) => (
                    <td key={p} className="text-center">
                      <input type="radio" name={`perm-${u.id}`} aria-label={`${u.name} ${p}`} checked={cur === p} onChange={() => set(u.id, p)} />
                    </td>
                  ))}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div className="flex gap-[6px] mt-[14px]">
        <button type="button" className="ec-btn ec-btn-primary" onClick={() => onApply(perm)}>저장(F8)</button>
        <button type="button" className="ec-btn" onClick={onClose}>닫기</button>
      </div>
    </Modal>
  )
}
