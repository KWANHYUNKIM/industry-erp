import { useEffect, useMemo, useRef, useState } from 'react'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import { api, extractErrorMessage } from '../../api/client'
import EcListShell from '../../components/EcListShell'
import Modal from '../../components/Modal'
import { EcCond } from '../../components/EcStatusPanel'
import CodePickerField from '../../components/CodePickerField'
import EcPeriodPicks, { periodOf, QUOTATION_PICKS } from '../../components/EcPeriodPicks'
import { fetchFundPlans, useFundPlanMasters } from '../../features/fundplan/api'
import FundPlanModal from '../../features/fundplan/components/FundPlanModal'
import { methodCell, won, type FundPlan } from '../../features/fundplan/types'
import NumCheck from '../../features/bankcheck/components/NumCheck'

/**
 * 회계 II › 자금계획 › <b>계획전표조회</b>(E020511) — 2026-10-12 loginaa 실측.
 *
 * <p>기간 기본 <b>최근30일(+1개월)</b>(2026/09/12 ~ 2026/11/11). 열: 발생일자 · 입출구분 · 입력구분 · 금액 · 상대계정명 · 거래처명 ·
 * 관리번호(어음번호) · 적요 · 이체정보 · 회계반영여부. 최근 일자 · 나중에 넣은 장이 위. 출금 줄은 바탕이 옅은 빨강
 * (토큰 ec-danger-bg). 버튼줄 신규(F2) · 회계처리▴ · 선택삭제 · Excel. [발생일자]를 누르면 계획전표수정 창.
 * [선택삭제] → '전표를 삭제하겠습니까?'.
 * 출금 30,000(기업은행-1122 · 외상매입금 · 김치좋아) 저장 → 목록 '출금 · 자금 · 30,000' · 계획전표현황 그날 '예금(현금)감소 30' ·
 * 추정자금일보 기업은행-1122 감소 30,000.
 *
 * <p>[회계처리▴](입금보고서 · 지출결의서 · 일반전표)는 회계 I 전표로 넘기는 기능이라 아직 없다 — [회계반영여부]는 늘 빈칸.
 * [이체정보]는 거래처 이체계좌 등록 링크인데 거래처 화면 몫이라 글자만 둔다.
 *
 * <p>2026-10-14 다시 잼: 조건은 접힌 채 [Search(F3)] 로 편다 — 기준일자 · 부서 · 프로젝트 · 입출구분 / 입력구분
 * (전체 · 자금 · 수금 · 지급 · 어음 · 채권 · 채무, 처음 자금 · 수금 · 지급만 켜짐) / 자금구분(전체 · 예금(현금) · 어음) ·
 * 계좌번호 · 계정코드 · 거래처 · 금액 ~ · 관리번호(어음번호) · 적요 · 회계반영여부(전체 · 반영 · 미반영) · 최초작성자 · 최종수정자.
 * 첫 칸은 번호 체크칸(form-checkbox-numbered, 폭 40). 격자 위 오른쪽에 기간 글 '2026/09/14 ~2026/11/13'.
 */
