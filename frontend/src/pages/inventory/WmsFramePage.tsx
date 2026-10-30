import { useEffect, useRef, useState } from 'react'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import { api, extractErrorMessage } from '../../api/client'
import EcListShell from '../../components/EcListShell'
import { EcCond } from '../../components/EcStatusPanel'
import EcPeriodPicks, { INQUIRY_PICKS, periodOf, ymd } from '../../components/EcPeriodPicks'
import { ecAlert } from '../../components/EcDialog'
import type { LocationStock, WmsOverview } from '../../types/api'
import EcDateInput, { EcDateRange } from '../../components/ui/EcDateInput'

/**
 * 재고 II > WMS — 바깥 WMS 연동 화면들의 틀(2026-10-20 loginaa 실측).
 *
 * <p>원본 WMS 는 이카운트 WMS 계정과 연동된 별도 창고 시스템이다. 입고예정 · 출고예정은 발주서에서 넘어오고,
 * [입고] · [출고] · [조정] · [ERP전표생성] 은 WMS 쪽 재고를 바꾸거나 ERP 재고 전표를 만든다.
 * 우리에게는 WMS 계정이 없어 <b>화면 틀(조건 · 열 · 버튼 · 문구)만</b> 맞춘다 — 저장 · 처리 단추는 연동 안내를 띄운다.
 * 재고번호가 있는 두 화면(WMS재고조정 · WMS재고현황)만 우리 로케이션 재고(/wms)를 보여 준다.
 * 창고관리(C000904)는 우리 로케이션 화면(WmsPage)이 맡는다.
 */

const NOT_LINKED = 'WMS 계정이 연동되어 있지 않습니다.\n\n[WMS계정선택]에서 연동한 뒤 이용 바랍니다.'
const notLinked = () => void ecAlert(NOT_LINKED)

type Kind =
  | 'account' | 'inbound-plan' | 'inbound-status' | 'inbound-process' | 'inbound-slip'
  | 'outbound-plan' | 'outbound-status' | 'outbound-process' | 'outbound-slip'
  | 'adjust' | 'stock-status' | 'history'

const HISTORY_PICKS = ['금일', '전일', '금주(~오늘)', '전주', '금월(~오늘)', '전월', '금년', '전년', '종료일', '최근30일(+1개월)'] as const

/** 원본 목록 화면의 처음 기간 — 오늘 −30일 ~ 오늘 +30일(입고예정 · 입고처리 · ERP전표생성 모두 2026/09/20 ~ 2026/11/19). */
function aroundToday(): [string, string] {
  const d = new Date()
  const a = new Date(d); a.setDate(d.getDate() - 30)
  const b = new Date(d); b.setDate(d.getDate() + 30)
  return [ymd(a), ymd(b)]
}

const stockNo = (id: number) => String(id).padStart(10, '0')

function EmptyGrid({ cols, check }: { cols: string[]; check?: boolean }) {
  const ref = useRef<HTMLTableElement>(null)
  useTableColumnCheck(ref, 'WMS ' + cols[0], [cols.join('|'), check])
  return (
    <table ref={ref} className="w-full text-left">
      <thead>
        <tr>
          {check && <th className="w-[34px] text-center"><input type="checkbox" aria-label="전체 선택" disabled /></th>}
          {cols.map((c) => <th key={c}>{c}</th>)}
        </tr>
      </thead>
      <tbody>
        <tr><td colSpan={cols.length + (check ? 1 : 0)} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
      </tbody>
    </table>
  )
}

function Pills({ labels, value, onChange }: { labels: string[]; value: string; onChange: (v: string) => void }) {
  return (
    <div className="ec-pills mb-[8px]">
      {labels.map((l) => (
        <button key={l} type="button" className={`ec-pill${value === l ? ' active' : ''}`} onClick={() => onChange(l)}>{l}</button>
      ))}
    </div>
  )
}

function Period({ from, to }: { from: string; to: string }) {
  return <p className="text-[12px] text-ec-hint mb-[6px]">{from.replaceAll('-', '/')} ~ {to.replaceAll('-', '/')}</p>
}

