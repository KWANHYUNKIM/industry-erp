import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Modal from '../../components/Modal'
import SelfUseInputPage, { SelfUsePrint } from './SelfUseInputPage'
import { dateNo } from '../../utils/dateNo'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import { api, extractErrorMessage } from '../../api/client'
import EcListShell from '../../components/EcListShell'
import { EcCond } from '../../components/EcStatusPanel'
import CodePickerField from '../../components/codepicker/CodePickerField'
import EcPeriodPicks, { QUOTATION_PICKS, SELF_USE_PICKS, periodOf } from '../../components/EcPeriodPicks'
import { useCondPickers } from '../../utils/useCondPickers'
import type { StockAdjustment, StockAdjustmentSlip } from '../../types/api'
import { ecConfirm } from '../../components/EcDialog'
import { EcDateRange } from '../../components/ui/EcDateInput'

interface AdjustmentList { rows: StockAdjustment[]; totalRows: number; truncated: boolean }

/**
 * 재고 I &gt; 기타이동 &gt; 자가사용 &gt; <b>자가사용조회</b>(E040504) — 2026-10-03 loginaa 실측(자료가 든 판).
 *
 * <p>조건: 기준일자(구간, 기본 <b>최근30일(+1개월)</b>, 빠른선택 금일 · 전일 · <b>말일</b> · … · 종료일 · 최근30일(+1개월)) ·
 * 창고 · 프로젝트 · 거래처 · 품목코드 · 발송여부. 열: 입력일자(일자-No.) · 거래처 · 창고 · 품목 · 수량 · 담당자 · 인쇄.
 * 버튼줄 신규(F2) · …. 위에 탭 전체 · 결재중 · 미확인 · 확인.
 *
 * <p>2026-10-12 다시 실측(입력 → 조회 → 수정 → 삭제): 조건은 <b>접혀</b> 있고 [Search(F3)] 로 편다(…조회 화면 공통).
 * 한 줄이 <b>전표 한 장</b>이다 — 품목이 여럿이면 '투광등 100W 외 1건', 수량은 줄 합. [일자-No.] 를 누르면 그 자리에
 * <b>자가사용수정</b> 창이 뜬다(일자 잠김 · [저장(F8) · 삭제 · 닫기]). 아래 [신규(F2)] 는 자가사용입력.
 * [발송여부]는 전표를 메일로 보내지 않아 없다. 2026-10-21: [인쇄] 열 → 자가사용전표(SelfUsePrint), 탭 [전체 · 결재중 · 미확인 · 확인]
 * (새 전표는 곧바로 확인 — 결재중 · 미확인은 비어 있다), 수정 창 버튼 아홉을 원본대로 두었다.
 *
 * <p><b>불량처리조회</b>(C000088) — 같은 날 실측. 조건: 기준일자(기본 최근30일(+1개월), 빠른선택에 [말일]이 없다) · 창고 · 프로젝트 ·
 * 품목코드 · 담당자 · 불량유형 · 처리방법(체크, 다 켜짐 — 원본 회사는 폐기 · 품목대체 · 정상사용) · 기타(수정일자순) · 최종수정자 · 발송여부.
 * 열: 입력일자 · 창고 · 품목 · 수량 · 처리방법 · 인쇄. [거래처]가 없다. 불량유형 · 처리방법 후보는 공통코드에서 가져온다.
 */
