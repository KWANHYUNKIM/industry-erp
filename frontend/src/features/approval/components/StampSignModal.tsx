import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import Modal from '../../../components/Modal'
import { ecAlert, ecConfirm } from '../../../components/EcDialog'
import { useShortcut } from '../../../utils/useShortcut'

/**
 * 원본 [My도장/서명] → '도장/서명올리기' 창(2026-10-30 E070105 클릭 대조).
 *
 *   등록할 이미지를 선택한 후, 사용할 영역을 선택합니다.
 *   Before : 원본사진 [이미지삽입]  |  After  가로: [ ] 세로: [ ]
 *   [저장(F8)] [삭제] [닫기]
 *
 * <p>Before 판에서 끌어 사용할 영역을 고르면(고르지 않으면 사진 전체) After 에 가로 × 세로 크기로 잘라 보인다.
 * 도장 이미지를 받아 둘 서버 자리가 아직 없어 <b>이 브라우저에만</b> 저장한다(사용자마다 따로).
 */
const keyOf = (user: string) => `erp_stamp_${user}`

/** 저장해 둔 도장/서명(data URL) — 없으면 null. */
export function loadStamp(user: string | undefined): string | null {
  if (!user) return null
  try { return localStorage.getItem(keyOf(user)) } catch { return null }
}

type Area = { x: number; y: number; w: number; h: number }

