import { useEffect, useState } from 'react'
import { api, extractErrorMessage } from '../../../api/client'
import Modal from '../../../components/Modal'
import { dateText } from '../../../utils/dateText'

/**
 * 업무관리 예시 게시판 입력 창의 연결 칸 두 가지(2026-10-22 loginaa 실측).
 * 칸 모양은 둘 다 같다 — 🔍 · 고른 글자 · ×(지우기). 🔍 를 누르면 창이 뜨고 줄 맨 앞 [적용] 으로 고른다.
 */
function LinkBox({ placeholder, value, onOpen, onClear }: { placeholder: string; value: string; onOpen: () => void; onClear: () => void }) {
  return (
    <div className="flex-1 flex items-center gap-[4px] ec-input">
      <button type="button" aria-label={`${placeholder} 검색`} title={`${placeholder} 검색`} className="no-ec bg-transparent border-0 p-0 cursor-pointer text-ec-hint" onClick={onOpen}>🔍</button>
      <span className={`flex-1 truncate ${value ? '' : 'text-ec-hint'}`}>{value || placeholder}</span>
      {value && (
        <button type="button" aria-label={`${placeholder} 지우기`} className="no-ec bg-transparent border-0 p-0 cursor-pointer" onClick={onClear}>×</button>
      )}
    </div>
  )
}

interface PostRow {
  id: number; postNo: number; title: string; postDate: string; stage: string | null
  writer: string; writerName?: string | null; forwardTo?: string | null; attachmentId?: number | null
}

/**
 * 다른 게시판 글을 잇는 칸 — 원본 '상담 이력관리검색창' · '영업 방문관리검색창' · '공사진행현황검색창' …(그 게시판의 목록 모양).
 * 알약 [전체][그 게시판 진행상태…], 열 [적용] (일자-No.) 게시글번호 · 제목 · 작성자명 · 전달자 · 진행상태 · 첨부 · 조회.
 * 고르면 칸에 그 글의 제목이 든다.
 */
