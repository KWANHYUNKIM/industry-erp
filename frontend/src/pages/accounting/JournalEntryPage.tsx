import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import Modal from '../../components/Modal'
import type { JournalEntry } from '../../types/api'
import EcSlipShell from '../../components/EcSlipShell'
import SlipGridTools from '../../features/fastentry/components/SlipGridTools'
import EcDateField from '../../components/EcDateField'
import EcNumInput from '../../components/EcNumInput'
import CodePickerField, { type CodeItem } from '../../components/CodePickerField'
import { EcCond } from '../../components/EcStatusPanel'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import { api, extractErrorMessage } from '../../api/client'
import { useCondPickers } from '../../utils/useCondPickers'
import { useDeptProjectItems } from '../../features/cashquick/useDeptProject'
import { journalNeighbors } from '../../utils/journalNav'
import { ymd } from '../../components/EcPeriodPicks'

interface Account { id: number; code: string; name: string }
/**
 * 줄 구분 — 원본 선택상자 1출 · 2입 · 3차 · 4대(2026-10-14 실측).
 * 1출: 금액을 차변에 넣으면 대변 칸에도 같은 금액이 서고(합계 양쪽), 저장하면 상대 줄 '대 현금' 이 붙는다(계정별원장 1019 현금 대변).
 * 2입: 차변을 건너뛰고 대변에 넣는다 — 차변에 같은 금액, 상대 줄 '차 현금'.
 */
type Side = '1' | '2' | '3' | '4'
/** 1출 · 2입 줄은 금액 칸 하나가 차 · 대 양쪽이다. */
const isDebitIn = (s: Side) => s === '1' || s === '3'
interface Row { side: Side; accountId: string; partnerId: string; debit: string; credit: string; description: string; departmentId: string }

const won = (n: number) => n.toLocaleString('ko-KR')
const num = (v: string) => Number(String(v).replace(/,/g, '')) || 0
const today = () => ymd(new Date())
const emptyRow = (side: Side = '3'): Row => ({ side, accountId: '', partnerId: '', debit: '', credit: '', description: '', departmentId: '' })
const blankRows = () => [emptyRow(), emptyRow(), emptyRow()]
const TEMP_KEY = 'temp-journal-entry'
const CONFIRM_LABEL: Record<string, string> = { IN_APPROVAL: '결재중', UNCONFIRMED: '미확인', CONFIRMED: '확인' }

