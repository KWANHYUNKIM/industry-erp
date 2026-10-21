import { useEffect, useRef, useState } from 'react'
import Modal from '../../components/Modal'

const FONTS = ['돋움', '굴림', '바탕', '맑은 고딕']
const SIZES = ['10px', '12px', '14px', '16px', '18px', '20px', '24px']
const INSERTS = [
  { key: 'text', label: '텍스트 상자', mark: 'T' },
  { key: 'check', label: '체크 상자', mark: '☑' },
  { key: 'line', label: '서명(도장) 칸', mark: '✎' },
  { key: 'date', label: '날짜 칸', mark: '31' },
] as const

/**
 * 근로계약서진행단계의 [계약서설정] 창 — 문서 편집기(원본 2026-10-21 실측).
 *
 * <p>머리 '계약서설정', 도구줄 [대상 ▾(계약참여자1 …) · 삽입 ▸ 서식 아이콘 넷 · 필수체크 ☐ · 글꼴 돋움 ▾ · 18px ▾ · B I U S · 글자색],
 * 본문은 계약서 미리보기 한 쪽, 아래 [저장(F8)] [닫기] 와 오른쪽 쪽 이동 《 〈 〉 》 [Page 1/2].
 * 원본은 올린 계약서 문서 위에 참여자별 입력 칸을 놓는다. 우리는 올린 파일을 쪽으로 그리지 못해 문서 위에 칸을 놓는 모양만 한다
 * (쪽 수 = 1, 저장은 창만 닫는다 — 바깥 전자서명 연동이 없다).
 */
export default function ContractSettingModal({ open, contractName, onClose }: { open: boolean; contractName: string; onClose: () => void }) {
  const [target, setTarget] = useState('계약참여자1')
  const [required, setRequired] = useState(false)
  const [font, setFont] = useState('돋움')
  const [size, setSize] = useState('18px')
  const [style, setStyle] = useState({ b: false, i: false, u: false, s: false })
  const [fields, setFields] = useState<{ id: number; label: string; target: string }[]>([])
  const [page, setPage] = useState(1)
  const pages = 1
  const paperRef = useRef<HTMLDivElement>(null)
  /* 글꼴 · 크기는 고른 값이라 클래스로 못 쓴다 — 요소에 직접 건다(인라인 style 래칫을 피함). */
  useEffect(() => { if (paperRef.current) { paperRef.current.style.fontFamily = font; paperRef.current.style.fontSize = size } }, [font, size, open])
  const flip = (k: 'b' | 'i' | 'u' | 's') => setStyle((x) => ({ ...x, [k]: !x[k] }))
  return (
    <Modal open={open} title="계약서설정" width={860} onClose={onClose}>
      <div className="flex flex-wrap items-center gap-[6px] mb-[6px] text-[12px]">
        <span>대상</span>
        <select className="ec-input w-[120px]" aria-label="대상" value={target} onChange={(e) => setTarget(e.target.value)}>
          <option>계약참여자1</option><option>계약참여자2</option>
        </select>
        <span className="ml-[6px]">삽입</span>
        {INSERTS.map((x) => (
          <button key={x.key} type="button" className="ec-btn ec-btn-sm" title={x.label} aria-label={`삽입 ${x.label}`}
                  onClick={() => setFields((f) => [...f, { id: f.length + 1, label: x.label, target }])}>{x.mark}</button>
        ))}
        <label className="inline-flex items-center gap-[3px] ml-[6px]"><input type="checkbox" checked={required} onChange={(e) => setRequired(e.target.checked)} /> 필수체크</label>
        <span className="ml-[6px]">글꼴</span>
        <select className="ec-input w-[90px]" aria-label="글꼴" value={font} onChange={(e) => setFont(e.target.value)}>{FONTS.map((f) => <option key={f}>{f}</option>)}</select>
        <select className="ec-input w-[80px]" aria-label="글자 크기" value={size} onChange={(e) => setSize(e.target.value)}>{SIZES.map((f) => <option key={f}>{f}</option>)}</select>
        <button type="button" className={`ec-btn ec-btn-sm font-bold${style.b ? ' ec-btn-primary' : ''}`} onClick={() => flip('b')}>B</button>
        <button type="button" className={`ec-btn ec-btn-sm italic${style.i ? ' ec-btn-primary' : ''}`} onClick={() => flip('i')}>I</button>
        <button type="button" className={`ec-btn ec-btn-sm underline${style.u ? ' ec-btn-primary' : ''}`} onClick={() => flip('u')}>U</button>
        <button type="button" className={`ec-btn ec-btn-sm line-through${style.s ? ' ec-btn-primary' : ''}`} onClick={() => flip('s')}>S</button>
      </div>
      <div className="border border-ec-line bg-ec-page h-[360px] overflow-y-auto p-[16px]">
        <div ref={paperRef} className="mx-auto max-w-[620px] min-h-[320px] p-[24px] ec-paper">
          <div className="border border-black text-center py-[10px] mb-[16px] text-[22px] tracking-[0.5em]">{contractName || '계약서'}</div>
          <p className="text-ec-hint text-[12px]">올린 계약서 문서가 이 자리에 쪽으로 보입니다(우리 화면은 문서 미리보기를 그리지 못합니다).</p>
          <div className="mt-[12px] flex flex-wrap gap-[6px]">
            {fields.map((f) => (
              <span key={f.id} className={`border border-ec-blue px-[6px] py-[2px] text-[12px]${style.b ? ' font-bold' : ''}${style.i ? ' italic' : ''}${style.u ? ' underline' : ''}${style.s ? ' line-through' : ''}`}>
                {f.target} · {f.label}{required ? ' *' : ''}
              </span>
            ))}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-[4px] mt-[8px]">
        <button type="button" className="ec-btn ec-btn-primary" onClick={onClose}>저장(F8)</button>
        <button type="button" className="ec-btn" onClick={onClose}>닫기</button>
        <span className="ml-auto inline-flex items-center gap-[3px]">
          <button type="button" className="ec-btn ec-btn-sm" aria-label="첫 쪽" onClick={() => setPage(1)}>«</button>
          <button type="button" className="ec-btn ec-btn-sm" aria-label="이전 쪽" onClick={() => setPage(Math.max(1, page - 1))}>‹</button>
          <button type="button" className="ec-btn ec-btn-sm" aria-label="다음 쪽" onClick={() => setPage(Math.min(pages, page + 1))}>›</button>
          <button type="button" className="ec-btn ec-btn-sm" aria-label="마지막 쪽" onClick={() => setPage(pages)}>»</button>
          <span className="text-[12px] ml-[4px]">[Page {page}/{pages}]</span>
        </span>
      </div>
    </Modal>
  )
}
