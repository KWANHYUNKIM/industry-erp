import { useEffect, useMemo, useRef, useState } from 'react'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import { api, extractErrorMessage } from '../../api/client'
import EcListShell from '../../components/EcListShell'
import { EcCond } from '../../components/EcStatusPanel'
import CodePickerField from '../../components/CodePickerField'
import Modal from '../../components/Modal'
import EcPeriodPicks, { periodOf } from '../../components/EcPeriodPicks'
import { QUOTATION_PICKS } from '../../utils/periods'
import { fetchBonds, useBondMasters } from '../../features/bond/api'
import BondEntryModal from '../../features/bond/components/BondEntryModal'
import { dateNo, flatten, sideWord, won, type BondRow, type BondSide } from '../../features/bond/types'

/**
 * 회계 II › 채권관리 › <b>채권조회</b>(E060403) · 채무관리 › <b>채무조회</b> — 2026-10-12 loginaa 실측.
 *
 * <p>조건(Search 판): 기준일자(기본 <b>최근30일(+1개월)</b> — 2026/09/12 ~ 2026/11/11) · 채권 만기일자 · 채권번호 ·
 * 증감구분(전체 · 증가 · 감소, 다 켜짐) · 출처업무 · 입력구분(전체 · 직접입력 · 연결전표) · 거래처 · 부서 · 프로젝트 · 적요 · 작성자 · 최종수정자.
 * 열: 일자-No. · 채권번호 · 증감구분 · 거래처명 · 금액 · 채권 만기일자 · 적요 · 출처업무 · 회계일자-No. — 최근 장이 위(2026/10/12 -2 가 -1 위).
 * 감소 줄은 만기일자가 빈칸이다. 버튼줄 신규(F2) · 선택삭제 · Excel · 이력조회. 빈 목록 '등록된 데이터가 없습니다.'
 *
 * <p>[일자-No.] 를 누르면 수정 창. [선택삭제] → '전표를 삭제하겠습니까? - 채권조회' → 확인. 증가 장을 지워도 그 번호로 감소한 장이 있으면
 * 막지 않는다(원본이 그대로 지웠다). 우리 채권내역은 모두 이 창에서 직접 적으므로 [출처업무]는 '채권내역'(채무는 '채무내역'),
 * [회계일자-No.] 는 빈칸, [입력구분] 연결전표는 늘 비어 있다. [이력조회]는 수정 이력 기능이 없어 두지 않는다.
 */
