import { useEffect, useMemo, useState } from 'react'
import { api, extractErrorMessage } from '../../../api/client'
import Modal from '../../../components/Modal'
import EcDateField from '../../../components/EcDateField'
import EcNumInput from '../../../components/EcNumInput'
import { EcCond } from '../../../components/EcStatusPanel'
import GridCode from '../../../components/GridCode'
import type { CodeItem } from '../../../components/CodePickerField'
import { ymd } from '../../../components/EcPeriodPicks'
import type { BankAccountRow } from '../../../types/api'
import type { BondMasters } from '../api'
import { won, type BondSide } from '../types'

/** 채권감소등록에서 고른 채권 한 줄 — 감소금액 · 채권번호 · 증가 줄의 적요를 들고 온다. */
export interface DepositPick {
  accountId: number
  partnerId: number | null
  bondNo: string
  amount: number
  departmentId: number | null
  projectId: number | null
  /** 증가 줄의 적요 — [적요] 증가적요동일. */
  memo: string | null
}

type Collect = 'CASH' | 'NOTE' | 'CHECK' | 'OTHER'
type MemoMode = 'SAME' | 'BONDNO' | 'DIRECT'
type Group = 'LINE' | 'PARTNER'
/** 수금(지급)형태 '수표' 의 [생성방식] — 원본 기본은 자동생성(2026-10-14 실측). */
type Produce = 'DIRECT' | 'START' | 'AUTO'

interface Line { accountId: number; partnerId: number | null; bondNo: string; amount: string; memo: string
  departmentId: number | null; projectId: number | null; checkNo?: string; noteNo?: string; noteDue?: string }

/**
 * 원본 수표번호입력 [자동생성] 번호 — '26101403162966200001' = 연월일시분초(261014 031629) + 천분의 1초(662) + 줄 차례 5자리(00001).
 * 2026-10-14 loginaa 두 번 잼(03:16:29 · 03:22:59).
 */
function autoCheckNos(n: number) {
  const d = new Date()
  const p = (v: number, w = 2) => String(v).padStart(w, '0')
  const head = `${p(d.getFullYear() % 100)}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}${p(d.getMilliseconds(), 3)}`
  return Array.from({ length: n }, (_, i) => `${head}${p(i + 1, 5)}`)
}

/** 원본 계좌검색의 [계좌명] — 등록한 이름이 없으면 '은행-끝 4자리'(기업은행-1122). */
function bankLabel(b: BankAccountRow) {
  if (b.name) return b.name
  const digits = (b.accountNo ?? '').replace(/\D/g, '')
  return digits.length >= 4 ? `${b.bankName}-${digits.slice(-4)}` : b.bankName
}

