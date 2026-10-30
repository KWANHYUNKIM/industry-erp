import { useEffect, useMemo, useRef, useState } from 'react'
import EcListShell from '../../components/EcListShell'
import CodePickerField from '../../components/CodePickerField'
import type { CodeColumn } from '../../components/CodeSearchModal'
import Modal from '../../components/Modal'
import EditStateMenu, { type StateOp } from '../../components/EditStateMenu'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import { EcCond } from '../../components/EcStatusPanel'
import EcPeriodPicks, { periodOf, ORDER_STAGE_PICKS } from '../../components/EcPeriodPicks'
import { ecAlert, ecConfirm, requireSelection } from '../../components/EcDialog'
import { api, extractErrorMessage } from '../../api/client'
import EcRowCap, { capRows } from '../../components/EcRowCap'
import EcDateInput, { EcDateRange } from '../../components/ui/EcDateInput'

/**
 * 재고2 > 오더관리 > 오더관리진행단계(E040904).
 *
 * <p>2026-10-21 loginaa 실측: 오더는 전표(수주)가 아니라 <b>오더관리번호</b>다. [신규(F2)] 로
 * [오더관리번호등록] 창(번호 00027 미리 찍힘 · 신규에서 고칠 수 있음(00023_202610 꼴) · 오더관리명 · 오더관리유형 · 생성일자 · 적요1 · 적요2 · 검색창내용)을
 * 열어 만들고, 격자는 오더관리번호 · 오더관리명 · 오더관리유형명 · 기준일자 · 진행단계('주문서 (0)') · 상세(보기).
 * 빈 오더관리명 · 오더관리유형으로 저장하면 두 칸만 붉어지고 글은 없다. 저장 · 삭제 뒤 창은 말 없이 닫힌다.
 * [전체단계완료] '선택한 오더관리번호를 종결 하겠습니까?' → 상세 [진행상태] 완료.
 *
 * <p>우리는 아직 전표에 오더관리번호 칸이 없어 단계별 전표 수는 늘 0 이다(plans/재고2.md 남은 것).
 */
interface OrderNo {
  id: number
  orderNo: string
  name: string
  orderTypeId: number
  orderTypeCode: string
  orderTypeName: string
  createdDate: string
  remarks1: string | null
  remarks2: string | null
  searchKeyword: string | null
  completed: boolean
  active: boolean
}

interface Step { seq: number; stageId: number; stageName: string }
interface OrderType { id: number; code: string; name: string; steps: Step[]; active: boolean }

/** 원본 '오더관리유형검색' 창 열 — 유형코드 · 유형명(2026-10-21 실측). */
const TYPE_COLUMNS: CodeColumn[] = [
  { head: '유형코드', width: 120, cell: (i) => i.code, link: true },
  { head: '유형명', cell: (i) => i.name, link: true },
]

interface Form {
  name: string
  orderTypeId: string
  createdDate: string
  remarks1: string
  remarks2: string
  searchKeyword: string
}

const initP = periodOf('최근30일(+1개월)')!
const today = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10)
const emptyForm = (): Form => ({ name: '', orderTypeId: '', createdDate: today(), remarks1: '', remarks2: '', searchKeyword: '' })

/**
 * {@code popup} — MyPage 오더관리진행단계 위젯이 이 화면을 숨긴 채(features/mypage/PopupHost) 창 하나만 띄울 때(원본 2026-10-30 홈 실측):
 * orderId 가 없으면 펜(새 글) → '오더관리번호등록', 있으면 오더관리번호 · 명 → 그 번호의 '오더관리번호등록', detail 이면 [보기] → '오더관리번호별 상세내역'.
 * 위젯은 기간이 달라(금월) 기간 없이 받는다.
 */
