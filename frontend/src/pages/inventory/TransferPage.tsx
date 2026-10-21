import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import CodePickerField from '../../components/CodePickerField'
import { api, extractErrorMessage } from '../../api/client'
import type { Item, StockAdjustment, StockAdjustmentType, StockRow, StockTransfer as TransferRow, Warehouse } from '../../types/api'

/** 창고이동 한 줄. 같은 이동번호의 줄들이 전표 한 장이다(서버 V426) — lineNo 는 전표 안 줄 차례. */
type StockTransfer = TransferRow & { lineNo?: number; createdAt?: string | null; updatedAt?: string | null }
import EcListShell from '../../components/EcListShell'
import { EcCond } from '../../components/EcStatusPanel'
import { useCondPickers } from '../../utils/useCondPickers'
import { useTableSort } from '../../utils/useTableSort'
import Modal from '../../components/Modal'
import { ymd } from '../../components/EcPeriodPicks'
import { dateText } from '../../utils/dateText'
import EcPeriodPicks, { INQUIRY_PICKS, periodOf } from '../../components/EcPeriodPicks'
import EcBarChart from '../../components/EcBarChart'
import NumCheck from '../../components/NumCheck'
import { ecAlert, ecConfirm } from '../../components/EcDialog'
import { SlipHistoryModal, slipHeadLabel } from '../../features/sliphistory/SlipHistoryModal'
import EcGridToolbar, { EcWebUploadButton } from '../../components/EcGridToolbar'
import { useMyItemsPick, MyItemsNote } from '../../components/MyItemsButton'

const today = () => ymd(new Date())
const num = (n: number) => n.toLocaleString('ko-KR')

const TABS = ['창고이동', '자가사용', '불량처리', '대체사용', '폐기', '재고조정'] as const
type Tab = (typeof TABS)[number]
const TAB_TYPE: Record<Exclude<Tab, '창고이동'>, StockAdjustmentType> = {
  자가사용: 'SELF_USE', 불량처리: 'DEFECT', 대체사용: 'SUBSTITUTE', 폐기: 'DISPOSAL', 재고조정: 'ADJUST',
}

/**
 * 재고 I > 기타이동 — 창고이동(출고+입고 원자처리)과
 * 자가사용·불량처리(차감), 재고조정(실사수량과의 차이만큼 증감).
 */
interface CodeRow { id: number; code: string; name: string }

/*
 * 원본 기타이동현황은 <b>금월</b>을 보고 열린다(사본 실측 — 달 스핀박스가 07 하나).
 * 우리는 기간 칸이 <b>아예 없어서</b> 이동·조정이 쌓이면 몇 해치가 한 표에 쏟아졌다.
 */
const initP = periodOf('금월(~오늘)')!