/**
 * 회계 II › 채권관리 › 채권감소등록(E060402) [입금보고서작성] — 2026-10-13 loginaa 실측.
 *
 * <p>1) <b>입금보고서작성</b> 창: 수금형태(현금/예금 · 어음 · 수표 · 기타계정) + [입금계좌] 코드도움, 적요(증가적요동일 · 채권번호 · 직접입력),
 * 전표 묶음기준(라인별 · 거래처별/계정별). [입금계좌]를 비우고 [적용(F8)] 하면 그 칸이 빨갛게 된다.
 * <br>2) [적용] → <b>입금보고서</b> 창이 채워진 채 열린다: 돈 들어온 계좌 · 계정코드(대변) 1089 외상매출금 · 거래처 · 금액 · 적요명.
 * [저장(F8)] 하면 회계전표(차 입금계좌 / 대 외상매출금)와 채권 감소(출처업무 입금보고서)가 함께 생긴다.
 * 원본 QA2B001 50,000 → 20,000 입금 → 잔액 30,000, 회계일자-No. 2026/10/13 -18.
 *
 * <p><b>채무감소등록(E060502) [지출결의서작성]</b>이 거울이다(2026-10-13 실측): 창 이름 지출결의서작성 · 지급형태 · [출금계좌] ·
 * 적요(증가적요동일 · 채무번호 · 직접입력) · 전표 묶음기준 → [적용(F8)] → <b>지출결의서</b> 창(돈 나간 계좌 검색 · 돈 나간 계좌명 ·
 * 계정코드(차변) 2519 외상매입금 · 거래처 · 금액 · 적요명) → [저장(F8)] 하면 회계전표(차 외상매입금 / 대 출금계좌)와
 * 채무 감소(출처업무 지출결의서 · 회계일자-No. 2026/10/13 -21)가 함께 생긴다. QA2P001 50,000 → 20,000 지급 → 잔액 30,000.
 *
 * <p><b>수금(지급)형태 '수표'</b>(2026-10-14 실측): 고르면 [생성방식] 직접입력 · 시작번호입력 · 자동생성(기본)이 생긴다. [적용(F8)] →
 * <b>수표번호입력</b> 창(거래처 · 계정 · 부서 · 프로젝트 · 금액 · 수표번호, [번호생성] · 적용(F8) · 취소 — 취소하면 두 창이 다 닫힌다,
 * 직접입력은 번호가 빈 채라 [적용] 이 넘어가지 않는다) → 입금보고서(돈 들어온 계좌 = 입금계좌 = 수표계좌 · 추가정보 '채권 …, 수령수표 …')
 * → [저장] 하면 회계전표 · 채권 감소와 함께 수령수표가 줄마다 하나 는다(수령수표조회 거래유형 '입금보고서'). 채무 쪽은 지출결의서 · 발행수표.
 * [시작번호입력] 의 [번호생성] 은 원본에서 못 쟀다 — 우리는 첫 줄 번호부터 1씩 늘려 채운다.
 *
 * <p><b>어음</b>(2026-10-21 실측): 입금계좌 자리가 [계정코드](1109 받을어음) · 생성방식(직접입력이 처음) → 어음번호입력 창(+ 만기일자) → 입금보고서 돈 들어온 계좌 = 그 계정 · 추가정보 '채권 …, 받을어음 …' → 저장하면 줄마다 받을어음 증가(거래유형 입금보고서). 기타계정은 아직 막는다.
 */