export default function OrderStagePage({ popup }: { popup?: { orderId?: number; detail?: boolean } } = {}) {
  const [rows, setRows] = useState<OrderNo[]>([])
  const [types, setTypes] = useState<OrderType[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [keyword, setKeyword] = useState('')
  const [from, setFrom] = useState(popup ? '' : initP.from)
  const [to, setTo] = useState(popup ? '' : initP.to)
  const [orderNoCond, setOrderNoCond] = useState('')
  const [byUpdated, setByUpdated] = useState(false)
  const [searchKeywordCond, setSearchKeywordCond] = useState('')
  const [typeFilter, setTypeFilter] = useState('전체')
  const [progress, setProgress] = useState<'전체' | '진행중' | '완료'>('전체')
  const [useTab, setUseTab] = useState<'전체' | '사용' | '사용중단'>('사용')
  const [checked, setChecked] = useState<Set<number>>(new Set())
  const [details, setDetails] = useState<number[]>([])

  /* [오더관리번호등록] 창 */
  const [formOpen, setFormOpen] = useState(false)
  const [editId, setEditId] = useState<number | null>(null)
  const [nextNo, setNextNo] = useState('')
  const [fnOpen, setFnOpen] = useState(false)
  const [form, setForm] = useState<Form>(emptyForm())
  const [invalid, setInvalid] = useState<Set<keyof Form>>(new Set())
  const [formError, setFormError] = useState('')

  async function load() {
    setLoading(true)
    setError('')
    try {
      const [o, t] = await Promise.all([
        api.get<OrderNo[]>('/order-numbers', { params: { from: from || undefined, to: to || undefined } }),
        api.get<OrderType[]>('/order-types'),
      ])
      setRows(o.data)
      setTypes(t.data)
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { load() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [from, to])

  /* MyPage 위젯에서 부른 창 — 처음 한 번만 연다(번호는 목록을 받은 뒤에 찾는다) */
  const popupDone = useRef(false)
  useEffect(() => {
    if (!popup || popupDone.current) return
    if (popup.orderId == null) { popupDone.current = true; void openNew(); return }
    const o = rows.find((r) => r.id === popup.orderId)
    if (!o) return
    popupDone.current = true
    if (popup.detail) setDetails([o.id])
    else openEdit(o)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows])

  const stepsOf = useMemo(() => new Map(types.map((t) => [t.id, t.steps])), [types])

  const shown = rows.filter((o) => {
    if (keyword && !(o.orderNo.includes(keyword) || o.name.includes(keyword))) return false
    if (searchKeywordCond && !(o.searchKeyword ?? '').includes(searchKeywordCond)) return false
    if (orderNoCond && !o.orderNo.includes(orderNoCond)) return false
    if (typeFilter !== '전체' && o.orderTypeName !== typeFilter) return false
    if (progress === '진행중' && o.completed) return false
    if (progress === '완료' && !o.completed) return false
    if (useTab === '사용' && !o.active) return false
    if (useTab === '사용중단' && o.active) return false
    return true
  })
    .slice()
    .sort((a, b) => (byUpdated ? b.id - a.id : 0))
  const capped = capRows(shown, 200)

  async function openNew() {
    setEditId(null)
    setForm(emptyForm())
    setInvalid(new Set())
    setFormError('')
    setFnOpen(false)
    setFormOpen(true)
    await genNo()
  }

  /* 원본 번호 칸 [Fn ▸ 코드생성] — 다음 다섯 자리 번호를 다시 찍는다. */
  async function genNo() {
    try {
      const r = await api.get<{ orderNo: string }>('/order-numbers/next-no')
      setNextNo(r.data.orderNo)
    } catch { setNextNo('') }
  }

  /* 원본 [Fn ▸ 중복확인] — 있으면 '이미 등록된 코드입니다.' */
  async function checkDup() {
    setFnOpen(false)
    const no = nextNo.trim()
    if (!no) return
    try {
      const r = await api.get<{ exists: boolean }>('/order-numbers/exists', { params: { orderNo: no } })
      await ecAlert(r.data.exists ? '이미 등록된 코드입니다.' : '사용할 수 있는 코드입니다.')
    } catch (err) {
      setFormError(extractErrorMessage(err))
    }
  }

  function openEdit(o: OrderNo) {
    setEditId(o.id)
    setNextNo(o.orderNo)
    setForm({
      name: o.name, orderTypeId: String(o.orderTypeId), createdDate: o.createdDate,
      remarks1: o.remarks1 ?? '', remarks2: o.remarks2 ?? '', searchKeyword: o.searchKeyword ?? '',
    })
    setInvalid(new Set())
    setFormError('')
    setFormOpen(true)
  }

  async function save() {
    /* 원본: 빈 오더관리명 · 오더관리유형 칸만 붉어지고 글은 없다. */
    const bad = new Set<keyof Form>()
    if (!form.name.trim()) bad.add('name')
    if (!form.orderTypeId) bad.add('orderTypeId')
    setInvalid(bad)
    if (bad.size > 0) return
    setFormError('')
    const body = {
      name: form.name.trim(), createdDate: form.createdDate || undefined,
      remarks1: form.remarks1 || null, remarks2: form.remarks2 || null, searchKeyword: form.searchKeyword || null,
    }
    try {
      if (editId) await api.put(`/order-numbers/${editId}`, body)
      else await api.post('/order-numbers', { ...body, orderNo: nextNo.trim() || null, orderTypeId: Number(form.orderTypeId) })
      setFormOpen(false)
      await load()
    } catch (err) {
      setFormError(extractErrorMessage(err))
    }
  }

  async function onState(op: StateOp) {
    if (!editId) return
    const cur = rows.find((r) => r.id === editId)
    try {
      if (op === '삭제') {
        if (!(await ecConfirm('삭제하겠습니까?'))) return
        await api.delete(`/order-numbers/${editId}`)
      } else if (cur) {
        await api.put(`/order-numbers/${editId}`, {
          name: cur.name, createdDate: cur.createdDate, remarks1: cur.remarks1, remarks2: cur.remarks2,
          searchKeyword: cur.searchKeyword, active: op === '재사용',
        })
      }
      setFormOpen(false)
      await load()
    } catch (err) {
      setFormError(extractErrorMessage(err))
    }
  }

  async function completeAll() {
    if (!requireSelection(checked.size)) return
    if (!(await ecConfirm('선택한 오더관리번호를 종결 하겠습니까?'))) return
    try {
      await api.post('/order-numbers/complete', { ids: [...checked] })
      setChecked(new Set())
      await load()
    } catch (err) { setError(extractErrorMessage(err)) }
  }

  async function toggleUse() {
    if (!requireSelection(checked.size)) return
    const targets = rows.filter((o) => checked.has(o.id))
    const reviving = targets.every((o) => !o.active)
    try {
      for (const o of targets) {
        await api.put(`/order-numbers/${o.id}`, {
          name: o.name, createdDate: o.createdDate, remarks1: o.remarks1, remarks2: o.remarks2,
          searchKeyword: o.searchKeyword, active: reviving,
        })
      }
      setChecked(new Set())
      await load()
    } catch (err) { setError(extractErrorMessage(err)) }
  }

  const tableRef = useRef<HTMLTableElement>(null)
  useTableColumnCheck(tableRef, '오더관리진행단계', [])

  const detailRows = rows.filter((o) => details.includes(o.id))
  const set = (k: keyof Form) => (e: { target: { value: string } }) => {
    const v = e.target.value
    setForm((f) => ({ ...f, [k]: v }))
    if (v) setInvalid((s) => { const n = new Set(s); n.delete(k); return n })
  }

  return (
    <EcListShell
      title="오더관리진행단계"
      search={keyword}
      onSearchChange={setKeyword}
      onSearch={load}
      searchable
      onNew={openNew}
      actions={[
        { label: '사용중단/재사용', onClick: toggleUse, selected: checked.size },
        { label: '전체단계완료', onClick: completeAll, selected: checked.size },
        { label: '선택상세보기', onClick: () => { if (requireSelection(checked.size)) setDetails([...checked]) }, selected: checked.size },
      ]}
    >
      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}

      <ul className="ec-cond mb-[8px]">
        <EcCond label="기준일자">
          <div className="flex items-center gap-[6px] flex-wrap">
            <EcDateRange from={{ className: "ec-input w-[140px]", value: from, onChange: (e) => setFrom(e.target.value) }} to={{ className: "ec-input w-[140px]", value: to, onChange: (e) => setTo(e.target.value) }} />
            <EcPeriodPicks labels={ORDER_STAGE_PICKS} currentFrom={from}
                           onPick={(r) => { setFrom(r.from); setTo(r.to) }} />
          </div>
        </EcCond>
        <EcCond label="오더관리유형" pick>
          {/* 원본 조건 · 등록 창 둘 다 코드도움 '오더관리유형검색'(유형코드 · 유형명, 2026-10-21 실측) */}
          <CodePickerField label="오더관리유형" hideLabel width={160} value={typeFilter === '전체' ? '' : typeFilter}
                           onChange={(v) => setTypeFilter(v || '전체')} columns={TYPE_COLUMNS}
                           items={types.map((t) => ({ value: t.name, code: t.code, name: t.name }))} />
        </EcCond>
        <EcCond label="오더관리번호">
          <input className="ec-input w-[160px]" value={orderNoCond} onChange={(e) => setOrderNoCond(e.target.value)} />
        </EcCond>
        <EcCond label="기타">
          <label className="flex items-center gap-[3px] text-[12.5px]">
            <input type="checkbox" checked={byUpdated} onChange={(e) => setByUpdated(e.target.checked)} />
            수정일자순(정렬)
          </label>
        </EcCond>
        <EcCond label="검색창내용">
          <input className="ec-input w-[160px]" value={searchKeywordCond} placeholder="검색창내용"
                 onChange={(e) => setSearchKeywordCond(e.target.value)} />
        </EcCond>
        <EcCond label="진행">
          <div className="ec-pills">
            {(['전체', '진행중', '완료'] as const).map((t) => (
              <button key={t} type="button" className={`ec-pill no-ec${progress === t ? ' active' : ''}`}
                      onClick={() => setProgress(t)}>{t}</button>
            ))}
          </div>
        </EcCond>
        <EcCond label="사용여부">
          <div className="ec-pills">
            {(['전체', '사용', '사용중단'] as const).map((t) => (
              <button key={t} type="button" className={`ec-pill no-ec${useTab === t ? ' active' : ''}`}
                      onClick={() => setUseTab(t)}>{t}</button>
            ))}
          </div>
        </EcCond>
      </ul>

      <div className="overflow-x-auto">
        <EcRowCap capped={capped.capped} shown={capped.rows.length} total={capped.total}
                  hint="검색어나 유형으로 좁혀 보세요." />
        <table ref={tableRef} className="ec-grid w-full text-left">
          <thead>
            <tr>
              <th className="w-[30px] text-center">
                <input type="checkbox"
                       checked={shown.length > 0 && shown.every((o) => checked.has(o.id))}
                       onChange={() => setChecked(
                         shown.every((o) => checked.has(o.id)) ? new Set() : new Set(shown.map((o) => o.id)))} />
              </th>
              <th className="w-[34px]"></th>
              <th className="w-[130px]">오더관리번호</th>
              <th>오더관리명</th>
              <th className="w-[100px]">오더관리유형명</th>
              <th className="w-[100px]">기준일자</th>
              <th>진행단계</th>
              <th className="w-[50px] text-center">상세</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} className="ec-empty">불러오는 중…</td></tr>
            ) : shown.length === 0 ? (
              <tr><td colSpan={8} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
            ) : capped.rows.map((o, i) => {
              const steps = stepsOf.get(o.orderTypeId) ?? []
              return (
                <tr key={o.id}>
                  <td className="text-center">
                    <input type="checkbox" checked={checked.has(o.id)} onChange={() => setChecked((prev) => {
                      const next = new Set(prev)
                      if (next.has(o.id)) next.delete(o.id); else next.add(o.id)
                      return next
                    })} />
                  </td>
                  <td className="text-center text-ec-hint">{i + 1}</td>
                  <td><a href="#" className="ec-link" onClick={(e) => { e.preventDefault(); openEdit(o) }}>{o.orderNo}</a></td>
                  <td>{o.name}</td>
                  <td>{o.orderTypeName}</td>
                  <td>{o.createdDate.replace(/-/g, '/')}</td>
                  <td>
                    {/* 원본: 유형의 단계마다 '단계명 (연결 전표 수)' 알약. 우리 전표에는 아직 오더관리번호 칸이 없어 0. */}
                    <div className="ec-pills">
                      {steps.map((s, k) => (
                        <span key={s.seq} className={`ec-pill no-ec${!o.completed && k === 0 ? ' active' : ''}`}>
                          {s.stageName} (0)
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="text-center">
                    <a href="#" className="ec-link" onClick={(e) => { e.preventDefault(); setDetails([o.id]) }}>보기</a>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <Modal open={formOpen} title="오더관리번호등록" onClose={() => setFormOpen(false)} error={formError} width={560}>
        <div className="ec-form">
          <div className="grid grid-cols-[110px_1fr] gap-[6px] items-center text-[12.5px]">
            <label>오더관리번호</label>
            {/* 원본(2026-10-30 실측): 신규는 다음 번호가 찍힌 채 고칠 수 있고 옆에 [Fn ▾ 중복확인 · 코드생성], 수정 창은 번호를 글자로만 보인다. */}
            {editId ? <span>{nextNo}</span> : (
              <span className="relative flex">
                <input className="ec-input w-full" value={nextNo} placeholder="오더관리번호" maxLength={30}
                       onChange={(e) => setNextNo(e.target.value)} />
                <button type="button" className="ec-btn" title="Fn" onClick={() => setFnOpen((v) => !v)}>Fn</button>
                {fnOpen && (
                  <div className="ec-menu">
                    <button type="button" onClick={() => void checkDup()}>중복확인</button>
                    <button type="button" onClick={() => { setFnOpen(false); void genNo() }}>코드생성</button>
                  </div>
                )}
              </span>
            )}
            <label>오더관리명</label>
            <span className={invalid.has('name') ? 'ec-invalid' : ''}>
              <input className="ec-input w-full" placeholder="오더관리명" value={form.name} onChange={set('name')} />
            </span>
            <label>오더관리유형</label>
            <span className={invalid.has('orderTypeId') ? 'ec-invalid' : ''}>
              <CodePickerField label="오더관리유형" hideLabel fill emptyLabel="" value={form.orderTypeId} disabled={!!editId}
                               onChange={(v) => set('orderTypeId')({ target: { value: v } })}
                               columns={TYPE_COLUMNS}
                               items={types.filter((t) => t.active || String(t.id) === form.orderTypeId)
                                 .map((t) => ({ value: String(t.id), code: t.code, name: t.name }))} />
            </span>
            <label>생성일자</label>
            <EcDateInput className="ec-input w-[150px]" value={form.createdDate} onChange={set('createdDate')} />
            <label>적요1</label>
            <input className="ec-input w-full" placeholder="적요1" value={form.remarks1} onChange={set('remarks1')} />
            <label>적요2</label>
            <input className="ec-input w-full" placeholder="적요2" value={form.remarks2} onChange={set('remarks2')} />
            <label>검색창내용</label>
            <input className="ec-input w-full" placeholder="검색창내용" value={form.searchKeyword} onChange={set('searchKeyword')} />
          </div>
        </div>
        <div className="mt-[10px] flex gap-[4px]">
          <button type="button" className="ec-btn ec-btn-primary" onClick={save}>저장(F8)</button>
          <button type="button" className="ec-btn" onClick={() => { if (editId) { const o = rows.find((r) => r.id === editId); if (o) openEdit(o) } else { setForm(emptyForm()); setInvalid(new Set()) } }}>다시 작성</button>
          {editId && <EditStateMenu active={rows.find((r) => r.id === editId)?.active ?? true} onPick={onState} />}
          <button type="button" className="ec-btn" onClick={() => setFormOpen(false)}>닫기</button>
        </div>
      </Modal>

      <Modal open={detailRows.length > 0} title="오더관리번호별 상세내역" onClose={() => setDetails([])} width={620}>
        {detailRows.map((d) => {
          const steps = stepsOf.get(d.orderTypeId) ?? []
          const st = steps[0]
          return (
            <div key={d.id} className="mb-[12px] text-[12.5px]">
              <div className="mb-[6px]">오더관리번호: {d.orderNo} / 오더관리명: {d.name}</div>
              <table className="ec-grid w-full mb-[6px]">
                <tbody>
                  <tr><th className="w-[110px]">단계</th><td>{st ? `${st.seq}단계 [${st.stageName}]` : ''}</td></tr>
                  <tr><th>불러오기 기준</th><td></td></tr>
                  <tr><th>진행상태</th><td>{d.completed ? '완료' : '진행중'}</td></tr>
                </tbody>
              </table>
              <table className="ec-grid w-full">
                <thead><tr><th>품목코드</th><th>품명</th><th>규격</th><th>입력수량</th></tr></thead>
                <tbody><tr><td colSpan={4} className="ec-empty">등록된 데이터가 없습니다.</td></tr></tbody>
              </table>
            </div>
          )
        })}
        <div className="flex gap-[4px]">
          <button type="button" className="ec-btn" onClick={() => setDetails([])}>닫기</button>
        </div>
      </Modal>
    </EcListShell>
  )
}
