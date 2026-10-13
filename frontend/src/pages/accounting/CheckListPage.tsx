import { useEffect, useMemo, useRef, useState } from 'react'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import { api, extractErrorMessage } from '../../api/client'
import EcListShell from '../../components/EcListShell'
import Modal from '../../components/Modal'
import CheckDirectEntryModal, { type CheckVoucher } from '../../features/bankcheck/components/CheckDirectEntryModal'
import { EcCond } from '../../components/EcStatusPanel'
import CodePickerField from '../../components/CodePickerField'
import EcPeriodPicks, { QUOTATION_PICKS, periodOf } from '../../components/EcPeriodPicks'
import { dateText } from '../../utils/dateText'
import { dateNo } from '../../utils/dateNo'
import type { BankCheck, CheckType } from '../../types/api'

const won = (n: number) => Math.round(n).toLocaleString('ko-KR')

/** 원본 번호 칸(form-checkbox-numbered) — 번호가 곧 체크 칸이다. 고르면 파랑(2026-10-14 수령수표조회 실측 '1'). */
function NumCheck({ no, on, onChange, label, head = false, disabled = false }: {
  no: number | ''; on: boolean; onChange: (v: boolean) => void; label: string; head?: boolean; disabled?: boolean
}) {
  return (
    <label className={`relative ${disabled ? 'cursor-default' : 'cursor-pointer'} ${head ? 'block mx-auto w-[18px] h-[18px]' : 'inline-block align-middle'}`}>
      <input type="checkbox" aria-label={label} checked={on} disabled={disabled} onChange={(e) => onChange(e.target.checked)}
             className="absolute inset-0 m-0 opacity-0 cursor-pointer disabled:cursor-default" />
      <span className={`inline-block w-[18px] h-[17px] leading-[17px] text-center rounded-[6px] ${
        on ? 'bg-ec-blue text-ec-panel' : disabled ? 'bg-ec-panel text-ec-hint' : 'bg-ec-panel text-ec-icon hover:bg-ec-row-hover'}`}>{no}</span>
    </label>
  )
}

/** 수표 한 장이 남기는 움직임 — 받은(발행한) 날 증가, 손을 떠난 날(입금 · 부도 · 결제완료) 감소. */
interface Move { key: string; date: string; inc: boolean; c: BankCheck }

/**
 * 회계 II &gt; 수표관리 &gt; 수령수표 &gt; <b>수령수표조회</b>(E060603) · 발행수표 &gt; <b>발행수표조회</b>(E060607) — 2026-10-03 loginaa 실측.
 *
 * <p>조건: 기준일자(구간, 기본 <b>최근30일(+1개월)</b> — 2026/09/03 ~ 2026/11/02) · 수표번호 · 증감구분(전체 · 증가 · 감소 체크, 다 켜짐) ·
 * 거래유형 · 입력구분(전체 · 연결전표 · 직접입력, 다 켜짐) · 거래처 · 부서 · 프로젝트 · 수령(발행)수표계좌 · 적요 · 최초작성자 · 최종수정자.
 * 열: 일자 · 수표번호 · 증감구분 · 거래처명 · 금액 · 적요 · 거래유형 · 회계전표일자-No. (발행수표조회는 적요 뒤에 [인쇄] 열이 하나 더 있다.)
 * 버튼줄: 신규(F2) · (발행수표인쇄) · 선택삭제 · Excel.
 *
 * <p>한 줄은 수표가 아니라 <b>움직임</b>이다 — 받은 날 '수령수표증가', 입금 · 부도한 날 '수령수표감소'(발행은 발행 · 결제완료).
 * [입력구분] 연결전표 = 수표관리에서 받아 분개가 생긴 수표, 직접입력 = [신규(F2)] 수표내역입력으로 분개 없이 넣은 수표.
 * [선택삭제]는 고른 <b>움직임</b>을 지운다 — 확인 창 '선택한 전표를 삭제 하겠습니까?'(알림 · 확인/취소, 2026-10-13 실측).
 * 감소 줄이면 입금 · 부도 · 결제를 취소해 수표가 보유로 돌아오고(입금 분개 · 계좌 입금도 되돌림), 증가 줄이면 수표를 지운다.
 * 원본은 감소 줄이 남은 수표의 증가 줄도 막지 않는다(감소만 홀로 남음) — 우리 수표는 한 장이라 그 감소를 먼저 취소하고 지운다.
 * 원본 판(2026-10-13 QA회계2 수표 1장 증가 · 감소): 증감구분 '증가' · '감소', 최근 줄이 위, 합계줄 없음.
 * 원본 [수령수표내역입력](신규)에서 직접 넣은 줄의 거래유형은 '수표만증가' · '수표만감소', [일자] 칸은 '2026/10/13 -1' 처럼 일자-No. 다
 * (수표 전표 자체 번호 — (수표 종류, 날짜) 마다 1 부터, 증가 · 감소 전표가 같은 줄을 쓰고 지운 번호는 다시 안 준다. 한 전표의 여러 줄은 같은 번호).
 * 우리 수표는 받는 순간 분개가 생기는 연결전표라 거래유형은 수령 · 입금완료 · 부도(발행 · 결제완료)로 둔다.
 * [최종수정자] = 마지막으로 입금 · 부도 · 결제나 그 취소를 한 사람. [인쇄] 열 · [발행수표인쇄]는 수표 용지 인쇄 이력인데 우리는 수표를 인쇄하지 않는다.
 * [신규(F2)]는 원본처럼 수령(발행)수표내역입력 창을 연다(features/bankcheck/components/CheckDirectEntryModal).
 * 직접입력 줄의 [일자] '2026/10/13 -10' 은 링크 — 그 수표내역입력 전표를 열어 고치거나 [삭제] 한다(2026-10-13 실측).
 */