function workTime(iso?: string | null) {
  if (!iso) return ''
  const d = new Date(iso)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

/**
 * 회계 I › FastEntry › <b>일반전표</b>(E010201) — 2026-10-13 loginaa 실측(plans/회계1/E010201.md).
 *
 * <p>입력 판: 전표일자 · 구분(일반전표) · 회계전표No. · 첨언내용. 격자: 구분(3차 · 4대) · 계정코드 · 계정명 · 거래처코드 · 거래처명 ·
 * 차변 · 대변 · 적요코드 · 적요 · 추가정보([입력]) · 부서. 처음 3줄, 아래로 내려가면 줄이 는다. 합계줄 차변 · 대변 합과 적요 칸에 차액.
 * 계정코드 칸에 이름 일부를 치고 Enter → '계정검색'(한 건이면 바로 고른다). 다음 줄 적요 칸에 들어가면 윗줄 적요가 따라온다.
 *
 * <p>검증(원본 글자): 계정 없이 저장 → 계정코드 칸 '계정코드를 입력 바랍니다.' · 차대가 다르면 알림
 * '대차금액이 맞지 않아 저장할 수 없습니다.' / '대변과 차변의 전표금액을 확인 바랍니다.'
 * 계정에 추가항목유형이 없으면 [입력] → '해당 계정에 입력 가능한 추가정보가 없습니다.'
 *
 * <p>[저장(F8)]은 안내 없이 빈 화면(전표일자는 그대로). 칸을 떠날 때마다 임시저장 — 다시 열면 위에 '임시저장된 내역' 줄.
 * 회계거래조회에서 전표번호를 누르면 수정 창(?journal=id): 전표일자 막힘, 버튼 저장(F8) · 저장/전표(F7) · 복사 · 이전 · 다음 · 닫기 · 삭제 · H,
 * 삭제 확인 '전표를 삭제하겠습니까?' + '- 일반전표'. 저장하면 닫혀 회계거래조회로.
 *
 * <p>1출 · 2입: 줄 하나에 금액 하나, 저장하면 현금 상대 줄이 붙는다(다시 열면 3차 · 4대 두 줄로 보인다 — 원본은 1출 한 줄 그대로).
 *
 * <p>격자 위 툴바는 원본 그대로 [찾기(F3)] · [전표불러오기](SlipGridTools — 받쳐 줄 기능이 없어 모양만).
 * <p>두지 않은 것(plans/회계1.md 남은 것): 적요코드(적요 마스터 없음) ·
 * 회계전표No. 직접 지정 · 웹자료올리기 · 보내기 · 수정 창 [확인취소] · 프로젝트 열(원본 이 회사 설정으로 숨김).
 */
export default function JournalEntryPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const editId = Number(params.get('journal')) || null
  const pickers = useCondPickers(['partners'])
  const deptProject = useDeptProjectItems()
  const [accounts, setAccounts] = useState<Account[]>([])
  const [entryDate, setEntryDate] = useState(today())
  const [memo, setMemo] = useState('')
  const [rows, setRows] = useState<Row[]>(blankRows)
  const [loaded, setLoaded] = useState<JournalEntry | null>(null)
  const [error, setError] = useState('')
  /** 계정 없이 저장했을 때 빨갛게 두르는 줄 — 원본은 그 칸 위에 말풍선을 띄운다. */
  const [missing, setMissing] = useState<number | null>(null)
  const [unbalanced, setUnbalanced] = useState(false)
  const [noExtra, setNoExtra] = useState<number | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [hasTemp, setHasTemp] = useState(false)
  const [savedAt, setSavedAt] = useState('')

  useEffect(() => {
    api.get<Account[]>('/accounts').then((r) => setAccounts(r.data)).catch((e) => setError(extractErrorMessage(e)))
  }, [])
  useEffect(() => {
    if (editId) return
    try { setHasTemp(!!localStorage.getItem(TEMP_KEY)) } catch { setHasTemp(false) }
  }, [editId])

  /* 수정 창 — 분개 줄을 그대로 되살린다. */
  useEffect(() => {
    if (!editId) return
    api.get<JournalEntry>(`/journals/${editId}`).then(({ data: e }) => {
      setLoaded(e)
      setEntryDate(e.entryDate)
      setMemo(e.memo ?? '')
      const rs: Row[] = e.lines.map((l) => ({
        side: l.debit > 0 ? '3' : '4', accountId: String(l.accountId), partnerId: l.partnerId ? String(l.partnerId) : '',
        debit: l.debit > 0 ? String(l.debit) : '', credit: l.credit > 0 ? String(l.credit) : '',
        description: l.description ?? '', departmentId: l.departmentId ? String(l.departmentId) : '',
      }))
      setRows([...rs, emptyRow(), emptyRow()])
    }).catch((err) => setError(extractErrorMessage(err)))
  }, [editId])

  const accountItems: CodeItem[] = useMemo(() => accounts.map((a) => ({ value: String(a.id), code: a.code, name: a.name })), [accounts])
  const amountOf = (r: Row) => num(isDebitIn(r.side) ? r.debit : r.credit)
  const totalDebit = rows.reduce((a, r) => a + (r.side === '4' ? 0 : amountOf(r)), 0)
  const totalCredit = rows.reduce((a, r) => a + (r.side === '3' ? 0 : amountOf(r)), 0)
  /** 1출 · 2입의 상대 줄 계정 — 우리 표준계정 101 현금(원본 1019). */
  const cashId = accounts.find((a) => a.code === '101')?.id ?? accounts.find((a) => a.name === '현금')?.id
  const diff = Math.abs(totalDebit - totalCredit)

  function setRow(i: number, patch: Partial<Row>) {
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)))
    setMissing(null)
  }
  /** 원본: 처음 3줄, 둘째 줄부터 들어가면 아래에 빈 줄이 붙어 늘 몇 줄 여유가 있다. */
  function grow(i: number) {
    const want = i === 0 ? 3 : i + 4
    setRows((rs) => (rs.length >= want ? rs : [...rs, ...Array.from({ length: want - rs.length }, () => emptyRow())]))
  }
  /** 적요 칸에 들어가면 비어 있을 때 윗줄 적요를 가져온다(원본 실측). */
  function carryMemo(i: number) {
    if (i === 0 || rows[i].description) return
    const above = rows[i - 1]?.description
    if (above) setRow(i, { description: above })
  }

  /* ── 임시저장: 칸을 떠날 때마다(원본 '오후 11:35 임시저장되었습니다.') ── */
  function tempSave() {
    if (editId || !rows.some((r) => r.accountId || num(r.debit) || num(r.credit))) return
    try {
      localStorage.setItem(TEMP_KEY, JSON.stringify({ entryDate, memo, rows }))
      setSavedAt(`${new Date().toLocaleTimeString('ko-KR', { hour: 'numeric', minute: '2-digit' })} 임시저장되었습니다.`)
    } catch { /* 저장소가 막혀도 입력은 이어 간다 */ }
  }
  function applyTemp() {
    try {
      const s = JSON.parse(localStorage.getItem(TEMP_KEY) ?? 'null')
      if (s) { setEntryDate(s.entryDate ?? today()); setMemo(s.memo ?? ''); setRows(Array.isArray(s.rows) && s.rows.length ? s.rows : blankRows()) }
    } catch { /* 읽을 수 없으면 그냥 둔다 */ }
    setHasTemp(false)
  }
  function deleteTemp() {
    try { localStorage.removeItem(TEMP_KEY) } catch { /* 무시 */ }
    setHasTemp(false); setSavedAt('')
  }

  function reset() {
    setRows(blankRows()); setMemo(''); setMissing(null); setError('')
  }

  async function save(thenSlip = false) {
    setError('')
    const filled = rows.filter((r) => r.accountId || amountOf(r))
    if (filled.length === 0 || filled.some((r) => !r.accountId)) {
      setMissing(filled.length === 0 ? 0 : rows.findIndex((r) => amountOf(r) && !r.accountId))
      return
    }
    if (totalDebit !== totalCredit || totalDebit === 0) { setUnbalanced(true); return }
    if (filled.some((r) => r.side === '1' || r.side === '2') && !cashId) { setError('현금 계정(101)이 없습니다.'); return }
    setSaving(true)
    try {
      const body = {
        entryDate, memo: memo.trim() || undefined,
        lines: filled.flatMap((r) => {
          const amt = amountOf(r)
          const line = {
            accountId: Number(r.accountId),
            debit: isDebitIn(r.side) ? amt : 0,
            credit: isDebitIn(r.side) ? 0 : amt,
            description: r.description.trim() || undefined,
            partnerId: r.partnerId ? Number(r.partnerId) : undefined,
            departmentId: r.departmentId ? Number(r.departmentId) : undefined,
          }
          if (r.side === '3' || r.side === '4') return [line]
          // 1출 → 대 현금 · 2입 → 차 현금 (원본: 줄 하나로 넣어도 현금 원장에 상대 금액이 선다)
          const cash = { ...line, accountId: Number(cashId), partnerId: undefined, debit: line.credit, credit: line.debit }
          return [line, cash]
        }),
      }
      const { data } = editId
        ? await api.put<JournalEntry>(`/journals/${editId}`, body)
        : await api.post<JournalEntry>('/journals', body)
      if (!editId) deleteTemp()
      if (thenSlip) navigate(`/accounting/journals?entryId=${data.id}`)
      else if (editId) navigate('/accounting/journals')
      else reset()   // 원본: 안내 없이 빈 입력 화면(전표일자는 그대로)
    } catch (e) {
      const msg = extractErrorMessage(e)
      if (msg.includes('대차금액')) setUnbalanced(true)
      else setError(msg)
    } finally {
      setSaving(false)
    }
  }

  async function remove() {
    if (!editId) return
    try {
      await api.delete(`/journals/${editId}`)
      setConfirmDelete(false)
      navigate('/accounting/journals')
    } catch (e) {
      setError(extractErrorMessage(e))
    }
  }

  /** [복사] — 같은 줄로 새 전표를 연다(일자는 오늘). */
  function copy() {
    const keep = rows
    navigate('/accounting/journal-entry')
    setTimeout(() => { setLoaded(null); setEntryDate(today()); setRows(keep) }, 0)
  }

  const nav = editId ? journalNeighbors(`/accounting/journal-entry?journal=${editId}`) : { prev: null, next: null }
  const actions = editId
    ? [
        { label: '저장(F8)', primary: true, submit: true, disabled: saving },
        { label: '저장/전표(F7)', onClick: () => void save(true), disabled: saving },
        { label: '복사', onClick: copy },
        { label: '이전', onClick: () => nav.prev && navigate(nav.prev), disabled: !nav.prev },
        { label: '다음', onClick: () => nav.next && navigate(nav.next), disabled: !nav.next },
        { label: '닫기', onClick: () => navigate('/accounting/journals') },
        { label: '삭제', onClick: () => setConfirmDelete(true) },
        { label: 'H', onClick: () => setHistoryOpen(true) },
      ]
    : [
        { label: '저장(F8)', primary: true, submit: true, disabled: saving },
        { label: '저장/전표(F7)', onClick: () => void save(true), disabled: saving },
        { label: '다시 작성', onClick: reset },
        { label: '리스트', onClick: () => navigate('/accounting/journals') },
      ]

  const tableRef = useRef<HTMLTableElement>(null)
  useTableColumnCheck(tableRef, '일반전표', [])
  const slipNo = loaded ? loaded.docNo.replace(/^.*-0*/, '') : ''

  return (
    <>
    <form onSubmit={(e) => { e.preventDefault(); void save() }} onBlur={tempSave}>
      <EcSlipShell title="일반전표" formTabs={[{ id: 'basic', label: '일반전표' }]} activeFormTab="basic"
                   tempSave={hasTemp ? { onApply: applyTemp, onDelete: deleteTemp } : null} savedAt={savedAt} actions={actions}>
        {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
        <ul className="ec-form mb-[8px]">
          <EcCond label="전표일자" span={2}>
            <div className="flex items-center gap-[4px]">
              <EcDateField value={entryDate} onChange={setEntryDate} disabled={!!editId} />
              {slipNo && <span>- {slipNo}</span>}
            </div>
          </EcCond>
          <EcCond label="구분" span={2}>
            <select className="ec-input w-full" aria-label="구분" value="일반전표" disabled={!!editId} onChange={() => undefined}>
              <option value="일반전표">일반전표</option>
            </select>
          </EcCond>
          <EcCond label="회계전표No." span={2}>
            <input className="ec-input w-full" aria-label="회계전표No." placeholder="회계전표No." readOnly value="" />
          </EcCond>
          <EcCond label="첨언내용" span="full">
            <textarea className="ec-input w-full h-[52px]" aria-label="첨언내용" placeholder="첨언내용" maxLength={1000}
                      value={memo} onChange={(e) => setMemo(e.target.value)} />
          </EcCond>
        </ul>

        <SlipGridTools tools={['찾기(F3)', '전표불러오기']} />
        {/* 원본 본문 줄 36.5 = 칸 안 입력(span.grid-input-data) 25.2 + 위아래 5.4 — 우리 입력칸 26 이 줄을 37.3 으로 밀었다. */}
        <table ref={tableRef} className="w-full text-left [&_tbody_input]:h-[var(--ec-grid-ctl-h)] [&_tbody_select]:h-[var(--ec-grid-ctl-h)] [&_tbody_button]:h-[var(--ec-grid-ctl-h)]">
          <thead>
            <tr>
              <th className="w-[48px]"></th><th className="w-[90px] text-center">구분</th>
              <th className="text-center">계정코드</th><th className="text-center">계정명</th>
              <th className="text-center">거래처코드</th><th className="text-center">거래처명</th>
              <th className="text-center w-[150px]">차변</th><th className="text-center w-[150px]">대변</th>
              <th className="text-center w-[90px]">적요코드</th><th className="text-center">적요</th>
              <th className="text-center w-[70px]">추가정보</th><th className="text-center w-[130px]">부서</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} onFocus={() => grow(i)}>
                <td className="text-center text-ec-hint">{i + 1}</td>
                <td>
                  <select className="ec-input w-full" aria-label={`${i + 1}줄 구분`} value={r.side}
                          onChange={(e) => {
                            const side = e.target.value as Side
                            const amt = isDebitIn(r.side) ? r.debit : r.credit
                            setRow(i, isDebitIn(side) ? { side, debit: amt, credit: '' } : { side, credit: amt, debit: '' })
                          }}>
                    <option value="1">1출</option>
                    <option value="2">2입</option>
                    <option value="3">3차</option>
                    <option value="4">4대</option>
                  </select>
                </td>
                <td colSpan={2} className={missing === i ? 'outline outline-1 outline-[var(--ec-danger)]' : ''}
                    title={missing === i ? '계정코드를 입력 바랍니다.' : undefined}>
                  <CodePickerField label="계정" popupTitle="계정검색" hideLabel pair fill emptyLabel="(없음)"
                                   value={r.accountId} onChange={(v) => setRow(i, { accountId: v })} items={accountItems} />
                  {missing === i && <div className="text-ec-danger text-[11px]">계정코드를 입력 바랍니다.</div>}
                </td>
                <td colSpan={2}>
                  <CodePickerField label="거래처" hideLabel pair fill emptyLabel="(없음)"
                                   value={r.partnerId} onChange={(v) => setRow(i, { partnerId: v })} items={pickers.partners} />
                </td>
                <td>
                  <EcNumInput className="ec-input w-full text-right" aria-label={`${i + 1}줄 차변`} disabled={!isDebitIn(r.side)}
                              value={r.side === '2' ? r.credit : r.debit} onValue={(v) => setRow(i, { debit: v })} />
                </td>
                <td>
                  <EcNumInput className="ec-input w-full text-right" aria-label={`${i + 1}줄 대변`} disabled={isDebitIn(r.side)}
                              value={r.side === '1' ? r.debit : r.credit} onValue={(v) => setRow(i, { credit: v })} />
                </td>
                <td><input className="ec-input w-full" aria-label={`${i + 1}줄 적요코드`} readOnly value="" /></td>
                <td>
                  <input className="ec-input w-full" aria-label={`${i + 1}줄 적요`} maxLength={300} value={r.description}
                         onFocus={() => carryMemo(i)} onChange={(e) => setRow(i, { description: e.target.value })} />
                </td>
                <td className="text-center relative">
                  <a className="text-ec-navy cursor-pointer" onClick={() => r.accountId && setNoExtra(noExtra === i ? null : i)}>입력</a>
                  {noExtra === i && (
                    <div className="ec-alert absolute right-0 top-full z-10 whitespace-nowrap">해당 계정에 입력 가능한 추가정보가 없습니다.</div>
                  )}
                </td>
                <td>
                  <CodePickerField label="부서" hideLabel fill emptyLabel="(없음)" value={r.departmentId}
                                   onChange={(v) => setRow(i, { departmentId: v })} items={deptProject.departments} />
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="font-bold bg-ec-page">
              <td colSpan={6}></td>
              <td className="text-right">{won(totalDebit)}</td>
              <td className="text-right">{won(totalCredit)}</td>
              <td></td>
              <td className="text-right">{diff ? won(diff) : ''}</td>
              <td colSpan={2}></td>
            </tr>
          </tfoot>
        </table>
      </EcSlipShell>
    </form>

      <Modal open={unbalanced} title="알림" width={620} error={error} onClose={() => setUnbalanced(false)}>
        <p className="mb-[8px]">아래의 경우 처리가 불가능합니다.<br />자세한 내용은 아래의 사항을 참고하시기 바랍니다.<br />아래 사항을 수정 후 다시 진행하시기 바랍니다.</p>
        <table className="w-full">
          <thead><tr><th className="w-[90px]">구분</th><th className="w-[120px]">해당 메뉴</th><th>사유</th></tr></thead>
          <tbody>
            <tr><td></td><td></td><td>대차금액이 맞지 않아 저장할 수 없습니다.<br /><br />대변과 차변의 전표금액을 확인 바랍니다.</td></tr>
          </tbody>
        </table>
        <div className="flex gap-[5px] mt-[8px]">
          <button type="button" className="ec-btn" onClick={() => setUnbalanced(false)}>닫기</button>
        </div>
      </Modal>

      <Modal open={historyOpen} title="전표이력보기" width={780} error={error} onClose={() => setHistoryOpen(false)}>
        <p className="mb-[6px]">전표번호 : {entryDate.replace(/-/g, '/')} -{slipNo}</p>
        <table className="w-full">
          <thead><tr><th className="w-[34px]"></th><th className="text-center">작업자ID</th><th className="text-center">작업일시</th><th className="text-center">전표종류</th><th className="text-center">상태</th></tr></thead>
          <tbody>
            {loaded && [
              { who: loaded.createdBy, at: loaded.createdAt, state: '신규' },
              ...(loaded.updatedAt && loaded.createdAt && workTime(loaded.updatedAt) !== workTime(loaded.createdAt)
                ? [{ who: (loaded as JournalEntry & { updatedBy?: string | null }).updatedBy ?? loaded.createdBy, at: loaded.updatedAt, state: '수정' }] : []),
            ].map((h, i) => (
              <tr key={i}>
                <td className="text-center">{i + 1}</td>
                <td className="text-center text-ec-navy">{(h.who ?? '').toUpperCase()}</td>
                <td className="text-center">{workTime(h.at)}</td>
                <td className="text-center">{CONFIRM_LABEL[(loaded as JournalEntry & { confirmStatus?: string }).confirmStatus ?? ''] ?? ''}</td>
                <td className="text-center">{h.state}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="flex gap-[5px] mt-[8px]">
          <button type="button" className="ec-btn ec-btn-primary" onClick={() => setHistoryOpen(false)}>닫기</button>
        </div>
      </Modal>

      <Modal open={confirmDelete} title="알림" width={420} error={error} onClose={() => setConfirmDelete(false)}>
        <p className="mb-[12px]">전표를 삭제하겠습니까?<br />- 일반전표</p>
        <div className="flex gap-[5px]">
          <button type="button" className="ec-btn ec-btn-primary" onClick={() => void remove()}>확인</button>
          <button type="button" className="ec-btn" onClick={() => setConfirmDelete(false)}>취소</button>
        </div>
      </Modal>
    </>
  )
}
