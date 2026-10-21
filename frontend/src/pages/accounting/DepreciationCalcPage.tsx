import { Fragment, useEffect, useRef, useState } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import EcListShell from '../../components/EcListShell'
import Modal from '../../components/Modal'
import { ecAlert, ecConfirm } from '../../components/EcDialog'
import { EcReportFoot, EcReportHead, reportDate } from '../../components/EcReportFrame'
import { useTableColumnCheck } from '../../utils/assertTableColumns'

interface Calc {
  id: number; fiscalTerm: number; periodFrom: string; periodTo: string; itemCount: number; totalAmount: number
  reflected: boolean; excludedMonths: number; assetSummary: string | null
}
interface DetailLine {
  assetAccountCode: string; assetAccountName: string; assetNo: string; name: string; acquisitionDate: string
  usefulLifeYears: number; months: number; openCost: number; change: number; closeCost: number
  priorAccum: number; priorUnpaid: number; amount: number; closeAccum: number; unpaid: number
}
interface SlipLine { division: string; accountId: number; accountCode: string; accountName: string; debit: number; credit: number }
interface SlipDraft { entryDate: string; lines: SlipLine[]; totalDebit: number; totalCredit: number }
interface HistoryRow { assetNo: string; name: string; workedBy: string | null; workedAt: string | null; status: string }
interface AssetOpt {
  id: number; assetNo: string; name: string; assetAccountName: string; methodName: string; usefulLifeYears: number; salvageValue: number
}

const won = (n: number) => (n === 0 ? '' : Math.round(n).toLocaleString('ko-KR'))
const ym = (p: string) => p.replace('-', '/')
const thisYm = () => new Date().toISOString().slice(0, 7)

/**
 * 회계 I &gt; 고정자산 &gt; <b>감가상각계산</b>(E010616) — 2026-10-22 loginaa 실측. 기간 묶음 한 줄 = 회계기수 · 감가상각기간 · 건수 · 계산처리 ·
 * 감가상각현황 · 기타 · 감가상각총액. 줄 단추: 계산처리(계산 전 [전체계산 · 개별계산 · 수정], 반영 뒤 [계산/수정] ▾ 수정) ·
 * 감가상각현황(반영 뒤 [조회 · 반영내용삭제], 반영을 지우면 [조회 · 고정자산대장에반영 · 삭제]) · 기타([전표생성 · 이력]).
 * [전체계산]이 상각을 만들면서 대장에 바로 반영한다. [전표생성]은 일반전표 창에 계정별 분개를 채워 연다(저장해야 전표가 선다).
 */
