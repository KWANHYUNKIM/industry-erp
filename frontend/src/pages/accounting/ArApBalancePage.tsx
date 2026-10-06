import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import { api, extractErrorMessage } from '../../api/client'
import EcListShell from '../../components/EcListShell'
import { EcCond } from '../../components/EcStatusPanel'
import CodePickerField from '../../components/CodePickerField'
import { ymd } from '../../components/EcPeriodPicks'
import { EcReportHead, reportDate } from '../../components/EcReportFrame'
import type { JournalEntry } from '../../types/api'

/*
 * 원본 [담당자 계] · [합계] 줄(2026-10-03 실측)은 바탕 (243,243,243) · 굵게 — 출력물 공통의 tr.ec-total(index.css)과 같다.
 * 이 화면은 인라인 style · 색 값을 쓰지 않는다(style-check 래칫, 새 파일 기준 0).
 */

type Side = '채권' | '채무'
/** 계정(StandardAccounts) — 채권은 받을어음 110 · 외상매출금 108, 채무는 지급어음 252 · 외상매입금 251. */
const ACC: Record<Side, { note: string; open: string; noteName: string; openName: string; plan: string }> = {
  채권: { note: '110', open: '108', noteName: '받을어음', openName: '외상매출금', plan: '수금계획' },
  채무: { note: '252', open: '251', noteName: '지급어음', openName: '외상매입금', plan: '지급계획' },
}

interface JournalList { rows: JournalEntry[]; totalRows: number; truncated: boolean }
interface PartnerOpt {
  id: number; code: string; name: string; manager: string | null; parentId: number | null; active: boolean
  creditLimit: number | null; mobile: string | null; phone: string | null
}
/** 외상 잔액을 생긴 달로 나눈 것 — [이번 달, 1 · 2 · 3 달 전, 기타]. */
type Aging = [number, number, number, number, number]
interface Row { key: string; p: PartnerOpt; note: number; open: number; aging: Aging }

/**
 * 회계 I &gt; 경영자료 &gt; <b>채권/채무잔액분석표</b>(E010823) — 2026-10-03 loginaa 실측(자료가 든 판, 채권).
 *
 * <p>조건: 구분(<b>채권</b> | 채무) · 조회일자(하루, 기본 오늘, 빠른선택 금일 · 전일 · 이번기수 · 직전기수) · 거래처 · 거래처관리담당자 ·
 * 부서 · 프로젝트 · 기타([결재방표시] · [담당자별집계] · [잔액0포함] · [천단위] 꺼짐, [사용중단거래처포함] 켜짐) ·
 * 대표거래처로 합산(<b>거래처관계기준</b> | 개별거래처기준).
 *
 * <p>인쇄 머리 제목은 <b>채권잔액분석표</b>(채무면 채무잔액분석표). 열은 담당자코드 · 담당자 · 거래처코드 · 거래처명 · 여신한도 · 총채권 ·
 * 받을어음 · 외상매출금 계 · 외상매출금 현황(이번 달 · 지난 세 달 · 기타) · 수금계획 현황(이번 달부터 네 달 · 기타) · 수금계획 계 · 차액 ·
 * 모바일 · 전화. 담당자마다 묶고 [담당자 계](담당자 없는 거래처는 '[] 계'), 끝 [합계]. 원본에서 [담당자별집계]가 꺼져 있어도 담당자로 묶여 나왔다.
 *
 * <p>외상 잔액은 가장 최근 증가부터 거슬러 생긴 달에 나눠 담고, 잔액이 0 이하면 이번 달 칸에 둔다(원본에서 음수 잔액이 그렇게 찍혔다).
 * 담당자는 거래처의 관리담당자(이름만 — 우리 거래처는 사원 코드를 들지 않아 담당자코드는 비운다). 수금 · 지급계획은 우리에게 없어 비우고,
 * 차액은 외상 계 − 계획 계. 원본의 '6개의 추가항목생성가능' 열은 빈 자리표라 두지 않았다. 부서 · 프로젝트는 회계전표에 없다.
 */