/** 입고예정(C000905) · 출고예정(E090182) — 발주서에서 넘어온 예정 목록. */
function PlanList({ dir }: { dir: '입고' | '출고' }) {
  const [pill, setPill] = useState('전체')
  const [[from, to]] = useState(aroundToday)
  const place = dir === '입고' ? '보낸곳명' : '받는곳명'
  return (
    <EcListShell
      title={`${dir}예정`}
      onNew={notLinked}
      actions={[
        { label: 'Email', onClick: notLinked },
        { label: '보내기', onClick: notLinked },
        { label: '인쇄', onClick: notLinked },
        { label: '선택삭제', onClick: notLinked, selected: 0 },
        { label: 'Excel' },
      ]}
    >
      <Pills labels={['전체', '확인', '진행중', '완료']} value={pill} onChange={setPill} />
      <Period from={from} to={to} />
      <EmptyGrid check cols={[`${dir}예정번호`, '유형', place, '담당자명', '품목명[규격]', '납기일자', `${dir}예정수량합계`, '종결여부', '진행상태', '인쇄']} />
    </EcListShell>
  )
}

/** 입고처리(E090181) · 출고처리(E090184). */
function ProcessList({ dir }: { dir: '입고' | '출고' }) {
  const [pill, setPill] = useState(`${dir}예정`)
  const [[from, to]] = useState(aroundToday)
  const cols = dir === '입고'
    ? ['입고예정번호', '보낸곳명', '품목명[규격]', '납기일자', '입고예정수량', '입고대기수량', '미입고수량', '입고지시수량', '적요']
    : ['출고예정번호', '보낸곳명', '품목명[규격]', '품목별납기일자', '출고예정수량', '미출고수량', '출고대기수량', '출고지시수량', '적요']
  return (
    <EcListShell title={`${dir}처리`} actions={[{ label: dir, primary: true, onClick: notLinked }, { label: 'Excel' }]}>
      <Pills labels={[`${dir}예정`, `${dir}대기`, `${dir}완료`]} value={pill} onChange={setPill} />
      <Period from={from} to={to} />
      <EmptyGrid check cols={cols} />
    </EcListShell>
  )
}

/** ERP전표생성(입고) E090199 · (출고) E090196 — WMS 처리분을 ERP 재고 전표로 넘긴다. */
function SlipList({ dir }: { dir: '입고' | '출고' }) {
  const [[from, to]] = useState(aroundToday)
  const cols = dir === '입고'
    ? ['입고번호', '입고예정번호', '유형', '품목명[규격]', '입고수량합계', '보낸곳명', '담당자명']
    : ['출고번호', '출고예정번호', '출고유형', '품목명[규격]', '출고수량합계', '보낸곳명', '담당자명']
  return (
    <EcListShell title={`ERP전표생성(${dir})`} actions={[{ label: 'ERP전표생성', primary: true, onClick: notLinked }]}>
      <Period from={from} to={to} />
      <EmptyGrid check cols={cols} />
    </EcListShell>
  )
}

/** 입고예정현황 E090231 · 출고예정현황 E090230 — 조건 판에서 시작하는 현황. */
function PlanStatus({ dir }: { dir: '입고' | '출고' }) {
  const month = periodOf('금월(~오늘)')!
  const [from, setFrom] = useState(month.from)
  const [to, setTo] = useState(month.to)
  const [mode, setMode] = useState('내역')
  const [shown, setShown] = useState(false)
  return (
    <EcListShell title={`${dir}예정현황`} searchable={false} onSearch={() => setShown(true)}
      actions={[{ label: '검색(F8)', primary: true, onClick: () => setShown(true) }, { label: '인쇄', onClick: notLinked }, { label: 'Excel' }]}>
      <ul className="ec-cond mb-[8px]">
        <EcCond label="구분">
          {['내역', '집계'].map((v) => (
            <label key={v} className="inline-flex items-center gap-[3px] mr-[10px] text-[12.5px]">
              <input type="radio" name={`wms-${dir}-mode`} checked={mode === v} onChange={() => setMode(v)} /> {v}
            </label>
          ))}
          <label className="inline-flex items-center gap-[3px] text-[12.5px]"><input type="checkbox" /> 라인별</label>
        </EcCond>
        <EcCond label="기준일자">
          <EcDateRange from={{ className: "ec-input w-[145px]", value: from, onChange: (e) => setFrom(e.target.value) }} to={{ className: "ec-input w-[145px]", value: to, onChange: (e) => setTo(e.target.value) }} />
          <span className="ml-[6px]"><EcPeriodPicks labels={INQUIRY_PICKS} currentFrom={from} onPick={(r) => { setFrom(r.from); setTo(r.to) }} /></span>
        </EcCond>
        <EcCond label="품목별납기일자">
          <EcDateRange from={{ className: "ec-input w-[145px]" }} to={{ className: "ec-input w-[145px]" }} />
        </EcCond>
        {['창고', '거래처', '품목코드', '담당자', '거래처관리담당자', '유형'].map((l) => (
          <EcCond key={l} label={l} pick><input className="ec-input w-[200px]" /></EcCond>
        ))}
        <EcCond label="양식">
          <select className="ec-input w-[200px]"><option>기본(수정불가)</option></select>
        </EcCond>
        <EcCond label="결재방표시"><input type="checkbox" /></EcCond>
      </ul>
      {shown && (
        <>
          <Period from={from} to={to} />
          <EmptyGrid cols={['일자-No.', '유형', dir === '입고' ? '보낸곳명' : '받는곳명', '담당자명', '품목명[규격]', '수량', '적요']} />
        </>
      )}
    </EcListShell>
  )
}