export default function TransferPage() {
  /* 재고조정조회의 [간편재고조정] 이 ?tab=재고조정 으로 연다. */
  const [params] = useSearchParams()
  const [tab, setTab] = useState<Tab>(() => (TABS as readonly string[]).includes(params.get('tab') ?? '') ? params.get('tab') as Tab : '창고이동')
  const [from, setFrom] = useState(initP.from)
  const [to, setTo] = useState(initP.to)
  const [transfers, setTransfers] = useState<StockTransfer[]>([])
  const [adjustments, setAdjustments] = useState<StockAdjustment[]>([])
  const [items, setItems] = useState<Item[]>([])
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [stock, setStock] = useState<StockRow[]>([])
  const [keyword, setKeyword] = useState('')
  const [whCond, setWhCond] = useState('')
  const [projects, setProjects] = useState<CodeRow[]>([])
  const [employees, setEmployees] = useState<CodeRow[]>([])
  /* 담당자는 id 만 저장한다(inventory 는 hr 을 참조할 수 없다) — 이름은 화면이 붙인다. */
  const empName = (id: number | null) => employees.find((e) => e.id === id)?.name ?? ''
  /* 원본 조건 [적요]. 사유는 두 표에 다 찍히는데 검색상자로만 걸렀다 —
     그 상자는 품목명까지 훑어서 적요만으로 좁힐 수가 없었다. */
  const [reasonCond, setReasonCond] = useState('')
  /* 원본 기타이동현황 조건 차례: 창고 · <b>프로젝트</b> · 품목 · <b>담당자</b> · 적요. */
  const [projCond, setProjCond] = useState('')
  const [empCond, setEmpCond] = useState('')
  const pickers = useCondPickers(['warehouses'])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  /* 메뉴 [창고이동입력] 은 ?new=1 로 연다 — 원본은 입력이 따로 있는 화면이라 등록 창을 바로 띄운다. */
  const [showForm, setShowForm] = useState(() => params.get('new') === '1')
  /* 이동번호를 눌러 연 전표(원본 창고이동조회 → 창고이동수정 창). 없으면 새 전표다. */
  const [editSlip, setEditSlip] = useState<StockTransfer[] | null>(null)
  /* 수정 창에서 [복사] 를 누르면 같은 창이 입력 창이 된다 — 제목도 창고이동입력. */
  const [copying, setCopying] = useState(false)
  async function openSlip(no: string) {
    try {
      const r = await api.get<StockTransfer[]>(`/stock-transfers/slips/${encodeURIComponent(no)}`)
      setTab('창고이동'); setEditSlip(r.data); setCopying(false); setShowForm(true)
    } catch (err) {
      void ecAlert(extractErrorMessage(err))
    }
  }
  /*
   * 원본 창고이동조회 머리 탭: 전체 · 결재중 · 미확인 · 확인(2026-10-21 loginaa 실측). 저장한 전표는 곧바로 [확인] 이고,
   * 이 회사는 전표상태관리유형 설정이 꺼져 있어 [확인취소] 가 막힌다 — 그래서 결재중 · 미확인은 늘 비어 있다.
   */
  const [stTab, setStTab] = useState<'전체' | '결재중' | '미확인' | '확인'>('전체')
  /** 원본 창고이동조회 번호 칸 = 체크 칸 — [선택삭제] 가 지울 전표(이동번호). */
  const [picked, setPicked] = useState<Set<string>>(new Set())
  /* 목록 [인쇄] 열 · 수정 창 [저장/전표(F7)] 이 여는 창고이동전표(원본 '기본(수정불가)' 양식). */
  const [printSlip, setPrintSlip] = useState<StockTransfer[] | null>(null)
  async function openPrint(no: string) {
    try {
      setPrintSlip((await api.get<StockTransfer[]>(`/stock-transfers/slips/${encodeURIComponent(no)}`)).data)
    } catch (err) {
      void ecAlert(extractErrorMessage(err))
    }
  }
  /*
   * 수정 창 [이전] · [다음] — 원본은 일자 · 번호 차례로 한 장 앞(이전 = 더 옛 전표) · 뒤(다음 = 더 새 전표)를 연다
   * (실측: 10/21 -3 에서 [다음] → 10/22 -1, [이전] → 10/21 -1). 지금 받아 둔 기간 안에서 움직인다.
   */
  function navSlip(no: string, dir: -1 | 1) {
    const nos = [...new Map(transfers.map((r) => [r.transferNo, r])).values()]
      .sort((a, b) => a.transferDate.localeCompare(b.transferDate) || a.transferNo.localeCompare(b.transferNo))
      .map((r) => r.transferNo)
    const next = nos[nos.indexOf(no) + dir]
    if (next) void openSlip(next)
  }
  /* 같은 화면에서 메뉴를 다시 누르면 다시 그려지지 않는다 — 주소의 new 가 바뀔 때도 연다. */
  useEffect(() => { if (params.get('new') === '1') { setTab('창고이동'); setShowForm(true) } }, [params])

  /*
   * 창고이동은 <b>지울 자리가 아예 없었다.</b> 판매·구매·자재불출은 줄마다 [삭제]가 있는데
   * 이 화면만 없어서, 창고를 잘못 골라 옮기면 반대로 한 번 더 옮기는 수밖에 없었다.
   * 그러면 창고이동조회에 있지도 않은 이동이 두 줄 남는다. 서버가 옮겼던 재고를 되돌린다.
   */
  async function removeTransfer(r: StockTransfer) {
    /* 원본 창고이동수정 창 [삭제] 의 확인 글 그대로 — 전표 한 장(줄 전부)을 지운다. */
    if (!(await ecConfirm('전표를 삭제하겠습니까?\n- 창고이동'))) return
    try {
      await api.delete(`/stock-transfers/slips/${encodeURIComponent(r.transferNo)}`)
      setShowForm(false); setEditSlip(null)
      setOk(`${slipNoText(r.transferDate, r.transferNo)} 삭제 — 옮겼던 재고를 되돌렸습니다.`)
      load()
    } catch (err) {
      void ecAlert(extractErrorMessage(err))
    }
  }

  /*
   * 원본 창고이동조회 [선택삭제](E040502, 2026-10-21 실측: QA 이동 한 장을 체크 → 확인 글 '선택한 전표를 삭제 하겠습니까?'
   * → [확인] 뒤 안내 없이 목록만 다시 그린다). 고른 것이 없으면 셸이 원본 알림을 띄운다(selected).
   */
  async function removePicked() {
    if (!(await ecConfirm('선택한 전표를 삭제 하겠습니까?'))) return
    try {
      for (const no of picked) await api.delete(`/stock-transfers/slips/${encodeURIComponent(no)}`)
    } catch (err) {
      void ecAlert(extractErrorMessage(err))
    }
    setPicked(new Set()); setOk('')
    load()
  }

  /** 재고조정·폐기 등도 지울 자리가 없었다(QA 10회차) — 창고이동과 같이 서버가 바뀐 재고를 되돌린다. */
  async function removeAdjustment(r: { id: number; adjustNo: string; typeName?: string }) {
    if (!(await ecConfirm(`'${r.adjustNo}' 을(를) 삭제할까요? 바뀐 재고도 되돌아갑니다.`))) return
    try {
      await api.delete(`/stock-adjustments/${r.id}`)
      setOk(`${r.adjustNo} 삭제 — 재고를 되돌렸습니다.`)
      load()
    } catch (err) {
      void ecAlert(extractErrorMessage(err))
    }
  }

  async function load() {
    setLoading(true)
    try {
      const [t, a, i, w, s, pj, em] = await Promise.all([
        api.get<StockTransfer[]>('/stock-transfers', { params: { from, to } }),
        api.get<{ rows: StockAdjustment[] }>('/stock-adjustments', { params: { from, to } }),
        api.get<Item[]>('/items'),
        api.get<Warehouse[]>('/warehouses'),
        api.get<StockRow[]>('/stock'),
        api.get<CodeRow[]>('/projects'),
        api.get<CodeRow[]>('/employees'),
      ])
      setTransfers(t.data)
      setAdjustments(a.data.rows)
      setItems(i.data)
      setWarehouses(w.data)
      setStock(s.data)
      setProjects(pj.data)
      setEmployees(em.data)
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  /* 기간이 바뀌면 다시 물어본다 — 예전에는 전 기간을 받아 브라우저에서 걸렀다. */
  useEffect(() => { load() }, [from, to])

  function switchTab(t: Tab) {
    setTab(t)
    setShowForm(false)
    setEditSlip(null)
    setError('')
  }

  /** 저장 결과 안내. 예전엔 창이 닫히고 목록만 다시 떠서 어느 번호로 들어갔는지 안 보였다(QA 10회차). */
  const [ok, setOk] = useState('')
  async function saved(msg: string) {
    setShowForm(false)
    setEditSlip(null)
    setError('')
    /* 창고이동 전표는 원본처럼 말 없이 닫힌다(2026-10-21 실측) — 안내 줄은 조정 계열만 쓴다. */
    setOk(msg)
    await load()
  }

  /*
   * 원본 기타이동현황 조건 차례: <b>창고</b> · 프로젝트 · 품목 · 담당자 · 적요.
   * 창고는 두 표에 다 찍히는데 그것으로 거를 수가 없었다 — 창고이동은 출고·입고
   * <b>어느 쪽이든</b> 걸리게 한다(그 창고가 낀 이동을 보려는 것이므로).
   */
  /**
   * 원본 [데이터 보기형식] · [그래프로 보기] — 조건 판 <b>맨 끝</b>이다(사본 실측:
   * 창고 · 프로젝트 · 품목 · 담당자 · 적요 · 적용양식 · 양식구분 · 데이터 보기형식).
   *
   * <p>이 화면은 탭이 [창고이동]과 조정 계열로 갈린다 — <b>보고 있는 탭의 표</b>를 그린다.
   * 창고이동은 '어디서 어디로', 조정은 품목별이다. 탭마다 표가 다른데 그림만 하나로
   * 그리면 표와 그림이 다른 것을 세게 된다.
   *
   * <p>수량은 <b>절댓값</b>으로 더한다 — 조정은 늘기도 줄기도 해서 부호를 섞으면
   * 서로 지워져 '움직임이 없었다' 로 보인다(재고이동·실사와 같은 함정이다).
   */
  const [view, setView] = useState<'표' | '그래프'>('표')

  const shownTransfers = transfers
    .filter((r) => (!from || r.transferDate >= from) && (!to || r.transferDate <= to))
    .filter((r) => !whCond || String(r.fromWarehouseId) === whCond || String(r.toWarehouseId) === whCond)
    .filter((r) => !projCond || String(r.projectId) === projCond)
    .filter((r) => !empCond || empName(r.employeeId) === empCond)
    .filter((r) => !reasonCond || (r.reason ?? '').includes(reasonCond))
    .filter((r) => !keyword || r.itemName.includes(keyword) || (r.reason ?? '').includes(keyword))
  /*
   * 원본 창고이동조회는 <b>전표 한 장 = 한 줄</b>이다: 이동번호(일자 -No.) · 보내는창고명 · 받는창고명 ·
   * 품목('첫 품목 외 n건') · 수량(줄 합). 서버는 줄마다 주므로 이동번호로 묶는다(조건은 줄에 걸고, 걸린 줄이 있는 전표를 보인다).
   */
  const shownSlips = (() => {
    const m = new Map<string, { first: StockTransfer; count: number; qty: number }>()
    for (const r of shownTransfers) {
      const cur = m.get(r.transferNo)
      if (!cur) m.set(r.transferNo, { first: r, count: 1, qty: Number(r.quantity) })
      else {
        cur.count += 1; cur.qty += Number(r.quantity)
        if ((r.lineNo ?? 1) < (cur.first.lineNo ?? 1)) cur.first = r
      }
    }
    return [...m.values()].map(({ first, count, qty }) => ({
      ...first, quantity: qty,
      itemName: count > 1 ? `${first.itemName} 외 ${count - 1}건` : first.itemName,
    }))
  })()
  const shownAdjustments = adjustments.filter((r) =>
    tab !== '창고이동' && r.type === TAB_TYPE[tab] &&
    (!from || r.adjustDate >= from) && (!to || r.adjustDate <= to) &&
    (!whCond || String(r.warehouseId) === whCond) &&
    (!projCond || String(r.projectId) === projCond) &&
    (!empCond || empName(r.employeeId) === empCond) &&
    (!reasonCond || (r.reason ?? '').includes(reasonCond)) &&
    (!keyword || r.itemName.includes(keyword) || (r.reason ?? '').includes(keyword)))

  /*
   * 두 표 모두 [일자]·[품목명] 머리에 <b>▼ 만 그려 놓고</b> 정렬은 없었다.
   * 탭에 따라 다른 표가 서므로 <b>정렬 상태도 표마다 따로</b> 든다 — 하나로 묶으면
   * 창고이동에서 고른 차례가 재고조정 탭으로 넘어가 엉뚱한 열에 붙는다.
   */
  const transferSort = useTableSort(shownSlips, {
    일자: (r) => r.transferDate,
    품목명: (r) => r.itemName,
  })
  const adjustSort = useTableSort(shownAdjustments, {
    일자: (r) => r.adjustDate,
    품목명: (r) => r.itemName,
  })

  const count = (t: Tab) => (t === '창고이동' ? new Set(transfers.map((r) => r.transferNo)).size : adjustments.filter((r) => r.type === TAB_TYPE[t]).length)

  return (
    <EcListShell
      title="기타이동"
      search={keyword}
      onSearchChange={setKeyword}
      newLabel={showForm ? '입력닫기' : `${tab} 등록(F2)`}
      onNew={() => { setEditSlip(null); setShowForm(true) }}
      actions={[
        { label: '새로고침', onClick: load },
        /* 원본 창고이동조회 버튼줄(2026-10-21 실측): 신규(F2) · Email · 진행상태변경 · 보내기 · 인쇄 · 바코드(품목) · 전자결재 · 선택삭제 · Excel · 이력조회.
           바깥 연동 · 단계가 없는 전표라 Email · 진행상태변경 · 보내기 · 바코드(품목) · 전자결재 · 이력조회 는 모양만. */
        ...(tab === '창고이동' ? [{ label: 'Email' }, { label: '진행상태변경', selected: picked.size }, { label: '보내기' }] : []),
        { label: '인쇄' },
        ...(tab === '창고이동' ? [{ label: '바코드(품목)' }, { label: '전자결재' },
          { label: '선택삭제', selected: picked.size, onClick: () => void removePicked() }] : []),
        { label: 'Excel' },
        ...(tab === '창고이동' ? [{ label: '이력조회' }] : []),
      ]}
    >
      <div className="flex gap-[2px] mb-[8px] border-b border-b-ec-line border-solid">
        {TABS.map((t) => (
          <button key={t} onClick={() => switchTab(t)} className="no-ec" style={{
            padding: '6px 14px', fontSize: 12.5, border: 'none', cursor: 'pointer',
            background: tab === t ? '#fff' : 'transparent', color: tab === t ? 'var(--ec-blue)' : 'var(--ec-label)',
            fontWeight: tab === t ? 700 : 400, borderBottom: tab === t ? '2px solid var(--ec-blue)' : '2px solid transparent',
          }}>{t} ({count(t)})</button>
        ))}
      </div>

      {/* 원본 조건 차례: <b>창고</b> · 프로젝트 · 품목 · 담당자 · 적요 */}
      <ul className="ec-cond" style={{ marginBottom: 8 }}>
        {/* 원본 조건 첫째 <b>[기준일자]</b>(사본 실측). */}
        <EcCond label="기준일자">
          <input type="date" className="ec-input" value={from}
                 onChange={(e) => setFrom(e.target.value)} style={{ width: 140 }} />
          <span className="my-0 mx-[4px] text-ec-hint">~</span>
          <input type="date" className="ec-input" value={to}
                 onChange={(e) => setTo(e.target.value)} style={{ width: 140 }} />
          <span className="ml-[6px]">
            <EcPeriodPicks labels={INQUIRY_PICKS} currentFrom={from}
              onPick={(r) => { setFrom(r.from); setTo(r.to) }} />
          </span>
        </EcCond>
        <EcCond label="창고" pick>
          <CodePickerField label="창고" hideLabel width={170} emptyLabel="전체"
                           value={whCond} onChange={setWhCond} items={pickers.warehouses} />
        </EcCond>
        <EcCond label="프로젝트" pick>
          <CodePickerField label="프로젝트" hideLabel width={170} emptyLabel="전체"
                           value={projCond} onChange={setProjCond}
                           items={projects.map((x) => ({ value: String(x.id), code: x.code, name: x.name }))} />
        </EcCond>
        <EcCond label="담당자" pick>
          <CodePickerField label="담당자" hideLabel width={170} emptyLabel="전체"
                           value={empCond} onChange={setEmpCond}
                           items={employees.map((x) => ({ value: x.name, code: x.code, name: x.name }))} />
        </EcCond>
        {/* 원본 조건 차례의 맨 끝 — [적요] 다음이다(사본 실측). */}
        <EcCond label="적요">
          <input className="ec-input" value={reasonCond} placeholder="적요"
                 onChange={(e) => setReasonCond(e.target.value)} style={{ width: 170 }} />
        </EcCond>
        <EcCond label="데이터 보기형식">
          <div className="ec-pills">
            {(['표', '그래프'] as const).map((v) => (
              <button key={v} type="button" className={`ec-pill no-ec${view === v ? ' active' : ''}`}
                      onClick={() => setView(v)}>{v}</button>
            ))}
          </div>
        </EcCond>
      </ul>

      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
      {ok && <p className="ec-alert ec-alert-success mb-[8px]">{ok}</p>}

      <Modal error={error} open={showForm} title={tab === '창고이동' ? (editSlip && !copying ? '창고이동수정' : '창고이동입력') : '기타이동 등록'}
             onClose={() => { setShowForm(false); setEditSlip(null) }}>{(tab === '창고이동'
        ? <TransferForm key={editSlip?.[0]?.transferNo ?? 'new'} slip={editSlip} onDelete={removeTransfer}
                        onPrint={openPrint} onNav={(dir) => editSlip?.[0] && navSlip(editSlip[0].transferNo, dir)} onCopy={() => setCopying(true)}
                        onClose={() => { setShowForm(false); setEditSlip(null) }}
                        items={items} warehouses={warehouses} stock={stock} projects={projects} employees={employees} onError={setError} onSaved={saved} />
        : <AdjustmentForm type={TAB_TYPE[tab]} label={tab} items={items} warehouses={warehouses} stock={stock} projects={projects} employees={employees} onError={setError} onSaved={saved} />)}</Modal>

      <Modal open={!!printSlip} title="창고이동" onClose={() => setPrintSlip(null)}>
        {printSlip && <SlipPrint slip={printSlip} warehouses={warehouses} items={items} onClose={() => setPrintSlip(null)} />}
      </Modal>

      {tab === '창고이동' && view === '표' && (
        <div className="ec-pills mb-[6px]" role="tablist" aria-label="전표상태">
          {(['전체', '결재중', '미확인', '확인'] as const).map((t) => (
            <button key={t} type="button" role="tab" aria-selected={stTab === t}
                    className={`ec-pill no-ec${stTab === t ? ' active' : ''}`} onClick={() => setStTab(t)}>{t}</button>
          ))}
        </div>
      )}

      {view === '그래프' ? (
        <EcBarChart unit="" emptyText="조회된 이동 내역이 없습니다."
                    rows={(() => {
                      const m = new Map<string, number>()
                      if (tab === '창고이동') {
                        for (const r of shownTransfers) {
                          const k = `${r.fromWarehouseName} → ${r.toWarehouseName}`
                          m.set(k, (m.get(k) ?? 0) + Math.abs(r.quantity))
                        }
                      } else {
                        for (const r of shownAdjustments) {
                          m.set(r.itemName, (m.get(r.itemName) ?? 0) + Math.abs(r.quantityChange))
                        }
                      }
                      return [...m].map(([label, value]) => ({ label, value }))
                    })()} />
      ) : tab === '창고이동' ? (
        <table className="w-full text-left">
          <thead>
            <tr>
              <th className="w-[34px]">
                <NumCheck head no="" label="전체 선택" on={transferSort.sorted.length > 0 && transferSort.sorted.every((r) => picked.has(r.transferNo))}
                          onChange={(v) => setPicked(v ? new Set(transferSort.sorted.map((r) => r.transferNo)) : new Set())} />
              </th>
              <th className="w-[130px] cursor-pointer" onClick={() => transferSort.toggle('일자')}>이동번호 {transferSort.mark('일자')}</th>
              <th className="w-[120px]">보내는창고명</th>
              <th className="w-[120px]">받는창고명</th>
              <th className="cursor-pointer" onClick={() => transferSort.toggle('품목명')}>품목 {transferSort.mark('품목명')}</th>
              <th className="w-[90px] text-right">수량</th>
              <th className="w-[54px] text-center">인쇄</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="ec-empty">불러오는 중…</td></tr>
            ) : shownSlips.length === 0 || stTab === '결재중' || stTab === '미확인' ? (
              <tr><td colSpan={7} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
            ) : transferSort.sorted.map((r, i) => (
              <tr key={r.transferNo}>
                <td className="text-center">
                  <NumCheck no={i + 1} on={picked.has(r.transferNo)}
                            onChange={() => setPicked((s) => { const n = new Set(s); n.has(r.transferNo) ? n.delete(r.transferNo) : n.add(r.transferNo); return n })} />
                </td>
                <td><a className="cursor-pointer" title={r.transferNo} onClick={() => openSlip(r.transferNo)}>{slipNoText(r.transferDate, r.transferNo)}</a></td>
                <td>{r.fromWarehouseName}</td>
                <td>{r.toWarehouseName}</td>
                <td>{r.itemName}</td>
                <td className="text-right">{num(r.quantity)}</td>
                <td className="text-center"><a className="cursor-pointer" onClick={() => openPrint(r.transferNo)}>인쇄</a></td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <table className="w-full text-left">
          <thead>
            <tr>
              <th className="w-[34px]"></th>
              <th className="w-[130px]">전표번호</th>
              <th className="w-[100px] cursor-pointer" onClick={() => adjustSort.toggle('일자')}>일자 {adjustSort.mark('일자')}</th>
              <th className="cursor-pointer" onClick={() => adjustSort.toggle('품목명')}>품목명 {adjustSort.mark('품목명')}</th>
              <th className="w-[120px]">창고</th>
              <th className="w-[90px] text-right">처리전</th>
              <th className="w-[90px] text-right">증감</th>
              <th className="w-[90px] text-right">처리후</th>
              <th>사유</th>
              <th className="w-[60px] text-center">삭제</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={10} className="ec-empty">불러오는 중…</td></tr>
            ) : shownAdjustments.length === 0 ? (
              <tr><td colSpan={10} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
            ) : adjustSort.sorted.map((r, i) => (
              <tr key={r.id}>
                <td className="text-center text-ec-hint">{i + 1}</td>
                <td>{r.adjustNo}</td>
                <td>{dateText(r.adjustDate)}</td>
                <td>{r.itemName}</td>
                <td>{r.warehouseName}</td>
                <td className="text-right text-ec-hint">{num(r.beforeQty)}</td>
                <td style={{ textAlign: 'right', fontWeight: 700, color: r.quantityChange < 0 ? 'var(--ec-danger)' : 'var(--ec-success)' }}>
                  {r.quantityChange > 0 ? '+' : ''}{num(r.quantityChange)}
                </td>
                <td className="text-right font-semibold">{num(r.afterQty)} {r.unit}</td>
                <td className="text-ec-label">{r.reason ?? ''}</td>
                <td className="text-center">
                  <button onClick={() => removeAdjustment(r)} style={{ color: 'var(--ec-danger)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12 }}>삭제</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </EcListShell>
  )
}

/** 원본 이동번호 꼴 '2026/10/21 -2' — 우리 이동번호 TR-20261021-0002 의 날짜와 일련번호. */
function slipNoText(date: string, no: string) {
  const seq = Number(no.split('-')[2] ?? '')
  return `${date.replaceAll('-', '/')} -${Number.isFinite(seq) && seq > 0 ? seq : no}`
}

interface SlipLine { itemId: string; quantity: string; reason: string }
const blankLine = (): SlipLine => ({ itemId: '', quantity: '', reason: '' })

/**
 * 창고이동입력 / 창고이동수정 (원본 E040501). 머리: 일자 · 담당자 · 보내는창고 · 받는창고 · 프로젝트,
 * 줄: 품목코드 · 품목명 · 수량 · 적요 — 줄 수는 늘릴 수 있고 빈 줄은 저장하지 않는다.
 * 예전에는 품목 하나에 한 건이라, 다섯 품목을 옮기면 이동번호가 다섯 개 생겼다.
 */
function TransferForm({ slip, onDelete, onPrint, onNav, onCopy, onClose, items, warehouses, stock, projects, employees, onError, onSaved }: {
  slip: StockTransfer[] | null; onDelete: (r: StockTransfer) => void
  onPrint: (transferNo: string) => void; onNav: (dir: -1 | 1) => void; onCopy: () => void; onClose: () => void
  items: Item[]; warehouses: Warehouse[]; stock: StockRow[]
  projects: CodeRow[]; employees: CodeRow[]
  onError: (m: string) => void; onSaved: (msg: string) => void
}) {
  /* [복사] — 원본은 같은 머리 · 줄을 든 채 입력 창(저장 · 저장/전표 · 다시 작성 · 닫기)으로 바뀐다. 저장하면 새 번호다. */
  const [copied, setCopied] = useState(false)
  const head = copied ? undefined : slip?.[0]
  const [showHistory, setShowHistory] = useState(false)
  const [form, setForm] = useState({
    transferDate: head?.transferDate ?? today(),
    projectId: head?.projectId ? String(head.projectId) : '',
    employeeId: head?.employeeId ? String(head.employeeId) : '',
    fromWarehouseId: head ? String(head.fromWarehouseId) : '',
    toWarehouseId: head ? String(head.toWarehouseId) : '',
  })
  const [lines, setLines] = useState<SlipLine[]>(() => {
    const ls = (slip ?? []).map((r) => ({ itemId: String(r.itemId), quantity: String(r.quantity), reason: r.reason ?? '' }))
    while (ls.length < 5) ls.push(blankLine())
    return ls
  })
  const tableRef = useRef<HTMLTableElement>(null)
  const myItems = useMyItemsPick((picked) => setLines((ls) => {
    const kept = ls.filter((l) => l.itemId || l.quantity)
    return [...kept, ...picked.map((m) => ({ ...blankLine(), itemId: String(m.itemId) })), blankLine()]
  }))
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }))
  const setLine = (i: number, k: keyof SlipLine, v: string) =>
    setLines((ls) => ls.map((l, j) => (j === i ? { ...l, [k]: v } : l)))
  const itemOf = (id: string) => items.find((it) => String(it.id) === id)
  const filled = lines.filter((l) => l.itemId || l.quantity)
  const total = filled.reduce((a, l) => a + (Number(l.quantity) || 0), 0)
  const whItems = warehouses.map((w) => ({ value: String(w.id), code: w.code, name: w.name }))

  function reset() {
    setForm({ transferDate: today(), projectId: '', employeeId: '', fromWarehouseId: form.fromWarehouseId, toWarehouseId: form.toWarehouseId })
    setLines(Array.from({ length: 5 }, blankLine))
  }

  async function submit(andPrint = false) {
    onError('')
    if (!form.fromWarehouseId) return onError('보내는창고를 선택하세요.')
    if (!form.toWarehouseId) return onError('받는창고를 선택하세요.')
    if (form.fromWarehouseId === form.toWarehouseId) return onError('보내는창고와 받는창고가 같을 수 없습니다.')
    if (filled.length === 0) return onError('품목을 한 줄 이상 입력하세요.')
    for (const [i, l] of filled.entries()) {
      if (!l.itemId) return onError(`${i + 1}번째 줄 품목을 선택하세요.`)
      if (!l.quantity || Number(l.quantity) <= 0) return onError(`${i + 1}번째 줄 수량을 입력하세요.`)
    }
    const body = {
      transferDate: form.transferDate,
      fromWarehouseId: Number(form.fromWarehouseId),
      toWarehouseId: Number(form.toWarehouseId),
      projectId: form.projectId ? Number(form.projectId) : undefined,
      employeeId: form.employeeId ? Number(form.employeeId) : undefined,
      lines: filled.map((l) => ({ itemId: Number(l.itemId), quantity: Number(l.quantity), reason: l.reason || undefined })),
    }
    try {
      const res = head
        ? await api.put<StockTransfer[]>(`/stock-transfers/slips/${encodeURIComponent(head.transferNo)}`, body)
        : await api.post<StockTransfer[]>('/stock-transfers/slips', body)
      const r = res.data[0]
      if (andPrint) onPrint(r.transferNo)
      /* 원본 창고이동 저장은 말 없이 창이 닫힌다(2026-10-21 실측, plans 재고1 창고이동 ⑤). */
      onSaved('')
    } catch (err) {
      onError(extractErrorMessage(err))
    }
  }

  return (
    <div className="border border-ec-line border-solid bg-white p-[14px] mb-[8px]">
      {head && (
        <div className="flex justify-end mb-[6px]">
          {/* 원본 창고이동수정 창 머리 오른쪽. 이 회사는 전표상태관리유형 설정으로 막혀 원본도 이 글만 띄운다(2026-10-21 실측). */}
          <button type="button" className="ec-btn ec-btn-sm"
                  onClick={() => void ecAlert('권한이 없습니다. 마스터에게 문의 바랍니다. - 창고이동\n(전표상태관리유형 설정으로 인해 전표상태를 변경할 수 없습니다. ※ Self-Customizing > 환경설정 > 기능설정 > [공통]탭 > 전표상태관리유형)')}>확인취소</button>
        </div>
      )}
      <div className="flex gap-[12px] flex-wrap items-end mb-[10px]">
        <Field label="일자">
          <input className="ec-input" type="date" value={form.transferDate} onChange={(e) => set('transferDate', e.target.value)} style={{ width: 140 }} />
        </Field>
        <Field label="담당자">
          <CodePickerField label="담당자" hideLabel width={150} placeholder="담당자" emptyLabel="선택 해제"
                           value={form.employeeId} onChange={(v) => set('employeeId', v)}
                           items={employees.map((x) => ({ value: String(x.id), code: x.code, name: x.name }))} />
        </Field>
        <Field label="보내는창고">
          <CodePickerField pair label="보내는창고" hideLabel width={170} placeholder="보내는창고" emptyLabel="선택 해제"
                           value={form.fromWarehouseId} onChange={(v) => set('fromWarehouseId', v)} items={whItems} />
        </Field>
        <Field label="받는창고">
          <CodePickerField pair label="받는창고" hideLabel width={170} placeholder="받는창고" emptyLabel="선택 해제"
                           value={form.toWarehouseId} onChange={(v) => set('toWarehouseId', v)} items={whItems} />
        </Field>
        <Field label="프로젝트">
          <CodePickerField label="프로젝트" hideLabel width={160} placeholder="프로젝트" emptyLabel="선택 해제"
                           value={form.projectId} onChange={(v) => set('projectId', v)}
                           items={projects.map((x) => ({ value: String(x.id), code: x.code, name: x.name }))} />
        </Field>
      </div>
      {/* 원본 창고이동입력 도구줄(2026-10-21 실측): 찾기(F3) · 정렬 · My품목 · 주문 · 구매 · 생산 · 발주요청 · 재고불러오기 · 바코드 · 전표 바코드 · 검증 · 전표불러오기 */}
      <EcGridToolbar tableRef={tableRef} slipKinds={['주문', '구매', '생산', '발주요청']} onMyItems={myItems.pick} myItemsBusy={myItems.busy}>
        <MyItemsNote note={myItems.note} />
      </EcGridToolbar>
      <table ref={tableRef} className="w-full text-left">
        <thead>
          <tr>
            <th className="w-[34px]"></th>
            <th className="w-[240px]">품목코드</th>
            <th>품목명</th>
            <th className="w-[100px] text-right">수량</th>
            <th className="w-[110px] text-right">보내는창고 재고</th>
            <th>적요</th>
            <th className="w-[110px]">새로운 항목 추가</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l, i) => {
            const it = itemOf(l.itemId)
            const have = l.itemId && form.fromWarehouseId
              ? stock.find((x) => x.itemId === Number(l.itemId) && x.warehouseId === Number(form.fromWarehouseId))?.quantity ?? 0
              : null
            return (
              <tr key={i} data-line={i + 1}>
                <td className="text-center text-ec-hint">{i + 1}</td>
                <td>
                  <CodePickerField pair label="품목" hideLabel width={220} placeholder="품목코드" emptyLabel="선택 해제"
                                   value={l.itemId} onChange={(v) => setLine(i, 'itemId', v)}
                                   items={items.map((x) => ({ value: String(x.id), code: x.code, name: x.name, alias: x.searchKeyword, sub: x.spec }))} />
                </td>
                <td>{it ? `${it.name}${it.spec ? ` [${it.spec}]` : ''}` : ''}</td>
                <td>
                  <input className="ec-input text-right" type="number" step="any" aria-label={`${i + 1}번째 줄 수량`}
                         value={l.quantity} onChange={(e) => setLine(i, 'quantity', e.target.value)} style={{ width: 90 }} />
                </td>
                <td className="text-right text-ec-hint">{have === null ? '' : num(have)}</td>
                <td>
                  <input className="ec-input" aria-label={`${i + 1}번째 줄 적요`} value={l.reason}
                         onChange={(e) => setLine(i, 'reason', e.target.value)} style={{ width: '100%' }} />
                </td>
                <td />
              </tr>
            )
          })}
          <tr>
            <td colSpan={3} className="text-ec-hint">
              <button type="button" className="ec-btn ec-btn-sm" onClick={() => setLines((ls) => [...ls, blankLine()])}>줄 추가</button>
            </td>
            <td className="text-right font-semibold">{num(total)}</td>
            <td colSpan={3}></td>
          </tr>
        </tbody>
      </table>
      <EcWebUploadButton />
      {/* 원본 버튼 줄 — 수정: 저장(F8) · 저장/전표(F7) · 복사 · 이전 · 다음 · 닫기 · 삭제 · 보내기 · H / 입력: 저장(F8) · 저장/전표(F7) · 다시 작성 · 닫기 */}
      <div className="flex gap-[4px] mt-[10px] flex-wrap">
        <button className="ec-btn ec-btn-primary" onClick={() => submit()}>저장(F8)</button>
        <button className="ec-btn" onClick={() => submit(true)}>저장/전표(F7)</button>
        {head ? (
          <>
            <button className="ec-btn" onClick={() => { setCopied(true); onCopy() }}>복사</button>
            <button className="ec-btn" onClick={() => onNav(-1)}>이전</button>
            <button className="ec-btn" onClick={() => onNav(1)}>다음</button>
            <button className="ec-btn" onClick={onClose}>닫기</button>
            <button className="ec-btn" onClick={() => onDelete(head)}>삭제</button>
            {/* 바깥 연동(메일 · 메신저로 보내기) — 모양만. */}
            <button className="ec-btn" title="보내기 — 바깥 연동은 아직 없습니다">보내기</button>
            <button className="ec-btn" onClick={() => setShowHistory(true)}>H</button>
          </>
        ) : (
          <>
            <button className="ec-btn" onClick={reset}>다시 작성</button>
            <button className="ec-btn" onClick={onClose}>닫기</button>
          </>
        )}
      </div>
      {/* [H] — 서버가 적은 작업 이력(StockTransferService.HISTORY_TARGET, 전표번호로 연다). */}
      {showHistory && head && (
        <SlipHistoryModal target="STOCK_TRANSFER" lastUpdate docNo={head.transferNo} head={slipHeadLabel(head.transferDate, head.transferNo)}
                          onClose={() => setShowHistory(false)} />
      )}
    </div>
  )
}

/**
 * 창고이동전표(원본 [인쇄] · [저장/전표(F7)] 의 '기본(수정불가)' 양식): 전표번호 · [1 / 1] · 출고처 · DATE · 입고처,
 * 순번 · 품목코드 · 품목명[규격명] · 수량 · 적요, 수량 합 · 인수 인. 버튼 인쇄 · 닫기(Email · Excel 은 바깥 연동 · 파일이라 뺌).
 */
function SlipPrint({ slip, warehouses, items, onClose }: { slip: StockTransfer[]; warehouses: Warehouse[]; items: Item[]; onClose: () => void }) {
  const h = slip[0]
  const whText = (id: number, name: string) => `${name}(${warehouses.find((w) => w.id === id)?.code ?? ''})`
  const total = slip.reduce((a, r) => a + Number(r.quantity), 0)
  const fix2 = (n: number) => n.toLocaleString('ko-KR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return (
    <div>
      <div className="text-center font-bold text-[18px] mb-[8px]">창고이동전표</div>
      <table className="w-full text-left mb-[6px]">
        <tbody>
          <tr><th className="w-[90px]">전표번호</th><td>{slipNoText(h.transferDate, h.transferNo)} [ 1 / 1 ]</td><th className="w-[70px]">DATE</th><td>{h.transferDate.replaceAll('-', '. ')}</td></tr>
          <tr><th>출고처</th><td>{whText(h.fromWarehouseId, h.fromWarehouseName)}</td><th>입고처</th><td>{whText(h.toWarehouseId, h.toWarehouseName)}</td></tr>
        </tbody>
      </table>
      <table className="w-full text-left">
        <thead><tr><th className="w-[44px] text-center">순번</th><th className="w-[110px]">품목코드</th><th>품목명[규격명]</th><th className="w-[90px] text-right">수량</th><th>적요</th></tr></thead>
        <tbody>
          {slip.map((r, i) => {
            const spec = items.find((x) => x.id === r.itemId)?.spec
            return (
              <tr key={r.id}>
                <td className="text-center">{i + 1}</td><td>{r.itemCode}</td>
                <td>{r.itemName}{spec ? ` [${spec}]` : ''}</td>
                <td className="text-right">{fix2(Number(r.quantity))}</td><td>{r.reason ?? ''}</td>
              </tr>
            )
          })}
          <tr><th colSpan={3} className="text-right">수량</th><td className="text-right font-semibold">{fix2(total)}</td><td>인수 <span className="ml-[24px]">인</span></td></tr>
        </tbody>
      </table>
      <div className="flex gap-[4px] mt-[10px]">
        <button className="ec-btn ec-btn-primary" onClick={() => window.print()}>인쇄</button>
        <button className="ec-btn" onClick={onClose}>닫기</button>
      </div>
    </div>
  )
}

function AdjustmentForm({ type, label, items, warehouses, stock, projects, employees, onError, onSaved }: {
  type: StockAdjustmentType; label: string
  items: Item[]; warehouses: Warehouse[]; stock: StockRow[]
  projects: CodeRow[]; employees: CodeRow[]
  onError: (m: string) => void; onSaved: (msg: string) => void
}) {
  const [form, setForm] = useState({
    adjustDate: today(), itemId: '', quantity: '', actualQty: '', reason: '',
    /* 원본 조건의 [프로젝트]·[담당자]. 창고이동과 같은 까닭이다. */
    projectId: '', employeeId: '',
    warehouseId: warehouses[0] ? String(warehouses[0].id) : '',
  })
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }))

  const isAdjust = type === 'ADJUST'
  /*
   * 지난 날짜 실사는 <b>그날 재고</b>와 비교한다 — 서버가 그렇게 조정한다(QA 55회차). 미리보기도 같은 수를 본다.
   * 오늘이면 받아 둔 현재고 그대로.
   */
  const past = isAdjust && form.adjustDate !== '' && form.adjustDate < today()
  const [asOfStock, setAsOfStock] = useState<StockRow[] | null>(null)
  useEffect(() => {
    if (!past) { setAsOfStock(null); return }
    let alive = true
    api.get<StockRow[]>('/stock', { params: { asOf: form.adjustDate } })
      .then((r) => { if (alive) setAsOfStock(r.data) })
      .catch(() => { if (alive) setAsOfStock(null) })
    return () => { alive = false }
  }, [past, form.adjustDate])

  const current = useMemo(() => {
    if (!form.itemId || !form.warehouseId) return null
    const src = past ? asOfStock : stock
    if (!src) return null
    const row = src.find((s) => s.itemId === Number(form.itemId) && s.warehouseId === Number(form.warehouseId))
    return row ? row.quantity : 0
  }, [form.itemId, form.warehouseId, stock, past, asOfStock])

  const diff = isAdjust && current !== null && form.actualQty !== '' ? Number(form.actualQty) - current : null

  async function submit() {
    onError('')
    if (!form.itemId) return onError('품목을 선택하세요.')
    if (!form.warehouseId) return onError('창고를 선택하세요.')
    if (isAdjust) {
      if (form.actualQty === '' || Number(form.actualQty) < 0) return onError('실사수량을 입력하세요.')
    } else if (!form.quantity || Number(form.quantity) <= 0) {
      return onError('수량을 입력하세요.')
    }
    try {
      const res = await api.post<{ adjustNo: string; typeName: string; itemName: string; warehouseName: string }>('/stock-adjustments', {
        type,
        itemId: Number(form.itemId),
        warehouseId: Number(form.warehouseId),
        quantity: isAdjust ? undefined : Number(form.quantity),
        actualQty: isAdjust ? Number(form.actualQty) : undefined,
        adjustDate: form.adjustDate,
        projectId: form.projectId ? Number(form.projectId) : undefined,
        employeeId: form.employeeId ? Number(form.employeeId) : undefined,
        reason: form.reason || undefined,
      })
      const r = res.data
      onSaved(`${r.adjustNo} ${r.typeName} 완료 · ${r.itemName} (${r.warehouseName})`)
    } catch (err) {
      onError(extractErrorMessage(err))
    }
  }

  return (
    <div className="border border-ec-line border-solid bg-white p-[14px] mb-[8px]">
      <div className="text-[13px] font-extrabold text-ec-navy mb-[10px]">{label} 등록</div>
      <div className="flex gap-[12px] flex-wrap items-end">
        <Field label="일자">
          <input className="ec-input" type="date" value={form.adjustDate} onChange={(e) => set('adjustDate', e.target.value)} style={{ width: 140 }} />
        </Field>
        <Field label="품목 *">
          <CodePickerField label="품목" hideLabel width={220} placeholder="선택하세요" emptyLabel="선택 해제"
                           value={form.itemId} onChange={(v) => set('itemId', v)}
                           items={items.map((it) => ({ value: String(it.id), code: it.code, name: it.name, alias: it.searchKeyword, sub: it.spec }))} />
        </Field>
        <Field label="창고 *">
          <select className="ec-input" value={form.warehouseId} onChange={(e) => set('warehouseId', e.target.value)} style={{ width: 150 }}>
            {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
        </Field>
        <Field label={past ? `${form.adjustDate} 재고` : '현재고'}>
          <div className="ec-input" style={{ width: 90, textAlign: 'right', background: 'var(--ec-bg-page)', color: 'var(--ec-label)', lineHeight: '22px' }}>
            {current === null ? '-' : num(current)}
          </div>
        </Field>
        {isAdjust ? (
          <Field label="실사수량 *">
            <input className="ec-input" type="number" step="any" min="0" value={form.actualQty} onChange={(e) => set('actualQty', e.target.value)} style={{ width: 100, textAlign: 'right' }} />
          </Field>
        ) : (
          <Field label={`${label} 수량 *`}>
            <input className="ec-input" type="number" step="any" value={form.quantity} onChange={(e) => set('quantity', e.target.value)} style={{ width: 100, textAlign: 'right' }} />
          </Field>
        )}
        {isAdjust && diff !== null && (
          <div style={{ fontSize: 12.5, paddingBottom: 5, color: diff === 0 ? 'var(--ec-text-hint)' : diff < 0 ? 'var(--ec-danger)' : 'var(--ec-success)', fontWeight: 700 }}>
            증감 {diff > 0 ? '+' : ''}{num(diff)}
          </div>
        )}
        <Field label="프로젝트">
          <CodePickerField label="프로젝트" hideLabel width={160} placeholder="선택 안 함" emptyLabel="선택 해제"
                           value={form.projectId} onChange={(v) => set('projectId', v)}
                           items={projects.map((x) => ({ value: String(x.id), code: x.code, name: x.name }))} />
        </Field>
        <Field label="담당자">
          <CodePickerField label="담당자" hideLabel width={150} placeholder="선택 안 함" emptyLabel="선택 해제"
                           value={form.employeeId} onChange={(v) => set('employeeId', v)}
                           items={employees.map((x) => ({ value: String(x.id), code: x.code, name: x.name }))} />
        </Field>
        <Field label="사유">
          <input className="ec-input" value={form.reason} onChange={(e) => set('reason', e.target.value)} style={{ width: 200 }} />
        </Field>
        <button className="ec-btn ec-btn-primary" onClick={submit}>{label} 처리</button>
      </div>
      <div className="mt-[8px] text-[11.5px] text-ec-hint">
        {isAdjust
          ? '※ 실사수량과 그 일자 재고의 차이만큼 재고를 증감합니다(수불부에 조정으로 기록). 지난 날짜면 그 뒤 거래는 그대로 둡니다.'
          : `※ 입력 수량만큼 재고를 차감합니다. 현재고보다 많으면 ${label}가 거절됩니다.`}
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="text-[12.5px]">
      <div className="text-ec-label mb-[3px]">{label}</div>
      {children}
    </label>
  )
}