export default function ArApBalancePage() {
  const [side, setSide] = useState<Side>('채권')
  const [asOf, setAsOf] = useState(ymd(new Date()))
  const [partners, setPartners] = useState<PartnerOpt[]>([])
  const [partner, setPartner] = useState('')
  const [manager, setManager] = useState('')
  const [withZero, setWithZero] = useState(false)
  const [thousand, setThousand] = useState(false)
  const [withInactive, setWithInactive] = useState(true)
  const [byParent, setByParent] = useState(true)
  const [entries, setEntries] = useState<JournalEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    api.get<PartnerOpt[]>('/partners').then((r) => setPartners(r.data)).catch(() => setPartners([]))
  }, [])

  async function load() {
    setLoading(true)
    setError('')
    try {
      const r = await api.get<JournalList>('/journals', { params: { from: '1900-01-01', to: asOf, all: true } })
      setEntries(r.data.rows)
    } catch (e) {
      setError(extractErrorMessage(e))
    } finally {
      setLoading(false)
    }
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void load() }, [asOf])

  const a = ACC[side]
  const monthIdx = (d: string) => {
    const [y, m] = asOf.split('-').map(Number)
    const [dy, dm] = d.split('-').map(Number)
    return (y - dy) * 12 + (m - dm)
  }
  const monthLabels = useMemo(() => {
    const m = Number(asOf.split('-')[1])
    return [0, 1, 2, 3].map((k) => `${((m - 1 - k + 120) % 12) + 1}월`).concat('기타')
  }, [asOf])
  const planLabels = useMemo(() => {
    const m = Number(asOf.split('-')[1])
    return [0, 1, 2, 3].map((k) => `${((m - 1 + k) % 12) + 1}월`).concat('기타')
  }, [asOf])

  const rows = useMemo(() => {
    const debitSide = side === '채권'
    const pById = new Map(partners.map((p) => [p.id, p]))
    const m = new Map<number, { note: number; open: number; incs: { date: string; amt: number }[] }>()
    for (const e of entries) {
      let pid = e.partnerId
      if (pid == null) continue
      if (byParent && pById.get(pid)?.parentId) pid = pById.get(pid)!.parentId!
      for (const l of e.lines) {
        if (l.accountCode !== a.note && l.accountCode !== a.open) continue
        const inc = debitSide ? Number(l.debit) : Number(l.credit)
        const dec = debitSide ? Number(l.credit) : Number(l.debit)
        if (!m.has(pid)) m.set(pid, { note: 0, open: 0, incs: [] })
        const g = m.get(pid)!
        if (l.accountCode === a.note) g.note += inc - dec
        else { g.open += inc - dec; if (inc) g.incs.push({ date: e.entryDate, amt: inc }) }
      }
    }
    const out: Row[] = []
    for (const [pid, g] of m) {
      const p = pById.get(pid)
      if (!p) continue
      if (partner && String(pid) !== partner) continue
      if (manager && (p.manager ?? '') !== manager) continue
      if (!withInactive && !p.active) continue
      if (!withZero && Math.round(g.note + g.open) === 0) continue
      const aging: Aging = [0, 0, 0, 0, 0]
      if (g.open <= 0) aging[0] = g.open
      else {
        let left = g.open
        for (const inc of [...g.incs].sort((x, y) => (x.date < y.date ? 1 : -1))) {
          if (left <= 0) break
          const take = Math.min(left, inc.amt)
          aging[Math.min(4, Math.max(0, monthIdx(inc.date)))] += take
          left -= take
        }
        if (left > 0) aging[4] += left
      }
      out.push({ key: String(pid), p, note: g.note, open: g.open, aging })
    }
    return out.sort((x, y) => (x.p.manager ?? '').localeCompare(y.p.manager ?? '', 'ko') || x.p.name.localeCompare(y.p.name, 'ko'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries, partners, side, byParent, partner, manager, withInactive, withZero, asOf])

  const groups = useMemo(() => {
    const m = new Map<string, Row[]>()
    for (const r of rows) {
      const k = r.p.manager ?? ''
      if (!m.has(k)) m.set(k, [])
      m.get(k)!.push(r)
    }
    return [...m.entries()]
  }, [rows])
  const managers = useMemo(() => [...new Set(partners.map((p) => p.manager).filter((v): v is string => !!v))].sort(), [partners])

  const fmt = (n: number) => (n === 0 ? '' : Math.round(thousand ? n / 1000 : n).toLocaleString('ko-KR'))
  const sumRows = (rs: Row[]) => rs.reduce((s, r) => ({
    limit: s.limit + Number(r.p.creditLimit ?? 0), note: s.note + r.note, open: s.open + r.open,
    aging: s.aging.map((v, i) => v + r.aging[i]) as Aging,
  }), { limit: 0, note: 0, open: 0, aging: [0, 0, 0, 0, 0] as Aging })

  const tableRef = useRef<HTMLTableElement>(null)
  useTableColumnCheck(tableRef, '채권/채무잔액분석표', [rows.length, side])

  const nums = (limit: number, note: number, open: number, aging: Aging) => (
    <>
      <td className="text-right">{fmt(limit)}</td>
      <td className="text-right">{fmt(note + open)}</td>
      <td className="text-right">{fmt(note)}</td>
      <td className="text-right">{fmt(open)}</td>
      {aging.map((v, i) => <td key={`a${i}`} className="text-right">{fmt(v)}</td>)}
      {planLabels.map((l) => <td key={`p${l}`}></td>)}
      <td></td>
      <td className="text-right">{fmt(open)}</td>
    </>
  )

  return (
    <EcListShell
      title="채권/채무잔액분석표"
      searchable={false}
      actions={[
        { label: '검색(F8)', primary: true, onClick: load },
        { label: '다시 작성', onClick: () => { setSide('채권'); setAsOf(ymd(new Date())); setPartner(''); setManager(''); setWithZero(false); setThousand(false); setWithInactive(true); setByParent(true) } },
        { label: '인쇄' },
        { label: 'Excel' },
      ]}
    >
      {error && <p className="ec-error">{error}</p>}
      <ul className="ec-cond mb-2">
        <EcCond label="구분">
          {(['채권', '채무'] as Side[]).map((v) => (
            <label key={v} className="mr-2.5 inline-flex items-center gap-[3px]">
              <input type="radio" name="arb-side" checked={side === v} onChange={() => setSide(v)} /> {v}
            </label>
          ))}
        </EcCond>
        <EcCond label="조회일자">
          <input type="date" value={asOf} onChange={(e) => e.target.value && setAsOf(e.target.value)} className="ec-input w-[145px]" />
        </EcCond>
        <EcCond label="거래처" pick>
          <CodePickerField label="거래처" hideLabel width={220} emptyLabel="전체" value={partner} onChange={setPartner}
                           items={partners.map((p) => ({ value: String(p.id), code: p.code, name: p.name }))} />
        </EcCond>
        <EcCond label="거래처관리담당자" pick>
          <CodePickerField label="거래처관리담당자" hideLabel width={180} emptyLabel="전체" value={manager} onChange={setManager}
                           items={managers.map((m) => ({ value: m, name: m }))} />
        </EcCond>
        <EcCond label="기타">
          {([['잔액0포함', withZero, setWithZero], ['천단위', thousand, setThousand], ['사용중단거래처포함', withInactive, setWithInactive]] as const).map(([l, v, set]) => (
            <label key={l} className="mr-2.5 inline-flex items-center gap-[3px]">
              <input type="checkbox" checked={v} onChange={(e) => set(e.target.checked)} /> {l}
            </label>
          ))}
        </EcCond>
        <EcCond label="대표거래처로 합산">
          {([['거래처관계기준', true], ['개별거래처기준', false]] as const).map(([l, v]) => (
            <label key={l} className="mr-2.5 inline-flex items-center gap-[3px]">
              <input type="radio" name="arb-parent" checked={byParent === v} onChange={() => setByParent(v)} /> {l}
            </label>
          ))}
        </EcCond>
      </ul>

      <EcReportHead title={side === '채권' ? '채권잔액분석표' : '채무잔액분석표'} period={`${reportDate(asOf)}${thousand ? ' (단위 : 천원)' : ''}`} />
      <div className="overflow-x-auto">
        <table ref={tableRef} className="ec-report w-full text-left">
          <thead>
            <tr>
              <th rowSpan={2}>담당자코드</th>
              <th rowSpan={2}>담당자</th>
              <th rowSpan={2}>거래처코드</th>
              <th rowSpan={2}>거래처명</th>
              <th rowSpan={2} className="text-right">여신한도</th>
              <th rowSpan={2} className="text-right">총{side}</th>
              <th rowSpan={2} className="text-right">{a.noteName}</th>
              <th rowSpan={2} className="text-right">{a.openName} 계</th>
              <th colSpan={5} className="text-center">{a.openName} 현황</th>
              <th colSpan={5} className="text-center">{a.plan} 현황</th>
              <th rowSpan={2} className="text-right">{a.plan} 계</th>
              <th rowSpan={2} className="text-right">차액</th>
              <th rowSpan={2}>모바일</th>
              <th rowSpan={2}>전화</th>
            </tr>
            <tr>
              {monthLabels.map((l) => <th key={`m${l}`} className="text-right">{l}</th>)}
              {planLabels.map((l) => <th key={`p${l}`} className="text-right">{l}</th>)}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={22} className="p-5 text-center text-[var(--ec-text-hint)]">불러오는 중…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={22} className="p-5 text-center text-[var(--ec-text-hint)]">등록된 데이터가 없습니다.</td></tr>
            ) : (
              <>
                {groups.map(([mgr, rs]) => {
                  const s = sumRows(rs)
                  return (
                    <Fragment key={mgr || '-'}>
                      {rs.map((r) => (
                        <tr key={r.key}>
                          <td></td>
                          <td>{r.p.manager ?? ''}</td>
                          <td>{r.p.code}</td>
                          <td>{r.p.name}</td>
                          {nums(Number(r.p.creditLimit ?? 0), r.note, r.open, r.aging)}
                          <td>{r.p.mobile ?? ''}</td>
                          <td>{r.p.phone ?? ''}</td>
                        </tr>
                      ))}
                      <tr className="ec-total">
                        <td colSpan={4} className="text-center">{mgr || '[]'} 계</td>
                        {nums(s.limit, s.note, s.open, s.aging)}
                        <td></td>
                        <td></td>
                      </tr>
                    </Fragment>
                  )
                })}
                {(() => { const s = sumRows(rows); return (
                  <tr className="ec-total">
                    <td colSpan={4} className="text-center">합계</td>
                    {nums(s.limit, s.note, s.open, s.aging)}
                    <td></td>
                    <td></td>
                  </tr>
                ) })()}
              </>
            )}
          </tbody>
        </table>
      </div>
    </EcListShell>
  )
}
