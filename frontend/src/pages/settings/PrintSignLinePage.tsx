import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import EcListShell from '../../components/EcListShell'
import Modal from '../../components/Modal'
import { api, extractErrorMessage } from '../../api/client'
import type { SignLineSet, SignLineRow, SignModule } from '../../types/api'
import { signLineHtml } from '../../utils/print'
import { EcHistoryModal } from '../../components/EcHistory'

/** 원본 알약 [회계] · [재고] · [관리] — 메뉴마다 켜져 있는 알약이 다르다(회계 I → 회계, 관리 → 관리) */
const MODULES: { key: SignModule; label: string }[] = [
  { key: 'ACCOUNTING', label: '회계' },
  { key: 'INVENTORY', label: '재고' },
  { key: 'MANAGEMENT', label: '관리' },
]
const TITLE: Record<SignModule, string> = {
  ACCOUNTING: '인쇄용결재라인등록(회계)',
  INVENTORY: '인쇄용결재라인등록(재고)',
  MANAGEMENT: '인쇄용결재라인등록(관리)',
}
/** 원본 글자크기 선택상자 */
const FONTS = [9, 10, 11, 12, 13, 14]

function moduleOf(path: string): SignModule {
  if (path.startsWith('/hr')) return 'MANAGEMENT'
  if (path.startsWith('/inventory')) return 'INVENTORY'
  return 'ACCOUNTING'
}

const num = (v: string): number | null => (v.trim() === '' ? null : Math.max(0, Math.round(Number(v))) || null)

/**
 * 인쇄용결재라인등록(원본 E010106 회계 · E040111 재고 · E090102 관리) — 모듈마다 결재라인 1 · 2.
 * 하단 [H] = 그 모듈 결재라인을 마지막으로 저장한 때 · 사람 한 줄(2026-10-14 E040111 실측 '2026/10/14 오전 4:12:13 [GUEST]',
 * 바꾼 것 없이 저장해도 그 시각으로 바뀐다 — 서버 PrintSignService.HISTORY_PREFIX + 모듈, id 0).
 * 줄마다 맨 왼쪽 [결재라인] 칸 + 결재자 1 ~ 9(명칭 · 가로크기(px) · 글자크기(px)). 출력물은 자기 모듈의 결재라인 1 을 찍는다.
 */