export default function DepreciationCalcPage() {
  const [calcs, setCalcs] = useState<Calc[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [form, setForm] = useState<{ fiscalTerm: string; from: string; to: string } | null>(null)
  const [detail, setDetail] = useState<{ calc: Calc; lines: DetailLine[] } | null>(null)
  const [history, setHistory] = useState<{ calc: Calc; rows: HistoryRow[] } | null>(null)
  const [slip, setSlip] = useState<{ calc: Calc; draft: SlipDraft; date: string } | null>(null)
  const [pick, setPick] = useState<{ calc: Calc; assets: AssetOpt[] } | null>(null)
  const [open, setOpen] = useState('')
  const tableRef = useRef<HTMLTableElement>(null)
  useTableColumnCheck(tableRef, '감가상각계산', [calcs.length])

  async function load() {
    setLoading(true)
    try {
      setCalcs((await api.get<Calc[]>('/fixed-assets/calcs')).data)
    } catch (e) {
      setError(extractErrorMessage(e))
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { void load() }, [])

  async function create() {
    if (!form) return
    setError('')
    if (!/^\d+$/.test(form.fiscalTerm) || Number(form.fiscalTerm) < 1) return setError('회계기수를 입력하세요.')
    if (!/^\d{4}-\d{2}$/.test(form.from) || !/^\d{4}-\d{2}$/.test(form.to)) return setError('감가상각기간을 입력하세요.')
    try {
      await api.post('/fixed-assets/calcs', { fiscalTerm: Number(form.fiscalTerm), periodFrom: form.from, periodTo: form.to })
      setForm(null)
      await load()
    } catch (e) {
      setError(extractErrorMessage(e))
    }
  }

  async function showDetail(c: Calc) {
    try {
      const r = await api.get<DetailLine[]>(`/fixed-assets/calcs/${c.id}/detail`)
      setDetail({ calc: c, lines: r.data })
    } catch (e) {
      await ecAlert(extractErrorMessage(e))
    }
  }

  async function calculate(c: Calc) {
    try {
      await api.post(`/fixed-assets/calcs/${c.id}/calculate`)
      await load()
      await showDetail({ ...c, reflected: true })
    } catch (e) {
      await ecAlert(extractErrorMessage(e))
    }
  }

  async function individual(c: Calc) {
    if (c.itemCount === 0 && !c.reflected) return ecAlert('생성된 감가상각내역이 없습니다.')
    return showDetail(c)
  }

  async function editTargets(c: Calc) {
    try {
      const r = await api.get<AssetOpt[]>('/fixed-assets')
      setPick({ calc: c, assets: r.data })
    } catch (e) {
      await ecAlert(extractErrorMessage(e))
    }
  }

  async function unreflect(c: Calc) {
    if (!(await ecConfirm('삭제하겠습니까?'))) return
    try {
      await api.delete(`/fixed-assets/calcs/${c.id}/reflect`)
      await load()
    } catch (e) {
      await ecAlert(extractErrorMessage(e))
    }
  }

  async function remove(c: Calc) {
    if (!(await ecConfirm('감가상각반영내용도 함께 삭제됩니다.삭제하겠습니까?'))) return
    try {
      await api.delete(`/fixed-assets/calcs/${c.id}`)
      await load()
    } catch (e) {
      await ecAlert(extractErrorMessage(e))
    }
  }

  async function showSlip(c: Calc) {
    try {
      const r = await api.get<SlipDraft>(`/fixed-assets/calcs/${c.id}/slip`)
      setSlip({ calc: c, draft: r.data, date: r.data.entryDate })
    } catch (e) {
      await ecAlert(extractErrorMessage(e))
    }
  }

  async function saveSlip() {
    if (!slip) return
    try {
      await api.post('/journals', {
        entryDate: slip.date,
        lines: slip.draft.lines.map((l) => ({ accountId: l.accountId, debit: l.debit || undefined, credit: l.credit || undefined })),
      })
      setSlip(null)
    } catch (e) {
      await ecAlert(extractErrorMessage(e))
    }
  }

  async function showHistory(c: Calc) {
    try {
      const r = await api.get<HistoryRow[]>(`/fixed-assets/calcs/${c.id}/history`)
      setHistory({ calc: c, rows: r.data })
    } catch (e) {
      await ecAlert(extractErrorMessage(e))
    }
  }

  /** 줄 안의 드롭다운 — 단추를 누르면 아래에 항목이 뜬다(원본 계산처리 · 감가상각현황 · 기타). */
  function Menu({ id, label, items, primary }: { id: string; label: string; items: { label: string; run: () => void }[]; primary?: boolean }) {
    const on = open === id
    return (
      <span className="relative inline-block">
        <button type="button" className={`ec-btn ec-btn-sm ${primary ? 'ec-btn-primary' : ''}`} onClick={() => setOpen(on ? '' : id)}>{label}</button>
        {on && (
          <span className="absolute left-0 top-full z-20 flex flex-col bg-white border border-ec-line border-solid rounded-ec min-w-full">
            {items.map((it) => (
              <button key={it.label} type="button" className="no-ec px-[8px] py-[3px] text-left whitespace-nowrap"
                      onClick={() => { setOpen(''); it.run() }}>{it.label}</button>
            ))}
          </span>
        )}
      </span>
    )
  }

  return (
    <EcListShell
      title="감가상각계산"
      searchable={false}
      newLabel="신규(F2)"
      onNew={() => { setError(''); setForm({ fiscalTerm: String(new Date().getFullYear() - 2009), from: `${thisYm().slice(0, 4)}-01`, to: thisYm() }) }}
      actions={[{ label: 'Search(F3)', primary: true, onClick: load }]}
    >
      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
      <table ref={tableRef} className="w-full text-center">
        <thead>
          <tr>
            <th>회계기수</th><th>감가상각기간</th><th>건수</th><th>계산처리</th><th>감가상각현황</th><th>기타</th><th className="text-right">감가상각총액</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={7} className="ec-empty">불러오는 중…</td></tr>
          ) : calcs.length === 0 ? (
            <tr><td colSpan={7} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
          ) : calcs.map((c) => (
            <tr key={c.id}>
              <td>{c.fiscalTerm}</td>
              <td>{ym(c.periodFrom)} ~ {ym(c.periodTo)}</td>
              <td>{c.itemCount}</td>
              <td>
                {c.reflected
                  ? <Menu id={`c${c.id}`} label="계산/수정" items={[{ label: '수정', run: () => void editTargets(c) }]} />
                  : <Menu id={`c${c.id}`} label="계산처리" primary items={[
                    { label: '전체계산', run: () => void calculate(c) },
                    { label: '개별계산', run: () => void individual(c) },
                    { label: '수정', run: () => void editTargets(c) },
                  ]} />}
              </td>
              <td>
                {c.reflected
                  ? <Menu id={`s${c.id}`} label="감가상각현황" primary items={[
                    { label: '조회', run: () => void showDetail(c) },
                    { label: '반영내용삭제', run: () => void unreflect(c) },
                  ]} />
                  : <Menu id={`s${c.id}`} label="감가상각현황" primary items={[
                    { label: '조회', run: () => void showDetail(c) },
                    { label: '고정자산대장에반영', run: () => void calculate(c) },
                    { label: '삭제', run: () => void remove(c) },
                  ]} />}
              </td>
              <td>
                <Menu id={`g${c.id}`} label="기타" primary items={[
                  { label: '전표생성', run: () => void showSlip(c) },
                  { label: '이력', run: () => void showHistory(c) },
                ]} />
              </td>
              <td className="text-right">{Math.round(c.totalAmount).toLocaleString('ko-KR')}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <Modal open={!!form} title="계산처리" error={error} width={780} onClose={() => setForm(null)}>
        {form && (
          <div className="flex flex-col gap-[8px]">
            <label className="flex items-center gap-[8px]"><span className="w-[80px]">회계기수</span>
              <input className="ec-input w-[120px] text-right" name="fiscalTerm" value={form.fiscalTerm}
                     onChange={(e) => setForm({ ...form, fiscalTerm: e.target.value })} />
            </label>
            <label className="flex items-center gap-[8px]"><span className="w-[80px]">정산기능</span>
              <input type="checkbox" name="settle" />
            </label>
            <div className="flex items-center gap-[8px]"><span className="w-[80px]">감가상각기간</span>
              <YmSelect name="periodFrom" value={form.from} onChange={(v) => setForm({ ...form, from: v })} />
              <span>~</span>
              <YmSelect name="periodTo" value={form.to} onChange={(v) => setForm({ ...form, to: v })} />
            </div>
            <div className="flex gap-[6px]">
              <button className="ec-btn ec-btn-primary" onClick={create}>저장(F8)</button>
              <button className="ec-btn" onClick={() => setForm(null)}>닫기</button>
            </div>
          </div>
        )}
      </Modal>

      {detail && <DetailWindow detail={detail} error={error} onClose={() => setDetail(null)} />}

      <Modal open={!!history} title="감가상각계산이력" error={error} width={720} onClose={() => setHistory(null)}>
        {history && (
          <div>
            <p className="mb-[4px]">회계기수 {history.calc.fiscalTerm}</p>
            <p className="mb-[8px]">감가상각기간 {reportDate(`${history.calc.periodFrom}-01`)} ~{reportDate(`${history.calc.periodTo}-${lastDay(history.calc.periodTo)}`)}</p>
            <table className="w-full text-center">
              <thead><tr><th>고정자산코드</th><th>고정자산명</th><th>작업자ID</th><th>작업일시</th><th>상태</th></tr></thead>
              <tbody>
                {history.rows.map((r) => (
                  <tr key={r.assetNo}><td>{r.assetNo}</td><td>{r.name}</td><td>{r.workedBy}</td><td>{workedAt(r.workedAt)}</td><td>{r.status}</td></tr>
                ))}
              </tbody>
            </table>
            <div className="mt-[8px]"><button className="ec-btn" onClick={() => setHistory(null)}>닫기</button></div>
          </div>
        )}
      </Modal>

      <Modal open={!!slip} title="일반전표" error={error} width={900} onClose={() => setSlip(null)}>
        {slip && (
          <div>
            <label className="flex items-center gap-[8px] mb-[8px]">전표일자
              <input className="ec-input w-[140px]" type="date" name="entryDate" value={slip.date} onChange={(e) => setSlip({ ...slip, date: e.target.value })} />
              <span className="ml-[16px]">구분</span><span>일반전표</span>
            </label>
            <table className="w-full">
              <thead><tr><th>구분</th><th>계정코드</th><th>계정명</th><th>거래처코드</th><th>거래처명</th><th className="text-right">차변</th><th className="text-right">대변</th><th>적요코드</th><th>적요</th></tr></thead>
              <tbody>
                {slip.draft.lines.map((l, i) => (
                  <tr key={i}>
                    <td>{l.division}</td><td>{l.accountCode}</td><td>{l.accountName}</td><td></td><td></td>
                    <td className="text-right">{won(l.debit)}</td><td className="text-right">{won(l.credit)}</td><td></td><td></td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="ec-total">
                  <td colSpan={5}></td><td className="text-right">{won(slip.draft.totalDebit)}</td><td className="text-right">{won(slip.draft.totalCredit)}</td><td colSpan={2}></td>
                </tr>
              </tfoot>
            </table>
            <div className="mt-[8px] flex gap-[6px]">
              <button className="ec-btn ec-btn-primary" onClick={saveSlip}>저장(F8)</button>
              <button className="ec-btn" onClick={() => setSlip(null)}>닫기</button>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={!!pick} title="고정자산수정대상선택" error={error} width={760} onClose={() => setPick(null)}>
        {pick && <PickWindow assets={pick.assets} onClose={() => setPick(null)} />}
      </Modal>
    </EcListShell>
  )
}

/** 연 · 월 두 칸(원본 감가상각기간 2026 ▾ 01 ▾ ~ 2026 ▾ 10 ▾) */
function YmSelect({ name, value, onChange }: { name: string; value: string; onChange: (v: string) => void }) {
  const y = Number(value.slice(0, 4))
  const years = Array.from({ length: 11 }, (_, i) => y - 5 + i)
  return (
    <span className="inline-flex gap-[4px]">
      <select className="ec-input" name={`${name}Year`} value={value.slice(0, 4)} onChange={(e) => onChange(`${e.target.value}-${value.slice(5, 7)}`)}>
        {years.map((v) => <option key={v} value={v}>{v}</option>)}
      </select>
      <select className="ec-input" name={`${name}Month`} value={value.slice(5, 7)} onChange={(e) => onChange(`${value.slice(0, 4)}-${e.target.value}`)}>
        {Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0')).map((m) => <option key={m} value={m}>{m}</option>)}
      </select>
    </span>
  )
}

const lastDay = (p: string) => String(new Date(Number(p.slice(0, 4)), Number(p.slice(5, 7)), 0).getDate()).padStart(2, '0')
const workedAt = (t: string | null) => {
  if (!t) return ''
  const d = new Date(t)
  const h = d.getHours()
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')} ${h < 12 ? '오전' : '오후'} ${h % 12 === 0 ? 12 : h % 12}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`
}

/** 고정자산수정대상선택 — 자산을 체크해 [변경]. 아무것도 안 고르면 원본 공용 안내. */
function PickWindow({ assets, onClose }: { assets: AssetOpt[]; onClose: () => void }) {
  const [checked, setChecked] = useState<Set<number>>(new Set())
  const toggle = (id: number) => setChecked((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })
  return (
    <div>
      <table className="w-full">
        <thead>
          <tr><th className="w-[30px]"></th><th>고정자산코드</th><th>고정자산명</th><th>고정자산계정명</th><th>상각방법</th><th className="text-right">내용연수</th><th className="text-right">잔존가치</th></tr>
        </thead>
        <tbody>
          {assets.map((a) => (
            <tr key={a.id}>
              <td><input type="checkbox" checked={checked.has(a.id)} onChange={() => toggle(a.id)} /></td>
              <td>{a.assetNo}</td><td>{a.name}</td><td>{a.assetAccountName}</td><td>{a.methodName}</td>
              <td className="text-right">{a.usefulLifeYears}</td><td className="text-right">{won(a.salvageValue)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-[8px] flex gap-[6px]">
        <button className="ec-btn ec-btn-primary"
                onClick={() => { if (checked.size === 0) void ecAlert('리스트에 선택된 자료가 없습니다. 체크박스에 체크한 후 다시 시도 바랍니다.') }}>변경</button>
        <button className="ec-btn" onClick={onClose}>닫기</button>
      </div>
    </div>
  )
}

/** 감가상각상세내역 창 — 계정별 소계 · 합계, 머리 회사명 · 기간, 꼬리 [P.1] · 출력한 때. */
function DetailWindow({ detail, error, onClose }: { detail: { calc: Calc; lines: DetailLine[] }; error: string; onClose: () => void }) {
  const { calc, lines } = detail
  const groups: { name: string; rows: DetailLine[] }[] = []
  for (const l of lines) {
    const g = groups.find((x) => x.name === l.assetAccountName)
    if (g) g.rows.push(l); else groups.push({ name: l.assetAccountName, rows: [l] })
  }
  const sum = (rs: DetailLine[], k: keyof DetailLine) => rs.reduce((s, r) => s + Number(r[k]), 0)
  return (
    <Modal open title="감가상각상세내역" error={error} width={1280} onClose={onClose}>
      <EcReportHead title="감가상각상세내역" period={`${reportDate(`${calc.periodFrom}-01`)} ~ ${reportDate(`${calc.periodTo}-${lastDay(calc.periodTo)}`)}`} />
      <table className="ec-report w-full text-left">
        <thead>
          <tr>
            <th>고정자산계정명</th><th>고정자산코드</th><th>고정자산명</th><th>취득일자</th><th className="text-right">내용연수</th><th>내용연수단위</th><th className="text-right">상각률</th><th className="text-right">상각월수</th>
            <th className="text-right">기초가액</th><th className="text-right">당기증감</th><th className="text-right">기말잔액</th><th className="text-right">전기말상각누계액</th><th className="text-right">전기말미상각잔액</th><th className="text-right">당기상각비</th><th className="text-right">당기말상각누계액</th><th className="text-right">미상각잔액</th>
          </tr>
        </thead>
        <tbody>
          {groups.length === 0 ? (
            <tr><td colSpan={16} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
          ) : groups.map((g) => (
            <Fragment key={g.name}>
              {g.rows.map((r) => (
                <tr key={r.assetNo}>
                  <td>{r.assetAccountName}</td><td>{r.assetNo}</td><td>{r.name}</td><td>{r.acquisitionDate.replace(/-/g, '/')}</td>
                  <td className="text-right">{r.usefulLifeYears}</td><td>년</td><td className="text-right">0</td><td className="text-right">{r.months}</td>
                  <td className="text-right">{won(r.openCost)}</td><td className="text-right">{won(r.change)}</td><td className="text-right">{won(r.closeCost)}</td>
                  <td className="text-right">{won(r.priorAccum)}</td><td className="text-right">{won(r.priorUnpaid)}</td><td className="text-right">{won(r.amount)}</td>
                  <td className="text-right">{won(r.closeAccum)}</td><td className="text-right">{won(r.unpaid)}</td>
                </tr>
              ))}
              <tr className="ec-total">
                <td colSpan={8} className="text-center">{g.name} 계</td>
                <td className="text-right">{won(sum(g.rows, 'openCost'))}</td><td className="text-right">{won(sum(g.rows, 'change'))}</td>
                <td className="text-right">{won(sum(g.rows, 'closeCost'))}</td><td className="text-right">{won(sum(g.rows, 'priorAccum'))}</td>
                <td className="text-right">{won(sum(g.rows, 'priorUnpaid'))}</td><td className="text-right">{won(sum(g.rows, 'amount'))}</td>
                <td className="text-right">{won(sum(g.rows, 'closeAccum'))}</td><td className="text-right">{won(sum(g.rows, 'unpaid'))}</td>
              </tr>
            </Fragment>
          ))}
        </tbody>
        {groups.length > 0 && (
          <tfoot>
            <tr className="ec-total">
              <td colSpan={8} className="text-center">합계</td>
              <td className="text-right">{won(sum(lines, 'openCost'))}</td><td className="text-right">{won(sum(lines, 'change'))}</td>
              <td className="text-right">{won(sum(lines, 'closeCost'))}</td><td className="text-right">{won(sum(lines, 'priorAccum'))}</td>
              <td className="text-right">{won(sum(lines, 'priorUnpaid'))}</td><td className="text-right">{won(sum(lines, 'amount'))}</td>
              <td className="text-right">{won(sum(lines, 'closeAccum'))}</td><td className="text-right">{won(sum(lines, 'unpaid'))}</td>
            </tr>
          </tfoot>
        )}
      </table>
      <EcReportFoot />
      <div className="mt-[8px] flex gap-[6px]">
        <button className="ec-btn">인쇄</button>
        <button className="ec-btn">Excel</button>
        <button className="ec-btn" onClick={onClose}>닫기</button>
      </div>
    </Modal>
  )
}
