import { useEffect, useState } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import Modal from '../../components/Modal'
import EcSettingSheet, { type SheetSection } from '../../components/EcSettingSheet'
import { useShortcut } from '../../utils/useShortcut'

/**
 * Self-Customizing > 보안관리 > 보안설정 (원본 C001138).
 *
 * <p>원본은 기능설정과 같은 틀이다 — [공통] 알약 · '접속관리'(접속제한설정 · 로그인관리 · 다중로그인) ·
 * '활동이력관리'(IP이력 · 로그인이력감시) · '보안설정' 판. 저장은 마스터만 된다.
 *
 * <p>우리 정책 중 <b>실제로 지키는 것은 최소 비밀번호 길이 하나</b>다(auth/user/UserService.requirePasswordPolicy —
 * 사용자 등록·비밀번호 변경). 변경주기 · 실패 잠금 · 세션 자동종료 · IP 제한 · 2단계 인증은 저장만 되고 아무 데서도
 * 안 써서 싣지 않는다. 옛 화면 아래의 '접속 이력' 표는 지어낸 표본 넉 줄이었다(접속 기록을 남기는 곳이 없다) — 뺐다.
 */
const TABS = ['공통'] as const

interface Policy { pwLength: number }

export default function SecurityPage() {
  const [policy, setPolicy] = useState<Policy | null>(null)
  const [editing, setEditing] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    api.get<Policy | null>('/security-policy')
      .then((r) => setPolicy({ pwLength: r.data?.pwLength ?? 8 }))
      .catch((err) => setError(extractErrorMessage(err)))
  }, [])

  const sheet: Record<typeof TABS[number], SheetSection[]> = {
    공통: [{
      title: '접속관리',
      groups: [{ title: '로그인관리', rows: [
        { label: '비밀번호설정', value: `최소 길이:${policy?.pwLength ?? ''}자`, editable: true },
      ] }],
    }],
  }

  return (
    <EcSettingSheet title="보안설정" tabs={TABS} sheet={sheet} loading={!policy}
      onEdit={() => { setError(''); setEditing(true) }}>
      {error && !editing && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
      {editing && policy && (
        <EditDialog policy={policy} error={error} onError={setError}
          onClose={() => { setEditing(false); setError('') }}
          onSaved={(p) => { setPolicy(p); setEditing(false) }} />
      )}
    </EcSettingSheet>
  )
}

function EditDialog({ policy, error, onError, onClose, onSaved }: {
  policy: Policy; error: string
  onError: (m: string) => void; onClose: () => void; onSaved: (p: Policy) => void
}) {
  const [len, setLen] = useState(String(policy.pwLength))
  const [saving, setSaving] = useState(false)

  async function save() {
    if (saving) return
    const n = Number(len)
    if (!Number.isInteger(n) || n < 1) { onError('비밀번호 최소 길이를 올바르게 입력하세요.'); return }
    setSaving(true); onError('')
    try {
      // 다른 정책 칸은 보내지 않는다 — 서버가 null 은 그대로 둔다.
      const r = await api.put<Policy>('/security-policy', { pwLength: n })
      onSaved({ pwLength: r.data.pwLength })
    } catch (err) {
      onError(extractErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }
  useShortcut('F8', save, !saving)

  return (
    <Modal open title="로그인관리" onClose={onClose} error={error} width={960}>
      <div className="pb-[10px] mb-[10px]">
        <div className="mb-[2px]">⊙ 비밀번호설정</div>
        <div className="pl-[13px] mb-[6px]">사용자 등록·비밀번호 변경 때 비밀번호가 이 길이보다 짧으면 저장하지 않습니다.</div>
        <div className="pl-[13px]">
          최소 길이 <input className="ec-input w-[60px] text-right" value={len} onChange={(e) => setLen(e.target.value)} /> 자
        </div>
      </div>
      <div className="ec-slip-footer">
        <button className="ec-btn ec-btn-primary" onClick={save} disabled={saving}>저장(F8)</button>
        <button className="ec-btn" onClick={onClose}>닫기</button>
      </div>
    </Modal>
  )
}
