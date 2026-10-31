import { lazy, Suspense, useCallback, useRef, useState, type ComponentType, type KeyboardEvent, type ReactNode } from 'react'
import Modal from '../../../components/Modal'
import { ecAlert } from '../../../components/EcDialog'
import { reportPeriod } from '../../../components/EcReportFrame'
import { useAuth } from '../../auth/AuthContext'
import { findDataTable } from '../../../utils/tableExport'
import type { ReportEmbedProps } from '../../../utils/reportEmbed'
import type { ApprovalOutput } from '../../../types/api'
import { sanitizeHtml } from '../bodyTemplate'
import { pad2 } from '../../../utils/periods'

/**
 * 기안서 [결재문서] › '전표 출력물' — 원본 2026-10-30 loginaa 실측(plans/데이터이관/원본-전자결재.md '결재문서 › 전표 출력물').
 *
 *   '전표 출력물'(파란 링크) → 작은 메뉴 [판매현황 · 미판매현황 · ─ · 전체메뉴]
 *   판매현황 → 기안서 창 위에 '판매현황' 창(조건 판 → 검색 → 보고서) + 아래 [적용] [자동갱신] [닫기]
 *   [적용] → 창이 닫히고 링크 위에 칩: 회색 딱지 '출력물' + 파란 '[판매현황]2026/10/30 오전 10:27:44'
 *   칩 → '출력물' 창(적용할 때 찍은 사본) + [닫기]
 *   전체메뉴 → '출력물' 창: 검색칸 + 표 구분1 · 구분2 · 메뉴 → 메뉴를 누르면 위 판매현황 창과 같은 흐름
 *
 * 보고서는 메뉴 화면(/sales/sales-status · /sales/unsold)을 그대로 띄운다 — 조건 판 · 결과 표를 베끼지 않는다.
 */

interface OutputMenu {
  group1: string
  group2: string
  name: string
  Page: ComponentType<{ embed?: ReportEmbedProps }>
}

export const OUTPUT_MENUS: OutputMenu[] = [
  { group1: '재고 I', group2: '영업관리', name: '판매현황', Page: lazy(() => import('../../../pages/trade/SalesStatusPage')) },
  { group1: '재고 I', group2: '영업관리', name: '미판매현황', Page: lazy(() => import('../../../pages/trade/UnsoldStatusPage')) },
]

const menuOf = (name: string) => OUTPUT_MENUS.find((m) => m.name === name)