export default function DepositReportModal({ side = 'RECEIVABLE', picks, masters, onClose, onSaved }: {
  side?: BondSide
  picks: DepositPick[] | null
  masters: BondMasters
  onClose: () => void
  onSaved: () => void
}) {
  const ar = side === 'RECEIVABLE'
  /** 채권은 입금보고서, 채무는 지출결의서 — 원본 글자 그대로. */
  const t = ar
    ? { doc: '입금보고서', form: '수금형태', settle: '입금계좌', money: '돈 들어온 계좌', acc: '계정코드(대변)', no: '채권번호', kind: '수금' }
    : { doc: '지출결의서', form: '지급형태', settle: '출금계좌', money: '돈 나간 계좌', acc: '계정코드(차변)', no: '채무번호', kind: '지급' }
  const [banks, setBanks] = useState<BankAccountRow[]>([])
  const [collect, setCollect] = useState<Collect>('CASH')
  const [settle, setSettle] = useState('')
  const [memoMode, setMemoMode] = useState<MemoMode>('SAME')
  const [group, setGroup] = useState<Group>('LINE')
  const [settleErr, setSettleErr] = useState(false)
  const [note, setNote] = useState('')
  const [produce, setProduce] = useState<Produce>('AUTO')
  /** 수금(지급)형태 '어음' 의 [계정코드](받을어음 · 지급어음 계정 id) — 원본은 입금계좌 자리에 계정 코드도움(1109 → 받을어음). */
  const [noteAcc, setNoteAcc] = useState('')
  /** 어음번호입력 창의 만기일자 — 줄마다(처음은 오늘). */
  const [dues, setDues] = useState<string[]>([])
  /** 수표번호입력 창 — 줄마다 수표번호. null 이면 닫힘. */
  const [pending, setPending] = useState<Line[] | null>(null)
  const [checkNos, setCheckNos] = useState<string[] | null>(null)
  const [checkErr, setCheckErr] = useState<Set<number>>(new Set())
  /** 2단계 — 입금보고서 창 */
  const [lines, setLines] = useState<Line[] | null>(null)
  const [date, setDate] = useState(ymd(new Date()))
  const [memo, setMemo] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!picks) return
    setCollect('CASH'); setSettle(''); setMemoMode('SAME'); setGroup('LINE'); setSettleErr(false); setNote('')
    setLines(null); setDate(ymd(new Date())); setMemo(''); setError('')
    setProduce('AUTO'); setPending(null); setCheckNos(null); setCheckErr(new Set()); setNoteAcc(''); setDues([])
    api.get<BankAccountRow[]>('/bank-cards/accounts').then((r) => setBanks(r.data)).catch((e) => setError(extractErrorMessage(e)))
  }, [picks])

  const settleItems: CodeItem[] = useMemo(() => [
    ...banks.filter((b) => b.active).map((b) => ({ value: `b${b.id}`, code: b.code ?? b.accountNo, name: bankLabel(b) })),
    { value: '000', code: '000', name: '현금' },
  ], [banks])
  const settleName = settleItems.find((x) => x.value === settle)?.name ?? ''
  const settleCode = settleItems.find((x) => x.value === settle)?.code ?? ''
  const accName = (id: number) => masters.accounts.find((a) => a.value === String(id))
  const ptn = (id: number | null) => (id == null ? undefined : masters.partners.find((p) => p.value === String(id)))

  function apply() {
    if (!picks) return
    if (collect === 'OTHER') {
      setNote(`기타계정 ${t.kind}은 아직 지원하지 않습니다. 현금/예금 · 어음 · 수표로 골라 주세요.`)
      return
    }
    /* 어음은 입금계좌 대신 [계정코드](받을어음) — 비우면 그 칸이 빨갛다. 수표는 돈 들어온(나간) 계좌가 수표계좌다 — 현금(000)으로는 수표를 둘 데가 없다. */
    if (collect === 'NOTE' ? !noteAcc : !settle || (collect === 'CHECK' && settle === '000')) { setSettleErr(true); return }
    const memoOf = (p: DepositPick) => (memoMode === 'SAME' ? p.memo ?? '' : memoMode === 'BONDNO' ? p.bondNo : '')
    let ls: Line[] = picks.map((p) => ({ accountId: p.accountId, partnerId: p.partnerId, bondNo: p.bondNo,
      amount: String(p.amount), memo: memoOf(p), departmentId: p.departmentId, projectId: p.projectId }))
    /* 거래처별/계정별: 같은 계정 · 거래처 줄을 금액 합으로 한 줄(원본 2026-10-21: QA1B1 10,000 · QA1B2 20,000 → 30,000 '채권 QA1B1 외').
       채권 감소는 채권번호마다 따로라 줄(lines)은 그대로 두고, 입금보고서 표 · 분개만 묶는다(shown · 서버 groupByPartner). */
    if (group === 'PARTNER') ls = [...ls].sort((a, b) => `${a.accountId}/${a.partnerId}`.localeCompare(`${b.accountId}/${b.partnerId}`))
    if (collect === 'CHECK' || collect === 'NOTE') {
      setPending(ls)
      setCheckNos(produce === 'AUTO' ? autoCheckNos(ls.length) : ls.map(() => ''))
      setDues(ls.map(() => date))
      setCheckErr(new Set())
      return
    }
    setLines(ls)
  }

  /** 수표번호입력 [번호생성] — 빈 칸을 자동생성 번호로. 시작번호입력이면 첫 줄 번호부터 1씩. */
  function generate() {
    if (!checkNos) return
    const first = checkNos[0]?.trim() ?? ''
    if (produce === 'START' && /^\d+$/.test(first)) {
      setCheckNos(checkNos.map((_, i) => (BigInt(first) + BigInt(i)).toString().padStart(first.length, '0')))
    } else {
      const auto = autoCheckNos(checkNos.length)
      setCheckNos(checkNos.map((v, i) => (v.trim() ? v : auto[i])))
    }
    setCheckErr(new Set())
  }

  function applyCheckNos() {
    if (!pending || !checkNos) return
    const bad = new Set(checkNos.map((v, i) => (v.trim() ? -1 : i)).filter((i) => i >= 0))
    if (bad.size > 0) { setCheckErr(bad); return }
    setLines(pending.map((l, i) => (collect === 'NOTE'
      ? { ...l, noteNo: checkNos[i].trim(), noteDue: dues[i] || date }
      : { ...l, checkNo: checkNos[i].trim() })))
  }

  async function save() {
    if (!lines) return
    setError('')
    const bad = lines.findIndex((l) => !(Number(l.amount) > 0))
    if (bad >= 0) { setError('금액을 입력 바랍니다.'); return }
    setSaving(true)
    try {
      await api.post('/bonds/deposit-report', {
        date,
        bankAccountId: collect !== 'NOTE' && settle.startsWith('b') ? Number(settle.slice(1)) : undefined,
        cash: (collect !== 'NOTE' && settle === '000') || undefined,
        noteAccountId: collect === 'NOTE' ? Number(noteAcc) : undefined,
        description: memo.trim() || undefined,
        lines: lines.map((l) => ({ accountId: l.accountId, partnerId: l.partnerId, bondNo: l.bondNo, amount: Number(l.amount),
          departmentId: l.departmentId, projectId: l.projectId, memo: l.memo.trim() || undefined, checkNo: l.checkNo || undefined,
          noteNo: l.noteNo || undefined, noteDue: l.noteDue || undefined })),
        groupByPartner: group === 'PARTNER' || undefined,
      }, { params: { side } })
      onSaved()
      onClose()
    } catch (e) {
      setError(extractErrorMessage(e))
    } finally {
      setSaving(false)
    }
  }

  const radio = <T extends string>(name: string, cur: T, set: (v: T) => void, opts: [T, string][]) => (
    <span className="inline-flex items-center gap-[10px]">
      {opts.map(([v, label]) => (
        <label key={v} className="inline-flex items-center gap-[4px]">
          <input type="radio" name={name} checked={cur === v} onChange={() => set(v)} />{label}
        </label>
      ))}
    </span>
  )

  const total = (lines ?? []).reduce((s, l) => s + (Number(l.amount) || 0), 0)
  /** 입금보고서 표의 줄 — 거래처별/계정별이면 계정 · 거래처로 묶은 줄(금액 합 · 첫 적요 · '채권 첫번호 외'). i 는 lines 의 첫 줄 자리. */
  const shown = useMemo(() => {
    const ls = (lines ?? []).map((l, i) => ({ l, i, count: 1, amount: Number(l.amount) || 0 }))
    if (group !== 'PARTNER') return ls
    const m = new Map<string, (typeof ls)[number]>()
    for (const x of ls) {
      const k = `${x.l.accountId}/${x.l.partnerId}`
      const g = m.get(k)
      if (g) { g.count += 1; g.amount += x.amount } else m.set(k, { ...x })
    }
    return [...m.values()]
  }, [lines, group])

  return (
    <>
      <Modal open={picks != null && lines == null && checkNos == null} title={`${t.doc}작성`} width={780} error={error} onClose={onClose}>
        <ul className="ec-form mb-[8px]">
          <EcCond label={t.form} span={2}>
            <span className="flex flex-col gap-[6px] w-full">
              {radio('collect', collect, (v) => { setCollect(v); setNote(''); setSettleErr(false); setProduce(v === 'NOTE' ? 'DIRECT' : 'AUTO') },
                [['CASH', '현금/예금'], ['NOTE', '어음'], ['CHECK', '수표'], ['OTHER', '기타계정']])}
              <span className={`flex w-full items-center gap-[6px]${settleErr ? ' outline outline-1 outline-ec-danger rounded-ec' : ''}`}>
                {collect === 'NOTE' ? (
                  <>
                    <span className="text-ec-label whitespace-nowrap">계정코드</span>
                    <span className="w-[160px]">
                      <GridCode title="계정검색" codeHead="계정코드" nameHead="계정명" items={masters.accounts}
                                value={noteAcc} onPick={(v) => { setNoteAcc(v); setSettleErr(false) }} />
                    </span>
                    <span className="flex-1">{masters.accounts.find((a) => a.value === noteAcc)?.name ?? ''}</span>
                  </>
                ) : (
                  <>
                    <span className="text-ec-label whitespace-nowrap">{t.settle}</span>
                    <span className="w-[160px]">
                      <GridCode title="계좌검색" codeHead={t.settle} nameHead="계좌명" items={settleItems}
                                value={settle} onPick={(v) => { setSettle(v); setSettleErr(false) }} />
                    </span>
                    <span className="flex-1">{settleName}</span>
                  </>
                )}
              </span>
              {(collect === 'CHECK' || collect === 'NOTE') && (
                <span className="flex items-center gap-[6px]">
                  <span className="text-ec-label whitespace-nowrap">생성방식</span>
                  {radio('produce', produce, setProduce, [['DIRECT', '직접입력'], ['START', '시작번호입력'], ['AUTO', '자동생성']])}
                </span>
              )}
            </span>
          </EcCond>
          <EcCond label="적요" span={2}>
            {radio('memoMode', memoMode, setMemoMode, [['SAME', '증가적요동일'], ['BONDNO', t.no], ['DIRECT', '직접입력']])}
          </EcCond>
          <EcCond label="전표 묶음기준" span={2}>
            {radio('group', group, setGroup, [['LINE', '라인별'], ['PARTNER', '거래처별/계정별']])}
          </EcCond>
        </ul>
        {note && <p className="ec-alert ec-alert-danger mb-[8px]">{note}</p>}
        <div className="flex gap-[5px] mt-[14px]">
          <button type="button" className="ec-btn ec-btn-primary" onClick={apply}>적용(F8)</button>
          <button type="button" className="ec-btn" onClick={onClose}>닫기</button>
        </div>
      </Modal>

      <Modal open={picks != null && checkNos != null && lines == null} title={collect === 'NOTE' ? '어음번호입력' : '수표번호입력'} width={780} error={error} onClose={onClose}>
        <div className="flex gap-[5px] mb-[6px]">
          <button type="button" className="ec-btn ec-btn-sm" onClick={generate}>번호생성</button>
        </div>
        <table className="ec-grid-input no-ec table-fixed">
          <thead>
            <tr>
              <th className="w-[32px]" />
              <th>거래처</th>
              <th>계정</th>
              <th>부서</th>
              <th>프로젝트</th>
              <th>금액</th>
              <th className="w-[200px]">{collect === 'NOTE' ? '어음번호' : '수표번호'}</th>
              {collect === 'NOTE' && <th className="w-[150px]">만기일자</th>}
            </tr>
          </thead>
          <tbody>
            {(pending ?? []).map((l, i) => (
              <tr key={i}>
                <td className="text-center text-ec-hint">{i + 1}</td>
                <td>{ptn(l.partnerId)?.name ?? ''}</td>
                <td>{accName(l.accountId)?.name ?? ''}</td>
                <td>{l.departmentId != null ? masters.departments?.find((d) => d.value === String(l.departmentId))?.name ?? '' : ''}</td>
                <td>{l.projectId != null ? masters.projects?.find((p) => p.value === String(l.projectId))?.name ?? '' : ''}</td>
                <td className="text-right">{won(Number(l.amount))}</td>
                <td>
                  <input className={`ec-input w-full${checkErr.has(i) ? ' outline outline-1 outline-ec-danger' : ''}`} aria-label={`${i + 1}줄 ${collect === 'NOTE' ? '어음번호' : '수표번호'}`}
                         maxLength={30} value={checkNos?.[i] ?? ''}
                         onChange={(e) => { const v = e.target.value; setCheckNos((ns) => ns!.map((x, j) => (j === i ? v : x))); setCheckErr(new Set()) }} />
                </td>
                {collect === 'NOTE' && (
                  <td><input type="date" className="ec-input w-full" aria-label={`${i + 1}줄 만기일자`} value={dues[i] ?? ''}
                             onChange={(e) => { const v = e.target.value; setDues((ds) => ds.map((x, j) => (j === i ? v : x))) }} /></td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        <div className="flex gap-[5px] mt-[14px]">
          <button type="button" className="ec-btn ec-btn-primary" onClick={applyCheckNos}>적용(F8)</button>
          <button type="button" className="ec-btn" onClick={onClose}>취소</button>
        </div>
      </Modal>

      <Modal open={picks != null && lines != null} title={t.doc} width={1100} error={error} onClose={onClose}>
        <ul className="ec-form mb-[8px]">
          <EcCond label="일자" span={2}>
            <EcDateField value={date} onChange={setDate} />
          </EcCond>
          <EcCond label="첨언내용" span={2}>
            <textarea className="ec-input w-full h-[37px] resize-y" placeholder="첨언내용" maxLength={200}
                      value={memo} onChange={(e) => setMemo(e.target.value)} />
          </EcCond>
        </ul>
        <div className="overflow-x-auto">
          <table className="ec-grid-input no-ec table-fixed min-w-[1000px]">
            <thead>
              <tr>
                <th className="w-[32px]" />
                <th>{t.money} 검색</th>
                <th>{t.money}명</th>
                <th>{t.acc}</th>
                <th>계정코드명</th>
                <th>거래처 검색</th>
                <th>거래처명</th>
                <th>금액</th>
                <th>적요명</th>
                <th className="w-[260px]">추가정보</th>
              </tr>
            </thead>
            <tbody>
              {shown.map(({ l, i, count, amount }, n) => (
                <tr key={i}>
                  <td className="text-center text-ec-hint">{n + 1}</td>
                  <td>{collect === 'NOTE' ? masters.accounts.find((a) => a.value === noteAcc)?.code ?? '' : settleCode}</td>
                  <td>{collect === 'NOTE' ? masters.accounts.find((a) => a.value === noteAcc)?.name ?? '' : settleName}</td>
                  <td>{accName(l.accountId)?.code ?? ''}</td>
                  <td>{accName(l.accountId)?.name ?? ''}</td>
                  <td>{ptn(l.partnerId)?.code ?? ''}</td>
                  <td>{ptn(l.partnerId)?.name ?? ''}</td>
                  <td>
                    {count > 1
                      ? <span className="block text-right">{won(amount)}</span>
                      : <EcNumInput className="ec-input w-full text-right" aria-label={`${n + 1}줄 금액`} value={l.amount}
                                    onValue={(v) => setLines((ls) => ls!.map((x, j) => (j === i ? { ...x, amount: v } : x)))} />}
                  </td>
                  <td>
                    <input className="ec-input w-full" aria-label={`${n + 1}줄 적요명`} maxLength={200} value={l.memo}
                           onChange={(e) => setLines((ls) => ls!.map((x, j) => (j === i ? { ...x, memo: e.target.value } : x)))} />
                  </td>
                  {/* 원본 '채권 150505053650291, 수령수표 26101403162966200001' */}
                  <td className="text-ec-navy">{`${t.no.slice(0, 2)} ${l.bondNo}${count > 1 ? ' 외' : ''}`}{l.checkNo && count === 1 ? `, ${ar ? '수령수표' : '발행수표'} ${l.checkNo}` : ''}{l.noteNo && count === 1 ? `, ${ar ? '받을어음' : '지급어음'} ${l.noteNo}` : ''}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={7} />
                <td className="text-right">{won(total)}</td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          </table>
        </div>
        <div className="flex gap-[5px] mt-[14px]">
          <button type="button" className="ec-btn ec-btn-primary" disabled={saving} onClick={() => void save()}>저장(F8)</button>
          <button type="button" className="ec-btn" onClick={onClose}>닫기</button>
        </div>
      </Modal>
    </>
  )
}