export default function StockMoveListPage({ kind }: { kind: 'SELF_USE' | 'DEFECT' }) {
  const selfUse = kind === 'SELF_USE'
  const title = selfUse ? '자가사용조회' : '불량처리조회'
  const navigate = useNavigate()
  const pickers = useCondPickers(['warehouses', 'projects', 'items', 'employees', 'partners'])
  const init = periodOf('최근30일(+1개월)')!
  const [from, setFrom] = useState(init.from)
  const [to, setTo] = useState(init.to)
  const [warehouse, setWarehouse] = useState('')
  const [project, setProject] = useState('')
  const [partner, setPartner] = useState('')
  /** 머리 검색상자 — 품목 · 거래처 · 창고 이름 낱말로 전표를 추린다. */
  const [keyword, setKeyword] = useState('')
  /** 자가사용수정 창 — 원본처럼 목록 위에 뜬다. */
  const [editNo, setEditNo] = useState<string | null>(null)
  /*
   * 원본 자가사용조회 머리 탭: 전체 · 결재중 · 미확인 · 확인(2026-10-21 실측). 저장한 전표는 곧바로 [확인] 이고
   * 이 회사는 전표상태관리유형이 꺼져 있어 결재중 · 미확인은 늘 비어 있다(창고이동조회와 같다).
   */
  const [stTab, setStTab] = useState<'전체' | '결재중' | '미확인' | '확인'>('전체')
  /* 목록 [인쇄] 열이 여는 자가사용전표. */
  const [printSlip, setPrintSlip] = useState<StockAdjustmentSlip | null>(null)
  async function openPrint(no: string) {
    try {
      setPrintSlip((await api.get<StockAdjustmentSlip>(`/stock-adjustments/slips/${encodeURIComponent(no)}`)).data)
    } catch (e) {
      setError(extractErrorMessage(e))
    }
  }
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [item, setItem] = useState('')
  const [employee, setEmployee] = useState('')
  const [defectKind, setDefectKind] = useState('')
  /** 원본 [처리방법] 체크 — 끈 것만 담는다(공통코드 후보가 늘어도 처음엔 다 켜진 채다). */
  const [handlingOff, setHandlingOff] = useState<Set<string>>(new Set())
  const [codeGroups, setCodeGroups] = useState<{ name: string; codes: { name: string }[] }[]>([])
  const [rows, setRows] = useState<StockAdjustment[]>([])
  const partnerName = useMemo(() => new Map(pickers.partners.map((p) => [p.id, p.name])), [pickers.partners])
  const [truncated, setTruncated] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function load() {
    setLoading(true)
    setError('')
    try {
      const [r, c] = await Promise.all([
        api.get<AdjustmentList>('/stock-adjustments', { params: { from, to, type: kind } }),
        api.get<{ name: string; codes: { name: string }[] }[]>('/codes').catch(() => ({ data: [] })),
      ])
      setRows(r.data.rows)
      setCodeGroups(c.data)
      setTruncated(r.data.truncated)
    } catch (e) {
      setError(extractErrorMessage(e))
    } finally {
      setLoading(false)
    }
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void load() }, [from, to, kind])

  const empName = useMemo(() => new Map(pickers.employees.map((e) => [(e as { id?: number }).id, e.name])), [pickers.employees])
  const shown = useMemo(() => rows
    .filter((r) => r.type === kind)
    /* 불량처리의 정상품목 줄(들어온 재고)은 빼고 센다 — 원본 불량처리조회는 품목대체 전표를 불량품목만으로 찍는다. */
    .filter((r) => !r.normal)
    .filter((r) => r.adjustDate >= from && r.adjustDate <= to)
    .filter((r) => !warehouse || String(r.warehouseId) === warehouse)
    .filter((r) => !project || String(r.projectId) === project)
    .filter((r) => !partner || String(r.partnerId) === partner)
    .filter((r) => !employee || (r.employeeId != null && empName.get(r.employeeId) === employee))
    .filter((r) => !defectKind || (r.kind ?? '') === defectKind)
    .filter((r) => selfUse || !handlingOff.has(r.handling ?? ''))
    .sort((a, b) => (a.adjustDate > b.adjustDate ? -1 : a.adjustDate < b.adjustDate ? 1 : b.adjustNo.localeCompare(a.adjustNo))),
  [rows, kind, selfUse, from, to, warehouse, project, partner, employee, defectKind, handlingOff, empName])
  /*
   * 전표 한 장 = 한 줄. 같은 adjustNo 의 줄을 묶고 첫 줄 품목에 '외 n건', 수량은 줄 합(원본 그대로).
   * [품목코드] 조건은 <b>그 품목이 든 전표</b>를 남긴다 — 줄 하나만 남기면 '외 n건' 이 틀린다.
   */
  const slips = useMemo(() => {
    const m = new Map<string, StockAdjustment[]>()
    for (const r of shown) m.set(r.adjustNo, [...(m.get(r.adjustNo) ?? []), r])
    return [...m.values()]
      .map((ls) => [...ls].sort((a, b) => (a.lineNo ?? 1) - (b.lineNo ?? 1)))
      .filter((ls) => !item || ls.some((r) => String(r.itemId) === item))
      .filter((ls) => !keyword.trim() || ls.some((r) => [r.itemName, r.itemCode, r.warehouseName,
        r.partnerId != null ? partnerName.get(r.partnerId) : ''].some((v) => (v ?? '').includes(keyword.trim()))))
  }, [shown, item, keyword, partnerName])

  async function removePicked() {
    if (!(await ecConfirm('선택한 전표를 삭제 하겠습니까?'))) return
    try {
      for (const no of picked) await api.delete(`/stock-adjustments/slips/${encodeURIComponent(no)}`)
      setPicked(new Set())
      await load()
    } catch (e) {
      setError(extractErrorMessage(e))
    }
  }
  const tableRef = useRef<HTMLTableElement>(null)
  useTableColumnCheck(tableRef, title, [slips.length])
  const codesOf = (g: string) => (codeGroups.find((x) => x.name === g)?.codes ?? []).map((c) => c.name)
  /* 원본 [처리방법] 후보는 폐기 · 품목대체 · 정상사용 고정(2026-10-13 불량처리현황 실측) — 공통코드 DEFECT_HANDLING 은 원본에 없는 값이다. */
  const handlings = ['폐기', '품목대체', '정상사용']

  return (
    <EcListShell
      title={title}
      search={keyword}
      onSearchChange={setKeyword}
      onSearch={() => void load()}
      onNew={() => navigate(selfUse ? '/inventory/self-use-input' : '/inventory/defect-input')}
      actions={[
        /* 원본 자가사용조회 · 불량처리조회 버튼줄(2026-10-21 실측): Email · 진행상태변경 · 보내기 · 인쇄 · 바코드(품목) · 전자결재 · 선택삭제 · Excel · 이력조회.
           바깥 연동 · 단계 없는 전표라 Email · 진행상태변경 · 보내기 · 바코드(품목) · 전자결재 · 이력조회 는 모양만. */
        { label: 'Email' }, { label: '진행상태변경', selected: picked.size }, { label: '보내기' }, { label: '인쇄' },
        { label: '바코드(품목)' }, { label: '전자결재' },
        { label: '선택삭제', onClick: () => void removePicked(), selected: picked.size },
        { label: 'Excel' }, { label: '이력조회' },
      ]}
    >
      <p className="text-right text-[12px] mb-[4px]">{from.replace(/-/g, '/')} ~ {to.replace(/-/g, '/')}</p>
      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
      <ul className="ec-cond" style={{ marginBottom: 8 }}>
        <EcCond label="기준일자">
          <EcDateRange from={{ className: "ec-input", value: from, onChange: (e) => setFrom(e.target.value) }} to={{ className: "ec-input", value: to, onChange: (e) => setTo(e.target.value) }} />
          <span className="ml-[6px]">
            <EcPeriodPicks labels={selfUse ? SELF_USE_PICKS : QUOTATION_PICKS} currentFrom={from} onPick={(r) => { setFrom(r.from); setTo(r.to) }} />
          </span>
        </EcCond>
        <EcCond label="창고" pick>
          <CodePickerField label="창고" hideLabel width={200} emptyLabel="전체" value={warehouse} onChange={setWarehouse} items={pickers.warehouses} />
        </EcCond>
        <EcCond label="프로젝트" pick>
          <CodePickerField label="프로젝트" hideLabel width={200} emptyLabel="전체" value={project} onChange={setProject} items={pickers.projects} />
        </EcCond>
        {selfUse && (
          <EcCond label="거래처" pick>
            <CodePickerField label="거래처" hideLabel width={220} emptyLabel="전체" value={partner} onChange={setPartner} items={pickers.partners} />
          </EcCond>
        )}
        <EcCond label="품목코드" pick>
          <CodePickerField label="품목코드" hideLabel width={220} emptyLabel="전체" value={item} onChange={setItem} items={pickers.items} />
        </EcCond>
        {!selfUse && (
          <>
            <EcCond label="담당자" pick>
              <CodePickerField label="담당자" hideLabel width={170} emptyLabel="전체" value={employee} onChange={setEmployee} items={pickers.employees} />
            </EcCond>
            <EcCond label="불량유형">
              <select className="ec-input" value={defectKind} onChange={(e) => setDefectKind(e.target.value)} style={{ width: 140 }}>
                <option value="">전체</option>
                {codesOf('불량유형').map((k) => <option key={k} value={k}>{k}</option>)}
              </select>
            </EcCond>
            <EcCond label="처리방법">
              <label className="inline-flex items-center gap-[3px] mr-[10px] text-[12.5px]">
                <input type="checkbox" checked={handlingOff.size === 0} onChange={(e) => setHandlingOff(e.target.checked ? new Set() : new Set(['', ...handlings]))} /> 전체
              </label>
              {handlings.map((h) => (
                <label key={h} className="inline-flex items-center gap-[3px] mr-[10px] text-[12.5px]">
                  <input type="checkbox" checked={!handlingOff.has(h)}
                         onChange={(e) => setHandlingOff((s) => { const n = new Set(s); if (e.target.checked) n.delete(h); else n.add(h); return n })} /> {h}
                </label>
              ))}
            </EcCond>
          </>
        )}
      </ul>

      {truncated && <p className="text-[12px] text-ec-warn mb-[6px]">자료가 많아 앞부분만 받았습니다 — 기간을 좁혀 보세요.</p>}
      {/* 원본 자가사용조회 · 불량처리조회 둘 다 머리 탭 전체 · 결재중 · 미확인 · 확인(2026-10-21 실측). */}
      <div className="ec-pills mb-[6px]" role="tablist" aria-label="전표상태">
        {(['전체', '결재중', '미확인', '확인'] as const).map((t) => (
          <button key={t} type="button" role="tab" aria-selected={stTab === t}
                  className={`ec-pill${stTab === t ? ' active' : ''}`} onClick={() => setStTab(t)}>{t}</button>
        ))}
      </div>
      <table ref={tableRef} className="w-full text-left">
        <thead>
          <tr>
            <th className="w-[34px]">
              <input type="checkbox" aria-label="전체 선택" checked={slips.length > 0 && picked.size === slips.length}
                     onChange={(e) => setPicked(e.target.checked ? new Set(slips.map((ls) => ls[0].adjustNo)) : new Set())} />
            </th>
            <th>입력일자</th>
            {selfUse && <th>거래처</th>}
            <th>창고</th>
            <th>품목</th>
            <th className="text-right">수량</th>
            {selfUse ? <th>담당자</th> : <th>처리방법</th>}
            <th className="w-[54px] text-center">인쇄</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={selfUse ? 8 : 7} className="ec-empty">불러오는 중…</td></tr>
          ) : slips.length === 0 || stTab === '결재중' || stTab === '미확인' ? (
            <tr><td colSpan={selfUse ? 8 : 7} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
          ) : slips.map((ls) => {
            const r = ls[0]
            const qty = ls.reduce((s, x) => s + Math.abs(Number(x.quantityChange)), 0)
            return (
              <tr key={r.adjustNo}>
                <td className="text-center">
                  <input type="checkbox" aria-label={`${r.adjustNo} 선택`} checked={picked.has(r.adjustNo)}
                         onChange={() => setPicked((p) => { const n = new Set(p); if (n.has(r.adjustNo)) n.delete(r.adjustNo); else n.add(r.adjustNo); return n })} />
                </td>
                <td>
                  <a className="cursor-pointer" onClick={() => setEditNo(r.adjustNo)}>{dateNo(r.adjustDate, r.adjustNo)}</a>
                </td>
                {selfUse && <td>{r.partnerId != null ? partnerName.get(r.partnerId) ?? '' : ''}</td>}
                <td>{r.warehouseName}</td>
                <td>{r.itemName}{r.spec ? ` [${r.spec}]` : ''}{ls.length > 1 ? ` 외 ${ls.length - 1}건` : ''}</td>
                <td className="text-right">{qty.toLocaleString('ko-KR')}</td>
                {selfUse
                  ? <td>{r.employeeId != null ? empName.get(r.employeeId) ?? '' : ''}</td>
                  : <td>{r.handling ?? ''}</td>}
                <td className="text-center"><a className="cursor-pointer" onClick={() => void openPrint(r.adjustNo)}>인쇄</a></td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <Modal open={editNo != null} title={selfUse ? '자가사용수정' : '불량처리수정'} width={1100} error={error} onClose={() => setEditNo(null)}>
        {editNo && (
          <SelfUseInputPage kind={kind} adjustNo={editNo} onDone={() => { setEditNo(null); void load() }}
                            onNav={(dir) => {
                              /* 목록은 새 전표가 위 — [이전](더 옛 전표)은 아래 줄, [다음](더 새 전표)은 위 줄. */
                              const i = slips.findIndex((ls) => ls[0].adjustNo === editNo)
                              const next = slips[i - dir]
                              if (next) setEditNo(next[0].adjustNo)
                            }} />
        )}
      </Modal>
      <Modal open={!!printSlip} title={selfUse ? '자가사용전표' : '불량처리'} error={error} onClose={() => setPrintSlip(null)}>
        {printSlip && (
          <SelfUsePrint slip={printSlip}
                        employeeText={printSlip.employeeId != null ? empName.get(printSlip.employeeId) ?? '' : ''}
                        partnerText={(id) => { const p = id != null ? pickers.partners.find((x) => x.value === String(id)) : undefined; return p ? `${p.name}(${p.code})` : '' }}
                        whCode={pickers.warehouses.find((w) => w.value === String(printSlip.warehouseId))?.code ?? ''}
                        onClose={() => setPrintSlip(null)} />
        )}
      </Modal>
    </EcListShell>
  )
}