/** 지금 — 서버 LocalDateTime 꼴 'YYYY-MM-DDTHH:mm:ss'(시간대 없이 이 PC 의 시각). */
const nowLocal = () => {
  const d = new Date()
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`
}

/** 칩 글자 — 원본 '[판매현황]2026/10/30 오전 10:27:44'. */
export function outputLabel(o: Pick<ApprovalOutput, 'menuName' | 'appliedAt'>): string {
  const [date, time = '00:00:00'] = o.appliedAt.split('T')
  const [h, m, s = '00'] = time.split(':')
  const hh = Number(h)
  const ampm = hh < 12 ? '오전' : '오후'
  const h12 = hh % 12 === 0 && hh >= 12 ? 12 : hh % 12
  return `[${o.menuName}]${date.replace(/-/g, '/')} ${ampm} ${h12}:${m}:${s.slice(0, 2)}`
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** 조건에서 기간 — 판매현황 {from,to} · 미판매현황 {cond:{from,to}}. */
function periodOfConditions(c: Record<string, unknown> | null): string {
  const src = (c?.cond && typeof c.cond === 'object' ? c.cond : c) as Record<string, unknown> | null
  return reportPeriod(typeof src?.from === 'string' ? src.from : '', typeof src?.to === 'string' ? src.to : '')
}

/**
 * 창 안에 그려진 보고서를 얼린다 — 출력물 판(.ec-report-frame: 제목 · 회사명 · 기간 + 표)이 있으면 그것을,
 * 없으면(집계 · 미판매현황) 가장 큰 표에 같은 머리를 붙인다. 씻은 HTML(스크립트 · 이벤트 속성 없음)이다.
 */
function captureReport(root: HTMLElement, title: string, companyName: string, period: string): string {
  const frame = root.querySelector('.ec-report-frame')
  let html: string
  if (frame) {
    html = frame.outerHTML
  } else {
    const table = findDataTable(root)
    if (!table || table.querySelectorAll('tbody tr').length === 0) return ''
    html = `<div class="ec-report-frame"><div class="ec-report-head"><div class="ec-report-title">${esc(title)}</div>`
      + `<div class="ec-report-meta"><span>회사명 : ${esc(companyName)}</span><span>${esc(period)}</span></div></div>${table.outerHTML}</div>`
  }
  // sanitizeHtml 은 붙여 넣은 서식이 격자 규칙에 덮이지 않게 표에 no-ec 를 단다 — 출력물은 격자 모양 그대로 둔다.
  return sanitizeHtml(html).replace(/\bno-ec\b/g, '')
}

/** 바깥 창(기안서작성)까지 같이 닫히지 않게 — Modal 은 Esc 를 window 에서 듣는다. 이 창 안에서 누른 Esc 는 이 창만 닫는다. */
function EscScope({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') { e.stopPropagation(); onClose() }
  }
  return <div onKeyDown={onKeyDown}>{children}</div>
}

/** '전표 출력물' 링크 + 작은 메뉴(판매현황 · 미판매현황 · ─ · 전체메뉴). */
export function OutputLinkMenu({ onPick, onAll }: { onPick: (menuName: string) => void; onAll: () => void }) {
  const [open, setOpen] = useState(false)
  return (
    <span className="relative inline-block">
      <span className="ec-link cursor-pointer" role="button" onClick={() => setOpen((v) => !v)}>전표 출력물</span>
      {open && (
        <>
          <div className="ec-backdrop-clear" onClick={() => setOpen(false)} />
          <div className="ec-menu left-0 right-auto" role="menu">
            {OUTPUT_MENUS.map((m) => (
              <button key={m.name} type="button" onClick={() => { setOpen(false); onPick(m.name) }}>{m.name}</button>
            ))}
            <hr className="my-[3px] border-0 border-t border-t-ec-line border-solid" />
            <button type="button" onClick={() => { setOpen(false); onAll() }}>전체메뉴</button>
          </div>
        </>
      )}
    </span>
  )
}

/** 붙인 출력물 칩들 — 회색 딱지 '출력물' + 파란 '[메뉴]일시'. onRemove 를 주면 × 로 뗀다(저장 전). */
export function OutputChips({ outputs, onOpen, onRemove }: {
  outputs: ApprovalOutput[]
  onOpen: (o: ApprovalOutput) => void
  onRemove?: (index: number) => void
}) {
  if (outputs.length === 0) return null
  return (
    <div className="flex flex-col gap-[3px] mb-[4px]" data-testid="approval-outputs">
      {outputs.map((o, i) => (
        <span key={`${o.menuName}-${o.appliedAt}-${i}`} className="inline-flex items-center gap-[6px]">
          <span className="bg-ec-page border border-ec-line border-solid text-ec-muted text-[11px] px-[6px] py-[1px] rounded-[4px]">출력물</span>
          <span className="ec-link cursor-pointer" onClick={() => onOpen(o)}>{outputLabel(o)}</span>
          {onRemove && (
            <span className="cursor-pointer font-bold text-ec-hint" title="출력물 빼기" onClick={() => onRemove(i)}>×</span>
          )}
        </span>
      ))}
    </div>
  )
}

/**
 * 판매현황 · 미판매현황 창 — 메뉴 화면을 그대로 띄우고 아래 [적용] [자동갱신] [닫기].
 */
export function OutputReportWindow({ menuName, onApply, onClose }: {
  menuName: string
  onApply: (o: ApprovalOutput) => void
  onClose: () => void
}) {
  const menu = menuOf(menuName)
  const { companyName } = useAuth()
  const bodyRef = useRef<HTMLDivElement>(null)
  const condRef = useRef<Record<string, unknown> | null>(null)
  const onConditions = useCallback((c: Record<string, unknown>) => { condRef.current = c }, [])

  async function apply() {
    if (!bodyRef.current) return
    const html = captureReport(bodyRef.current, menuName, companyName ?? '', periodOfConditions(condRef.current))
    if (!html) return void ecAlert('[검색] 으로 보고서를 먼저 띄운 뒤 적용하세요.')
    onApply({ menuName, appliedAt: nowLocal(), mode: 'SNAPSHOT', html, conditions: condRef.current })
  }

  /*
   * [자동갱신] — 원본에서 눌러 보지 않았다(2026-10-30, 추정). 이름대로 사본 대신 조건을 저장하고
   * 칩을 열 때마다 그 조건으로 다시 조회하게 했다. 원본을 재면 맞춘다.
   */
  function autoRefresh() {
    onApply({ menuName, appliedAt: nowLocal(), mode: 'AUTO', html: null, conditions: condRef.current ?? {} })
  }

  if (!menu) return null
  const { Page } = menu
  return (
    <Modal open title={menuName} width={1200} onClose={onClose}>
      <EscScope onClose={onClose}>
        <div ref={bodyRef} className="max-h-[70vh] overflow-auto">
          <Suspense fallback={<div className="p-[12px] text-ec-hint">불러오는 중…</div>}>
            <Page embed={{ onConditions }} />
          </Suspense>
        </div>
        <div className="flex gap-[6px] mt-[10px] pt-[8px] border-t border-t-ec-line-soft border-solid">
          <button type="button" className="ec-btn ec-btn-primary" onClick={() => void apply()}>적용</button>
          <button type="button" className="ec-btn" onClick={autoRefresh}>자동갱신</button>
          <button type="button" className="ec-btn" onClick={onClose}>닫기</button>
        </div>
      </EscScope>
    </Modal>
  )
}

/** 칩을 눌러 뜨는 '출력물' 창 — 적용할 때 찍은 사본 + [닫기]. 자동갱신 출력물은 저장한 조건으로 다시 조회한다(추정). */
export function OutputViewWindow({ output, onClose }: { output: ApprovalOutput; onClose: () => void }) {
  const menu = menuOf(output.menuName)
  return (
    <Modal open title="출력물" width={1200} onClose={onClose}>
      <EscScope onClose={onClose}>
        <div className="max-h-[70vh] overflow-auto" data-testid="approval-output-view">
          {output.mode === 'AUTO' && menu ? (
            <Suspense fallback={<div className="p-[12px] text-ec-hint">불러오는 중…</div>}>
              <menu.Page embed={{ conditions: output.conditions ?? {}, autoSearch: true }} />
            </Suspense>
          ) : (
            <div dangerouslySetInnerHTML={{ __html: sanitizeHtml(output.html ?? '').replace(/\bno-ec\b/g, '') }} />
          )}
        </div>
        <div className="flex gap-[6px] mt-[10px] pt-[8px] border-t border-t-ec-line-soft border-solid">
          <button type="button" className="ec-btn" onClick={onClose}>닫기</button>
        </div>
      </EscScope>
    </Modal>
  )
}

/** [전체메뉴] '출력물' 창 — 검색칸 + 구분1 · 구분2 · 메뉴. 메뉴를 누르면 그 출력물 창으로 간다. */
export function OutputMenuWindow({ onPick, onClose }: { onPick: (menuName: string) => void; onClose: () => void }) {
  const [q, setQ] = useState('')
  const needle = q.trim()
  const rows = OUTPUT_MENUS.filter((m) => !needle || `${m.group1} ${m.group2} ${m.name}`.includes(needle))
  return (
    <Modal open title="출력물" width={560} onClose={onClose}>
      <EscScope onClose={onClose}>
        <div className="flex items-center gap-[4px] mb-[6px]">
          <input className="ec-input w-[200px]" placeholder="검색" aria-label="출력물 검색" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <table className="w-full text-left">
          <thead><tr><th className="w-[110px]">구분1</th><th className="w-[110px]">구분2</th><th>메뉴</th></tr></thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={3} className="text-center">검색된 메뉴가 없습니다.</td></tr>
            ) : rows.map((m) => (
              <tr key={m.name}>
                <td>{m.group1}</td>
                <td>{m.group2}</td>
                <td><span className="ec-link cursor-pointer" onClick={() => onPick(m.name)}>{m.name}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="flex gap-[6px] mt-[10px] pt-[8px] border-t border-t-ec-line-soft border-solid">
          <button type="button" className="ec-btn" onClick={onClose}>닫기</button>
        </div>
      </EscScope>
    </Modal>
  )
}

/** 칩 · 창을 한데 묶은 상태 — 기안서작성(고칠 수 있음)과 상세(읽기만)가 같이 쓴다. */
export type OutputWindowState =
  | { kind: 'report'; menuName: string }
  | { kind: 'menu' }
  | { kind: 'view'; output: ApprovalOutput }
  | null