export default function CheckListPage({ type }: { type: CheckType }) {
  const received = type === 'RECEIVED'
  const title = received ? '수령수표조회' : '발행수표조회'
  const acctLabel = received ? '수령수표계좌' : '발행수표계좌'
  const incName = received ? '수령수표증가' : '발행수표증가'
  const decName = received ? '수령수표감소' : '발행수표감소'
  const init = periodOf('최근30일(+1개월)')!
  const [from, setFrom] = useState(init.from)
  const [to, setTo] = useState(init.to)
  const [checkNo, setCheckNo] = useState('')
  const [showInc, setShowInc] = useState(true)
  const [showDec, setShowDec] = useState(true)
  const [kind, setKind] = useState('')
  const [direct, setDirect] = useState(true)
  const [linked, setLinked] = useState(true)
  const [partner, setPartner] = useState('')
  const [bankAccount, setBankAccount] = useState('')
  const [remark, setRemark] = useState('')
  const [author, setAuthor] = useState('')
  const [editor, setEditor] = useState('')
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [entryOpen, setEntryOpen] = useState(false)
  const [voucher, setVoucher] = useState<CheckVoucher | null>(null)
  const [checks, setChecks] = useState<BankCheck[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  /* 감소는 닫힌 날로 걸어야 해 기간 끝날까지 받은(발행한) 수표를 다 받아 화면에서 날짜로 다시 거른다. */
  async function load() {
    setLoading(true)
    setError('')
    try {
      const r = await api.get<BankCheck[]>('/checks', { params: { to } })
      setChecks(r.data)
      setPicked(new Set())
    } catch (e) {
      setError(extractErrorMessage(e))
    } finally {
      setLoading(false)
    }
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void load() }, [from, to, type])

  const ofType = useMemo(() => checks.filter((c) => c.type === type), [checks, type])
  /* 수령수표입금처리 [입금보고서작성] 으로 줄인 감소 줄은 거래유형 '입금보고서'(2026-10-13 실측) — 체크칸이 막히고 입금보고서를 지우면 사라진다. */
  const byVoucher = (m: Move) => !m.inc && !!m.c.settledByVoucher
  const kindOf = (m: Move) => (byVoucher(m) ? '입금보고서' : m.c.directEntry ? (m.inc ? '수표만증가' : '수표만감소') : m.inc ? (received ? '수령' : '발행') : m.c.statusName)
  /* 수표내역입력 전표 번호(원본 [일자] '2026/10/13 -5' 의 5) — 분개로 움직인 줄은 없다. */
  const entryNo = (m: Move) => (m.inc ? m.c.directInNo : m.c.directOutNo) ?? null
  const moves = useMemo(() => {
    const out: Move[] = []
    for (const c of ofType) {
      out.push({ key: `${c.id}-i`, date: c.issueDate, inc: true, c })
      if (c.settledDate) out.push({ key: `${c.id}-d`, date: c.settledDate, inc: false, c })
    }
    return out
      .filter((m) => m.date >= from && m.date <= to)
      .filter((m) => (m.inc ? showInc : showDec))
      .filter((m) => (m.c.directEntry ? direct : linked))
      .filter((m) => !checkNo || m.c.checkNo.includes(checkNo))
      .filter((m) => !kind || kindOf(m) === kind)
      .filter((m) => !partner || String(m.c.partnerId) === partner)
      .filter((m) => !bankAccount || (m.c.bankAccountName ?? '') === bankAccount)
      .filter((m) => !remark || (m.c.remark ?? '').includes(remark))
      .filter((m) => !author || (m.c.createdBy ?? '') === author)
      .filter((m) => !editor || (m.c.updatedBy ?? '') === editor)
      // 원본은 최근 줄이 위 — 같은 날이면 전표 번호가 큰(나중) 것, 번호가 없으면 나중에 생긴 움직임(감소)이 위.
      .sort((a, b) => (a.date > b.date ? -1 : a.date < b.date ? 1
        : (entryNo(b) ?? 0) - (entryNo(a) ?? 0) || (a.inc === b.inc ? b.c.id - a.c.id : a.inc ? 1 : -1)))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ofType, from, to, showInc, showDec, direct, linked, checkNo, kind, partner, bankAccount, remark, author, editor])
  const partners = useMemo(() => {
    const m = new Map<number, string>()
    ofType.forEach((c) => { if (c.partnerId != null) m.set(c.partnerId, c.partnerName ?? '') })
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1])).map(([id, name]) => ({ value: String(id), name }))
  }, [ofType])
  const accounts = useMemo(() => [...new Set(ofType.map((c) => c.bankAccountName).filter(Boolean) as string[])].sort(), [ofType])
  const authors = useMemo(() => [...new Set(ofType.map((c) => c.createdBy).filter(Boolean) as string[])].sort(), [ofType])
  const editors = useMemo(() => [...new Set(ofType.map((c) => c.updatedBy).filter(Boolean) as string[])].sort(), [ofType])
  /* [일자-No.] 링크 — 같은 (날짜, 번호, 증감) 의 수표들이 한 전표다. */
  function openVoucher(m: Move) {
    const no = entryNo(m)
    if (no == null) return
    const checks = ofType.filter((c) => (m.inc ? c.issueDate === m.date && c.directInNo === no : c.settledDate === m.date && c.directOutNo === no))
      .sort((a, b) => a.id - b.id)
    setVoucher({ date: m.date, increase: m.inc, entryNo: no, checks })
    setEntryOpen(true)
  }
  const allPicked = moves.some((m) => !byVoucher(m)) && moves.filter((m) => !byVoucher(m)).every((m) => picked.has(m.key))

  async function removePicked() {
    setConfirmDelete(false)
    const chosen = moves.filter((m) => picked.has(m.key))
    try {
      await api.post('/checks/delete', {
        decreaseIds: chosen.filter((m) => !m.inc).map((m) => m.c.id),
        increaseIds: chosen.filter((m) => m.inc).map((m) => m.c.id),
      })
      await load()
    } catch (e) {
      setError(extractErrorMessage(e))
    }
  }
  const kinds = received ? ['수령', '입금완료', '부도', '수표만증가', '수표만감소', '입금보고서'] : ['발행', '결제완료', '수표만증가', '수표만감소']
  const resetConds = () => { setFrom(init.from); setTo(init.to); setCheckNo(''); setShowInc(true); setShowDec(true); setKind(''); setDirect(true); setLinked(true); setPartner(''); setBankAccount(''); setRemark(''); setAuthor(''); setEditor('') }
  const tableRef = useRef<HTMLTableElement>(null)
  useTableColumnCheck(tableRef, title, [moves.length])

  const box = (label: string, checked: boolean, set: (v: boolean) => void) => (
    <label className="inline-flex items-center gap-[3px] mr-[10px] text-[12.5px]">
      <input type="checkbox" checked={checked} onChange={(e) => set(e.target.checked)} /> {label}
    </label>
  )

  return (
    <EcListShell
      title={title}
      onSearch={() => void load()}
      onReset={resetConds}
      actions={[
        { label: '신규(F2)', onClick: () => { setVoucher(null); setEntryOpen(true) } },
        { label: '선택삭제', disabled: picked.size === 0, onClick: () => setConfirmDelete(true) },
        { label: 'Excel' },
      ]}
    >
      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
      <ul className="ec-cond" style={{ marginBottom: 8 }}>
        <EcCond label="기준일자">
          <input type="date" className="ec-input" value={from} onChange={(e) => setFrom(e.target.value)} style={{ width: 145 }} />
          <span className="my-0 mx-[4px]">~</span>
          <input type="date" className="ec-input" value={to} onChange={(e) => setTo(e.target.value)} style={{ width: 145 }} />
          <span className="ml-[6px]">
            <EcPeriodPicks labels={QUOTATION_PICKS} currentFrom={from} onPick={(r) => { setFrom(r.from); setTo(r.to) }} />
          </span>
        </EcCond>
        <EcCond label="수표번호">
          <input className="ec-input" value={checkNo} onChange={(e) => setCheckNo(e.target.value)} style={{ width: 180 }} />
        </EcCond>
        <EcCond label="증감구분">
          {box('전체', showInc && showDec, (v) => { setShowInc(v); setShowDec(v) })}
          {box(incName, showInc, setShowInc)}
          {box(decName, showDec, setShowDec)}
        </EcCond>
        <EcCond label="거래유형">
          <select className="ec-input" value={kind} onChange={(e) => setKind(e.target.value)} style={{ width: 120 }}>
            <option value="">전체</option>
            {kinds.map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
        </EcCond>
        {/* 원본 [입력구분] — 연결전표 = 받을 때 분개가 생기는 수표(수표관리) · 직접입력 = [신규] 수표내역입력(분개 없음). */}
        <EcCond label="입력구분">
          {box('전체', direct && linked, (v) => { setDirect(v); setLinked(v) })}
          {box('연결전표', linked, setLinked)}
          {box('직접입력', direct, setDirect)}
        </EcCond>
        <EcCond label="거래처" pick>
          <CodePickerField label="거래처" hideLabel width={220} emptyLabel="전체" value={partner} onChange={setPartner} items={partners} />
        </EcCond>
        <EcCond label={received ? '수령수표계좌' : '발행수표계좌'} pick>
          <CodePickerField label={acctLabel} hideLabel width={200} emptyLabel="전체" value={bankAccount} onChange={setBankAccount}
                           items={accounts.map((a) => ({ value: a, name: a }))} />
        </EcCond>
        <EcCond label="적요">
          <input className="ec-input" value={remark} onChange={(e) => setRemark(e.target.value)} style={{ width: 220 }} />
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

      <table ref={tableRef} className="w-full text-left">
        <thead>
          <tr>
            <th className="w-[42px]">
              <NumCheck no="" head on={allPicked} label="전체 선택"
                        onChange={(v) => setPicked(v ? new Set(moves.filter((m) => !byVoucher(m)).map((m) => m.key)) : new Set())} />
            </th>
            <th>일자</th>
            <th>수표번호</th>
            <th>증감구분</th>
            <th>거래처명</th>
            <th className="text-right">금액</th>
            <th>적요</th>
            <th>거래유형</th>
            <th>회계전표일자-No.</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={9} className="ec-empty">불러오는 중…</td></tr>
          ) : moves.length === 0 ? (
            <tr><td colSpan={9} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
          ) : moves.map((m, i) => {
            const no = (m.inc ? m.c.issueJournalNo : m.c.settleJournalNo) ?? ''
            return (
              <tr key={m.key}>
                <td className="text-center">
                  <NumCheck no={i + 1} label={`${m.c.checkNo} ${m.inc ? incName : decName} 선택`} on={picked.has(m.key)} disabled={byVoucher(m)}
                            onChange={(v) => setPicked((s) => { const n = new Set(s); if (v) n.add(m.key); else n.delete(m.key); return n })} />
                </td>
                <td>
                  {entryNo(m) != null && !byVoucher(m)
                    ? <a href="#" onClick={(e) => { e.preventDefault(); openVoucher(m) }}>{dateText(m.date)} -{entryNo(m)}</a>
                    : entryNo(m) != null ? `${dateText(m.date)} -${entryNo(m)}` : dateText(m.date)}
                </td>
                <td>{m.c.checkNo}</td>
                <td>{m.inc ? '증가' : '감소'}</td>
                <td>{m.c.partnerName ?? ''}</td>
                <td className="text-right">{won(Number(m.c.amount))}</td>
                <td>{m.c.remark ?? ''}</td>
                <td>{kindOf(m)}</td>
                {/* 원본 '2026/10/13 -12' — 우리 GL 번호의 끝 일련번호만 */}
                <td>{no ? dateNo(m.date, no) : ''}</td>
              </tr>
            )
          })}
        </tbody>
      </table>

      <CheckDirectEntryModal type={type} open={entryOpen} voucher={voucher} onClose={() => { setEntryOpen(false); setVoucher(null) }} onSaved={() => void load()} />
      <Modal open={confirmDelete} title="알림" width={420} error={error} onClose={() => setConfirmDelete(false)}>
        <p className="mb-[12px]">선택한 전표를 삭제 하겠습니까?</p>
        <div className="flex gap-[5px]">
          <button type="button" className="ec-btn ec-btn-primary" onClick={() => void removePicked()}>확인</button>
          <button type="button" className="ec-btn" onClick={() => setConfirmDelete(false)}>취소</button>
        </div>
      </Modal>
    </EcListShell>
  )
}