export default function FundPlanListPage() {
  const title = '계획전표조회'
  const init = periodOf('최근30일(+1개월)')!
  const masters = useFundPlanMasters()
  const [from, setFrom] = useState(init.from)
  const [to, setTo] = useState(init.to)
  const [dept, setDept] = useState('')
  const [project, setProject] = useState('')
  const [dir, setDir] = useState<'' | 'OUT' | 'IN'>('')
  /** 원본 [입력구분] — 계획전표는 늘 '자금'. 처음 자금 · 수금 · 지급이 켜져 있다(2026-10-14 실측). */
  const [kinds, setKinds] = useState<Set<string>>(new Set(['자금', '수금', '지급']))
  const [fundKind, setFundKind] = useState<'' | 'DEPOSIT' | 'NOTE'>('')
  const [bank, setBank] = useState('')
  const [account, setAccount] = useState('')
  const [partner, setPartner] = useState('')
  const [amtFrom, setAmtFrom] = useState('')
  const [amtTo, setAmtTo] = useState('')
  const [noteNo, setNoteNo] = useState('')
  const [memo, setMemo] = useState('')
  const [reflected, setReflected] = useState<'' | 'Y' | 'N'>('')
  const [author, setAuthor] = useState('')
  const [editor, setEditor] = useState('')
  const [quick, setQuick] = useState('')
  const [rows, setRows] = useState<FundPlan[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [picked, setPicked] = useState<Set<number>>(new Set())
  const [modal, setModal] = useState<{ open: boolean; id: number | null }>({ open: false, id: null })
  const [confirmDelete, setConfirmDelete] = useState(false)

  async function load() {
    setLoading(true)
    setError('')
    try {
      setRows(await fetchFundPlans(from, to))
      setPicked(new Set())
    } catch (e) {
      setError(extractErrorMessage(e))
    } finally {
      setLoading(false)
    }
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void load() }, [from, to])

  const KINDS = ['자금', '수금', '지급', '어음', '채권', '채무']
  const resetConds = () => {
    setFrom(init.from); setTo(init.to); setDept(''); setProject(''); setDir(''); setKinds(new Set(['자금', '수금', '지급']))
    setFundKind(''); setBank(''); setAccount(''); setPartner(''); setAmtFrom(''); setAmtTo(''); setNoteNo(''); setMemo('')
    setReflected(''); setAuthor(''); setEditor('')
  }
  const authors = useMemo(() => [...new Set(rows.map((r) => r.createdBy).filter(Boolean) as string[])].sort(), [rows])
  const editors = useMemo(() => [...new Set(rows.map((r) => r.updatedBy).filter(Boolean) as string[])].sort(), [rows])

  const shown = useMemo(() => rows
    .filter((r) => !dept || String(r.departmentId) === dept)
    .filter((r) => !project || String(r.projectId) === project)
    .filter((r) => !dir || r.direction === dir)
    .filter((r) => kinds.has(methodCell(r.method)))
    .filter((r) => !fundKind || r.method === fundKind)
    .filter((r) => !bank || String(r.bankAccountId) === bank)
    .filter((r) => !account || String(r.counterAccountId) === account)
    .filter((r) => !partner || String(r.partnerId) === partner)
    .filter((r) => !amtFrom || Number(r.amount) >= Number(amtFrom))
    .filter((r) => !amtTo || Number(r.amount) <= Number(amtTo))
    .filter((r) => !noteNo || (r.noteNo ?? '').includes(noteNo))
    .filter((r) => !memo || (r.memo ?? '').includes(memo))
    // 회계처리가 아직 없어 모든 계획전표가 미반영이다
    .filter(() => reflected !== 'Y')
    .filter((r) => !author || r.createdBy === author)
    .filter((r) => !editor || r.updatedBy === editor)
    .filter((r) => !quick || [r.memo, r.partnerName, r.counterAccountName].some((v) => (v ?? '').includes(quick))),
  [rows, dept, project, dir, kinds, fundKind, bank, account, partner, amtFrom, amtTo, noteNo, memo, reflected, author, editor, quick])
  const tableRef = useRef<HTMLTableElement>(null)
  useTableColumnCheck(tableRef, title, [shown.length])

  async function removePicked() {
    setConfirmDelete(false)
    try {
      await api.post('/fund-plans/delete', { ids: [...picked] })
      await load()
    } catch (e) {
      setError(extractErrorMessage(e))
    }
  }

  const radio = <T extends string>(name: string, value: T, cur: T, label: string, on: (v: T) => void) => (
    <label key={value} className="inline-flex items-center gap-[3px] mr-[10px] text-[12.5px]">
      <input type="radio" name={name} checked={cur === value} onChange={() => on(value)} /> {label}
    </label>
  )
  const box = (label: string, checked: boolean, set: (v: boolean) => void) => (
    <label key={label} className="inline-flex items-center gap-[3px] mr-[10px] text-[12.5px]">
      <input type="checkbox" checked={checked} onChange={(e) => set(e.target.checked)} /> {label}
    </label>
  )
  const toggleKind = (k: string, v: boolean) => setKinds((s) => { const n = new Set(s); if (v) n.add(k); else n.delete(k); return n })

  return (
    <EcListShell
      title={title}
      search={quick}
      onSearchChange={setQuick}
      onSearch={() => void load()}
      onReset={resetConds}
      actions={[
        { label: '신규(F2)', primary: true, onClick: () => setModal({ open: true, id: null }) },
        { label: '선택삭제', selected: picked.size, onClick: () => setConfirmDelete(true) },
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
        <EcCond label="부서" pick>
          <CodePickerField label="부서" hideLabel width={220} emptyLabel="전체" value={dept} onChange={setDept} items={masters.departments} />
        </EcCond>
        <EcCond label="프로젝트" pick>
          <CodePickerField label="프로젝트" hideLabel width={220} emptyLabel="전체" value={project} onChange={setProject} items={masters.projects} />
        </EcCond>
        {/* 원본은 한 줄에 입출구분 · 입력구분 · 자금구분 세 묶음 */}
        <EcCond label="입출구분">
          {([['', '전체'], ['OUT', '출금'], ['IN', '입금']] as const).map(([v, l]) => radio('fp-list-dir', v, dir, l, setDir))}
          <span className="ml-[12px] mr-[6px] font-bold">입력구분</span>
          {box('전체', KINDS.every((k) => kinds.has(k)), (v) => setKinds(v ? new Set(KINDS) : new Set()))}
          {KINDS.map((k) => box(k, kinds.has(k), (v) => toggleKind(k, v)))}
          <span className="ml-[12px] mr-[6px] font-bold">자금구분</span>
          {([['', '전체'], ['DEPOSIT', '예금(현금)'], ['NOTE', '어음']] as const).map(([v, l]) => radio('fp-list-fund', v, fundKind, l, setFundKind))}
        </EcCond>
        <EcCond label="계좌번호" pick>
          <CodePickerField label="계좌번호" hideLabel width={220} emptyLabel="전체" value={bank} onChange={setBank} items={masters.bankAccounts} />
        </EcCond>
        <EcCond label="계정코드" pick>
          <CodePickerField label="계정코드" hideLabel width={220} emptyLabel="전체" value={account} onChange={setAccount} items={masters.accounts} />
        </EcCond>
        <EcCond label="거래처" pick>
          <CodePickerField label="거래처" hideLabel width={220} emptyLabel="전체" value={partner} onChange={setPartner} items={masters.partners} />
        </EcCond>
        <EcCond label="금액">
          <input className="ec-input w-[120px] text-right" aria-label="금액부터" value={amtFrom} onChange={(e) => setAmtFrom(e.target.value.replace(/[^0-9]/g, ''))} />
          <span className="my-0 mx-[4px]">~</span>
          <input className="ec-input w-[120px] text-right" aria-label="금액까지" value={amtTo} onChange={(e) => setAmtTo(e.target.value.replace(/[^0-9]/g, ''))} />
        </EcCond>
        <EcCond label="관리번호(어음번호)">
          <input className="ec-input w-[220px]" value={noteNo} onChange={(e) => setNoteNo(e.target.value)} />
        </EcCond>
        <EcCond label="적요">
          <input className="ec-input w-[220px]" value={memo} onChange={(e) => setMemo(e.target.value)} />
        </EcCond>
        <EcCond label="회계반영여부">
          {([['', '전체'], ['Y', '반영'], ['N', '미반영']] as const).map(([v, l]) => radio('fp-list-refl', v, reflected, l, setReflected))}
        </EcCond>
        <EcCond label="최초작성자" pick>
          <CodePickerField label="최초작성자" hideLabel width={170} emptyLabel="전체" value={author} onChange={setAuthor}
                           items={authors.map((a) => ({ value: a, name: a }))} />
        </EcCond>
        <EcCond label="최종수정자" pick>
          <CodePickerField label="최종수정자" hideLabel width={170} emptyLabel="전체" value={editor} onChange={setEditor}
                           items={editors.map((a) => ({ value: a, name: a }))} />
        </EcCond>
      </ul>

      <p className="text-right text-[12px] mb-[4px]">{from.replaceAll('-', '/')} ~{to.replaceAll('-', '/')}</p>
      <table ref={tableRef} className="w-full text-left">
        <thead>
          <tr>
            <th className="w-[40px]">
              <NumCheck no="" head label="전체선택" on={shown.length > 0 && shown.every((r) => picked.has(r.id))}
                        onChange={(v) => setPicked(v ? new Set(shown.map((r) => r.id)) : new Set())} />
            </th>
            <th className="text-center">발생일자</th>
            <th>입출구분</th>
            <th>입력구분</th>
            <th className="text-right">금액</th>
            <th>상대계정명</th>
            <th>거래처명</th>
            <th>관리번호(어음번호)</th>
            <th>적요</th>
            <th>이체정보</th>
            <th>회계반영여부</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={11} className="ec-empty">불러오는 중…</td></tr>
          ) : shown.length === 0 ? (
            <tr><td colSpan={11} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
          ) : shown.map((r, i) => (
            <tr key={r.id} className={r.direction === 'OUT' ? '[&>td]:bg-ec-danger-bg' : undefined}>
              <td className="text-center">
                <NumCheck no={i + 1} label={`${r.planDate} ${r.id} 선택`} on={picked.has(r.id)}
                          onChange={(v) => setPicked((s) => { const n = new Set(s); if (v) n.add(r.id); else n.delete(r.id); return n })} />
              </td>
              <td className="text-center">
                <button type="button" className="ec-link" onClick={() => setModal({ open: true, id: r.id })}>{r.planDate.replaceAll('-', '/')}</button>
              </td>
              <td>{r.directionName}</td>
              <td>{methodCell(r.method)}</td>
              <td className="text-right">{Number(r.amount) ? won(Number(r.amount)) : ''}</td>
              <td>{r.counterAccountName ?? ''}</td>
              <td>{r.partnerName ?? ''}</td>
              <td>{r.noteNo ?? ''}</td>
              <td>{r.memo ?? ''}</td>
              <td>{r.partnerId ? '등록' : ''}</td>
              <td />
            </tr>
          ))}
        </tbody>
      </table>

      <FundPlanModal open={modal.open} planId={modal.id} masters={masters}
                     onClose={() => setModal({ open: false, id: null })} onSaved={() => void load()} />
      <Modal open={confirmDelete} title="알림" width={420} error={error} onClose={() => setConfirmDelete(false)}>
        <p className="mb-[12px]">전표를 삭제하겠습니까?</p>
        <div className="flex gap-[5px]">
          <button type="button" className="ec-btn ec-btn-primary" onClick={() => void removePicked()}>확인</button>
          <button type="button" className="ec-btn" onClick={() => setConfirmDelete(false)}>취소</button>
        </div>
      </Modal>
    </EcListShell>
  )
}
