import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import EcListShell from '../../components/EcListShell'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import Modal from '../../components/Modal'
import { EcCond } from '../../components/EcStatusPanel'
import CodePickerField from '../../components/CodePickerField'
import { api, extractErrorMessage } from '../../api/client'
import type { Item } from '../../api/types'
import { ymd } from '../../components/EcPeriodPicks'
import { dateText } from '../../utils/dateText'

/**
 * 재고 II > 계획관리 > 매출계획 / 매출계획비교표 (이카운트 E040624·E040625·E040626·E040640)
 * 품목별 월 매출 목표(계획)를 등록하고, 판매 실적과 대조해 달성률을 본다.
 * 백엔드 신규: sales_plans 테이블 + GET/POST/DELETE /api/sales-plans, GET /api/sales-plans/comparison?year=
 * 실적은 저장하지 않고 판매(Sales) 집계로 계산한다.
 */
interface ComparisonRow {
  id: number
  planYear: number
  planMonth: number
  itemId: number
  itemName: string
  /** 원본 매출계획의 [창고]·[거래처]·[프로젝트]. 안 고르면 그 축을 안 나눈다. */
  warehouseName: string | null
  partnerName: string | null
  projectName: string | null
  /** 원본 매출계획비교표의 [담당자]. 위 셋과 같은 성질의 축이다. */
  employeeName: string | null
  /** 원본 [설정]의 [코드포함] — 이름 옆에 같이 보여 줄 코드. 안 나눈 축은 null. */
  itemCode: string
  warehouseCode: string | null
  partnerCode: string | null
  projectCode: string | null
  employeeCode: string | null
  /** 원본 매출계획입력의 [예상매출일자]. 안 정했으면 null. */
  expectedDate: string | null
  unit: string
  planQty: number
  planAmount: number
  /** 원본 [일자-No.] — 계획 한 줄을 가리키는 전표번호다. */
  planNo: string
  actualQty: number
  actualAmount: number
  achieveRate: number
}

const won = (n: number) => n.toLocaleString('ko-KR')
const rateColor = (r: number) => (r >= 100 ? '#1c7c3c' : r >= 80 ? '#c07a00' : '#c60a2e')
const thisYear = () => Number(ymd(new Date()).slice(0, 4))
const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1)

/**
 * 원본 매출계획비교표의 [반품구분] — 체크박스 셋이고 <b>셋 다 켜져 있는 것이 기본</b>이다
 * (사본 실측: 전체(0) · 일반(2) · 반품(1), 모두 checked).
 *
 * <p>여기서 고른 것이 <b>실적을 무엇으로 세느냐</b>를 바꾼다 — 반품을 넣으면 순매출,
 * 빼면 총매출이다. 서버가 골라 낸 뒤 합치므로 화면에서 뒤늦게 거를 수 없다.
 */
const SALE_FLAGS = ['전체', '일반', '반품'] as const
type SaleFlag = typeof SALE_FLAGS[number]

/**
 * 원본 매출계획비교표의 [설정] — 체크박스 셋이다(사본 실측).
 * <b>코드포함</b>(꺼짐) · <b>비율(%)</b>(켜짐) · <b>수량</b>(꺼짐).
 *
 * <p>표에 무엇을 낼지를 정하는 자리다. 원본 기본값 그대로 켠다 — 우리가 임의로 다 켜 두면
 * 첫 화면이 원본보다 넓고, 왜 다른지는 화면 어디에도 안 보인다.
 */
const SETUPS = ['코드포함', '비율(%)', '수량'] as const

interface CodeRow { id: number; code: string; name: string }

