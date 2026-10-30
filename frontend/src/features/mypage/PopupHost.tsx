import { useEffect, useRef, type ReactNode } from 'react'

/**
 * 화면 하나를 <b>숨긴 채</b> 그려 그 화면의 창(Modal — .ec-modal-back)만 메인 위에 보이게 한다.
 * MyPage 위젯 [펜] · 본문 클릭이 원본처럼 '일정관리등록' · '공지사항View' 같은 창 하나만 띄울 때 쓴다 —
 * 입력 · 조회 창이 화면 상태(분류 · 라벨 · 반복 · 결재선 …)에 깊이 엮여 있어 떼어 내는 대신 화면을 통째로 빌린다.
 *
 * 창이 하나라도 떴다가 모두 닫히면 onClose. 창 → 창으로 갈아타는 사이(View [수정] → 입력 창)에 잠깐 비는 것은 기다려 본다.
 * 끝내 창이 안 뜨면(지워진 글 …) 조금 뒤 스스로 닫는다.
 */
export default function PopupHost({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  useEffect(() => {
    const el = ref.current
    if (!el) return
    let seen = false
    let timer: number | undefined
    const open = () => !!el.querySelector('.ec-modal-back')
    const check = () => {
      if (open()) {
        seen = true
        window.clearTimeout(timer)
        timer = undefined
        return
      }
      if (timer !== undefined) return
      timer = window.setTimeout(() => {
        timer = undefined
        if (!open()) closeRef.current()
      }, seen ? 150 : 8000)
    }
    const mo = new MutationObserver(check)
    mo.observe(el, { childList: true, subtree: true })
    check()
    return () => { mo.disconnect(); window.clearTimeout(timer) }
  }, [])

  return <div ref={ref} className="ec-popup-host">{children}</div>
}
