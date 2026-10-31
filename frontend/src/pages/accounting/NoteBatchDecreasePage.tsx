import { useEffect, useMemo, useRef, useState } from 'react'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import { api, extractErrorMessage } from '../../api/client'
import EcListShell from '../../components/EcListShell'
import type { NoteSummary, Partner, PromissoryNote } from '../../types/api'
import { dateText } from '../../utils/dateText'
import NoteVoucherReportModal, { type NoteVoucherPick } from '../../features/promissorynote/components/NoteVoucherReportModal'
import { fmtAmount } from '../../utils/format'


type Note = PromissoryNote & { recordOnly?: boolean }

/**
 * 회계 I › 어음거래 › <b>받을어음일괄감소</b>(E010621) · <b>지급어음일괄감소</b>(E010629) — 2026-10-20 loginaa 실측.
 *
 * <p>입력 화면이 아니라 보유(미지급) 어음 목록이다. 열: 어음번호 · 발생일자 · 만기일자 · 어음계정 · 거래처코드 · 거래처명 · 잔액 ·
 * (받을어음만) 할인금액 · 감소금액 · 적요 · 부서명 · 프로젝트명. 체크하면 그 줄 [감소금액]에 잔액 전부가 들어간다.
 * 하단 단추 하나 — 받을어음 [입금보고서작성] · 지급어음 [지출결의서작성]. 안 고르고 누르면
 * '리스트에 선택된 자료가 없습니다. 체크박스에 체크한 후 다시 시도 바랍니다.'(EcListShell selected).
 * 고르면 NoteVoucherReportModal(작성 창 → 결의서 → 저장) — 저장하면 어음이 감소로 닫혀 목록에서 빠지고,
 * 결의서를 지우면 다시 보유로 돌아와 이 목록에 보인다(서버 V420 트리거).
 */
export default function NoteBatchDecreasePage({ receivable }: { receivable: boolean }) {
  const title = receivable ? '받을어음일괄감소' : '지급어음일괄감소'
  const [notes, setNotes] = useState<Note[]>([])
  const [partners, setPartners] = useState<Partner[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [picked, setPicked] = useState<Set<number>>(new Set())
  const [report, setReport] = useState<NoteVoucherPick[] | null>(null)

  async function load() {
    setLoading(true)
    setError('')
    try {
      const [n, p] = await Promise.all([api.get<NoteSummary>('/notes'), api.get<Partner[]>('/partners')])
      setNotes(n.data.notes as Note[])
      setPartners(p.data)
      setPicked(new Set())
    } catch (e) {
      setError(extractErrorMessage(e))
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { void load() }, [])

  const partnerCode = (id: number) => partners.find((p) => p.id === id)?.code ?? ''
  /* [내역만등록] 어음은 분개가 없어 결의서로 닫지 않는다(어음만감소). */
  const held = useMemo(() => notes.filter((n) => n.type === (receivable ? 'RECEIVABLE' : 'PAYABLE') && n.status === 'HELD' && !n.recordOnly)
    .sort((a, b) => (a.issueDate < b.issueDate ? -1 : a.issueDate > b.issueDate ? 1 : a.id - b.id)), [notes, receivable])
  const total = held.reduce((s, n) => s + Number(n.amount), 0)
  const pickedTotal = held.filter((n) => picked.has(n.id)).reduce((s, n) => s + Number(n.amount), 0)
  const cols = receivable ? 13 : 12
  const tableRef = useRef<HTMLTableElement>(null)
  useTableColumnCheck(tableRef, title, [held.length])

  const toggle = (id: number, on: boolean) => setPicked((s) => {
    const n = new Set(s)
    if (on) n.add(id)
    else n.delete(id)
    return n
  })

  function openReport() {
    const chosen = held.filter((n) => picked.has(n.id))
    if (chosen.length === 0) return
    setReport(chosen.map((n) => ({ note: n, partnerCode: partnerCode(n.partnerId) })))
  }

  return (
    <EcListShell
      title={title}
      actions={[{ label: receivable ? '입금보고서작성' : '지출결의서작성', primary: true, onClick: openReport, selected: picked.size }]}
    >
      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
      <table ref={tableRef} className="w-full text-left">
        <thead>
          <tr>
            <th className="w-[30px] text-center">
              <input type="checkbox" aria-label="전체선택" checked={held.length > 0 && held.every((n) => picked.has(n.id))}
                     onChange={(e) => held.forEach((n) => toggle(n.id, e.target.checked))} />
            </th>
            <th>어음번호</th>
            <th>발생일자</th>
            <th>만기일자</th>
            <th>어음계정</th>
            <th>거래처코드</th>
            <th>거래처명</th>
            <th className="text-right">잔액</th>
            {receivable && <th className="text-right">할인금액</th>}
            <th className="text-right">감소금액</th>
            <th>적요</th>
            <th>부서명</th>
            <th>프로젝트명</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={cols} className="ec-empty">불러오는 중…</td></tr>
          ) : held.length === 0 ? (
            <tr><td colSpan={cols} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
          ) : held.map((n) => (
            <tr key={n.id}>
              <td className="text-center">
                <input type="checkbox" aria-label={`${n.noteNo} 선택`} checked={picked.has(n.id)} onChange={(e) => toggle(n.id, e.target.checked)} />
              </td>
              <td className="text-ec-navy">{n.noteNo}</td>
              <td>{dateText(n.issueDate)}</td>
              <td>{dateText(n.dueDate)}</td>
              <td>{receivable ? '받을어음' : '지급어음'}</td>
              <td>{partnerCode(n.partnerId)}</td>
              <td>{n.partnerName}</td>
              <td className="text-right">{fmtAmount(Number(n.amount))}</td>
              {receivable && <td className="text-right" />}
              {/* 어음 한 장은 통째로 감소한다 — 체크하면 잔액 전부(일부 감소는 원본도 못 잼) */}
              <td className="text-right cursor-pointer" aria-label={`${n.noteNo} 감소금액`} onClick={() => { if (!picked.has(n.id)) toggle(n.id, true) }}>
                {picked.has(n.id) ? fmtAmount(Number(n.amount)) : ''}
              </td>
              <td>{n.remark ?? ''}</td>
              <td />
              <td />
            </tr>
          ))}
        </tbody>
        {held.length > 0 && (
          <tfoot>
            <tr className="font-bold">
              <td colSpan={7} className="text-center">합 계</td>
              <td className="text-right">{fmtAmount(total)}</td>
              {receivable && <td className="text-right" />}
              <td className="text-right">{pickedTotal ? fmtAmount(pickedTotal) : ''}</td>
              <td colSpan={3} />
            </tr>
          </tfoot>
        )}
      </table>

      <NoteVoucherReportModal receivable={receivable} picks={report} onClose={() => setReport(null)} onSaved={() => void load()} />
    </EcListShell>
  )
}