export default function StampSignModal({ user, onClose }: { user: string; onClose: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null)
  const imgRef = useRef<HTMLImageElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [src, setSrc] = useState<string | null>(null)
  const [saved, setSaved] = useState<string | null>(() => loadStamp(user))
  const [width, setWidth] = useState('100')
  const [height, setHeight] = useState('100')
  /** Before 판 위 고른 영역(화면 px) — 끄는 중이면 start 가 있다 */
  const [area, setArea] = useState<Area | null>(null)
  const start = useRef<{ x: number; y: number } | null>(null)
  /** 고른 영역 테두리 — 자리는 끄는 동안 바뀌어 DOM 에 직접 쓴다 */
  const boxRef = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const b = boxRef.current
    if (!b || !area) return
    b.style.left = `${area.x}px`
    b.style.top = `${area.y}px`
    b.style.width = `${area.w}px`
    b.style.height = `${area.h}px`
  }, [area])

  const w = Math.max(1, Math.min(600, Number(width) || 0))
  const h = Math.max(1, Math.min(600, Number(height) || 0))

  /* After — 고른 영역(없으면 전체)을 가로 × 세로로 그린다 */
  useEffect(() => {
    const c = canvasRef.current
    const img = imgRef.current
    if (!c) return
    const g = c.getContext('2d')
    if (!g) return
    g.clearRect(0, 0, c.width, c.height)
    if (!src || !img || !img.complete || img.naturalWidth === 0) return
    const sx = img.naturalWidth / img.clientWidth
    const sy = img.naturalHeight / img.clientHeight
    const a = area && area.w > 2 && area.h > 2 ? area : { x: 0, y: 0, w: img.clientWidth, h: img.clientHeight }
    g.drawImage(img, a.x * sx, a.y * sy, a.w * sx, a.h * sy, 0, 0, c.width, c.height)
  }, [src, area, w, h])

  function pick(file: File | undefined) {
    if (!file) return
    if (!file.type.startsWith('image/')) { void ecAlert('이미지 파일만 올릴 수 있습니다.'); return }
    const r = new FileReader()
    r.onload = () => { setArea(null); setSrc(String(r.result)) }
    r.readAsDataURL(file)
  }

  const pos = (e: React.PointerEvent) => {
    const b = (e.currentTarget as HTMLElement).getBoundingClientRect()
    return { x: Math.max(0, Math.min(b.width, e.clientX - b.left)), y: Math.max(0, Math.min(b.height, e.clientY - b.top)) }
  }

  async function save() {
    if (!src) { await ecAlert('등록할 이미지를 선택하세요.'); return }
    const data = canvasRef.current?.toDataURL('image/png')
    if (!data) return
    try { localStorage.setItem(keyOf(user), data) } catch { await ecAlert('이미지가 너무 커서 저장하지 못했습니다.'); return }
    setSaved(data)
    await ecAlert('저장되었습니다.')
  }

  async function remove() {
    if (!saved) { await ecAlert('삭제할 도장/서명이 없습니다.'); return }
    if (!(await ecConfirm('등록한 도장/서명을 삭제하겠습니까?'))) return
    try { localStorage.removeItem(keyOf(user)) } catch { /* 없으면 그만 */ }
    setSaved(null)
    setSrc(null)
    setArea(null)
  }

  useShortcut('F8', () => void save())

  return (
    <Modal open title="도장/서명올리기" width={720} onClose={onClose}>
      <p className="mb-[8px]">등록할 이미지를 선택한 후, 사용할 영역을 선택합니다.</p>
      <div className="flex gap-[12px] mobile:flex-col">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-[6px] mb-[4px]">
            <b>Before :</b> <span>원본사진</span>
            <button type="button" className="ec-btn ec-btn-sm ml-auto" onClick={() => fileRef.current?.click()}>이미지삽입</button>
            <input ref={fileRef} type="file" accept="image/*" hidden aria-label="이미지삽입"
                   onChange={(e) => { pick(e.target.files?.[0]); e.target.value = '' }} />
          </div>
          <div className="relative h-[260px] border border-ec-line border-solid bg-ec-page flex items-center justify-center overflow-hidden">
            {src ? (
              <div className="relative inline-block touch-none select-none cursor-crosshair"
                   onPointerDown={(e) => { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); const p = pos(e); start.current = p; setArea({ ...p, w: 0, h: 0 }) }}
                   onPointerMove={(e) => {
                     if (!start.current) return
                     const p = pos(e), s = start.current
                     setArea({ x: Math.min(s.x, p.x), y: Math.min(s.y, p.y), w: Math.abs(p.x - s.x), h: Math.abs(p.y - s.y) })
                   }}
                   onPointerUp={() => { start.current = null }}>
                <img ref={imgRef} src={src} alt="원본사진" draggable={false} className="block max-w-[320px] max-h-[250px]"
                     onLoad={() => setArea((a) => (a ? { ...a } : null))} />
                {area && area.w > 2 && area.h > 2 && (
                  <div ref={boxRef} className="absolute border border-dashed border-ec-blue pointer-events-none" />
                )}
              </div>
            ) : saved ? (
              <img src={saved} alt="등록된 도장/서명" className="max-w-[240px] max-h-[240px]" />
            ) : (
              <span className="text-ec-hint">이미지삽입으로 사진을 고르세요.</span>
            )}
          </div>
        </div>
        <div className="w-[260px] shrink-0 mobile:w-full">
          <div className="mb-[4px]"><b>After</b></div>
          <div className="h-[260px] border border-ec-line border-solid flex items-center justify-center overflow-auto">
            <canvas ref={canvasRef} width={w} height={h} aria-label="After" className="max-w-full" />
          </div>
          <div className="flex items-center gap-[6px] mt-[6px]">
            <label className="flex items-center gap-[4px]">가로:
              <input className="ec-input w-[60px] text-right" inputMode="numeric" value={width} onChange={(e) => setWidth(e.target.value.replace(/\D/g, ''))} />
            </label>
            <label className="flex items-center gap-[4px]">세로:
              <input className="ec-input w-[60px] text-right" inputMode="numeric" value={height} onChange={(e) => setHeight(e.target.value.replace(/\D/g, ''))} />
            </label>
          </div>
        </div>
      </div>
      <div className="flex gap-[6px] mt-[12px]">
        <button type="button" className="ec-btn ec-btn-primary" onClick={() => void save()}>저장(F8)</button>
        <button type="button" className="ec-btn" onClick={() => void remove()}>삭제</button>
        <button type="button" className="ec-btn" onClick={onClose}>닫기</button>
      </div>
    </Modal>
  )
}