export default function SalesPlanPage() {
  const [year, setYear] = useState<number>(thisYear())
  const [rows, setRows] = useState<ComparisonRow[]>([])
  /*
   * 원본 매출계획 조건의 <b>[품목]</b>. 품목은 목록에 찍히는데 그것으로 거를 수가 없어,
   * 한 품목의 열두 달을 보려면 표 전체를 눈으로 훑어야 했다.
   */
  const [itemCond, setItemCond] = useState('')
  /* 원본 매출계획 조건 차례: <b>창고 · 거래처</b> · 품목 · <b>프로젝트</b>. */
  const [whCond, setWhCond] = useState('')
  const [partnerCond, setPartnerCond] = useState('')
  const [projCond, setProjCond] = useState('')
  const [empCond, setEmpCond] = useState('')
  const [saleFlag, setSaleFlag] = useState<SaleFlag>('전체')
  const [setups, setSetups] = useState<string[]>(['비율(%)'])
  const withCode = setups.includes('코드포함')
  const withRate = setups.includes('비율(%)')
  const withQty = setups.includes('수량')
  /** 이름 옆에 코드를 붙여 준다 — [코드포함]이 꺼져 있으면 이름만. */
  const named = (name: string | null, code: string | null) =>
    (!name ? '' : withCode && code ? `${code} ${name}` : name)
  const [employees, setEmployees] = useState<CodeRow[]>([])
  const [warehouses, setWarehouses] = useState<CodeRow[]>([])
  const [partners, setPartners] = useState<CodeRow[]>([])
  const [projects, setProjects] = useState<CodeRow[]>([])
  const [items, setItems] = useState<Item[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')
  const [showForm, setShowForm] = useState(false)

  async function load() {
    setLoading(true); setError('')
    try {
      const [c, i, w, pt, pj, em] = await Promise.all([
        // [반품구분]은 <b>서버가 실적을 세기 전에</b> 걸러야 한다 — 합친 뒤에는 못 뺀다.
        api.get<ComparisonRow[]>('/sales-plans/comparison', { params: { year, saleFlag } }),
        api.get<Item[]>('/items'),
        api.get<CodeRow[]>('/warehouses'),
        api.get<CodeRow[]>('/partners'),
        api.get<CodeRow[]>('/projects'),
        api.get<CodeRow[]>('/employees'),
      ])
      setRows(c.data)
      setItems(i.data)
      setWarehouses(w.data); setPartners(pt.data); setProjects(pj.data); setEmployees(em.data)
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load() }, [year, saleFlag])

  async function remove(id: number) {
    setError(''); setOk('')
    try {
      await api.delete(`/sales-plans/${id}`)
      setOk('매출계획 1건 삭제')
      await load()
    } catch (err) {
      setError(extractErrorMessage(err))
    }
  }

  const shown = useMemo(() => rows
    .filter((r) => !itemCond || r.itemName === itemCond)
    .filter((r) => !whCond || r.warehouseName === whCond)
    .filter((r) => !partnerCond || r.partnerName === partnerCond)
    .filter((r) => !projCond || r.projectName === projCond)
    .filter((r) => !empCond || r.employeeName === empCond),
    [rows, itemCond, whCond, partnerCond, projCond, empCond])

  /*
   * [설정]으로 열이 켜지고 꺼지니 <b>머리와 줄의 칸 수가 자료 따라 변한다</b> —
   * 정적으로는 못 센다. 렌더된 표를 직접 재는 검사를 단다.
   */
  const tableRef = useRef<HTMLDivElement>(null)
  useTableColumnCheck(tableRef, '매출계획비교표', [withQty, withRate, shown.length])

  /* 합계도 걸러진 것으로 낸다 — 한 품목만 보면서 합계는 전체이면 숫자가 거짓말을 한다. */
  const totals = useMemo(() => {
    const t = shown.reduce((s, r) => ({ plan: s.plan + r.planAmount, actual: s.actual + r.actualAmount }), { plan: 0, actual: 0 })
    const rate = t.plan > 0 ? (t.actual / t.plan) * 100 : 0
    return { ...t, rate }
  }, [shown])

  /*
   * 원본 하단 단추줄의 <b>[선택삭제]</b> — 고른 줄을 한 번에 지운다. 줄마다 [삭제]는
   * 진작 있었지만, 잘못 올린 매출계획 열 줄을 지우려면 열 번 묻고 열 번 눌러야 했다.
   *
   * <p>하나가 막혀도 <b>거기서 멈추지 않는다</b> — 나머지는 지우고 몇 건이 남았는지 알려 준다.
   */
  const [picked, setPicked] = useState<Set<number>>(new Set())
  const pick = (id: number) => setPicked((s) => {
    const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n
  })

  async function removeChecked() {
    const ids = [...picked]
    if (ids.length === 0) { setError('삭제할 매출계획을(를) 고르세요.'); return }
    if (!window.confirm(`고른 ${ids.length}건을 삭제할까요?`)) return
    const results = await Promise.allSettled(ids.map((id) => api.delete(`/sales-plans/${id}`)))
    const failed = results.filter((r) => r.status === 'rejected').length
    setPicked(new Set())
    setError(failed ? `${failed}건은 삭제하지 못했습니다(이미 실적이 붙은 계획일 수 있습니다).` : '')
    load()
  }

  return (
    <EcListShell
      title="매출계획 / 비교표"
      newLabel={showForm ? '입력닫기' : '매출계획 등록(F2)'}
      onNew={() => setShowForm((v) => !v)}
      actions={[
        { label: '새로고침', onClick: load },
        /* 원본 차례: 신규(F2) · 선택삭제 · Excel (사본 실측) */
        { label: `선택삭제${picked.size ? ` (${picked.size})` : ''}`, onClick: removeChecked },
        { label: '인쇄' },
        { label: 'Excel' },
      ]}
    >
      {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}
      {ok && <p style={{ background: '#eafaef', color: '#1c7c3c', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{ok}</p>}

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <span style={{ fontSize: 12.5, color: '#3c4553', fontWeight: 600 }}>계획연도</span>
        <button className="ec-btn" onClick={() => setYear((y) => y - 1)}>◀</button>
        <b style={{ fontSize: 15, color: '#3c4553', minWidth: 54, textAlign: 'center' }}>{year}년</b>
        <button className="ec-btn" onClick={() => setYear((y) => y + 1)}>▶</button>
        <div style={{ marginLeft: 'auto', fontSize: 12.5, color: '#5a626e' }}>
          계획 <b style={{ color: '#3c4553', fontSize: 14 }}>{won(totals.plan)}</b>
          <span style={{ margin: '0 8px', color: '#c5cbd3' }}>|</span>
          실적 <b style={{ color: '#1c6b32', fontSize: 14 }}>{won(totals.actual)}</b>
          <span style={{ margin: '0 8px', color: '#c5cbd3' }}>|</span>
          달성률 <b style={{ color: rateColor(totals.rate), fontSize: 14 }}>{totals.rate.toFixed(1)}%</b>
        </div>
      </div>

      <Modal open={showForm} title="매출계획 등록" onClose={() => setShowForm(false)}>
        <PlanForm year={year} items={items} warehouses={warehouses} partners={partners} projects={projects} employees={employees} onError={setError} onSaved={() => { setShowForm(false); setOk('매출계획 등록 완료'); load() }} />
      </Modal>

      <ul className="ec-cond" style={{ marginBottom: 8 }}>
        <EcCond label="창고" pick>
          <CodePickerField label="창고" hideLabel width={170} emptyLabel="전체"
                           value={whCond} onChange={setWhCond}
                           items={warehouses.map((x) => ({ value: x.name, code: x.code, name: x.name }))} />
        </EcCond>
        <EcCond label="거래처" pick>
          <CodePickerField label="거래처" hideLabel width={170} emptyLabel="전체"
                           value={partnerCond} onChange={setPartnerCond}
                           items={partners.map((x) => ({ value: x.name, code: x.code, name: x.name }))} />
        </EcCond>
        <EcCond label="품목">
          {/* 마스터를 고르는 칸은 드롭다운이 아니라 코드도움이다. */}
          <CodePickerField label="품목" hideLabel width={200} emptyLabel="전체"
                           value={itemCond} onChange={setItemCond}
                           items={items.map((x) => ({ value: x.name, code: x.code, name: x.name }))} />
        </EcCond>
        <EcCond label="담당자" pick>
          <CodePickerField label="담당자" hideLabel width={150} emptyLabel="전체"
                           value={empCond} onChange={setEmpCond}
                           items={employees.map((x) => ({ value: x.name, code: x.code, name: x.name }))} />
        </EcCond>
        <EcCond label="프로젝트" pick>
          <CodePickerField label="프로젝트" hideLabel width={170} emptyLabel="전체"
                           value={projCond} onChange={setProjCond}
                           items={projects.map((x) => ({ value: x.name, code: x.code, name: x.name }))} />
        </EcCond>
        <EcCond label="반품구분">
          <div className="ec-pills">
            {SALE_FLAGS.map((k) => (
              <button key={k} type="button" className={`ec-pill no-ec${saleFlag === k ? ' active' : ''}`}
                      onClick={() => setSaleFlag(k)}>{k}</button>
            ))}
          </div>
        </EcCond>
        <EcCond label="설정">
          <div style={{ display: 'flex', gap: 12 }}>
            {SETUPS.map((k) => (
              <label key={k} style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 12.5 }}>
                <input type="checkbox" checked={setups.includes(k)}
                       onChange={(e) => setSetups((v) => (e.target.checked ? [...v, k] : v.filter((x) => x !== k)))} />
                {k}
              </label>
            ))}
          </div>
        </EcCond>
      </ul>

      <div ref={tableRef}>
      <table className="w-full text-left">
        <thead>
          <tr>
            <th style={{ width: 28, textAlign: 'center' }}></th>
            <th style={{ width: 34 }}></th>
            {/*
              원본 매출계획 격자의 <b>첫 열</b>은 [일자-No.] 다(사본 실측). 계획 한 줄을
              가리킬 이름이 없어서, 어느 계획을 고쳤다거나 지웠다고 말할 방법이 없었다.
            */}
            <th style={{ width: 150 }}>일자-No.</th>
            <th style={{ textAlign: 'center' }}>연월</th>
            {/* 원본 매출계획입력의 [예상매출일자]. 안 정한 계획은 빈칸이다. */}
            <th style={{ width: 110, textAlign: 'center' }}>예상매출일자</th>
            {/*
              원본 매출계획입력의 열 [거래처]. 계획에 축을 만들었는데 <b>표에는 안 보여</b>
              같은 품목·같은 달 계획이 여럿일 때 <b>어느 것이 어느 축인지</b> 알 수 없었다.
              창고·프로젝트도 같은 까닭으로 같이 보인다 — 안 나눈 계획은 빈칸이다.
            */}
            <th style={{ width: 110 }}>거래처명</th>
            {/* 원본 차례는 거래처명 <b>바로 다음</b>이 담당자다(사본 실측). */}
            <th style={{ width: 90 }}>담당자명</th>
            <th style={{ width: 100 }}>창고명</th>
            <th style={{ width: 110 }}>프로젝트명</th>
            {/* 원본 차례: 거래처명 · 창고명 · 프로젝트명 · <b>품목명</b> · 금액 */}
            <th>품목명</th>
            {/* 원본 [설정]의 [수량] — 처음엔 꺼져 있다. 금액만 보는 것이 기본이다. */}
            {withQty && <th style={{ textAlign: 'right' }}>계획수량</th>}
            <th style={{ textAlign: 'right' }}>계획금액</th>
            {withQty && <th style={{ textAlign: 'right' }}>실적수량</th>}
            <th style={{ textAlign: 'right' }}>실적금액</th>
            {/* 원본 [설정]의 [비율(%)] — 처음부터 켜져 있다. */}
            {withRate && <th style={{ textAlign: 'right' }}>달성률</th>}
            <th style={{ textAlign: 'center' }}>처리</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={11 + (withQty ? 2 : 0) + (withRate ? 1 : 0)} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
          ) : shown.length === 0 ? (
            <tr><td colSpan={11 + (withQty ? 2 : 0) + (withRate ? 1 : 0)} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>{year}년 매출계획이 없습니다. 「매출계획 등록」으로 추가하세요.</td></tr>
          ) : shown.map((r, i) => (
            <tr key={r.id}>
              <td style={{ textAlign: 'center' }}>
                <input type="checkbox" checked={picked.has(r.id)} onChange={() => pick(r.id)} />
              </td>
              <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
              <td style={{ fontFamily: 'monospace', color: 'var(--ec-blue)' }}>{r.planNo}</td>
              <td style={{ textAlign: 'center', fontFamily: 'monospace' }}>{r.planYear}-{String(r.planMonth).padStart(2, '0')}</td>
              <td style={{ textAlign: 'center', fontFamily: 'monospace', color: '#5a626e' }}>{dateText(r.expectedDate) || ''}</td>
              <td style={{ color: '#5a626e' }}>{named(r.partnerName, r.partnerCode)}</td>
              <td style={{ color: '#5a626e' }}>{named(r.employeeName, r.employeeCode)}</td>
              <td style={{ color: '#5a626e' }}>{named(r.warehouseName, r.warehouseCode)}</td>
              <td style={{ color: '#5a626e' }}>{named(r.projectName, r.projectCode)}</td>
              <td>{named(r.itemName, r.itemCode)} <span style={{ color: '#9aa1ab', fontSize: 11 }}>{r.unit}</span></td>
              {withQty && <td style={{ textAlign: 'right' }}>{won(r.planQty)}</td>}
              <td style={{ textAlign: 'right' }}>{won(r.planAmount)}</td>
              {withQty && <td style={{ textAlign: 'right', color: '#5a626e' }}>{won(r.actualQty)}</td>}
              <td style={{ textAlign: 'right', fontWeight: 600, color: '#1c6b32' }}>{won(r.actualAmount)}</td>
              {withRate && <td style={{ textAlign: 'right', fontWeight: 700, color: rateColor(r.achieveRate) }}>{r.achieveRate.toFixed(1)}%</td>}
              <td style={{ textAlign: 'center' }}>
                <button className="ec-btn" style={{ height: 20, padding: '0 8px', color: '#c60a2e' }} onClick={() => remove(r.id)}>삭제</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </EcListShell>
  )
}

function PlanForm({
  year, items, warehouses, partners, projects, employees, onError, onSaved,
}: {
  year: number
  items: Item[]
  warehouses: CodeRow[]
  partners: CodeRow[]
  projects: CodeRow[]
  employees: CodeRow[]
  onError: (m: string) => void
  onSaved: () => void
}) {
  const [itemId, setItemId] = useState('')
  const [month, setMonth] = useState('1')
  const [planQty, setPlanQty] = useState('')
  const [planAmount, setPlanAmount] = useState('')
  const [remark, setRemark] = useState('')
  /*
   * 원본 매출계획의 [창고]·[거래처]·[프로젝트]. 안 고르면 <b>그 축을 안 나눈다</b>는 뜻이고,
   * 고르면 <b>그 창고/거래처에서 나간 판매만</b> 실적으로 잡힌다(서버가 그렇게 맞춘다).
   */
  const [fWarehouse, setFWarehouse] = useState('')
  const [fPartner, setFPartner] = useState('')
  const [fProject, setFProject] = useState('')
  const [fEmployee, setFEmployee] = useState('')
  /* 원본 매출계획입력 머리의 [예상매출일자]. 안 정해도 된다. */
  const [expectedDate, setExpectedDate] = useState('')
  const [saving, setSaving] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!itemId) { onError('품목을 선택하세요.'); return }
    setSaving(true); onError('')
    try {
      await api.post('/sales-plans', {
        itemId: Number(itemId),
        planYear: year,
        planMonth: Number(month),
        planQty: Number(planQty || 0),
        planAmount: Number(planAmount || 0),
        warehouseId: fWarehouse ? Number(fWarehouse) : undefined,
        partnerId: fPartner ? Number(fPartner) : undefined,
        projectId: fProject ? Number(fProject) : undefined,
        employeeId: fEmployee ? Number(fEmployee) : undefined,
        expectedDate: expectedDate || undefined,
        remark: remark || undefined,
      })
      onSaved()
    } catch (err) {
      onError(extractErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  const cls = 'ec-input'
  const lbl: React.CSSProperties = { fontSize: 12.5, color: '#3c4553', fontWeight: 600, display: 'block', marginBottom: 4 }
  return (
    <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 360 }}>
      <div style={{ fontSize: 12, color: '#8a929c' }}>계획연도 <b style={{ color: '#3c4553' }}>{year}년</b></div>
      <div style={{ display: 'flex', gap: 10 }}>
        <label style={{ flex: 2 }}><span style={lbl}>품목 *</span>
          <select className={cls} value={itemId} onChange={(e) => setItemId(e.target.value)} style={{ width: '100%' }}>
            <option value="">품목 선택</option>
            {items.map((it) => <option key={it.id} value={it.id}>{it.name}</option>)}
          </select>
        </label>
        {/* 정하면 <b>계획연월과 같은 달</b>이어야 한다 — 어긋나면 서버가 막는다. */}
        <label style={{ flex: 1 }}><span style={lbl}>예상매출일자</span>
          <input className={cls} type="date" value={expectedDate}
                 onChange={(e) => setExpectedDate(e.target.value)} style={{ width: '100%' }} />
        </label>
        <label style={{ flex: 1 }}><span style={lbl}>월 *</span>
          <select className={cls} value={month} onChange={(e) => setMonth(e.target.value)} style={{ width: '100%' }}>
            {MONTHS.map((m) => <option key={m} value={m}>{m}월</option>)}
          </select>
        </label>
      </div>
      <div style={{ display: 'flex', gap: 10 }}>
        <label style={{ flex: 1 }}><span style={lbl}>계획수량</span>
          <input className={cls} type="number" step="any" value={planQty} onChange={(e) => setPlanQty(e.target.value)} style={{ width: '100%', textAlign: 'right' }} /></label>
        <label style={{ flex: 1 }}><span style={lbl}>계획금액</span>
          <input className={cls} type="number" step="any" value={planAmount} onChange={(e) => setPlanAmount(e.target.value)} style={{ width: '100%', textAlign: 'right' }} /></label>
      </div>
      {/* 원본 차례: 창고 · 거래처 · 품목 · 프로젝트 — 안 고르면 그 축을 안 나눈다. */}
      <div style={{ display: 'flex', gap: 10 }}>
        <label style={{ flex: 1 }}><span style={lbl}>창고</span>
          <CodePickerField label="창고" hideLabel fill emptyLabel="안 나눔"
                           value={fWarehouse} onChange={setFWarehouse}
                           items={warehouses.map((x) => ({ value: String(x.id), code: x.code, name: x.name }))} />
        </label>
        <label style={{ flex: 1 }}><span style={lbl}>거래처</span>
          <CodePickerField label="거래처" hideLabel fill emptyLabel="안 나눔"
                           value={fPartner} onChange={setFPartner}
                           items={partners.map((x) => ({ value: String(x.id), code: x.code, name: x.name }))} />
        </label>
      </div>
      <div style={{ display: 'flex', gap: 10 }}>
        <label style={{ flex: 1 }}><span style={lbl}>프로젝트</span>
          <CodePickerField label="프로젝트" hideLabel fill emptyLabel="안 나눔"
                           value={fProject} onChange={setFProject}
                           items={projects.map((x) => ({ value: String(x.id), code: x.code, name: x.name }))} />
        </label>
        {/* 담당자를 고르면 <b>그 사람이 친 판매만</b> 실적으로 잡힌다 — 서버가 그렇게 맞춘다. */}
        <label style={{ flex: 1 }}><span style={lbl}>담당자</span>
          <CodePickerField label="담당자" hideLabel fill emptyLabel="안 나눔"
                           value={fEmployee} onChange={setFEmployee}
                           items={employees.map((x) => ({ value: String(x.id), code: x.code, name: x.name }))} />
        </label>
      </div>
      <label><span style={lbl}>적요</span>
        <input className={cls} value={remark} onChange={(e) => setRemark(e.target.value)} style={{ width: '100%' }} placeholder="선택" /></label>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, marginTop: 4 }}>
        <button type="submit" className="ec-btn ec-btn-primary" disabled={saving}>{saving ? '저장 중…' : '저장(F8)'}</button>
      </div>
    </form>
  )
}