export default function PrintSignLinePage() {
  const { pathname } = useLocation()
  const [module, setModule] = useState<SignModule>(moduleOf(pathname))
  const [lines, setLines] = useState<SignLineRow[]>([])
  const [open, setOpen] = useState<[boolean, boolean]>([true, true])
  const [error, setError] = useState('')
  const [preview, setPreview] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)

  useEffect(() => { setModule(moduleOf(pathname)) }, [pathname])

  useEffect(() => {
    setError('')
    api.get<SignLineSet>('/print-sign-lines', { params: { module } })
      .then((r) => setLines(r.data.lines))
      .catch((e) => setError(extractErrorMessage(e)))
  }, [module])

  const patchLabel = (li: number, p: Partial<SignLineRow>) =>
    setLines((ls) => ls.map((l, i) => (i === li ? { ...l, ...p } : l)))
  const patchSlot = (li: number, si: number, p: Partial<SignLineRow['slots'][number]>) =>
    setLines((ls) => ls.map((l, i) => (i !== li ? l : { ...l, slots: l.slots.map((s, j) => (j === si ? { ...s, ...p } : s)) })))

  async function save() {
    setError('')
    try {
      const r = await api.put<SignLineSet>('/print-sign-lines', {
        lines: lines.map((l) => ({
          lineNo: l.lineNo, labelName: l.labelName, labelWidth: l.labelWidth, labelFont: l.labelFont,
          slots: l.slots.map((s) => ({ title: s.title, widthPx: s.widthPx, fontPx: s.fontPx })),
        })),
      }, { params: { module } })
      setLines(r.data.lines)   // 원본은 안내 없이 그대로 — 빈 가로가 80 으로 채워진 것이 보인다
    } catch (e) {
      setError(extractErrorMessage(e))
    }
  }

  return (
    <EcListShell
      title={TITLE[module]}
      searchable={false}
      option={false}
      actions={[
        { label: '저장(F8)', primary: true, onClick: () => void save() },
        { label: '미리보기', onClick: () => setPreview(true) },
        { label: 'H', onClick: () => setHistoryOpen(true) },
      ]}
    >
      <div className="ec-pills mb-[8px]">
        {MODULES.map((m) => (
          <button key={m.key} type="button" className={`ec-pill no-ec${module === m.key ? ' active' : ''}`}
                  onClick={() => setModule(m.key)}>{m.label}</button>
        ))}
      </div>

      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}

      {lines.map((l, li) => (
        <section key={l.lineNo} className="mb-[9px]">
          <button type="button" className="bg-transparent border-0 p-0 cursor-pointer mb-[4px] font-bold text-ec-text"
                  onClick={() => setOpen((o) => (li === 0 ? [!o[0], o[1]] : [o[0], !o[1]]))}>
            {open[li] ? '⊖' : '⊕'} 결재라인 {l.lineNo}
          </button>
          {open[li] && (
            <table className="w-full">
              <thead>
                <tr><th className="w-[15%]"></th><th>명칭</th><th className="w-[22%] text-right">가로크기(px)</th><th className="w-[22%]">글자크기(px)</th></tr>
              </thead>
              <tbody>
                <tr>
                  <td className="bg-ec-page">결재라인</td>
                  <td><input className="ec-input w-full" value={l.labelName ?? ''} maxLength={30}
                             onChange={(e) => patchLabel(li, { labelName: e.target.value })} /></td>
                  <td><input className="ec-input w-full text-right" inputMode="numeric" value={l.labelWidth ?? ''}
                             onChange={(e) => patchLabel(li, { labelWidth: num(e.target.value) })} /></td>
                  <td><FontSelect value={l.labelFont} onChange={(v) => patchLabel(li, { labelFont: v })} /></td>
                </tr>
                {l.slots.map((s, si) => (
                  <tr key={s.slotOrder}>
                    <td className="bg-ec-page">결재자 {s.slotOrder}</td>
                    <td><input className="ec-input w-full" value={s.title ?? ''} maxLength={30}
                               onChange={(e) => patchSlot(li, si, { title: e.target.value })} /></td>
                    <td><input className="ec-input w-full text-right" inputMode="numeric" value={s.widthPx ?? ''}
                               onChange={(e) => patchSlot(li, si, { widthPx: num(e.target.value) })} /></td>
                    <td><FontSelect value={s.fontPx} onChange={(v) => patchSlot(li, si, { fontPx: v })} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      ))}

      {historyOpen && <EcHistoryModal url={`/change-history?target=PRINT_SIGN_${module}&id=0`} last onClose={() => setHistoryOpen(false)} />}
      <Modal open={preview} title="결재라인 미리보기" error={error} onClose={() => setPreview(false)} width={760}>
        {lines.map((l) => (
          <div key={l.lineNo} className="mb-[12px]">
            <div className="font-bold mb-[4px]">결재라인 {l.lineNo}</div>
            {/* 인쇄와 같은 그림(utils/print.ts) — 명칭 · 가로가 둘 다 있는 칸만 그린다 */}
            <div dangerouslySetInnerHTML={{ __html: signLineHtml({ ...l, slots: l.slots.filter((s) => s.title && s.widthPx) }) }} />
          </div>
        ))}
        <div className="text-right"><button className="ec-btn" onClick={() => setPreview(false)}>닫기</button></div>
      </Modal>
    </EcListShell>
  )
}

function FontSelect({ value, onChange }: { value: number | null; onChange: (v: number | null) => void }) {
  return (
    <select className="ec-input w-full" value={value ?? ''} onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}>
      <option value=""></option>
      {FONTS.map((f) => <option key={f} value={f}>{f}px</option>)}
    </select>
  )
}
