import { useEffect, useMemo, useRef, useState } from 'react'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import { api, extractErrorMessage } from '../../api/client'
import { dateNo } from '../../utils/dateNo'
import EcListShell from '../../components/EcListShell'
import { EcCond } from '../../components/EcStatusPanel'
import CodePickerField from '../../components/CodePickerField'
import EcPeriodPicks, { INQUIRY_PICKS, periodOf } from '../../components/EcPeriodPicks'
import type { JournalEntry } from '../../types/api'

const won = (n: number) => (n === 0 ? '' : Math.round(n).toLocaleString('ko-KR'))
const slash = (d: string) => d.replace(/-/g, '/')

interface JournalList { rows: JournalEntry[]; totalRows: number; truncated: boolean }
interface PartnerOpt { id: number; code: string; name: string }
type Act = '신규' | '수정'
interface Row { key: string; at: string; e: JournalEntry; act: Act }

/**
 * 회계 I &gt; 출력물 &gt; 기타 &gt; <b>거래이력조회(회계)</b>(E010712) — 2026-10-03 loginaa 실측(자료가 든 판).
 *
 * <p>조건: 작업일자(구간, 기본 <b>금월(~오늘)</b>, 빠른선택 금일 … 전월 · 종료일) · 작업시간([사용] 꺼짐) · 전표일자(사용안함) ·
 * 전표상태(전체 · 전자결재 · 미확인 · 확인, 다 켜짐) · 거래처 · 부서 · 프로젝트 · 거래유형 · 계정 · 금액(구간) · 적요 · 회계전표No. ·
 * 작업자 · 행위 · 기타([최종이력만 검색] 켜짐 · [수정순] 꺼짐).
 *
 * <p>열: 작업일자 · 전표번호 · 거래유형 · 금액 · 행위(신규 · 수정 · 삭제) · 거래처코드 · 거래처명 · 적요 · 작업자 · 전표상태 · 이력(H). 합계 줄은 없다.
 * 우리 회계전표는 만든 사람 · 만든 때 · 마지막으로 고친 때만 들어(BaseTimeEntity) 이력은 <b>신규</b>와 마지막 <b>수정</b> 둘뿐이다 —
 * 그래서 [최종이력만 검색]을 켜면 고친 전표는 수정 한 줄, 안 고친 전표는 신규 한 줄이고, 끄면 둘 다 나온다.
 * 지운 전표는 남지 않아(소프트 삭제가 아니다) [삭제] 행위가 없다. 전표상태는 결재 없이 곧 확인이라 [확인]을 끄면 비고 전자결재 · 미확인은 걸리는 줄이 없다. 작업자는 만든 사람을 그대로 쓴다.
 * 부서 · 프로젝트는 회계전표에 없다.
 */
