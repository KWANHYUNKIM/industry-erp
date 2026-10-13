import { useEffect, useMemo, useRef, useState } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import EcListShell from '../../components/EcListShell'
import Modal from '../../components/Modal'
import EcDateField from '../../components/EcDateField'
import EcNumInput from '../../components/EcNumInput'
import EcPeriodPicks from '../../components/EcPeriodPicks'
import CodePickerField, { type CodeItem } from '../../components/CodePickerField'
import { EcCond } from '../../components/EcStatusPanel'
import { EcReportHead, EcReportFoot, reportPeriod } from '../../components/EcReportFrame'
import { periodOf, ymd } from '../../utils/periods'
import { dateText } from '../../utils/dateText'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import { useDeptProjectItems } from '../../features/cashquick/useDeptProject'
import { BillLineConds, applyFilter, useBillLineFilter } from '../../features/billingcontract/BillLineConds'
import { VAT_TYPES, won, type BillLineView } from '../../features/billingcontract/types'

/* 원본 버튼줄 글자 그대로(2026-10-13 실측). */
const PICKS = ['금일', '전일', '금주(~오늘)', '전주', '금월(~오늘)', '전월', '종료일', '말일', '전월+금월'] as const
/* 부가세를 공급가액의 10% 로 셈하는 유형(매출전표 I 와 같다) — 영세율 · 계산서 · 수출 · 면세는 0. */
const TAXED = new Set(['세금계산서', '소매매출', '카드매출', '세.계(고정자산)'])

interface AccountOpt { id: number; code: string; name: string }

/** 거래처 한 곳의 묶음 — 원본 격자 한 줄. 조정 · 외화금액 · 환율 · 공급가액 · 부가세 · 매출계정 · 적요는 고칠 수 있다. */
interface Group {
  partnerId: number; partnerCode: string; partnerName: string; foreignCurrency: boolean
  lines: BillLineView[]; trade: number
  adjust: string; foreign: string; rate: string; supply: string; vat: string; accountId: string; memo: string
}

const num = (s: string) => Number(s) || 0
/** 원본 적요 — 줄이 둘 이상이면 첫 줄 항목명 뒤에 ' 외 N건'(같은 항목이어도 줄 수로 센다, 2026-10-13 실측 '이카운트 사용료 외 1건'). */
const more = (name: string, n: number) => (n > 1 ? `${name} 외 ${n - 1}건` : name)

/** 줄 묶음 → 격자 한 줄(거래처). [일부반영] 은 고른 줄만으로 다시 만든다. */
function groupOf(ls: BillLineView[]): Group {
  const trade = ls.reduce((s, l) => s + Number(l.supplyAmount), 0)
  const vat = ls.reduce((s, l) => s + Number(l.vatAmount), 0)
  return {
    partnerId: ls[0].partnerId, partnerCode: ls[0].partnerCode, partnerName: ls[0].partnerName, foreignCurrency: ls[0].foreignCurrency,
    lines: ls, trade, adjust: '0', foreign: '0', rate: '0', supply: String(trade), vat: String(vat),
    accountId: ls[0].salesAccountId != null ? String(ls[0].salesAccountId) : '', memo: more(ls[0].itemName, ls.length),
  }
}

