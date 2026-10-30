import { Suspense, lazy, useEffect, useState } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import Modal from '../../components/Modal'
import { ecAlert } from '../../components/EcDialog'
import EcIcon from '../../components/ui/EcIcon'
import { useShortcut } from '../../utils/useShortcut'

/**
 * 머리 오른쪽 사람 그림 → 작은 판. 원본 ec56(2026-10-30 loginaa 다시 눌러 봄) 차례 그대로:
 * 프로필(머리) · 개인정보수정 · 개인기능설정 · 아이콘바 설정 · 로그인관리 · 보안점수 · 로그아웃 · 퇴근 & 로그아웃.
 * 창은 화면을 옮기지 않고 지금 화면 위에 뜬다(원본도 레이어 창).
 */
/* 창 안 화면은 라우터를 빌린다 — 틀(EcountLayout)이 이 파일을 부르므로 늦게 불러 고리를 끊는다 */
const PageWindow = lazy(() => import('../mypage/PageWindow'))

type Win = 'profile' | 'prefs' | 'mypage' | null

/* 우리에게 아직 없는 것 — 무엇이 없는지 말한다(plans/데이터이관/클릭대조/대조-메인(MyPage).md '남음') */
const NOT_YET: Record<string, string> = {
  '아이콘바 설정': '[아이콘바 설정] 은 아직 없습니다.\n오른쪽 앱바 맨 아래 [숨김 아이콘] 으로 아이콘을 접고 펼 수 있습니다.',
  로그인관리: '[로그인관리] 는 아직 없습니다.\n이 ERP 는 접속 이력을 남기지 않습니다.',
  보안점수: '[보안점수] 는 아직 없습니다.',
  '퇴근 & 로그아웃': '[퇴근 & 로그아웃] 은 아직 없습니다.\n그룹웨어 › 출/퇴근기록부(ID) 에서 퇴근을 넣은 뒤 [로그아웃] 하십시오.',
}

export default function UserMenu({ name, onLogout }: { name?: string; onLogout: () => void }) {
  const [open, setOpen] = useState(false)
  const [win, setWin] = useState<Win>(null)

  const pick = (label: string) => {
    setOpen(false)
    if (label === '개인정보수정') setWin('profile')
    else if (label === '개인기능설정') setWin('prefs')
    else if (label === '로그아웃') onLogout()
    else if (NOT_YET[label]) void ecAlert(NOT_YET[label])
  }

  return (
    <>
      <button className="ec-avatar" title={name} aria-label="사용자 메뉴" onClick={() => setOpen((o) => !o)}><EcIcon name="user" size={16} /></button>
      {open && (
        <>
          <div className="ec-user-back" onClick={() => setOpen(false)} />
          <div className="ec-user-menu" role="menu" aria-label="사용자 메뉴">
            <div className="head">프로필</div>
            {['개인정보수정', '개인기능설정', '아이콘바 설정', '로그인관리', '보안점수', '로그아웃', '퇴근 & 로그아웃'].map((l) => (
              <button key={l} type="button" role="menuitem" onClick={() => pick(l)}>{l}</button>
            ))}
          </div>
        </>
      )}
      {win === 'profile' && <ProfileWindow onClose={() => setWin(null)} />}
      {win === 'prefs' && <PersonalPrefsWindow onClose={() => setWin(null)} onMyPage={() => setWin('mypage')} />}
      {win === 'mypage' && <Suspense fallback={null}><PageWindow path="/mypage/folders" title="MyPage설정" onClose={() => setWin('prefs')} /></Suspense>}
    </>
  )
}

interface MyProfile { username: string; name: string; email: string | null }

/** [개인정보수정] — 원본 창의 칸 가운데 우리가 가진 것(비밀번호 변경 · 성명 · Email)만 */
function ProfileWindow({ onClose }: { onClose: () => void }) {
  const [p, setP] = useState<MyProfile | null>(null)
  const [error, setError] = useState('')
  const [pw, setPw] = useState<{ current: string; next: string; again: string } | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    api.get<MyProfile>('/me/profile').then((r) => setP(r.data)).catch((e) => setError(extractErrorMessage(e)))
  }, [])

  async function save() {
    if (!p || saving) return
    setError('')
    if (pw && (pw.current || pw.next || pw.again)) {
      if (pw.next !== pw.again) { setError('새 비밀번호가 서로 다릅니다.'); return }
    }
    setSaving(true)
    try {
      if (pw && (pw.current || pw.next)) await api.put('/me/password', { currentPassword: pw.current, newPassword: pw.next })
      await api.put<MyProfile>('/me/profile', { name: p.name, email: p.email })
      onClose()
    } catch (e) {
      setError(extractErrorMessage(e))
    } finally {
      setSaving(false)
    }
  }
  useShortcut('F8', save, !saving)

  return (
    <Modal open title="개인정보수정" onClose={onClose} error={error} width={560}>
      {!p ? <p className="text-ec-hint">불러오는 중…</p> : (
        <ul className="ec-form">
          <li className="wide"><div className="title">ID</div><div className="form">{p.username}</div></li>
          <li className="wide">
            <div className="title">비밀번호</div>
            <div className="form">
              {!pw ? <button type="button" className="ec-btn" onClick={() => setPw({ current: '', next: '', again: '' })}>비밀번호 변경</button> : (
                <div className="flex flex-col gap-[4px]">
                  <input className="ec-input w-[220px]" type="password" aria-label="현재 비밀번호" placeholder="현재 비밀번호" autoComplete="current-password"
                         value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} />
                  <input className="ec-input w-[220px]" type="password" aria-label="새 비밀번호" placeholder="새 비밀번호" autoComplete="new-password"
                         value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} />
                  <input className="ec-input w-[220px]" type="password" aria-label="새 비밀번호 확인" placeholder="새 비밀번호 확인" autoComplete="new-password"
                         value={pw.again} onChange={(e) => setPw({ ...pw, again: e.target.value })} />
                </div>
              )}
            </div>
          </li>
          <li className="wide"><div className="title">성명</div><div className="form"><input className="ec-input w-[220px]" aria-label="성명" value={p.name} onChange={(e) => setP({ ...p, name: e.target.value })} /></div></li>
          <li className="wide"><div className="title">Email</div><div className="form"><input className="ec-input w-[260px]" aria-label="Email" value={p.email ?? ''} onChange={(e) => setP({ ...p, email: e.target.value })} /></div></li>
        </ul>
      )}
      <div className="ec-slip-footer">
        <button type="button" className="ec-btn ec-btn-primary" onClick={() => void save()} disabled={saving || !p}>저장(F8)</button>
        <button type="button" className="ec-btn" onClick={onClose}>닫기</button>
      </div>
    </Modal>
  )
}

/** [개인기능설정] — 원본 창의 줄 가운데 우리가 가진 것: 기본설정 › My Page설정(누르면 'MyPage설정' 창) */
function PersonalPrefsWindow({ onClose, onMyPage }: { onClose: () => void; onMyPage: () => void }) {
  return (
    <Modal open title="개인기능설정" onClose={onClose} width={720}>
      <ul className="ec-form">
        <li className="wide">
          <div className="title">기본설정</div>
          <div className="form">My Page설정 <button type="button" className="ec-btn ml-[8px]" onClick={onMyPage}>설정</button></div>
        </li>
      </ul>
      <div className="ec-slip-footer">
        <button type="button" className="ec-btn" onClick={onClose}>닫기</button>
      </div>
    </Modal>
  )
}
