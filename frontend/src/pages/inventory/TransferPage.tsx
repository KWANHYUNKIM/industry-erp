import { useEffect, useMemo, useState } from 'react'
import CodePickerField from '../../components/CodePickerField'
import { api, extractErrorMessage } from '../../api/client'
import type { Item, StockAdjustment, StockAdjustmentType, StockRow, StockTransfer, Warehouse } from '../../types/api'
import EcListShell from '../../components/EcListShell'
import { EcCond } from '../../components/EcStatusPanel'
import { useCondPickers } from '../../utils/useCondPickers'
import { useTableSort } from '../../utils/useTableSort'
import Modal from '../../components/Modal'
import { ymd } from '../../components/EcPeriodPicks'
import { dateText } from '../../utils/dateText'
import EcPeriodPicks, { INQUIRY_PICKS, periodOf } from '../../components/EcPeriodPicks'
import EcBarChart from '../../components/EcBarChart'

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
  const [tab, setTab] = useState<Tab>('창고이동')
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
  const [showForm, setShowForm] = useState(false)

  /*
   * 창고이동은 <b>지울 자리가 아예 없었다.</b> 판매·구매·자재불출은 줄마다 [삭제]가 있는데
   * 이 화면만 없어서, 창고를 잘못 골라 옮기면 반대로 한 번 더 옮기는 수밖에 없었다.
   * 그러면 창고이동조회에 있지도 않은 이동이 두 줄 남는다. 서버가 옮겼던 재고를 되돌린다.
   */
  async function removeTransfer(r: StockTransfer) {
    if (!confirm(`창고이동 '${r.transferNo}' 을(를) 삭제할까요? 옮겼던 재고도 되돌아갑니다.`)) return
    try {
      await api.delete(`/stock-transfers/${r.id}`)
      load()
    } catch (err) {
      alert(extractErrorMessage(err))
    }
  }

  /** 재고조정·폐기 등도 지울 자리가 없었다(QA 10회차) — 창고이동과 같이 서버가 바뀐 재고를 되돌린다. */
  async function removeAdjustment(r: { id: number; adjustNo: string; typeName?: string }) {
    if (!confirm(`'${r.adjustNo}' 을(를) 삭제할까요? 바뀐 재고도 되돌아갑니다.`)) return
    try {
      await api.delete(`/stock-adjustments/${r.id}`)
      setOk(`${r.adjustNo} 삭제 — 재고를 되돌렸습니다.`)
      load()
    } catch (err) {
      alert(extractErrorMessage(err))
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
    setError('')
  }

  /** 저장 결과 안내. 예전엔 창이 닫히고 목록만 다시 떠서 어느 번호로 들어갔는지 안 보였다(QA 10회차). */
  const [ok, setOk] = useState('')
  async function saved(msg: string) {
    setShowForm(false)
    setError('')
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
  const transferSort = useTableSort(shownTransfers, {
    일자: (r) => r.transferDate,
    품목명: (r) => r.itemName,
  })
  const adjustSort = useTableSort(shownAdjustments, {
    일자: (r) => r.adjustDate,
    품목명: (r) => r.itemName,
  })

  const count = (t: Tab) => (t === '창고이동' ? transfers.length : adjustments.filter((r) => r.type === TAB_TYPE[t]).length)

  return (
    <EcListShell
      title="기타이동"
      search={keyword}
      onSearchChange={setKeyword}
      newLabel={showForm ? '입력닫기' : `${tab} 등록(F2)`}
      onNew={() => setShowForm(true)}
      actions={[{ label: '새로고침', onClick: load }, { label: '인쇄' }, { label: 'Excel' }]}
    >
      <div style={{ display: 'flex', gap: 2, marginBottom: 8, borderBottom: '1px solid var(--ec-border)' }}>
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
          <span style={{ margin: '0 4px', color: 'var(--ec-text-hint)' }}>~</span>
          <input type="date" className="ec-input" value={to}
                 onChange={(e) => setTo(e.target.value)} style={{ width: 140 }} />
          <span style={{ marginLeft: 6 }}>
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

      {error && <p style={{ marginBottom: 8, background: 'var(--ec-danger-bg)', color: 'var(--ec-danger)', padding: '6px 10px', fontSize: 12.5, borderRadius: 3 }}>{error}</p>}
      {ok && <p style={{ marginBottom: 8, background: 'var(--ec-success-bg)', color: 'var(--ec-success)', padding: '6px 10px', fontSize: 12.5, borderRadius: 3 }}>{ok}</p>}

      <Modal error={error} open={showForm} title="기타이동 등록" onClose={() => setShowForm(false)}>{(tab === '창고이동'
        ? <TransferForm items={items} warehouses={warehouses} stock={stock} projects={projects} employees={employees} onError={setError} onSaved={saved} />
        : <AdjustmentForm type={TAB_TYPE[tab]} label={tab} items={items} warehouses={warehouses} stock={stock} projects={projects} employees={employees} onError={setError} onSaved={saved} />)}</Modal>

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
              <th style={{ width: 34 }}></th>
              <th style={{ width: 130 }}>이동번호</th>
              <th style={{ width: 100, cursor: 'pointer' }} onClick={() => transferSort.toggle('일자')}>일자 {transferSort.mark('일자')}</th>
              <th style={{ cursor: 'pointer' }} onClick={() => transferSort.toggle('품목명')}>품목명 {transferSort.mark('품목명')}</th>
              <th style={{ width: 120 }}>출고창고</th>
              <th style={{ width: 120 }}>입고창고</th>
              <th style={{ width: 90, textAlign: 'right' }}>수량</th>
              <th>사유</th>
              <th style={{ width: 54 }}></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={9} style={{ textAlign: 'center', color: 'var(--ec-text-hint)', padding: 20 }}>불러오는 중…</td></tr>
            ) : shownTransfers.length === 0 ? (
              <tr><td colSpan={9} style={{ textAlign: 'center', color: 'var(--ec-text-hint)', padding: 20 }}>등록된 데이터가 없습니다.</td></tr>
            ) : transferSort.sorted.map((r, i) => (
              <tr key={r.id}>
                <td style={{ textAlign: 'center', color: 'var(--ec-text-hint)' }}>{i + 1}</td>
                <td style={{ fontFamily: 'monospace' }}>{r.transferNo}</td>
                <td>{dateText(r.transferDate)}</td>
                <td>{r.itemName}</td>
                <td>{r.fromWarehouseName}</td>
                <td style={{ color: 'var(--ec-blue)' }}>{r.toWarehouseName}</td>
                <td style={{ textAlign: 'right', fontWeight: 600 }}>{num(r.quantity)} {r.unit}</td>
                <td style={{ color: 'var(--ec-label)' }}>{r.reason ?? ''}</td>
                <td style={{ textAlign: 'center' }}>
                  <button onClick={() => removeTransfer(r)} style={{ color: 'var(--ec-danger)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12 }}>삭제</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <table className="w-full text-left">
          <thead>
            <tr>
              <th style={{ width: 34 }}></th>
              <th style={{ width: 130 }}>전표번호</th>
              <th style={{ width: 100, cursor: 'pointer' }} onClick={() => adjustSort.toggle('일자')}>일자 {adjustSort.mark('일자')}</th>
              <th style={{ cursor: 'pointer' }} onClick={() => adjustSort.toggle('품목명')}>품목명 {adjustSort.mark('품목명')}</th>
              <th style={{ width: 120 }}>창고</th>
              <th style={{ width: 90, textAlign: 'right' }}>처리전</th>
              <th style={{ width: 90, textAlign: 'right' }}>증감</th>
              <th style={{ width: 90, textAlign: 'right' }}>처리후</th>
              <th>사유</th>
              <th style={{ width: 60, textAlign: 'center' }}>삭제</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={10} style={{ textAlign: 'center', color: 'var(--ec-text-hint)', padding: 20 }}>불러오는 중…</td></tr>
            ) : shownAdjustments.length === 0 ? (
              <tr><td colSpan={10} style={{ textAlign: 'center', color: 'var(--ec-text-hint)', padding: 20 }}>등록된 데이터가 없습니다.</td></tr>
            ) : adjustSort.sorted.map((r, i) => (
              <tr key={r.id}>
                <td style={{ textAlign: 'center', color: 'var(--ec-text-hint)' }}>{i + 1}</td>
                <td style={{ fontFamily: 'monospace' }}>{r.adjustNo}</td>
                <td>{dateText(r.adjustDate)}</td>
                <td>{r.itemName}</td>
                <td>{r.warehouseName}</td>
                <td style={{ textAlign: 'right', color: 'var(--ec-text-hint)' }}>{num(r.beforeQty)}</td>
                <td style={{ textAlign: 'right', fontWeight: 700, color: r.quantityChange < 0 ? 'var(--ec-danger)' : 'var(--ec-success)' }}>
                  {r.quantityChange > 0 ? '+' : ''}{num(r.quantityChange)}
                </td>
                <td style={{ textAlign: 'right', fontWeight: 600 }}>{num(r.afterQty)} {r.unit}</td>
                <td style={{ color: 'var(--ec-label)' }}>{r.reason ?? ''}</td>
                <td style={{ textAlign: 'center' }}>
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

function TransferForm({ items, warehouses, stock, projects, employees, onError, onSaved }: {
  items: Item[]; warehouses: Warehouse[]; stock: StockRow[]
  projects: CodeRow[]; employees: CodeRow[]
  onError: (m: string) => void; onSaved: (msg: string) => void
}) {
  const [form, setForm] = useState({
    transferDate: today(), itemId: '', quantity: '', reason: '',
    /* 원본 조건의 [프로젝트]·[담당자]. 여태 어디로·누가 옮겼는지를 [사유]에 손으로 적었다. */
    projectId: '', employeeId: '',
    fromWarehouseId: warehouses[0] ? String(warehouses[0].id) : '',
    toWarehouseId: warehouses[1] ? String(warehouses[1].id) : warehouses[0] ? String(warehouses[0].id) : '',
  })
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }))

  async function submit() {
    onError('')
    if (!form.itemId) return onError('품목을 선택하세요.')
    if (form.fromWarehouseId === form.toWarehouseId) return onError('출고창고와 입고창고가 같을 수 없습니다.')
    if (!form.quantity || Number(form.quantity) <= 0) return onError('이동수량을 입력하세요.')
    try {
      const res = await api.post<{ transferNo: string; itemName: string; quantity: number; fromWarehouseName: string; toWarehouseName: string }>('/stock-transfers', {
        itemId: Number(form.itemId),
        fromWarehouseId: Number(form.fromWarehouseId),
        toWarehouseId: Number(form.toWarehouseId),
        quantity: Number(form.quantity),
        transferDate: form.transferDate,
        projectId: form.projectId ? Number(form.projectId) : undefined,
        employeeId: form.employeeId ? Number(form.employeeId) : undefined,
        reason: form.reason || undefined,
      })
      const r = res.data
      onSaved(`${r.transferNo} 이동 완료 · ${r.itemName} ${Number(r.quantity).toLocaleString()} (${r.fromWarehouseName} → ${r.toWarehouseName})`)
    } catch (err) {
      onError(extractErrorMessage(err))
    }
  }

  return (
    <div style={{ border: '1px solid var(--ec-border)', background: '#fff', padding: 14, marginBottom: 8 }}>
      <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--ec-blue-dark)', marginBottom: 10 }}>창고 간 이동 등록</div>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <Field label="일자">
          <input className="ec-input" type="date" value={form.transferDate} onChange={(e) => set('transferDate', e.target.value)} style={{ width: 140 }} />
        </Field>
        <Field label="품목 *">
          <CodePickerField label="품목" hideLabel width={220} placeholder="선택하세요" emptyLabel="선택 해제"
                           value={form.itemId} onChange={(v) => set('itemId', v)}
                           items={items.map((it) => ({ value: String(it.id), code: it.code, name: it.name, alias: it.searchKeyword, sub: it.spec }))} />
        </Field>
        <Field label="출고창고 *">
          <select className="ec-input" value={form.fromWarehouseId} onChange={(e) => set('fromWarehouseId', e.target.value)} style={{ width: 150 }}>
            {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
        </Field>
        <span style={{ fontSize: 16, color: 'var(--ec-blue)', paddingBottom: 4 }}>→</span>
        <Field label="입고창고 *">
          <select className="ec-input" value={form.toWarehouseId} onChange={(e) => set('toWarehouseId', e.target.value)} style={{ width: 150 }}>
            {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
        </Field>
        <Field label="수량 *">
          <input className="ec-input" type="number" step="any" value={form.quantity} onChange={(e) => set('quantity', e.target.value)} style={{ width: 90 }} />
        </Field>
        {/*
          출고창고에 지금 몇 개 있는지. 예전엔 안 보여서 넉넉한지 모른 채 넣고 "재고가 부족" 거절을 받아야 알았다(32회차).
          조정 창은 진작 [현재 재고] 를 보여 준다 — 같은 값을 쓴다.
        */}
        {form.itemId && form.fromWarehouseId && (() => {
          const have = stock.find((x) => x.itemId === Number(form.itemId) && x.warehouseId === Number(form.fromWarehouseId))?.quantity ?? 0
          const short = form.quantity !== '' && Number(form.quantity) > have
          return (
            <span style={{ fontSize: 12, paddingBottom: 6, color: short ? 'var(--ec-danger)' : 'var(--ec-label)' }}>
              출고창고 재고 <b>{have.toLocaleString()}</b>{short ? ' — 부족' : ''}
            </span>
          )
        })()}
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
        <button className="ec-btn ec-btn-primary" onClick={submit}>이동처리</button>
      </div>
      <div style={{ marginTop: 8, fontSize: 11.5, color: 'var(--ec-text-hint)' }}>※ 출고창고 재고가 부족하면 이동이 거절됩니다(출고·입고 동시 처리).</div>
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
    <div style={{ border: '1px solid var(--ec-border)', background: '#fff', padding: 14, marginBottom: 8 }}>
      <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--ec-blue-dark)', marginBottom: 10 }}>{label} 등록</div>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
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
      <div style={{ marginTop: 8, fontSize: 11.5, color: 'var(--ec-text-hint)' }}>
        {isAdjust
          ? '※ 실사수량과 그 일자 재고의 차이만큼 재고를 증감합니다(수불부에 조정으로 기록). 지난 날짜면 그 뒤 거래는 그대로 둡니다.'
          : `※ 입력 수량만큼 재고를 차감합니다. 현재고보다 많으면 ${label}가 거절됩니다.`}
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ fontSize: 12.5 }}>
      <div style={{ color: 'var(--ec-label)', marginBottom: 3 }}>{label}</div>
      {children}
    </label>
  )
}