function useLocationStocks() {
  const [rows, setRows] = useState<LocationStock[]>([])
  const [error, setError] = useState('')
  useEffect(() => {
    api.get<WmsOverview>('/wms').then((r) => setRows(r.data.locationStocks)).catch((e) => setError(extractErrorMessage(e)))
  }, [])
  return { rows, error }
}

/** WMS재고조정 E090174 — 기준일자 · 위치 · 재고번호 · 품목코드로 재고번호를 찾아 [조정]. */
function AdjustScreen() {
  const { rows, error } = useLocationStocks()
  const [base, setBase] = useState(ymd(new Date()))
  return (
    <EcListShell title="WMS재고조정" actions={[{ label: '조정', primary: true, onClick: notLinked }]}>
      <ul className="ec-cond mb-[8px]">
        <EcCond label="기준일자"><EcDateInput className="ec-input w-[145px]" value={base} onChange={(e) => setBase(e.target.value)} /></EcCond>
        {['위치', '재고번호', '품목코드'].map((l) => <EcCond key={l} label={l} pick><input className="ec-input w-[200px]" /></EcCond>)}
      </ul>
      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
      <p className="text-[12px] text-ec-hint mb-[6px]">{base.replaceAll('-', '/')}</p>
      <table className="w-full text-left">
        <thead>
          <tr>
            <th className="w-[34px] text-center"><input type="checkbox" aria-label="전체 선택" /></th>
            <th>재고번호</th><th>품목명</th><th>규격</th><th>위치명</th><th className="text-right">재고수량</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={6} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
          ) : rows.map((r) => (
            <tr key={r.id}>
              <td className="text-center"><input type="checkbox" /></td>
              <td>{stockNo(r.id)}</td><td>{r.itemName}</td><td></td><td>{r.locationCode}</td>
              <td className="text-right">{r.quantity.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </EcListShell>
  )
}

/** WMS재고현황 E090195 — 재고번호별 / 품목별, 끝에 합계 줄. */
function StockStatus() {
  const { rows, error } = useLocationStocks()
  const [mode, setMode] = useState('재고번호별')
  const [shown, setShown] = useState(false)
  const total = rows.reduce((s, r) => s + r.quantity, 0)
  const fmt = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2 })
  return (
    <EcListShell title="WMS재고현황" searchable={false} onSearch={() => setShown(true)}
      actions={[{ label: '검색(F8)', primary: true, onClick: () => setShown(true) }, { label: '인쇄', onClick: notLinked }, { label: 'Excel' }]}>
      <ul className="ec-cond mb-[8px]">
        <EcCond label="구분">
          {['재고번호별', '품목별'].map((v) => (
            <label key={v} className="inline-flex items-center gap-[3px] mr-[10px] text-[12.5px]">
              <input type="radio" name="wms-stock-mode" checked={mode === v} onChange={() => setMode(v)} /> {v}
            </label>
          ))}
        </EcCond>
        {['재고번호', '품목코드', '할당번호', '위치'].map((l) => <EcCond key={l} label={l} pick><input className="ec-input w-[200px]" /></EcCond>)}
        <EcCond label="양식"><select className="ec-input w-[200px]"><option>기본(수정불가)</option></select></EcCond>
      </ul>
      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
      {shown && (
        <table className="w-full text-left">
          <thead>
            <tr><th>재고번호</th><th>품목코드</th><th>품목명[규격]</th><th>구역명</th><th>위치명</th><th className="text-right">재고수량</th></tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={6} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
            ) : rows.map((r) => (
              <tr key={r.id}>
                <td>{stockNo(r.id)}</td><td>{r.itemCode}</td><td>{r.itemName}</td><td>{r.warehouseName}</td><td>{r.locationCode}</td>
                <td className="text-right">{fmt(r.quantity)}</td>
              </tr>
            ))}
            {rows.length > 0 && (
              <tr className="font-bold"><td colSpan={5}>합계</td><td className="text-right">{fmt(total)}</td></tr>
            )}
          </tbody>
        </table>
      )}
    </EcListShell>
  )
}

