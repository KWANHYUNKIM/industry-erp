import { useEffect, useRef, useState, type ReactNode } from 'react'
import Modal from '../../../components/Modal'
import { fillAndPrint, openPrintWindow } from '../../../utils/print'
import TaxInvoicePaper, { DEFAULT_PAPER_DISPLAY, type PaperDisplay, type PaperKind, type PaperParty, type PaperVoucher } from './TaxInvoicePaper'
import DropUpButton from './DropUpButton'
import EcHistoryButton from '../../../components/EcHistory'

const DISPLAY_KEY = 'taxPaperDisplay'
const MEMO_KEY = 'taxPaperMemo'
const load = <T,>(k: string, d: T): T => { try { const s = localStorage.getItem(k); return s ? { ...d, ...JSON.parse(s) } : d } catch { return d } }
const save = (k: string, v: unknown) => {
  try { localStorage.setItem(k, JSON.stringify(v)) } catch { /* 저장 못 해도 이 창에서는 그대로 쓴다 */ }
}

/**
 * '청구서' 창 — (세금)계산서발행/수령(E030202) 줄 [인쇄] · [저장/청구서인쇄] 와 매출(세금)계산서조회(세무)(E030203) 줄 [인쇄] 가
 * 같은 창을 띄운다(2026-10-20 원본 실측: 조회(세무)의 '회계 I' 줄도 일련번호 20261020 - 0002 · 공급가액 · 세액이 든 같은 두 장).
 *
 * <p>2026-10-22 실측 — 머리 오른쪽 [Option ▾](양식변경 ▸ ✓청구서 · 신규양식추가), 하단 [종이세금계산서 ⌄](청구서 · 종이세금계산서 · 종이계산서 + 신규양식추가,
 * 목록은 위로 펼침) · [인쇄 ▴](PDF · 인쇄설정 · 프린트문제해결 · 인쇄) · [표시설정] · [하단메모/공급자이메일] · [Email ▴](Fax · Email) · [닫기].
 * [종이계산서] 를 고르면 제목이 '계 산 서' 로 바뀐다. [표시설정] 창: 도장인쇄 · 일자인쇄 · 일련번호인쇄(표시/표시안함) · 인쇄구분(전체/공급자/공급받는자) ·
 * 청구/영수구분(동그라미/미적용/문자인쇄) · 인쇄형태 ☑2건/페이지, [기본값복원] · [적용(F8)] · [닫기]. [하단메모/공급자이메일] 창: (세금)계산서하단메모 · 공급자이메일 · [저장(F8)] [닫기] [H].
 */
export default function TaxInvoicePaperModal({ v, supplier, buyer, onClose }: {
  v: PaperVoucher; supplier: PaperParty; buyer: PaperParty; onClose: () => void
}) {
  const paperRef = useRef<HTMLDivElement>(null)
  const [kind, setKind] = useState<PaperKind>('종이세금계산서')
  const [display, setDisplay] = useState<PaperDisplay>(() => load(DISPLAY_KEY, DEFAULT_PAPER_DISPLAY))
  const [memo, setMemo] = useState(() => load(MEMO_KEY, { memo: '', email: '' }))
  const [win, setWin] = useState<'' | 'display' | 'memo'>('')
  const [optOpen, setOptOpen] = useState(false)
  const [formMenu, setFormMenu] = useState(false)
  useEffect(() => { setFormMenu(false) }, [optOpen])
  const printPaper = () => {
    const el = paperRef.current
    const w = el && openPrintWindow()
    if (!el || !w) return
    const styles = [...document.querySelectorAll('style, link[rel="stylesheet"]')].map((n) => n.outerHTML).join('')
    fillAndPrint(w, `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>청구서</title>${styles}</head><body>${el.innerHTML}</body></html>`)
  }
  return (
    <>
      <Modal open title="청구서" width={660} onClose={onClose}>
        <div className="flex items-center mb-[6px]">
          <b className="text-[14px]">청구서</b>
          <span className="flex-1" />
          <span className="relative">
            <button type="button" className="ec-btn" onClick={() => setOptOpen((o) => !o)}>Option</button>
            {optOpen && (
              <div className="ec-menu absolute right-0 top-[28px] z-[5]" onMouseLeave={() => setFormMenu(false)}>
                <button type="button" onMouseEnter={() => setFormMenu(true)} onClick={() => setFormMenu((o) => !o)}>양식변경 ▸</button>
                {formMenu && (
                  <div className="ec-menu absolute right-full top-0">
                    <button type="button" onClick={() => setOptOpen(false)}>✓ 청구서</button>
                    <button type="button" className="font-bold" onClick={() => setOptOpen(false)}>신규양식추가</button>
                  </div>
                )}
              </div>
            )}
          </span>
        </div>
        <div ref={paperRef}>
          <TaxInvoicePaper v={v} supplier={supplier} buyer={buyer} kind={kind} display={display} />
        </div>
        <div className="flex gap-[6px] mt-[12px] flex-wrap">
          <DropUpButton label={kind} arrow="⌄" checked={kind} onClick={undefined}
                        items={[{ label: '청구서', onClick: () => setKind('청구서') }, { label: '종이세금계산서', onClick: () => setKind('종이세금계산서') },
                                { label: '종이계산서', onClick: () => setKind('종이계산서') }, { label: '신규양식추가', footer: true }]} />
          <DropUpButton label="인쇄" primary onClick={printPaper}
                        items={[{ label: 'PDF' }, { label: '인쇄설정' }, { label: '프린트문제해결' }, { label: '인쇄', onClick: printPaper }]} />
          <button type="button" className="ec-btn" onClick={() => setWin('display')}>표시설정</button>
          <button type="button" className="ec-btn" onClick={() => setWin('memo')}>하단메모/공급자이메일</button>
          <DropUpButton label="Email" items={[{ label: 'Fax' }, { label: 'Email' }]} />
          <button type="button" className="ec-btn" onClick={onClose}>닫기</button>
        </div>
      </Modal>
      {win === 'display' && <DisplayWindow value={display} onApply={(d) => { setDisplay(d); save(DISPLAY_KEY, d); setWin('') }} onClose={() => setWin('')} />}
      {win === 'memo' && <MemoWindow value={memo} onSave={(m) => { setMemo(m); save(MEMO_KEY, m); setWin('') }} onClose={() => setWin('')} />}
    </>
  )
}