export default function JournalHistoryPage() {
  const init = periodOf('금월(~오늘)')!
  const [from, setFrom] = useState(init.from)
  const [to, setTo] = useState(init.to)
  const [useTime, setUseTime] = useState(false)
  const [timeFrom, setTimeFrom] = useState('00:00')
  const [timeTo, setTimeTo] = useState('23:59')
  const [partners, setPartners] = useState<PartnerOpt[]>([])
  const [partner, setPartner] = useState('')
  const [kind, setKind] = useState('')
  const [account, setAccount] = useState('')
  const [amtFrom, setAmtFrom] = useState('')
  const [amtTo, setAmtTo] = useState('')
  const [remark, setRemark] = useState('')
  const [docNo, setDocNo] = useState('')
  const [worker, setWorker] = useState('')
  const [act, setAct] = useState('')
  /** 전표상태 — 원본은 전체 · 전자결재 · 미확인 · 확인이 다 켜져 있다. 우리 전표는 늘 확인이라 [확인]을 끄면 비어 있다. */
  const [okOn, setOkOn] = useState(true)
  const [apprOn, setApprOn] = useState(true)
  const [uncheckedOn, setUncheckedOn] = useState(true)
  const [lastOnly, setLastOnly] = useState(true)
  const [byModified, setByModified] = useState(false)
  const [entries, setEntries] = useState<JournalEntry[]>([])
  const [truncated, setTruncated] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    api.get<PartnerOpt[]>('/partners').then((r) => setPartners(r.data)).catch(() => setPartners([]))
  }, [])

  /* 작업일자는 전표일자와 다르다 — 지난달 전표를 오늘 고쳤을 수도 있어 전표는 넉넉히 받아 작업일자로 거른다. */
  async function load() {
    setLoading(true)
    setError('')
    try {
      const r = await api.get<JournalList>('/journals', { params: { from: '1900-01-01', to: '2999-12-31', all: true } })
      setEntries(r.data.rows)
      setTruncated(r.data.truncated)
    } catch (e) {
      setError(extractErrorMessage(e))
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { void load() }, [])

  const codeOf = useMemo(() => new Map(partners.map((p) => [p.id, p.code])), [partners])
  const rows = useMemo(() => {
    const out: Row[] = []
    for (const e of entries) {
      const created = e.createdAt ?? null
      const updated = e.updatedAt && created && e.updatedAt.slice(0, 19) !== created.slice(0, 19) ? e.updatedAt : null
      const acts: [Act, string | null][] = lastOnly ? [updated ? ['수정', updated] : ['신규', created]] : [['신규', created], ...(updated ? [['수정', updated] as [Act, string]] : [])]
      for (const [a, at] of acts) {
        if (!at) continue
        out.push({ key: `${e.id}-${a}`, at, e, act: a })
      }
    }
    return out
      .filter((r) => r.at.slice(0, 10) >= from && r.at.slice(0, 10) <= to)
      .filter((r) => !useTime || (r.at.slice(11, 16) >= timeFrom && r.at.slice(11, 16) <= timeTo))
      .filter((r) => !partner || String(r.e.partnerId) === partner)
      .filter((r) => !kind || r.e.sourceTypeName === kind)
      .filter((r) => !account || r.e.lines.some((l) => l.accountName === account))
      .filter((r) => amtFrom === '' || Number(r.e.totalDebit) >= Number(amtFrom))
      .filter((r) => amtTo === '' || Number(r.e.totalDebit) <= Number(amtTo))
      .filter((r) => !remark || (r.e.description ?? '').includes(remark))
      .filter((r) => !docNo || r.e.docNo.includes(docNo))
      .filter((r) => !worker || (r.e.createdBy ?? '') === worker)
      .filter((r) => !act || r.act === act)
      .filter(() => okOn)
      .sort((a, b) => byModified
        ? (a.at < b.at ? 1 : a.at > b.at ? -1 : 0)
        : (a.e.entryDate < b.e.entryDate ? 1 : a.e.entryDate > b.e.entryDate ? -1 : b.e.docNo.localeCompare(a.e.docNo)))
  }, [entries, lastOnly, from, to, useTime, timeFrom, timeTo, partner, kind, account, amtFrom, amtTo, remark, docNo, worker, act, byModified, okOn])
  const kinds = useMemo(() => [...new Set(entries.map((e) => e.sourceTypeName))].sort(), [entries])
  const accounts = useMemo(() => [...new Set(entries.flatMap((e) => e.lines.map((l) => l.accountName)))].sort(), [entries])
  const workers = useMemo(() => [...new Set(entries.map((e) => e.createdBy).filter((v): v is string => !!v))].sort(), [entries])

  const tableRef = useRef<HTMLTableElement>(null)
  useTableColumnCheck(tableRef, '거래이력조회(회계)', [rows.length])

  const reset = () => {
    setFrom(init.from); setTo(init.to); setUseTime(false); setPartner(''); setKind(''); setAccount(''); setAmtFrom(''); setAmtTo('')
    setRemark(''); setDocNo(''); setWorker(''); setAct(''); setOkOn(true); setApprOn(true); setUncheckedOn(true); setLastOnly(true); setByModified(false)
  }
  const check = (label: string, v: boolean, set: (b: boolean) => void) => (
    <label className="inline-flex items-center gap-[3px] mr-[10px] text-[12.5px]">
      <input type="checkbox" checked={v} onChange={(e) => set(e.target.checked)} /> {label}
    </label>
  )

  return (
    <EcListShell
      title="거래이력조회(회계)"
      searchable={false}
      actions={[
        { label: '검색(F8)', primary: true, onClick: load },
        { label: '다시 작성', onClick: reset },
        { label: 'Excel' },
      ]}
    >
      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
      <ul className="ec-cond" style={{ marginBottom: 8 }}>
        <EcCond label="작업일자">
          <input type="date" className="ec-input" value={from} onChange={(e) => setFrom(e.target.value)} style={{ width: 145 }} />
          <span className="my-0 mx-[4px]">~</span>
          <input type="date" className="ec-input" value={to} onChange={(e) => setTo(e.target.value)} style={{ width: 145 }} />
          <span className="ml-[6px]">
            <EcPeriodPicks labels={INQUIRY_PICKS} currentFrom={from} onPick={(r) => { setFrom(r.from); setTo(r.to) }} />
          </span>
        </EcCond>
        <EcCond label="작업시간">
          <input type="time" className="ec-input" value={timeFrom} disabled={!useTime} onChange={(e) => setTimeFrom(e.target.value)} style={{ width: 110 }} />
          <span className="my-0 mx-[4px]">~</span>
          <input type="time" className="ec-input" value={timeTo} disabled={!useTime} onChange={(e) => setTimeTo(e.target.value)} style={{ width: 110, marginRight: 8 }} />
          {check('사용', useTime, setUseTime)}
        </EcCond>
        <EcCond label="전표상태">
          <label className="inline-flex items-center gap-[3px] mr-[10px] text-[12.5px]">
            <input type="checkbox" checked={okOn && apprOn && uncheckedOn} onChange={(e) => { setOkOn(e.target.checked); setApprOn(e.target.checked); setUncheckedOn(e.target.checked) }} /> 전체
          </label>
          {check('전자결재', apprOn, setApprOn)}
          {check('미확인', uncheckedOn, setUncheckedOn)}
          {check('확인', okOn, setOkOn)}
        </EcCond>
        <EcCond label="거래처" pick>
          <CodePickerField label="거래처" hideLabel width={220} emptyLabel="전체" value={partner} onChange={setPartner}
                           items={partners.map((p) => ({ value: String(p.id), code: p.code, name: p.name }))} />
        </EcCond>
        <EcCond label="거래유형">
          <select className="ec-input" value={kind} onChange={(e) => setKind(e.target.value)} style={{ width: 140 }}>
            <option value="">전체</option>
            {kinds.map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
        </EcCond>
        <EcCond label="계정" pick>
          <CodePickerField label="계정" hideLabel width={200} emptyLabel="전체" value={account} onChange={setAccount} items={accounts.map((a) => ({ value: a, name: a }))} />
        </EcCond>
        <EcCond label="금액">
          <input className="ec-input" inputMode="decimal" value={amtFrom} onChange={(e) => setAmtFrom(e.target.value)} style={{ width: 110 }} />
          <span className="my-0 mx-[4px]">~</span>
          <input className="ec-input" inputMode="decimal" value={amtTo} onChange={(e) => setAmtTo(e.target.value)} style={{ width: 110 }} />
        </EcCond>
        <EcCond label="적요">
          <input className="ec-input" value={remark} onChange={(e) => setRemark(e.target.value)} style={{ width: 220 }} />
        </EcCond>
        <EcCond label="회계전표No.">
          <input className="ec-input" value={docNo} onChange={(e) => setDocNo(e.target.value)} style={{ width: 180 }} />
        </EcCond>
        <EcCond label="작업자">
          <select className="ec-input" value={worker} onChange={(e) => setWorker(e.target.value)} style={{ width: 140 }}>
            <option value="">전체</option>
            {workers.map((w) => <option key={w} value={w}>{w}</option>)}
          </select>
        </EcCond>
        <EcCond label="행위">
          <select className="ec-input" value={act} onChange={(e) => setAct(e.target.value)} style={{ width: 110 }}>
            <option value="">전체</option>
            <option value="신규">신규</option>
            <option value="수정">수정</option>
          </select>
        </EcCond>
        <EcCond label="기타">
          {check('최종이력만 검색', lastOnly, setLastOnly)}
          {check('수정순', byModified, setByModified)}
        </EcCond>
      </ul>

      {truncated && <p className="text-[12px] text-ec-warn mb-[6px]">전표가 많아 앞부분만 받았습니다.</p>}
      <table ref={tableRef} className="w-full text-left">
        <thead>
          <tr>
            <th className="text-center">작업일자</th>
            <th className="text-center">전표번호</th>
            <th>거래유형</th>
            <th className="text-right">금액</th>
            <th className="text-center">행위</th>
            <th>거래처코드</th>
            <th>거래처명</th>
            <th>적요</th>
            <th>작업자</th>
            <th className="text-center">전표상태</th>
            <th className="text-center">이력</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={11} className="ec-empty">불러오는 중…</td></tr>
          ) : rows.length === 0 ? (
            <tr><td colSpan={11} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
          ) : rows.map((r) => (
            <tr key={r.key}>
              <td className="text-center">{slash(r.at.slice(0, 10))}</td>
              <td className="text-center text-ec-blue">{dateNo(r.e.entryDate, r.e.docNo)}</td>
              <td>{r.e.sourceTypeName}</td>
              <td className="text-right">{won(Number(r.e.totalDebit))}</td>
              <td className="text-center">{r.act}</td>
              <td>{r.e.partnerId != null ? codeOf.get(r.e.partnerId) ?? '' : ''}</td>
              <td>{r.e.partnerName ?? ''}</td>
              <td>{r.e.description ?? ''}</td>
              <td>{r.e.createdBy ?? ''}</td>
              <td className="text-center">확인</td>
              <td className="text-center text-ec-blue">H</td>
            </tr>
          ))}
        </tbody>
      </table>
    </EcListShell>
  )
}