export function PostLinkField({ label, board, boardTitle, path, stages, defaultStage, freePill, dateNo, value, onChange }: {
  label: string; board: string; boardTitle: string
  /** 그 게시판 화면 주소 — 하단 [신규(F2)] · [리스트] 가 새 탭으로 연다. */
  path?: string
  /** 그 게시판 알약(없으면 진행중 · 완료). */
  stages: string[] | null; defaultStage?: string; freePill?: boolean; dateNo?: boolean
  value: string; onChange: (title: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [rows, setRows] = useState<PostRow[]>([])
  const [tab, setTab] = useState('전체')
  const [err, setErr] = useState('')
  useEffect(() => {
    if (!open) return
    setTab('전체'); setErr('')
    api.get<PostRow[]>('/work-posts', { params: { board } }).then((r) => setRows(r.data)).catch((e) => setErr(extractErrorMessage(e)))
  }, [open, board])
  const pills = ['전체', ...(stages ?? ['진행중', '완료'])]
  const list = rows.filter((r) => tab === '전체' || (r.stage ?? defaultStage) === tab).sort((a, b) => b.postNo - a.postNo)
  const cols = dateNo ? 9 : 8
  return (
    <>
      <LinkBox placeholder={label} value={value} onOpen={() => setOpen(true)} onClear={() => onChange('')} />
      <Modal error={err} open={open} title={`${boardTitle}검색창`} width={780} onClose={() => setOpen(false)}>
        <div className="ec-pills mb-[8px]">
          {pills.map((t) => <button key={t} type="button" className={`ec-pill no-ec${tab === t ? ' active' : ''}`} onClick={() => setTab(t)}>{t}</button>)}
          {freePill && <span className="ec-pill no-ec">진행상태를 자유롭게 추가 가능합니다</span>}
        </div>
        <table className="w-full text-left">
          <thead>
            <tr>
              <th className="w-[50px]" />{dateNo && <th className="w-[110px] text-center">일자-No.</th>}
              <th className="w-[70px] text-center">게시글번호</th><th className="text-center">제목</th>
              <th className="w-[90px] text-center">작성자명</th><th className="w-[90px] text-center">전달자</th>
              <th className="w-[100px] text-center">진행상태</th><th className="w-[50px] text-center">첨부</th><th className="w-[50px] text-center">조회</th>
            </tr>
          </thead>
          <tbody>
            {list.length === 0 && <tr><td colSpan={cols} className="ec-empty">등록된 데이터가 없습니다.</td></tr>}
            {list.map((m) => (
              <tr key={m.id}>
                <td className="text-center">
                  <button type="button" className="no-ec bg-transparent border-0 p-0 cursor-pointer text-ec-navy"
                          onClick={() => { onChange(m.title); setOpen(false) }}>적용</button>
                </td>
                {dateNo && <td className="text-center">{dateText(m.postDate)} -1</td>}
                <td className="text-center">{m.postNo}</td>
                <td>{m.title}</td>
                <td>{m.writerName ?? m.writer}</td>
                <td>{m.forwardTo ?? ''}</td>
                <td className="text-ec-navy">{m.stage ?? defaultStage ?? ''}</td>
                <td className="text-center">{m.attachmentId ? '📎' : ''}</td>
                <td className="text-center text-ec-navy">R</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="flex gap-[6px] mt-[10px]">
          <button type="button" className="ec-btn ec-btn-primary" disabled={!path} onClick={() => window.open(`${path}?new=1`, '_blank')}>신규(F2)</button>
          <button type="button" className="ec-btn" disabled={!path} onClick={() => window.open(path, '_blank')}>리스트</button>
          <button type="button" className="ec-btn" onClick={() => setOpen(false)}>닫기</button>
        </div>
      </Modal>
    </>
  )
}

type SlipKind = 'sales' | 'purchase' | 'quotation'
interface SlipRow {
  id: number; no: string; date: string; partner: string; summary: string; total: number; tradeKind: string; warehouse: string
  reflected: boolean; validUntil: string; status: string; employee: string
}
const won = (n: number) => Math.round(Number(n)).toLocaleString('ko-KR')
const summaryOf = (ls: { itemName: string; spec?: string | null }[] | undefined) => {
  if (!ls || ls.length === 0) return ''
  const f = ls[0].spec ? `${ls[0].itemName} [${ls[0].spec}]` : ls[0].itemName
  return ls.length > 1 ? `${f} 외 ${ls.length - 1}건` : f
}

/**
 * 전표를 잇는 칸 — 원본 '판매검색창(조회)' · '구매검색창(조회)' · '견적서검색창(조회)'(2026-10-22 실측).
 * 판매 · 구매 열 [적용] 일자-No. · 거래처명 · 품목명(요약) · 금액합계 · 거래유형명 · 창고명 · 회계반영여부 · 인쇄 · 불러온전표,
 * 견적서 열 [적용] 일자-No. · 거래처명 · 사원(담당)명 · 품목명(요약) · 유효기간 · 견적금액합계 · 진행상태 · 생성된전표 · 인쇄.
 * 칸에는 고른 전표의 '일자 -No.' 가 든다.
 */
export function SlipLinkField({ label, kind, value, onChange }: { label: string; kind: SlipKind; value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false)
  const [rows, setRows] = useState<SlipRow[]>([])
  const [err, setErr] = useState('')
  const title = kind === 'sales' ? '판매검색창(조회)' : kind === 'purchase' ? '구매검색창(조회)' : '견적서검색창(조회)'
  useEffect(() => {
    if (!open) return
    setErr('')
    const url = kind === 'sales' ? '/sales' : kind === 'purchase' ? '/purchases' : '/quotations'
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    api.get<any[]>(url).then((r) => setRows(r.data.map((d) => ({
      id: d.id, no: d.docNo ?? d.quoteNo ?? '', date: d.saleDate ?? d.purchaseDate ?? d.quoteDate ?? '',
      partner: d.partnerName ?? '', summary: summaryOf(d.lines), total: d.totalAmount ?? 0, tradeKind: d.tradeKindName ?? '',
      warehouse: d.warehouseName ?? '', reflected: !!d.accountingReflected, validUntil: d.validUntil ?? '', status: d.statusName ?? '',
      employee: d.createdBy ?? '',
    })))).catch((e) => setErr(extractErrorMessage(e)))
  }, [open, kind])
  const slipText = (r: SlipRow) => `${dateText(r.date)} ${r.no.includes('-') ? '-' + r.no.split('-').pop() : r.no}`
  const quote = kind === 'quotation'
  return (
    <>
      <LinkBox placeholder={label} value={value} onOpen={() => setOpen(true)} onClear={() => onChange('')} />
      <Modal error={err} open={open} title={title} width={900} onClose={() => setOpen(false)}>
        <table className="w-full text-left">
          <thead>
            <tr>
              <th className="w-[50px]" /><th className="w-[110px] text-center">일자-No.</th><th className="text-center">거래처명</th>
              {quote && <th className="text-center">사원(담당)명</th>}
              <th className="text-center">품목명(요약)</th>
              {quote ? <th className="text-center">유효기간</th> : null}
              <th className="text-center">{quote ? '견적금액합계' : '금액합계'}</th>
              {quote ? <th className="text-center">진행상태</th> : <><th className="text-center">거래유형명</th><th className="text-center">창고명</th><th className="text-center">회계반영여부</th></>}
              {quote ? <th className="text-center">생성된전표</th> : null}
              <th className="w-[50px] text-center">인쇄</th>{!quote && <th className="text-center">불러온전표</th>}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={quote ? 10 : 10} className="ec-empty">등록된 데이터가 없습니다.</td></tr>}
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="text-center">
                  <button type="button" className="no-ec bg-transparent border-0 p-0 cursor-pointer text-ec-navy"
                          onClick={() => { onChange(slipText(r)); setOpen(false) }}>적용</button>
                </td>
                <td className="text-center">{slipText(r)}</td><td>{r.partner}</td>
                {quote && <td>{r.employee}</td>}
                <td>{r.summary}</td>
                {quote && <td className="text-center">{r.validUntil ? dateText(r.validUntil) : ''}</td>}
                <td className="text-right">{won(r.total)}</td>
                {quote ? <td className="text-center">{r.status}</td> : <><td>{r.tradeKind}</td><td>{r.warehouse}</td><td className="text-center">{r.reflected ? '반영' : '미반영'}</td></>}
                {quote && <td />}
                <td className="text-center text-ec-navy">인쇄</td>{!quote && <td className="text-center text-ec-navy">조회</td>}
              </tr>
            ))}
          </tbody>
        </table>
        <div className="flex gap-[6px] mt-[10px]">
          <button type="button" className="ec-btn" onClick={() => setOpen(false)}>닫기</button>
        </div>
      </Modal>
    </>
  )
}