/**
 * 회계 II › 계약관리 › 회계반영 › <b>회계/판매일괄반영</b>(E060906) — 2026-10-13 loginaa 실측.
 *
 * <p>조건: 구분(◉회계반영 ○판매반영) · 청구자료생성일자(전월 1일 ~ 오늘) · 계약 · 계약항목 · 거래처 · 담당자 · 부가세유형(세금계산서) ·
 * 청구단위 · 내.외자구분(전체 · 내자 · 외자) · 부서 · 프로젝트 · 기타 □거래처코드없는자료인쇄(인쇄용 — 아직 두지 않는다).
 * <p>회계반영 격자(거래처별 한 줄): ☐ · 거래처명 · 거래가액 · 조정 · 외화금액 · 환율 · 공급가액 · 부가세 · 합계 · 매출계정 · 상세 · 적요 · 회계전표No.,
 * 합계 줄. 버튼: 부가세유형 · 매출전표 I · 일부반영. [상세] → '일괄회계반영' 창 '매출 세금계산서 미청구 리스트'
 * (거래처명 · 일자-No. · 계약명 · 항목명 · 매출계정 · 수량 · 단가 · 공급가액 · 부가세 · 합계 · 적요).
 * 골라 [매출전표 I] → '회계/판매일괄반영' 창(전표일자 · 연결전표 없음 · 부서 · 프로젝트 · 부가세유형 · 거래처 · 공급가액 · 부가세 · 적요 ·
 * 매출계정 4049 제품매출 · 입금계좌 1089 외상매출금 · 수수료) [저장(F8)] → 매출전표 I 한 장, 그 거래처는 목록에서 빠진다.
 * <p>[일부반영](2026-10-13 QA회계2-청구거래처 청구 -4 · -5 로 실측): 거래처를 하나만 골라야 한다 — 아니면 '알림' 창
 * '자료를 1개 선택 시에만 가능합니다.'. 고르면 '일괄회계반영' 창(매출 세금계산서 미청구 리스트)에 줄마다 □ 가 붙고, 고른 줄만
 * [매출전표 I] 로 반영한다(-5 1 × 40,000 만 → 전표 공급가액 40,000 · 부가세 4,000 · 적요 '이카운트 사용료', 격자에는 -4 80,000 이 남음).
 * 격자 적요는 줄이 둘 이상이면 '이카운트 사용료 외 1건'.
 * <p>판매반영 격자: 거래처명 · 거래가액 · 내.외자구분 · 환율 · 외화금액 · 공급가액 · 부가세 · 합계 · 상세 — 원본에서 QA 계약(계약항목 '이카운트 사용료')
 * 청구자료가 판매반영에는 나오지 않아 [부가세율 적용] · [판매전표 발행] 은 아직 못 눌렀다. 고른 줄 위의 [공급가액계산 ▾ · 계산방법 선택 ▾ · 적용],
 * 매출전표 II · 회계전표No. 지정도 아직 없다.
 */