/** 재고이력관리 E090178 — 작업일자 처음 값 최근30일(+1개월). */
function HistoryScreen() {
  const first = periodOf('최근30일(+1개월)')!
  const [from, setFrom] = useState(first.from)
  const [to, setTo] = useState(first.to)
  const [mode, setMode] = useState('내역별')
  const [del, setDel] = useState('전체')
  const [shown, setShown] = useState(false)
  return (
    <EcListShell title="재고이력관리" searchable={false} onSearch={() => setShown(true)}
      actions={[{ label: '검색(F8)', primary: true, onClick: () => setShown(true) }, { label: '인쇄', onClick: notLinked }, { label: 'Excel' }]}>
      <ul className="ec-cond mb-[8px]">
        <EcCond label="구분">
          {['내역별', '라인별', '전표별'].map((v) => (
            <label key={v} className="inline-flex items-center gap-[3px] mr-[10px] text-[12.5px]">
              <input type="radio" name="wms-hist-mode" checked={mode === v} onChange={() => setMode(v)} /> {v}
            </label>
          ))}
        </EcCond>
        <EcCond label="작업일자">
          <EcDateRange from={{ className: "ec-input w-[145px]", value: from, onChange: (e) => setFrom(e.target.value) }} to={{ className: "ec-input w-[145px]", value: to, onChange: (e) => setTo(e.target.value) }} />
          <span className="ml-[6px]"><EcPeriodPicks labels={HISTORY_PICKS} currentFrom={from} onPick={(r) => { setFrom(r.from); setTo(r.to) }} /></span>
        </EcCond>
        <EcCond label="전표일자"><label className="inline-flex items-center gap-[3px] text-[12.5px]"><input type="checkbox" /> 사용</label></EcCond>
        {['위치', '재고번호', '품목코드'].map((l) => <EcCond key={l} label={l} pick><input className="ec-input w-[200px]" /></EcCond>)}
        <EcCond label="삭제구분">
          {['전체', '미삭제', '삭제'].map((v) => (
            <label key={v} className="inline-flex items-center gap-[3px] mr-[10px] text-[12.5px]">
              <input type="radio" name="wms-hist-del" checked={del === v} onChange={() => setDel(v)} /> {v}
            </label>
          ))}
        </EcCond>
        <EcCond label="작업유형"><select className="ec-input w-[200px]"><option>기타</option></select></EcCond>
        <EcCond label="결재방표시"><input type="checkbox" /></EcCond>
      </ul>
      {shown && <EmptyGrid cols={['작업일자-No.', '전표일자-No.', '작업구분', '적요', '품목명[규격]', '보내는 재고번호', '받는 재고번호', '수량', '작업자명']} />}
    </EcListShell>
  )
}

/** WMS계정선택 E090215 — 연동할 WMS 계정 하나와 [기본값 기본계정]. */
function AccountScreen() {
  return (
    <EcListShell title="WMS계정선택" searchable={false} option={false} actions={[]}>
      <form className="ec-form max-w-[640px]" onSubmit={(e) => { e.preventDefault(); notLinked() }}>
        <ul className="ec-cond">
          <EcCond label="WMS계정">
            <select className="ec-input w-[260px]"><option>WMS 계정 없음</option></select>
          </EcCond>
          <EcCond label="기본값">
            <label className="inline-flex items-center gap-[3px] text-[12.5px]">
              <input type="checkbox" defaultChecked /> 기본계정
            </label>
          </EcCond>
        </ul>
        <div className="flex gap-[4px] mt-[8px]">
          <button type="submit" className="ec-btn ec-btn-primary">저장(F8)</button>
          <button type="reset" className="ec-btn">다시 작성</button>
        </div>
      </form>
    </EcListShell>
  )
}

export default function WmsFramePage({ kind }: { kind: Kind }) {
  switch (kind) {
    case 'account': return <AccountScreen />
    case 'inbound-plan': return <PlanList dir="입고" />
    case 'inbound-status': return <PlanStatus dir="입고" />
    case 'inbound-process': return <ProcessList dir="입고" />
    case 'inbound-slip': return <SlipList dir="입고" />
    case 'outbound-plan': return <PlanList dir="출고" />
    case 'outbound-status': return <PlanStatus dir="출고" />
    case 'outbound-process': return <ProcessList dir="출고" />
    case 'outbound-slip': return <SlipList dir="출고" />
    case 'adjust': return <AdjustScreen />
    case 'stock-status': return <StockStatus />
    case 'history': return <HistoryScreen />
  }
}
