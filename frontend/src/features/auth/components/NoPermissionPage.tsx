import { useEffect, useState } from 'react'
import { api, extractErrorMessage } from '../../../api/client'
import { ecAlert } from '../../../components/EcDialog'
import Modal from '../../../components/Modal'
import { useAuth } from '../AuthContext'
import { permForRoute } from '../menuPermissions'

interface Master { id: number; username: string; name: string }

/** 권한요청을 보냈을 때의 안내(원본 문구 미실측 — 가정). */
export const REQUEST_SENT = '권한요청을 보냈습니다.\n마스터가 승인하면 이 메뉴를 쓸 수 있습니다.'

/**
 * 막힌 화면(메뉴 진입 권한 없음) — 원본 2026-10-30 loginaa 실측(plans/데이터이관/원본-업무권한.md §1).
 * 본문 틀 가운데: 회색 자물쇠 · '(결재설정) 업무 권한이 없습니다.'(괄호 안 파란 글자) · '서비스를 이용하려면 회사 마스터에게 문의 바랍니다.'
 * · '우리회사마스터 : a , b , c'(파란 이름, 큰 글씨 — 넷 이상이면 '권성희 , 노수민 , 전예진 외 3명', 영상 1514) · 파란 [권한요청]. 마스터 전용 메뉴(사용자관리)에는 [권한요청] 이 없다.
 * 왼쪽 · 위 메뉴는 그대로(EcountLayout 이 본문 자리에만 이것을 그린다).
 */
export default function NoPermissionPage({ path, menuName }: { path: string; menuName?: string }) {
  const { workName, isMasterOnly } = useAuth()
  const code = permForRoute(path)
  const [masters, setMasters] = useState<Master[]>([])
  const [asking, setAsking] = useState(false)

  useEffect(() => {
    api.get<Master[]>('/me/masters').then((r) => setMasters(r.data)).catch(() => setMasters([]))
  }, [])

  return (
    <div className="ec-noperm" data-testid="no-permission">
      <svg className="ec-noperm-lock" viewBox="0 0 64 64" aria-hidden="true">
        <rect x="12" y="28" width="40" height="30" rx="5" />
        <path d="M20 28v-8a12 12 0 0 1 24 0v8" fill="none" strokeWidth="6" />
        <circle cx="32" cy="42" r="4" className="hole" />
      </svg>
      <p className="ec-noperm-title">
        <span className="work">({code ? workName(code) : (menuName ?? '')})</span> 업무 권한이 없습니다.
      </p>
      <p className="ec-noperm-sub">서비스를 이용하려면 회사 마스터에게 문의 바랍니다.</p>
      <p className="ec-noperm-masters">
        우리회사마스터 : <span className="names">{masters.slice(0, 3).map((m) => m.name).join(' , ')}{masters.length > 3 ? ` 외 ${masters.length - 3}명` : ''}</span>
      </p>
      {code && !isMasterOnly(code) && (
        <button type="button" className="ec-btn ec-btn-primary ec-noperm-ask" onClick={() => setAsking(true)}>권한요청</button>
      )}
      {asking && code && (
        <PermissionRequestWindow code={code} path={path} menuName={menuName} onClose={() => setAsking(false)} />
      )}
    </div>
  )
}

/** [권한요청] 창 '권한요청사유' — 사유(선택) + [확인] [닫기]. 원본 영상 1998 · 2000. */
function PermissionRequestWindow({ code, path, menuName, onClose }: {
  code: string; path: string; menuName?: string; onClose: () => void
}) {
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function submit() {
    setSaving(true)
    setError('')
    try {
      await api.post('/permission-requests', { workCode: code, menuPath: path, menuName: menuName ?? null, reason: reason.trim() || null })
      onClose()
      await ecAlert(REQUEST_SENT)
    } catch (e) {
      setError(extractErrorMessage(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open title="권한요청사유" onClose={onClose} width={400} error={error}>
      {/* 원본(영상 1998): 머리 '권한요청사유' · 그 아래 '📄 권한요청사유' 한 줄 · 창 폭 그대로의 큰 글칸 · [확인] [닫기] */}
      <div className="font-bold mb-[6px] text-left" id="perm-req-reason-label">권한요청사유</div>
      <textarea id="perm-req-reason" aria-label="사유" aria-describedby="perm-req-reason-label" className="ec-input w-full h-[250px]"
                maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
      <div className="mt-[10px] flex gap-[4px]">
        <button type="button" className="ec-btn ec-btn-primary" disabled={saving} onClick={() => void submit()}>확인</button>
        <button type="button" className="ec-btn" onClick={onClose}>닫기</button>
      </div>
    </Modal>
  )
}