export default function BondListPage({ side }: { side: BondSide }) {
  const word = sideWord(side)
  const title = `${word}조회`
  const source = `${word}내역`
  const init = periodOf('최근30일(+1개월)')!
  const masters = useBondMasters()
  const [from, setFrom] = useState(init.from)
  const [to, setTo] = useState(init.to)
  const [dueFrom, setDueFrom] = useState('')
  const [dueTo, setDueTo] = useState('')
  const [bondNo, setBondNo] = useState('')
  const [showInc, setShowInc] = useState(true)
  const [showDec, setShowDec] = useState(true)
  const [partner, setPartner] = useState('')
  const [dept, setDept] = useState('')
  const [project, setProject] = useState('')
  const [memo, setMemo] = useState('')
  const [author, setAuthor] = useState('')
  const [editor, setEditor] = useState('')
  const [rows, setRows] = useState<BondRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [picked, setPicked] = useState<Set<number>>(new Set())
  const [modal, setModal] = useState<{ open: boolean; id: number | null }>({ open: false, id: null })
  const [confirmDelete, setConfirmDelete] = useState(false)

  async function load() {
    setLoading(true)
    setError('')
    try {
      setRows(flatten(await fetchBonds(side, to)))
      setPicked(new Set())
    } catch (e) {
      setError(extractErrorMessage(e))
    } finally {
      setLoading(false)
    }
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void load() }, [side, to])

  const shown = useMemo(() => rows
    .filter((r) => r.entryDate >= from && r.entryDate <= to)
    .filter((r) => (r.direction === 'INCREASE' ? showInc : showDec))
    .filter((r) => !dueFrom || (r.dueDate ?? '') >= dueFrom)
    .filter((r) => !dueTo || (!!r.dueDate && r.dueDate <= dueTo))
    .filter((r) => !bondNo || r.bondNo.includes(bondNo))
    .filter((r) => !partner || String(r.partnerId) === partner)
    .filter((r) => !dept || String(r.departmentId) === dept)
    .filter((r) => !project || String(r.projectId) === project)
    .filter((r) => !memo || (r.memo ?? '').includes(memo))
    .filter((r) => !author || r.createdBy === author)
    .filter((r) => !editor || r.updatedBy === editor),
  [rows, from, to, showInc, showDec, dueFrom, dueTo, bondNo, partner, dept, project, memo, author, editor])
  const users = (pick: (r: BondRow) => string | null) =>
    [...new Set(rows.map(pick).filter(Boolean) as string[])].sort().map((u) => ({ value: u, name: u }))
  const entryIds = [...new Set(shown.map((r) => r.entryId))]
  const allPicked = entryIds.length > 0 && entryIds.every((id) => picked.has(id))
  const tableRef = useRef<HTMLTableElement>(null)
  useTableColumnCheck(tableRef, title, [shown.length])

  async function removePicked() {
    setConfirmDelete(false)
    try {
      await api.post('/bonds/delete', { ids: [...picked] })
      await load()
    } catch (e) {
      setError(extractErrorMessage(e))
    }
  }

  const box = (label: string, checked: boolean, set: (v: boolean) => void, disabled = false) => (
    <label className={`inline-flex items-center gap-[3px] mr-[10px] text-[12.5px]${disabled ? ' text-ec-hint' : ''}`}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => set(e.target.checked)} /> {label}
    </label>
  )

  return (
    <EcListShell
      title={title}
      searchable={false}
      actions={[
        { label: '신규(F2)', primary: true, onClick: () => setModal({ open: true, id: null }) },
        { label: '선택삭제', disabled: picked.size === 0, onClick: () => setConfirmDelete(true) },
        { label: 'Excel' },
      ]}
    >
      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
      <ul className="ec-cond mb-[8px]">
        <EcCond label="기준일자">
          <input type="date" className="ec-input w-[145px]" value={from} onChange={(e) => setFrom(e.target.value)} />
          <span className="my-0 mx-[4px]">~</span>
          <input type="date" className="ec-input w-[145px]" value={to} onChange={(e) => setTo(e.target.value)} />
          <span className="ml-[6px]">
            <EcPeriodPicks labels={QUOTATION_PICKS} currentFrom={from} onPick={(r) => { setFrom(r.from); setTo(r.to) }} />
          </span>
        </EcCond>
        <EcCond label={`${word} 만기일자`}>
          <input type="date" className="ec-input w-[145px]" value={dueFrom} onChange={(e) => setDueFrom(e.target.value)} />
          <span className="my-0 mx-[4px]">~</span>
          <input type="date" className="ec-input w-[145px]" value={dueTo} onChange={(e) => setDueTo(e.target.value)} />
        </EcCond>
        <EcCond label={`${word}번호`}>
          <input className="ec-input w-[220px]" placeholder={`${word}번호`} value={bondNo} onChange={(e) => setBondNo(e.target.value)} />
        </EcCond>
        <EcCond label="증감구분">
          {box('전체', showInc && showDec, (v) => { setShowInc(v); setShowDec(v) })}
          {box('증가', showInc, setShowInc)}
          {box('감소', showDec, setShowDec)}
        </EcCond>
        <EcCond label="입력구분">
          {box('전체', true, () => {}, true)}
          {box('직접입력', true, () => {}, true)}
          {box('연결전표', true, () => {}, true)}
        </EcCond>
        <EcCond label="거래처" pick>
          <CodePickerField label="거래처" hideLabel width={220} value={partner} onChange={setPartner} items={masters.partners} />
        </EcCond>
        <EcCond label="부서" pick>
          <CodePickerField label="부서" hideLabel width={220} value={dept} onChange={setDept} items={masters.departments} />
        </EcCond>
        <EcCond label="프로젝트" pick>
          <CodePickerField label="프로젝트" hideLabel width={220} value={project} onChange={setProject} items={masters.projects} />
        </EcCond>
        <EcCond label="적요">
          <input className="ec-input w-[220px]" placeholder="적요" value={memo} onChange={(e) => setMemo(e.target.value)} />
        </EcCond>
        <EcCond label="작성자" pick>
          <CodePickerField label="작성자" hideLabel width={170} value={author} onChange={setAuthor} items={users((r) => r.createdBy)} />
        </EcCond>
        <EcCond label="최종수정자" pick>
          <CodePickerField label="최종수정자" hideLabel width={170} value={editor} onChange={setEditor} items={users((r) => r.updatedBy)} />
        </EcCond>
      </ul>

      <p className="text-right text-[12px] mb-[4px]">{from.replaceAll('-', '/')} ~ {to.replaceAll('-', '/')}</p>
      <table ref={tableRef} className="w-full text-left">
        <thead>
          <tr>
            <th className="w-[30px] text-center">
              <input type="checkbox" aria-label="전체선택" checked={allPicked}
                     onChange={(e) => setPicked(e.target.checked ? new Set(entryIds) : new Set())} />
            </th>
            <th className="text-center">일자-No.</th>
            <th>{word}번호</th>
            <th>증감구분</th>
            <th>거래처명</th>
            <th className="text-right">금액</th>
            <th className="text-center">{word} 만기일자</th>
            <th>적요</th>
            <th>출처업무</th>
            <th>회계일자-No.</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={10} className="ec-empty">불러오는 중…</td></tr>
          ) : shown.length === 0 ? (
            <tr><td colSpan={10} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
          ) : shown.map((r) => (
            <tr key={r.id}>
              <td className="text-center">
                <input type="checkbox" aria-label={`${dateNo(r)} 선택`} checked={picked.has(r.entryId)}
                       onChange={(e) => setPicked((s) => { const n = new Set(s); if (e.target.checked) n.add(r.entryId); else n.delete(r.entryId); return n })} />
              </td>
              <td className="text-center">
                <button type="button" className="ec-link" onClick={() => setModal({ open: true, id: r.entryId })}>{dateNo(r)}</button>
              </td>
              <td>{r.bondNo}</td>
              <td>{r.direction === 'INCREASE' ? '증가' : '감소'}</td>
              <td>{r.partnerName ?? ''}</td>
              <td className="text-right">{won(Number(r.amount))}</td>
              <td className="text-center">{r.dueDate ? r.dueDate.replaceAll('-', '/') : ''}</td>
              <td>{r.memo ?? ''}</td>
              <td>{source}</td>
              <td />
            </tr>
          ))}
        </tbody>
      </table>

      <BondEntryModal side={side} open={modal.open} entryId={modal.id} masters={masters}
                      onClose={() => setModal({ open: false, id: null })} onSaved={() => void load()} />
      <Modal open={confirmDelete} title="알림" width={420} error={error} onClose={() => setConfirmDelete(false)}>
        <p className="mb-[12px]">전표를 삭제하겠습니까?<br />- {title}</p>
        <div className="flex gap-[5px]">
          <button type="button" className="ec-btn ec-btn-primary" onClick={() => void removePicked()}>확인</button>
          <button type="button" className="ec-btn" onClick={() => setConfirmDelete(false)}>취소</button>
        </div>
      </Modal>
    </EcListShell>
  )
}