export default function ContractReflectPage() {
  // 원본 기본: 전월 1일 ~ 오늘(2026/09/01 ~ 2026/10/13 실측). '전월+금월' 버튼은 끝이 이번 달 말일이라 끝만 오늘로.
  const init = { from: periodOf('전월+금월')!.from, to: ymd(new Date()) }
  const [kind, setKind] = useState<'acct' | 'sales'>('acct')
  const [from, setFrom] = useState(init.from)
  const [to, setTo] = useState(init.to)
  const { filter, set, reset } = useBillLineFilter('세금계산서')
  const [rows, setRows] = useState<BillLineView[]>([])
  const [groups, setGroups] = useState<Group[]>([])
  const [picked, setPicked] = useState<Set<number>>(new Set())
  const [accounts, setAccounts] = useState<AccountOpt[]>([])
  const [error, setError] = useState('')
  const [detail, setDetail] = useState<Group | null>(null)
  // [일부반영] — 상세 창에 □ 를 붙여 고른 줄만 반영한다
  const [partial, setPartial] = useState(false)
  const [linePick, setLinePick] = useState<Set<number>>(new Set())
  const [notice, setNotice] = useState('')
  // [매출전표 I] 창 — 고른 거래처를 하나씩
  const [queue, setQueue] = useState<Group[]>([])
  const [slip, setSlip] = useState<null | {
    group: Group; date: string; departmentId: string; projectId: string; vatType: string; supply: string; vat: string
    memo: string; accountId: string; settleId: string; fee: string
  }>(null)
  const [slipError, setSlipError] = useState('')
  const dp = useDeptProjectItems()
  const tableRef = useRef<HTMLTableElement>(null)
  useTableColumnCheck(tableRef, '회계/판매일괄반영', [groups.length, kind])

  const acctId = (code: string) => String(accounts.find((a) => a.code === code)?.id ?? '')
  const accountItems: CodeItem[] = useMemo(() => accounts.map((a) => ({ value: String(a.id), code: a.code, name: a.name })), [accounts])

  async function load() {
    setError('')
    try {
      setRows((await api.get<BillLineView[]>('/contract-bills/lines', { params: { from, to, reflected: false } })).data)
    } catch (e) { setError(extractErrorMessage(e)) }
  }
  useEffect(() => {
    void load()
    api.get<AccountOpt[]>('/accounts').then((r) => setAccounts(r.data)).catch(() => setAccounts([]))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const shown = useMemo(() => applyFilter(rows, filter), [rows, filter])
  // 거래처별로 묶는다 — 원본 격자는 거래처 한 곳이 한 줄이다.
  useEffect(() => {
    const m = new Map<number, BillLineView[]>()
    shown.forEach((r) => m.set(r.partnerId, [...(m.get(r.partnerId) ?? []), r]))
    setGroups([...m.values()].map(groupOf))
    setPicked(new Set())
  }, [shown])

  const setGroup = (i: number, patch: Partial<Group>) => setGroups((gs) => gs.map((g, j) => {
    if (j !== i) return g
    const n = { ...g, ...patch }
    if ('adjust' in patch) n.supply = String(n.trade + num(n.adjust))
    if ('adjust' in patch || 'supply' in patch) n.vat = String(TAXED.has(filter.vatType) ? Math.floor(num(n.supply) / 10) : 0)
    return n
  }))

  function openSlip(g: Group) {
    setSlipError('')
    setSlip({
      group: g, date: ymd(new Date()), departmentId: g.lines[0].departmentId != null ? String(g.lines[0].departmentId) : '',
      projectId: g.lines[0].projectId != null ? String(g.lines[0].projectId) : '', vatType: filter.vatType || g.lines[0].vatType,
      supply: g.supply, vat: g.vat, memo: g.memo, accountId: g.accountId || acctId('404'), settleId: acctId('108'), fee: '0',
    })
  }
  function startReflect(gs: Group[]) {
    if (gs.length === 0) return
    setQueue(gs.slice(1)); openSlip(gs[0])
  }
  async function saveSlip() {
    if (!slip) return
    setSlipError('')
    if (!(num(slip.supply) > 0)) { setSlipError('공급가액: 자료를 입력 바랍니다.'); return }
    try {
      await api.post('/contract-bills/reflect', {
        lineIds: slip.group.lines.map((l) => l.lineId), entryDate: slip.date,
        departmentId: slip.departmentId ? Number(slip.departmentId) : null, projectId: slip.projectId ? Number(slip.projectId) : null,
        vatType: slip.vatType, partnerId: slip.group.partnerId, supplyAmount: num(slip.supply), vatAmount: num(slip.vat),
        description: slip.memo.trim() || null, accountId: Number(slip.accountId), settleAccountId: Number(slip.settleId),
        eInvoiceKind: slip.vatType === '세금계산서' ? '전자(세금)계산서-신규' : null, vatOmitted: false,
      })
      if (queue.length > 0) { openSlip(queue[0]); setQueue((q) => q.slice(1)) } else setSlip(null)
      await load()
    } catch (e) { setSlipError(extractErrorMessage(e)) }
  }

  const sum = (k: 'trade' | 'adjust' | 'foreign' | 'supply' | 'vat') => groups.reduce((s, g) => s + (k === 'trade' ? g.trade : num(g[k])), 0)
  const acctName = (id: string) => accounts.find((a) => String(a.id) === id)?.name ?? ''
  const pickedGroups = groups.filter((g) => picked.has(g.partnerId))
  const cols = kind === 'acct' ? 13 : 10

  return (
    <EcListShell title="회계/판매일괄반영" searchable={false} actions={[
      { label: '검색(F8)', primary: true, onClick: () => void load() },
      { label: '다시 작성', onClick: () => { setKind('acct'); setFrom(init.from); setTo(init.to); reset() } },
    ]}>
      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
      <ul className="ec-cond mb-[8px]">
        <EcCond label="구분">
          <label className="inline-flex items-center gap-[3px] mr-[10px]"><input type="radio" name="reflect-kind" checked={kind === 'acct'} onChange={() => setKind('acct')} /> 회계반영</label>
          <label className="inline-flex items-center gap-[3px]"><input type="radio" name="reflect-kind" checked={kind === 'sales'} onChange={() => setKind('sales')} /> 판매반영</label>
        </EcCond>
        <EcCond label="청구자료생성일자">
          <input type="date" className="ec-input w-[145px]" aria-label="청구자료생성일자 시작" value={from} onChange={(e) => setFrom(e.target.value)} />
          <span className="mx-[4px]">~</span>
          <input type="date" className="ec-input w-[145px]" aria-label="청구자료생성일자 끝" value={to} onChange={(e) => setTo(e.target.value)} />
          <span className="ml-[6px]"><EcPeriodPicks labels={PICKS} currentFrom={from} onPick={(r) => { setFrom(r.from); setTo(r.to) }} /></span>
        </EcCond>
        <BillLineConds rows={rows} filter={filter} set={set} full vatAll={false} />
      </ul>

      <p className="text-right mb-[4px]">{reportPeriod(from, to)}</p>
      <table ref={tableRef} className="w-full">
        <thead>
          {kind === 'acct' ? (
            <tr>
              <th className="w-[34px]"><input type="checkbox" aria-label="전체 선택" checked={groups.length > 0 && picked.size === groups.length}
                onChange={(e) => setPicked(e.target.checked ? new Set(groups.map((g) => g.partnerId)) : new Set())} /></th>
              <th className="w-[160px]">거래처명</th><th className="text-right">거래가액</th><th className="text-right">조정</th><th className="text-right">외화금액</th>
              <th className="text-right">환율</th><th className="text-right">공급가액</th><th className="text-right">부가세</th><th className="text-right">합계</th>
              <th>매출계정</th><th className="text-center">상세</th><th>적요</th><th>회계전표No.</th>
            </tr>
          ) : (
            <tr>
              <th className="w-[34px]"><input type="checkbox" aria-label="전체 선택" checked={groups.length > 0 && picked.size === groups.length}
                onChange={(e) => setPicked(e.target.checked ? new Set(groups.map((g) => g.partnerId)) : new Set())} /></th>
              <th>거래처명</th><th className="text-right">거래가액</th><th className="text-center">내.외자구분</th><th className="text-right">환율</th>
              <th className="text-right">외화금액</th><th className="text-right">공급가액</th><th className="text-right">부가세</th><th className="text-right">합계</th>
              <th className="text-center">상세</th>
            </tr>
          )}
        </thead>
        <tbody>
          {groups.length === 0 ? <tr><td colSpan={cols} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
            : groups.map((g, i) => (
              <tr key={g.partnerId}>
                <td className="text-center"><input type="checkbox" aria-label={`${g.partnerName} 선택`} checked={picked.has(g.partnerId)}
                  onChange={(e) => setPicked((s) => { const n = new Set(s); if (e.target.checked) n.add(g.partnerId); else n.delete(g.partnerId); return n })} /></td>
                <td>{g.partnerName}</td>
                <td className="text-right">{won(g.trade)}</td>
                {kind === 'acct' ? <>
                  <td><EcNumInput className="ec-input w-full text-right" aria-label="조정" value={g.adjust} onValue={(v) => setGroup(i, { adjust: v })} /></td>
                  <td><EcNumInput className="ec-input w-full text-right" aria-label="외화금액" value={g.foreign} onValue={(v) => setGroup(i, { foreign: v })} /></td>
                  <td><EcNumInput className="ec-input w-full text-right" aria-label="환율" value={g.rate} onValue={(v) => setGroup(i, { rate: v })} /></td>
                  <td><EcNumInput className="ec-input w-full text-right" aria-label="공급가액" value={g.supply} onValue={(v) => setGroup(i, { supply: v })} /></td>
                  <td><EcNumInput className="ec-input w-full text-right" aria-label="부가세" value={g.vat} onValue={(v) => setGroup(i, { vat: v })} /></td>
                  <td className="text-right">{won(num(g.supply) + num(g.vat))}</td>
                  <td><CodePickerField label="매출계정" hideLabel fill emptyLabel="" value={g.accountId} onChange={(v) => setGroup(i, { accountId: v })} items={accountItems} /></td>
                  <td className="text-center"><a href="#" onClick={(e) => { e.preventDefault(); setDetail(g) }}>상세</a></td>
                  <td><input className="ec-input w-full" aria-label="적요" maxLength={300} value={g.memo} onChange={(e) => setGroup(i, { memo: e.target.value })} /></td>
                  <td />
                </> : <>
                  <td className="text-center">{g.foreignCurrency ? '외자' : '내자'}</td>
                  <td className="text-right">0</td>
                  <td className="text-right">0</td>
                  <td className="text-right">{won(num(g.supply))}</td>
                  <td className="text-right">{won(num(g.vat))}</td>
                  <td className="text-right">{won(num(g.supply) + num(g.vat))}</td>
                  <td className="text-center"><a href="#" onClick={(e) => { e.preventDefault(); setDetail(g) }}>상세</a></td>
                </>}
              </tr>
            ))}
        </tbody>
        <tfoot>
          {groups.length > 0 && (kind === 'acct' ? (
            <tr>
              <td /><td />
              <td className="text-right">{won(sum('trade'))}</td>
              <td /><td /><td />
              <td className="text-right">{won(sum('supply'))}</td>
              <td className="text-right">{won(sum('vat'))}</td>
              <td className="text-right">{won(sum('supply') + sum('vat'))}</td>
              <td /><td /><td /><td />
            </tr>
          ) : (
            <tr>
              <td /><td />
              <td className="text-right">{won(sum('trade'))}</td>
              <td /><td /><td />
              <td className="text-right">{won(sum('supply'))}</td>
              <td className="text-right">{won(sum('vat'))}</td>
              <td className="text-right">{won(sum('supply') + sum('vat'))}</td>
              <td />
            </tr>
          ))}
        </tfoot>
      </table>
      {kind === 'acct' && (
        <div className="flex gap-[5px] mt-[8px]">
          <select className="ec-input w-[140px]" aria-label="반영 부가세유형" value={filter.vatType} onChange={(e) => set({ vatType: e.target.value })}>
            {VAT_TYPES.map((v) => <option key={v}>{v}</option>)}
          </select>
          <button type="button" className="ec-btn ec-btn-primary" disabled={pickedGroups.length === 0} onClick={() => startReflect(pickedGroups)}>매출전표 I</button>
          <button type="button" className="ec-btn" onClick={() => {
            if (pickedGroups.length !== 1) { setNotice('자료를 1개 선택 시에만 가능합니다.'); return }
            setPartial(true); setLinePick(new Set()); setDetail(pickedGroups[0])
          }}>일부반영</button>
        </div>
      )}

      <Modal open={!!notice} error={error} title="알림" width={420} onClose={() => setNotice('')}>
        <p className="text-[12px] mb-[12px]">{notice}</p>
        <button type="button" className="ec-btn ec-btn-primary" onClick={() => setNotice('')}>확인</button>
      </Modal>

      <Modal open={detail != null} title="일괄회계반영" width={980} error={error} onClose={() => { setDetail(null); setPartial(false) }}>
        {detail && <>
          <EcReportHead title={`매출 ${filter.vatType || '세금계산서'} 미청구 리스트`} period={reportPeriod(from, to)} sub={detail.partnerName} />
          <table className="ec-report w-full">
            <thead>
              <tr>
                {partial && <th className="w-[25px]"><input type="checkbox" aria-label="전체 선택" checked={detail.lines.every((l) => linePick.has(l.lineId))}
                  onChange={(e) => setLinePick(e.target.checked ? new Set(detail.lines.map((l) => l.lineId)) : new Set())} /></th>}
                <th>거래처명</th><th className="text-center">일자-No.</th><th>계약명</th><th>항목명</th><th>매출계정</th>
                <th className="text-right">수량</th><th className="text-right">단가</th><th className="text-right">공급가액</th>
                <th className="text-right">부가세</th><th className="text-right">합계</th><th>적요</th>
              </tr>
            </thead>
            <tbody>
              {detail.lines.map((l) => (
                <tr key={l.lineId}>
                  {partial && <td className="text-center"><input type="checkbox" aria-label={`${dateText(l.billDate)} -${l.billDocNo} 선택`} checked={linePick.has(l.lineId)}
                    onChange={() => setLinePick((p) => { const n = new Set(p); if (n.has(l.lineId)) n.delete(l.lineId); else n.add(l.lineId); return n })} /></td>}
                  <td>{l.partnerName}</td>
                  <td className="text-center">{dateText(l.billDate)} -{l.billDocNo}</td>
                  <td>{l.contractName ?? ''}</td>
                  <td>{l.itemName}</td>
                  <td>{l.salesAccountId != null ? acctName(String(l.salesAccountId)) : ''}</td>
                  <td className="text-right">{won(l.quantity)}</td>
                  <td className="text-right">{won(l.unitPrice)}</td>
                  <td className="text-right">{won(l.supplyAmount)}</td>
                  <td className="text-right">{won(l.vatAmount)}</td>
                  <td className="text-right">{won(Number(l.supplyAmount) + Number(l.vatAmount))}</td>
                  <td>{l.remark ?? ''}</td>
                </tr>
              ))}
              <tr className="ec-total">
                {partial && <td />}
                <td colSpan={5} className="text-center">합계</td>
                <td className="text-right">{won(detail.lines.reduce((s, l) => s + Number(l.quantity), 0))}</td>
                <td className="text-right">{won(detail.lines.reduce((s, l) => s + Number(l.unitPrice), 0))}</td>
                <td className="text-right">{won(detail.lines.reduce((s, l) => s + Number(l.supplyAmount), 0))}</td>
                <td className="text-right">{won(detail.lines.reduce((s, l) => s + Number(l.vatAmount), 0))}</td>
                <td className="text-right">{won(detail.lines.reduce((s, l) => s + Number(l.supplyAmount) + Number(l.vatAmount), 0))}</td>
                <td />
              </tr>
            </tbody>
          </table>
          <EcReportFoot />
          <div className="flex gap-[5px] mt-[8px]">
            {kind === 'acct' && <button type="button" className="ec-btn ec-btn-primary" disabled={partial && linePick.size === 0} onClick={() => {
              const g = partial ? groupOf(detail.lines.filter((l) => linePick.has(l.lineId))) : detail
              setDetail(null); setPartial(false); startReflect([g])
            }}>매출전표 I</button>}
            <button type="button" className="ec-btn" onClick={() => { setDetail(null); setPartial(false) }}>닫기</button>
          </div>
        </>}
      </Modal>

      <Modal open={slip != null} title="회계/판매일괄반영" width={760} error={slipError} onClose={() => { setSlip(null); setQueue([]) }}>
        {slip && <>
          <ul className="ec-form mb-[8px]">
            <EcCond label="전표일자" span={2}><EcDateField value={slip.date} onChange={(v) => setSlip({ ...slip, date: v })} /></EcCond>
            <EcCond label="연결전표" span={2}><span className="ec-link">없음</span></EcCond>
            <EcCond label="부서" span={2}>
              <CodePickerField label="부서" hideLabel pair fill emptyLabel="(없음)" value={slip.departmentId} onChange={(v) => setSlip({ ...slip, departmentId: v })} items={dp.departments} />
            </EcCond>
            <EcCond label="프로젝트" span={2}>
              <CodePickerField label="프로젝트" hideLabel pair fill emptyLabel="(없음)" value={slip.projectId} onChange={(v) => setSlip({ ...slip, projectId: v })} items={dp.projects} />
            </EcCond>
            <EcCond label="부가세유형" span={2}>
              <select className="ec-input w-full" aria-label="부가세유형" value={slip.vatType}
                onChange={(e) => setSlip({ ...slip, vatType: e.target.value, vat: String(TAXED.has(e.target.value) ? Math.floor(num(slip.supply) / 10) : 0) })}>
                {VAT_TYPES.map((v) => <option key={v}>{v}</option>)}
              </select>
              {slip.vatType === '세금계산서' && <div className="ec-pills mt-[4px]"><span className="ec-pill">전자(세금)계산서-신규</span><span className="ec-pill">예정누락아님</span></div>}
            </EcCond>
            <EcCond label="거래처" span={2}>
              {/* 원본도 묶은 거래처로 채워 둔다 — 다른 거래처로 바꾸면 청구자료와 어긋나므로 그 하나만 고를 수 있다. */}
              <CodePickerField label="거래처" hideLabel pair fill value={String(slip.group.partnerId)} onChange={() => undefined}
                items={[{ value: String(slip.group.partnerId), code: slip.group.partnerCode, name: slip.group.partnerName }]} />
            </EcCond>
            <EcCond label="공급가액" span={2}>
              <EcNumInput className="ec-input w-full text-right" aria-label="공급가액" value={slip.supply}
                onValue={(v) => setSlip({ ...slip, supply: v, vat: String(TAXED.has(slip.vatType) ? Math.floor(num(v) / 10) : 0) })} />
            </EcCond>
            <EcCond label="부가세" span={2}><EcNumInput className="ec-input w-full text-right" aria-label="부가세" value={slip.vat} onValue={(v) => setSlip({ ...slip, vat: v })} /></EcCond>
            <EcCond label="적요" span={2}><input className="ec-input w-full" aria-label="적요" maxLength={300} value={slip.memo} onChange={(e) => setSlip({ ...slip, memo: e.target.value })} /></EcCond>
            <EcCond label="매출계정" span={2}>
              <CodePickerField label="매출계정" hideLabel pair fill emptyLabel="(없음)" value={slip.accountId} onChange={(v) => setSlip({ ...slip, accountId: v })} items={accountItems} />
            </EcCond>
            <EcCond label="입금계좌" span={2}>
              <CodePickerField label="입금계좌" hideLabel pair fill emptyLabel="(없음)" value={slip.settleId} onChange={(v) => setSlip({ ...slip, settleId: v })} items={accountItems} />
            </EcCond>
          </ul>
          <div className="flex gap-[5px]">
            <button type="button" className="ec-btn ec-btn-primary" onClick={() => void saveSlip()}>저장(F8)</button>
            <button type="button" className="ec-btn" onClick={() => { setSlip(null); setQueue([]) }}>닫기</button>
          </div>
        </>}
      </Modal>
    </EcListShell>
  )
}