function Radios<T extends string>({ name, value, opts, onChange }: { name: string; value: T; opts: [T, string][]; onChange: (v: T) => void }) {
  return <>{opts.map(([k, l]) => (
    <label key={k} className="inline-flex items-center gap-[3px] mr-[14px]"><input type="radio" name={name} checked={value === k} onChange={() => onChange(k)} /> {l}</label>
  ))}</>
}

/** [표시설정] — 원본 2026-10-22 실측 글자 · 차례 그대로. */
function DisplayWindow({ value, onApply, onClose }: { value: PaperDisplay; onApply: (d: PaperDisplay) => void; onClose: () => void }) {
  const [d, setD] = useState(value)
  const yn: [string, string][] = [['Y', '표시'], ['N', '표시안함']]
  const row = (label: string, body: ReactNode) => (
    <li className="flex items-center min-h-[30px]"><span className="w-[110px] text-ec-hint">{label}</span><span>{body}</span></li>
  )
  return (
    <Modal open title="표시설정" width={640} onClose={onClose}>
      <b className="block mb-[6px]">표시설정</b>
      <button type="button" className="ec-btn ec-btn-sm mb-[6px]" onClick={() => setD(DEFAULT_PAPER_DISPLAY)}>기본값복원</button>
      <ul className="ec-form">
        {row('도장인쇄', <Radios name="pd-stamp" value={d.stamp ? 'Y' : 'N'} opts={yn} onChange={(v) => setD({ ...d, stamp: v === 'Y' })} />)}
        {row('일자인쇄', <Radios name="pd-date" value={d.date ? 'Y' : 'N'} opts={yn} onChange={(v) => setD({ ...d, date: v === 'Y' })} />)}
        {row('일련번호인쇄', <Radios name="pd-serial" value={d.serial ? 'Y' : 'N'} opts={yn} onChange={(v) => setD({ ...d, serial: v === 'Y' })} />)}
        {row('인쇄구분', <Radios name="pd-copies" value={d.copies} opts={[['all', '전체'], ['supplier', '공급자'], ['buyer', '공급받는자']]} onChange={(v) => setD({ ...d, copies: v })} />)}
        {row('청구/영수구분', <Radios name="pd-claim" value={d.claim} opts={[['circle', '동그라미'], ['none', '미적용'], ['text', '문자인쇄']]} onChange={(v) => setD({ ...d, claim: v })} />)}
        {row('인쇄형태', <label className="inline-flex items-center gap-[3px]"><input type="checkbox" checked={d.two} onChange={(e) => setD({ ...d, two: e.target.checked })} /> 2건 / 페이지</label>)}
      </ul>
      <div className="flex gap-[6px] mt-[12px]">
        <button type="button" className="ec-btn ec-btn-primary" onClick={() => onApply(d)}>적용(F8)</button>
        <button type="button" className="ec-btn" onClick={onClose}>닫기</button>
      </div>
    </Modal>
  )
}

/** [하단메모/공급자이메일] — 원본 2026-10-22 실측: '(세금)계산서하단메모' · '공급자이메일' 두 칸, [저장(F8)] [닫기] [H]. */
function MemoWindow({ value, onSave, onClose }: { value: { memo: string; email: string }; onSave: (m: { memo: string; email: string }) => void; onClose: () => void }) {
  const [m, setM] = useState(value)
  return (
    <Modal open title="하단메모/공급자이메일" width={640} onClose={onClose}>
      <div className="mb-[10px]">
        <div className="mb-[4px]">(세금)계산서하단메모</div>
        <input className="ec-input w-full" placeholder="(세금)계산서하단메모" value={m.memo} onChange={(e) => setM({ ...m, memo: e.target.value })} />
      </div>
      <div>
        <div className="mb-[4px]">공급자이메일</div>
        <input className="ec-input w-full" value={m.email} onChange={(e) => setM({ ...m, email: e.target.value })} />
      </div>
      <div className="flex gap-[6px] mt-[14px]">
        <button type="button" className="ec-btn ec-btn-primary" onClick={() => onSave(m)}>저장(F8)</button>
        <button type="button" className="ec-btn" onClick={onClose}>닫기</button>
        <EcHistoryButton target="TAX_PAPER_MEMO" id={1} last />
      </div>
    </Modal>
  )
}
