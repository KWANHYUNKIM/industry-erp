import { useEffect, useState, type FormEvent } from 'react'
import CodePickerField from '../../components/CodePickerField'
import { EcCond } from '../../components/EcStatusPanel'
import { useCondPickers } from '../../utils/useCondPickers'
import { api, extractErrorMessage } from '../../api/client'
import { printDocuments } from '../../utils/printDocument'
import EcListShell from '../../components/EcListShell'
import Modal from '../../components/Modal'
import { ymd } from '../../components/EcPeriodPicks'

/** 생산관리 > 생산불출 — 자재 불출 등록/삭제 (백엔드 /api/material-issues 연동) */
interface MaterialIssue {
  id: number
  itemId: number
  itemCode: string
  itemName: string
  itemSpec: string | null
  unit: string
  warehouseId: number | null
  warehouseName: string | null
  toWarehouseId: number | null
  toWarehouseName: string | null
  workOrderId: number | null
  workOrderNo: string | null
  /**
   * 작업지시가 가리키는 생산품목. 원본 생산불출입력 머리의 [생산품목] 이고
   * 그리드의 [작업지시품목코드] 이기도 하다. 작업지시 없이 낸 불출이면 null.
   */
  productCode: string | null
  productName: string | null
  /**
   * 담당자(사원) id. <b>이름은 여기 없다</b> — production 은 hr 을 참조할 수 없어
   * 서버가 붙이지 못한다(hr → accounting → production 이 이미 있어 순환).
   */
  employeeId: number | null
  qty: number
  issueDate: string
  note: string | null
}
/** searchKeyword 는 원본 [검색창내용] — 코드도움이 이 값으로도 찾는다. */
interface Item { id: number; code: string; name: string; unit: string; searchKeyword: string | null }
/** 구분(창고·공장·외주)까지 받는다 — 받는 쪽은 대개 공장이라 앞에 세운다. */
interface Warehouse { id: number; code: string; name: string; kind: string }
interface Project { id: number; code: string; name: string }
interface WorkOrder { id: number; orderNo: string; productName: string }
interface EmployeeLite { id: number; code: string; name: string }

const inputCls = 'ec-input w-full'
const today = () => ymd(new Date())
/**
 * 원본 생산불출입력 머리 실측(사본): 일자 · <b>담당자</b> · 보내는창고 · 받는공장 ·
 * <b>생산품목</b>. 생산불출현황 조건에도 [담당자] 가 있다 — 세 화면에서 나온 항목이다.
 *
 * <p>담당자가 없어 "누가 낸 불출인지" 를 적을 자리도, 그걸로 거를 자리도 없었다.
 * 생산품목은 작업지시를 고르면 따라온다 — 원본처럼 따로 고르게 하면 둘이 어긋날 수 있다.
 */
const emptyForm = {
  itemId: '', warehouseId: '', toWarehouseId: '', workOrderId: '',
  employeeId: '', issueDate: today(),
  /** 원본 생산불출입력 머리의 [프로젝트]. 안 정할 수 있다. */
  projectId: '',
}

/**
 * 격자 한 줄. 원본 생산불출입력은 <b>한 전표에 자재를 여러 줄</b> 넣는다 —
 * 같은 날 같은 작업지시로 자재 다섯 개를 내보내면서 다섯 번 저장할 일이 아니다.
 */
interface FormLine { key: number; itemId: string; qty: string; note: string }
let nextLineKey = 1
const emptyLine = (): FormLine => ({ key: nextLineKey++, itemId: '', qty: '', note: '' })

export default function IssuePage() {
  const [rows, setRows] = useState<MaterialIssue[]>([])
  const [items, setItems] = useState<Item[]>([])
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([])
  /** 담당자 이름은 서버가 못 붙여서 화면이 붙인다. */
  const [employees, setEmployees] = useState<EmployeeLite[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  /**
   * 원본은 목록 첫 칸에서 줄을 골라 [선택삭제] 한다(사본 실측: CHK_H 열).
   * 우리는 줄마다 [삭제]뿐이라, 잘못 넣은 열 건을 지우려면 열 번 눌러 열 번 확인해야 했다.
   */
  const [checked, setChecked] = useState<Set<number>>(new Set())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [keyword, setKeyword] = useState('')
  const [whCond, setWhCond] = useState('')
  const [itemCond, setItemCond] = useState('')
  const [empCond, setEmpCond] = useState('')
  const [noteCond, setNoteCond] = useState('')
  const condPickers = useCondPickers(['warehouses', 'items', 'employees'])
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [lines, setLines] = useState<FormLine[]>([emptyLine()])
  const setLine = (key: number, patch: Partial<FormLine>) =>
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)))

  async function load() {
    setLoading(true)
    try {
      const res = await api.get<MaterialIssue[]>('/material-issues')
      setRows(res.data)
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  async function loadRefs() {
    try {
      const [it, wh, wo, emp, pj] = await Promise.all([
        api.get<Item[]>('/items'),
        api.get<Warehouse[]>('/warehouses'),
        api.get<WorkOrder[]>('/work-orders'),
        api.get<EmployeeLite[]>('/employees'),
        api.get<Project[]>('/projects'),
      ])
      setItems(it.data)
      setWarehouses(wh.data)
      setWorkOrders(wo.data)
      setEmployees(emp.data)
      setProjects(pj.data)
    } catch {
      /* 참조 데이터 로딩 실패는 폼 사용에만 영향 */
    }
  }

  useEffect(() => { load(); loadRefs() }, [])

  /** 담당자 이름. 서버가 못 붙여서 화면이 붙인다 — 지워진 사원이면 '-'. */
  const empName = (id: number | null) =>
    id == null ? '-' : (employees.find((x) => x.id === id)?.name ?? '-')

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError('')
    try {
      /*
       * 줄을 <b>한 번에</b> 보낸다. 서버가 한 트랜잭션으로 넣고, 한 줄이라도 막히면
       * 전부 되돌린다 — 재고가 모자라 세 줄 중 둘만 들어가면 창고 수량도 전표도
       * 반쪽이 되고, 사람은 무엇이 들어갔는지 모른다.
       */
      const filled = lines.filter((l) => l.itemId && l.qty !== '')
      if (filled.length === 0) { setError('자재를 한 줄 이상 넣으세요.'); return }
      await api.post('/material-issues/batch', {
        warehouseId: form.warehouseId === '' ? null : Number(form.warehouseId),
        toWarehouseId: form.toWarehouseId === '' ? null : Number(form.toWarehouseId),
        workOrderId: form.workOrderId === '' ? null : Number(form.workOrderId),
        issueDate: form.issueDate || null,
        employeeId: form.employeeId === '' ? null : Number(form.employeeId),
        projectId: form.projectId === '' ? null : Number(form.projectId),
        lines: filled.map((l) => ({ itemId: Number(l.itemId), qty: Number(l.qty), note: l.note })),
      })
      setForm(emptyForm)
      setLines([emptyLine()])
      setShowForm(false)
      load()
    } catch (err) {
      setError(extractErrorMessage(err))
    }
  }

  /**
   * 원본 생산불출조회 격자의 마지막 열 <b>[인쇄]</b> — 그 한 건을 불출증으로 찍는다.
   *
   * <p>금액 칸은 안 그린다. 불출은 사내 이동이라 금액이 없다 — 0 으로 채워 그리면
   * "0원짜리 거래" 로 읽힌다. 공급자/공급받는자 칸도 없다(거래 상대가 없다).
   */
  async function printOne(r: MaterialIssue) {
    await printDocuments([{
      title: '생산불출증',
      docNo: r.workOrderNo ? `${r.issueDate} / ${r.workOrderNo}` : r.issueDate,
      docDate: r.issueDate,
      hideAmounts: true,
      hideParties: true,
      supplier: { label: '', name: '' },
      customer: { label: '', name: '' },
      extra: [
        { label: '보내는창고', value: r.warehouseName },
        { label: '받는공장', value: r.toWarehouseName },
        { label: '담당자', value: r.employeeId ? empName(r.employeeId) : null },
        { label: '생산품목', value: r.productName },
      ],
      remark: r.note,
      lines: [{
        itemCode: r.itemCode, itemName: r.itemName, unit: r.unit,
        quantity: r.qty, unitPrice: 0, supplyAmount: 0, vatAmount: 0,
      }],
    }])
  }

  async function remove(r: MaterialIssue) {
    if (!confirm(`'${r.itemName}' 불출내역을 삭제할까요?`)) return
    try {
      await api.delete(`/material-issues/${r.id}`)
      load()
    } catch (err) {
      alert(extractErrorMessage(err))
    }
  }

  /** 원본 [선택삭제]. 지우면 옮겼던 재고도 서버가 되돌린다(줄마다 [삭제]와 같은 길). */
  async function removeChecked() {
    const targets = shown.filter((r) => checked.has(r.id))
    if (targets.length === 0) { setError('지울 불출내역을 고르세요.'); return }
    if (!confirm(`고른 ${targets.length}건을 삭제할까요? 옮겼던 재고도 되돌아갑니다.`)) return
    setError('')
    const results = await Promise.allSettled(targets.map((r) => api.delete(`/material-issues/${r.id}`)))
    const failed = results.filter((x) => x.status === 'rejected').length
    setChecked(new Set())
    await load()
    if (failed > 0) setError(`${targets.length - failed}건 삭제, ${failed}건 실패.`)
  }

  /*
   * 원본 생산불출의 조건 차례는 <b>창고 · 품목 · 프로젝트 · 담당자 · 적요</b> 다(사본 실측).
   * 우리 화면에는 <b>조건이 하나도 없었다</b> — 검색어 한 칸이 품목명·작업지시번호를 겸했다.
   * [프로젝트]는 생산불출 응답에 그 값이 없어 못 만든다.
   */
  const shown = rows
    .filter((r) => !keyword || r.itemName.includes(keyword) || (r.workOrderNo ?? '').includes(keyword))
    .filter((r) => !whCond || (r.warehouseName ?? '').includes(whCond)
      || (r.toWarehouseName ?? '').includes(whCond))
    .filter((r) => !itemCond || r.itemName.includes(itemCond))
    .filter((r) => !empCond || empName(r.employeeId).includes(empCond))
    .filter((r) => !noteCond || (r.note ?? '').includes(noteCond))

  return (
    <EcListShell
      title="생산불출조회"
      search={keyword}
      onSearchChange={setKeyword}
      onSearch={load}
      onNew={() => setShowForm(true)}
      actions={[{ label: '검색(F8)', onClick: load },
                { label: `선택삭제${checked.size ? ` (${checked.size})` : ''}`, onClick: removeChecked },
                { label: 'Excel' }]}
    >
      {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}

      <Modal open={showForm} title="생산불출 등록" onClose={() => setShowForm(false)}>{(
        <form onSubmit={submit} style={{ marginBottom: 8, border: '1px solid var(--ec-border)', background: '#fff', padding: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--ec-blue-dark)', marginBottom: 8 }}>새 불출 등록</div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {/* 원본은 [보내는창고] → [받는공장] 으로 옮기는 전표다. 재고가 그만큼 실제로 움직인다. */}
            <div>
              {/* 원본 머리의 이름은 [일자]다(사본 실측). */}
              <label className="mb-1 block text-sm text-slate-600">일자</label>
              <input type="date" className={inputCls} value={form.issueDate} onChange={(e) => setForm({ ...form, issueDate: e.target.value })} />
            </div>
            <div>
              <label className="mb-1 block text-sm text-slate-600">담당자</label>
              {/* 원본은 이 칸을 <b>코드도움</b>으로 받는다(사본 실측) — 창고·거래처·사원은
                  몇백 개가 되므로 드롭다운으로는 코드로도 이름으로도 못 찾는다. */}
              <CodePickerField label="담당자" hideLabel fill placeholder="담당자" emptyLabel="선택 안 함"
                               value={form.employeeId} onChange={(v) => setForm({ ...form, employeeId: v })}
                               items={employees.map((x) => ({ value: String(x.id), code: x.code, name: x.name }))} />
            </div>
            <div>
              <label className="mb-1 block text-sm text-slate-600">보내는창고</label>
              {/* 원본은 이 칸을 <b>코드도움</b>으로 받는다(사본 실측) — 창고·거래처·사원은
                  몇백 개가 되므로 드롭다운으로는 코드로도 이름으로도 못 찾는다. */}
              <CodePickerField label="보내는창고" hideLabel fill placeholder="보내는창고" emptyLabel="선택"
                               value={form.warehouseId} onChange={(v) => setForm({ ...form, warehouseId: v })}
                               items={warehouses.map((x) => ({ value: String(x.id), code: x.code, name: x.name }))} />
            </div>
            <div>
              <label className="mb-1 block text-sm text-slate-600">받는공장</label>
              {/* 원본은 이 칸도 <b>코드도움</b>이다. 구분이 공장인 창고를 앞에 두고,
                  보내는 창고와 같은 곳은 뺀다 — 제 창고로 보낼 수는 없다. */}
              <CodePickerField label="받는공장" hideLabel fill placeholder="받는공장" emptyLabel="선택"
                               value={form.toWarehouseId} onChange={(v) => setForm({ ...form, toWarehouseId: v })}
                               items={[...warehouses]
                                 .sort((a, b) => (a.kind === '공장' ? -1 : 1) - (b.kind === '공장' ? -1 : 1))
                                 .filter((w) => String(w.id) !== form.warehouseId)
                                 .map((w) => ({ value: String(w.id), code: w.code, name: w.name, sub: w.kind !== '창고' ? w.kind : null }))} />
            </div>
            <div>
              <label className="mb-1 block text-sm text-slate-600">작업지시</label>
              <select className={inputCls} value={form.workOrderId} onChange={(e) => setForm({ ...form, workOrderId: e.target.value })}>
                <option value="">선택</option>
                {workOrders.map((w) => <option key={w.id} value={w.id}>{w.orderNo} ({w.productName})</option>)}
              </select>
            </div>
            <div>
              {/* 원본 생산불출입력 머리의 [프로젝트]. 프로젝트별 원가에 이 불출이 잡힌다. */}
              <label className="mb-1 block text-sm text-slate-600">프로젝트</label>
              <CodePickerField label="프로젝트" hideLabel fill emptyLabel="선택 해제"
                               value={form.projectId} onChange={(v) => setForm({ ...form, projectId: v })}
                               items={projects.map((p) => ({ value: String(p.id), code: p.code, name: p.name }))} />
            </div>
          </div>

          {/*
            원본 생산불출입력의 격자. 머리(일자·담당자·창고·작업지시·프로젝트)는 한 번만
            정하고, 자재는 여러 줄 넣는다. 한 줄이라도 막히면 서버가 전부 되돌린다.
          */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, marginBottom: 4 }}>
            <span style={{ fontSize: 12.5, fontWeight: 700, color: '#3f4855' }}>자재</span>
            <button type="button" className="ec-btn" onClick={() => setLines([...lines, emptyLine()])}>줄 추가</button>
          </div>
          <table className="w-full text-left">
            <thead>
              <tr>
                <th style={{ width: 34 }}></th>
                <th>품목명</th>
                <th style={{ width: 130, textAlign: 'right' }}>수량</th>
                <th style={{ width: 200 }}>적요</th>
                <th style={{ width: 60, textAlign: 'center' }}>삭제</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l, idx) => (
                <tr key={l.key}>
                  <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{idx + 1}</td>
                  <td>
                    <CodePickerField label="자재" hideLabel fill emptyLabel="선택 해제"
                                     value={l.itemId} onChange={(v) => setLine(l.key, { itemId: v })}
                                     items={items.map((i) => ({ value: String(i.id), code: i.code, name: i.name, alias: i.searchKeyword, sub: i.unit }))} />
                  </td>
                  <td>
                    <input type="number" step="any" className={inputCls} style={{ textAlign: 'right' }}
                           value={l.qty} onChange={(e) => setLine(l.key, { qty: e.target.value })} />
                  </td>
                  <td>
                    <input className={inputCls} value={l.note} onChange={(e) => setLine(l.key, { note: e.target.value })} />
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <button type="button" onClick={() => setLines(lines.length > 1 ? lines.filter((x) => x.key !== l.key) : [emptyLine()])}
                            style={{ color: '#c60a2e', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12 }}>삭제</button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={2} style={{ textAlign: 'right', fontWeight: 700 }}>합계</td>
                <td style={{ textAlign: 'right', fontWeight: 700 }}>
                  {lines.reduce((a2, l) => a2 + (Number(l.qty) || 0), 0).toLocaleString()}
                </td>
                <td colSpan={2}></td>
              </tr>
            </tfoot>
          </table>

          <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end' }}>
            <button type="submit" className="ec-btn ec-btn-primary">등록</button>
          </div>
        </form>
      )}</Modal>

      {/* 원본 조건 차례: 창고 · 품목 · 프로젝트 · 담당자 · 적요 */}
      <ul className="ec-cond" style={{ marginBottom: 8 }}>
        <EcCond label="창고" pick>
          <CodePickerField label="창고" hideLabel width={170} emptyLabel="전체"
                           value={whCond} onChange={setWhCond} items={condPickers.warehouses} />
        </EcCond>
        <EcCond label="품목" pick>
          <CodePickerField label="품목" hideLabel width={170} emptyLabel="전체"
                           value={itemCond} onChange={setItemCond} items={condPickers.items} />
        </EcCond>
        <EcCond label="담당자" pick>
          <CodePickerField label="담당자" hideLabel width={170} emptyLabel="전체"
                           value={empCond} onChange={setEmpCond} items={condPickers.employees} />
        </EcCond>
        <EcCond label="적요">
          <input className="ec-input" value={noteCond}
                 onChange={(e) => setNoteCond(e.target.value)} style={{ width: 170 }} />
        </EcCond>
      </ul>

      <table className="w-full text-left">
        <thead>
          <tr>
            <th style={{ width: 34, textAlign: 'center' }}>
              <input type="checkbox"
                     checked={shown.length > 0 && shown.every((r) => checked.has(r.id))}
                     onChange={() => setChecked(
                       shown.every((r) => checked.has(r.id)) ? new Set() : new Set(shown.map((r) => r.id)),
                     )} />
            </th>
            <th>일자</th>
            <th style={{ width: 90 }}>담당자</th>
            {/*
              원본 차례: 일자-No. · <b>보내는창고명 · 받는공장명</b> · 품목명[규격명] ·
              수량 · <b>작업지시서</b> · 인쇄. 어디서 어디로 갔는지가 먼저고,
              어느 지시 때문인지는 뒤따라 읽는다. 우리는 그 셋이 다 딴 자리에 있었다.
            */}
            <th>보내는창고명</th>
            <th>받는공장명</th>
            {/*
              원본 이름은 [작업지시품목코드]다. 우리는 [생산품목]이라 적고 '[코드] 이름'
              을 한 칸에 몰아 두었다 — 원본을 쓰던 사람이 코드로 훑을 때 눈이 걸린다.
              이름은 잃지 않게 칸의 tooltip 으로 남긴다.
            */}
            {/*
              원본 폭 실측: [품목코드] 125 · [작업지시품목코드] 70 — <b>작업지시 쪽이 좁다.</b>
              불출의 주인공은 빠져 나가는 자재(품목코드)고, 작업지시 품목은 어디에 쓰였는지
              가리키는 곁가지라서다. 우리는 130 vs 120 으로 <b>반대</b>였다.
            */}
            <th style={{ width: 70 }}>작업지시품목코드</th>
            <th style={{ width: 125 }}>품목코드</th>
            {/* 원본 열 이름은 [품목명[규격명]] — 이름만으로는 같은 이름의 다른 규격을 못 가린다. */}
            <th>품목명[규격명]</th>
            <th style={{ textAlign: 'right' }}>수량</th>
            <th>단위</th>
            <th>작업지시서</th>
            <th>적요</th>
            {/* 원본 생산불출조회의 마지막 열 [인쇄] — 그 한 건을 불출증으로 찍는다. */}
            <th style={{ width: 60, textAlign: 'center' }}>인쇄</th>
            <th style={{ width: 60, textAlign: 'center' }}>관리</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={14} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
          ) : shown.length === 0 ? (
            <tr><td colSpan={14} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>등록된 데이터가 없습니다.</td></tr>
          ) : shown.map((r) => (
            <tr key={r.id}>
              <td style={{ textAlign: 'center' }}>
                <input type="checkbox" checked={checked.has(r.id)} onChange={() => setChecked((prev) => {
                  const next = new Set(prev)
                  if (next.has(r.id)) next.delete(r.id); else next.add(r.id)
                  return next
                })} />
              </td>
              <td style={{ fontFamily: 'monospace' }}>{r.issueDate}</td>
              <td style={{ color: r.employeeId ? undefined : '#c9ced6' }}>{empName(r.employeeId)}</td>
              <td>{r.warehouseName ?? '-'}</td>
              <td style={{ color: r.toWarehouseName ? undefined : '#c9ced6' }}>{r.toWarehouseName ?? '-'}</td>
              <td style={{ fontFamily: 'monospace', color: r.productCode ? undefined : '#c9ced6' }}
                  title={r.productName ?? ''}>
                {r.productCode ?? '-'}
              </td>
              <td style={{ fontFamily: 'monospace' }}>{r.itemCode}</td>
              <td>{r.itemName}{r.itemSpec ? `[${r.itemSpec}]` : ''}</td>
              <td style={{ textAlign: 'right' }}>{r.qty.toLocaleString()}</td>
              <td>{r.unit}</td>
              <td style={{ fontFamily: 'monospace' }}>{r.workOrderNo ?? '-'}</td>
              <td>{r.note ?? ''}</td>
              <td style={{ textAlign: 'center' }}>
                <button onClick={() => printOne(r)} style={{ color: 'var(--ec-blue)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12 }}>인쇄</button>
              </td>
              <td style={{ textAlign: 'center' }}>
                <button onClick={() => remove(r)} style={{ color: '#c60a2e', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12 }}>삭제</button>
              </td>
            </tr>
          ))}
        </tbody>
        {shown.length > 0 && (
          <tfoot>
            <tr>
              <td colSpan={7} style={{ textAlign: 'right', fontWeight: 700 }}>합계</td>
              <td style={{ textAlign: 'right', fontWeight: 700 }}>
                {shown.reduce((a, r) => a + r.qty, 0).toLocaleString()}
              </td>
              <td colSpan={6}></td>
            </tr>
          </tfoot>
        )}
      </table>
    </EcListShell>
  )
}
