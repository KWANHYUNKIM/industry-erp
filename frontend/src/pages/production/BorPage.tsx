import { useEffect, useMemo, useState, type FormEvent } from 'react'
import EcListShell from '../../components/EcListShell'
import Modal from '../../components/Modal'
import CodePickerField from '../../components/CodePickerField'
import { EcCond } from '../../components/EcStatusPanel'
import { api, extractErrorMessage } from '../../api/client'
import type { Item } from '../../types/api'

/**
 * 생산관리 > BOR(작업소요시간).
 *
 * <p>원본 열 실측(사본): 생산품목코드 · 생산품목명 · 품목구분 · 생산공정명 ·
 * <b>생산수량</b> · <b>작업순서</b> · <b>작업명</b> · <b>작업시간(H)</b>.
 * 품목마다 "어느 공정을 어떤 순서로 몇 시간 거치는가" 를 적어 두는 <b>마스터</b>다.
 *
 * <p>우리 화면은 공정 목록에 로트수량을 곱해 보여 주는 <b>계산기</b>였다. 품목이 아예 없었고,
 * 그래서 "이 제품을 만드는 데 표준 몇 시간" 을 어디서도 알 수 없었다. 그 여파로
 * 작업지시서효율현황의 '시간 표준' 은 <b>실제로 작업한 공정만</b> 되짚어 셀 수밖에 없었다 —
 * 빼먹은 공정은 표준에도 안 잡히니 영영 안 보인다.
 *
 * <p>BOM 이 "무엇으로 만드는가" 라면 BOR 은 "어떻게 만드는가" 다.
 */
interface BorRow {
  id: number
  productId: number
  productCode: string
  productName: string
  productUnit: string
  categoryName: string | null
  processId: number
  processCode: string
  processName: string
  seq: number
  workName: string
  baseQty: number
  workHours: number
  /** 1개당 작업시간(H) = 작업시간 ÷ 생산수량. 서버가 낸다. */
  hoursPerUnit: number
  /** 원본 [작업기준품목코드]·[작업기준품목명]·[작업량]. 안 정했으면 null. */
  workItemId: number | null
  workItemCode: string | null
  workItemName: string | null
  workQty: number | null
  remark: string | null
  active: boolean
}

/** active — 원본은 사용중단한 공정을 코드도움에 안 띄운다. */
interface ProcessRow { id: number; code: string; name: string; workcenter: string | null; active: boolean }

const emptyForm = { productId: '', processId: '', seq: '1', workName: '', baseQty: '1', workHours: '',
  workItemId: '', workQty: '', remark: '' }

/** 소수시간을 시:분으로. 0.175H 는 10분 30초라 분까지 보여 준다. */
function hhmm(hours: number): string {
  const total = Math.round(hours * 60)
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

export default function BorPage() {
  const [rows, setRows] = useState<BorRow[]>([])
  const [items, setItems] = useState<Item[]>([])
  const [processes, setProcesses] = useState<ProcessRow[]>([])
  /**
   * 작업코드 마스터(공정등록 &gt; 작업코드등록). 있으면 작업명을 골라 쓴다 —
   * 자유입력만 두면 같은 작업이 '절단'·'절단작업'·'컷팅' 으로 갈라진다.
   * 마스터가 비어 있어도 자유입력은 그대로 되므로 막지 않는다.
   */
  const [operations, setOperations] = useState<{ id: number; processId: number; code: string; name: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [keyword, setKeyword] = useState('')
  /*
   * 원본 BOR(작업소요시간)은 <b>[생산품목]·[생산공정]을 따로</b> 묻는다(대조표 실측).
   * 우리는 둘을 키워드 한 칸으로 합쳐 두었는데, 그 칸이 <b>셸이 그리는 검색 상자와
   * 같은 상태</b>라 같은 칸이 화면에 두 번 서 있었다 — 한쪽에 치면 다른 쪽이 같이 변했다.
   */
  const [itemCond, setItemCond] = useState('')
  const [processCond, setProcessCond] = useState('')
  const [useTab, setUseTab] = useState<'전체' | '사용' | '사용중단'>('사용')
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<number | null>(null)
  const [form, setForm] = useState({ ...emptyForm })
  /** 원본에는 없지만, 라우팅을 세워 놓고 "그럼 100개는 몇 시간인가" 를 바로 보고 싶어 남긴다. */
  const [lotSize, setLotSize] = useState('100')

  async function load() {
    setLoading(true)
    setError('')
    try {
      const [b, i, p, o] = await Promise.all([
        api.get<BorRow[]>('/bor'),
        api.get<Item[]>('/items'),
        api.get<ProcessRow[]>('/processes'),
        api.get<{ id: number; processId: number; code: string; name: string }[]>('/process-operations'),
      ])
      setRows(b.data); setItems(i.data); setProcesses(p.data); setOperations(o.data)
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { load() }, [])

  const set = (f: keyof typeof form, v: string) => setForm((prev) => ({ ...prev, [f]: v }))

  function openCreate() {
    setEditId(null)
    setForm({ ...emptyForm })
    setShowForm(true)
  }

  function openEdit(r: BorRow) {
    setEditId(r.id)
    setForm({
      productId: String(r.productId), processId: String(r.processId),
      seq: String(r.seq), workName: r.workName,
      workItemId: r.workItemId ? String(r.workItemId) : '', workQty: r.workQty != null ? String(r.workQty) : '',
      baseQty: String(r.baseQty), workHours: String(r.workHours), remark: r.remark ?? '',
    })
    setShowForm(true)
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError('')
    const body = {
      productId: Number(form.productId), processId: Number(form.processId),
      seq: Number(form.seq), workName: form.workName,
      workItemId: form.workItemId ? Number(form.workItemId) : undefined,
      workQty: form.workQty ? Number(form.workQty) : undefined,
      baseQty: Number(form.baseQty || 1), workHours: Number(form.workHours || 0),
      remark: form.remark || null, active: true,
    }
    try {
      if (editId != null) await api.put(`/bor/${editId}`, body)
      else await api.post('/bor', body)
      setShowForm(false)
      setForm({ ...emptyForm })
      load()
    } catch (err) {
      setError(extractErrorMessage(err))
    }
  }

  async function remove(r: BorRow) {
    if (!confirm(`[${r.productName}] ${r.seq}. ${r.workName} 을(를) 삭제할까요?`)) return
    try {
      await api.delete(`/bor/${r.id}`)
      load()
    } catch (err) {
      alert(extractErrorMessage(err))
    }
  }

  const shown = rows.filter((r) => !keyword
    || r.productName.includes(keyword) || r.productCode.includes(keyword)
    || r.processName.includes(keyword) || r.workName.includes(keyword))
    .filter((r) => !itemCond || String(r.productId) === itemCond)
    .filter((r) => !processCond || String(r.processId) === processCond)
    .filter((r) => useTab === '전체' || (useTab === '사용' ? r.active : !r.active))

  /**
   * 원본 BOR(작업소요시간) 목록은 <b>BOR 이 없는 품목도</b> 한 줄씩 보인다(2026-10-02 loginaa 실측: 포장김치 · 투광등 ·
   * 코카콜라 1box 처럼 작업 칸이 빈 줄). 눌러서 바로 BOR 을 등록한다. 품목·공정으로 걸렀거나 [사용중단] 탭이면 안 보인다.
   */
  const noBor = useMemo(() => {
    if (keyword || itemCond || processCond || useTab === '사용중단') return []
    const has = new Set(rows.map((r) => r.productId))
    /* 원본은 제품 · 반제품 · 상품만 보인다 — 원재료·부재료는 만드는 품목이 아니라 BOR 을 달 일이 없다. */
    return items.filter((i) => i.active && !has.has(i.id) && i.category !== 'RAW_MATERIAL' && i.category !== 'SUB_MATERIAL')
      .sort((a, b) => a.code.localeCompare(b.code))
  }, [rows, items, keyword, itemCond, processCond, useTab])

  /** 품목별 1개당 표준시간 합. 원본은 품목 아래에 작업을 늘어놓으므로 소계가 뜻을 갖는다. */
  const perProduct = useMemo(() => {
    const m = new Map<number, number>()
    for (const r of shown) m.set(r.productId, (m.get(r.productId) ?? 0) + r.hoursPerUnit)
    return m
  }, [shown])

  const lot = Number(lotSize) || 0

  return (
    <EcListShell
      title="BOR(작업소요시간)"
      search={keyword}
      onSearchChange={setKeyword}
      onSearch={load}
      newLabel="신규(F2)"
      onNew={openCreate}
      actions={[{ label: '새로고침', onClick: load }, { label: 'Excel' }]}
    >
      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}

      <Modal error={error} open={showForm} title={editId ? '작업 수정' : '작업 등록'} onClose={() => setShowForm(false)}>{(
        <form onSubmit={submit} style={{ border: '1px solid var(--ec-border)', background: '#fff', padding: 14 }}>
          <div className="mt-2 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <CodePickerField
              label="생산품목 *" placeholder="품목 선택"
              value={form.productId} onChange={(v) => set('productId', v)}
              items={items.map((i) => ({ value: String(i.id), code: i.code, name: i.name, alias: i.searchKeyword, sub: i.categoryName }))}
            />
            <CodePickerField
              label="생산공정 *" placeholder="공정 선택"
              value={form.processId} onChange={(v) => set('processId', v)}
              items={processes.filter((p) => p.active !== false).map((p) => ({ value: String(p.id), code: p.code, name: p.name, sub: p.workcenter ?? undefined }))}
            />
            <div>
              <label className="mb-1 block text-sm text-ec-label">작업순서 *</label>
              <input className="ec-input w-full" type="number" value={form.seq} onChange={(e) => set('seq', e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-sm text-ec-label">작업명 *</label>
              <input className="ec-input w-full" list="bor-op-list" value={form.workName}
                     onChange={(e) => set('workName', e.target.value)} placeholder="예: 절단, 조립, 검사" />
              {/* 고른 공정의 작업코드를 먼저 보여 준다. 마스터가 비어 있으면 그냥 자유입력이다. */}
              <datalist id="bor-op-list">
                {operations
                  .filter((o) => !form.processId || String(o.processId) === form.processId)
                  .map((o) => <option key={o.id} value={o.name}>{o.code}</option>)}
              </datalist>
            </div>
            {/*
              원본 [작업기준품목]·[작업량]. 여기서 안 받으면 그 열이 늘 빈칸이다.
              안 정해도 된다(완제품 기준으로만 재는 공정) — 대신 <b>품목을 안 고르면 양도 안 받는다</b>.
              무엇을 얼마나 다루는지 반쪽만 남기지 않는다.
            */}
            <CodePickerField
              label="작업기준품목" placeholder="완제품과 같으면 비워 둠"
              value={form.workItemId} onChange={(v) => set('workItemId', v)}
              items={items.map((i) => ({ value: String(i.id), code: i.code, name: i.name, alias: i.searchKeyword, sub: i.categoryName }))}
            />
            <div>
              <label className="mb-1 block text-sm text-ec-label">작업량</label>
              <input className="ec-input w-full text-right" type="number" step="any" value={form.workQty}
                     disabled={!form.workItemId}
                     onChange={(e) => set('workQty', e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-sm text-ec-label">생산수량</label>
              <input className="ec-input w-full text-right" type="number" step="any" value={form.baseQty}
                     onChange={(e) => set('baseQty', e.target.value)} />
              <p className="text-[11.5px] text-ec-hint mt-[3px]">
                아래 작업시간이 <b>몇 개를 만드는 기준</b>인지. 1개 기준이면 1, 100개 로트 기준이면 100.
              </p>
            </div>
            <div>
              <label className="mb-1 block text-sm text-ec-label">작업시간(H) *</label>
              <input className="ec-input w-full text-right" type="number" step="any" value={form.workHours}
                     onChange={(e) => set('workHours', e.target.value)} placeholder="예: 1.5" />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-sm text-ec-label">적요</label>
              <input className="ec-input w-full" value={form.remark} onChange={(e) => set('remark', e.target.value)} />
            </div>
          </div>
          <div className="mt-[12px] flex justify-end">
            <button type="submit" className="ec-btn ec-btn-primary">{editId ? '저장' : '등록'}</button>
          </div>
        </form>
      )}</Modal>

      <ul className="ec-cond" style={{ marginBottom: 8 }}>
        {/* 원본 차례: <b>생산품목 · 생산공정 · 생산수량</b>(대조표 실측). */}
        {/* 마스터를 고르는 조건은 코드도움으로 든다(이 저장소의 규칙 — ui-check 가 지킨다). */}
        <EcCond label="생산품목" pick>
          <CodePickerField
            hideLabel label="생산품목" placeholder="생산품목 선택" emptyLabel="선택 해제" width={200}
            value={itemCond} onChange={setItemCond}
            items={items.map((i) => ({ value: String(i.id), code: i.code, name: i.name, alias: i.searchKeyword, sub: i.categoryName }))}
          />
        </EcCond>
        <EcCond label="생산공정" pick>
          <CodePickerField
            hideLabel label="생산공정" placeholder="생산공정 선택" emptyLabel="선택 해제" width={180}
            value={processCond} onChange={setProcessCond}
            items={processes.map((p) => ({ value: String(p.id), code: p.code, name: p.name, sub: p.workcenter ?? undefined }))}
          />
        </EcCond>
        {/*
          원본은 이 칸을 <b>[생산수량]</b> 이라 부른다 — 우리 표의 열 이름도 [생산수량] 인데
          조건에서만 [로트수량] 이라 불러 같은 값이 두 이름으로 서 있었다.
        */}
        <EcCond label="생산수량" span={2}>
          <input className="ec-input text-right" type="number" value={lotSize}
                 onChange={(e) => setLotSize(e.target.value)} style={{ width: 100 }} />
          <span className="text-[11.5px] text-ec-hint">이 수량을 만들 때의 시간을 함께 보여 줍니다.</span>
        </EcCond>
      </ul>

      <div className="overflow-x-auto">
        <table className="ec-grid w-full text-left">
        {/*
        원본 [사용여부] — <b>전체 · 사용 · 사용중단</b> 이고 [사용]이 켜진 채 뜬다(사본 실측).
        마스터는 지우지 않고 내리므로, 내린 것을 볼지 고르는 자리가 있어야 한다.
      */}
      <div className="ec-pills" style={{ marginBottom: 8 }}>
        {(['전체', '사용', '사용중단'] as const).map((t) => (
          <button key={t} type="button" className={`ec-pill no-ec${useTab === t ? ' active' : ''}`}
                  onClick={() => setUseTab(t)}>{t}</button>
        ))}
      </div>
        <thead>
            <tr>
              <th className="w-[34px]"></th>
              <th>생산품목코드</th>
              <th>생산품목명</th>
              <th className="w-[80px]">품목구분</th>
              <th>생산공정명</th>
              <th className="w-[80px] text-right">생산수량</th>
              {/* 원본 실측: [작업순서]는 왼쪽이다 — 세는 수가 아니라 차례를 적는 칸이다. */}
              <th className="w-[80px]">작업순서</th>
              <th>작업명</th>
              <th className="w-[100px] text-right">작업시간(H)</th>
              {/*
                원본 차례: … 작업시간(H) · <b>작업기준품목코드 · 작업기준품목명 · 작업량</b>.
                이 작업이 <b>어느 품목을 얼마만큼</b> 다루는가 — 같은 공정이라도 다루는 물건과
                양이 다르면 걸리는 시간이 달라지는데, 작업시간만 적어 두면 그 근거가 안 남는다.
              */}
              <th className="w-[110px]">작업기준품목코드</th>
              <th className="w-[140px]">작업기준품목명</th>
              <th className="w-[90px] text-right">작업량</th>
              <th className="w-[100px] text-right">1개당(H)</th>
              <th className="w-[110px] text-right">{lot.toLocaleString('ko-KR')}개 소요</th>
              <th className="w-[80px] text-center">관리</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={15} className="ec-empty">불러오는 중…</td></tr>
            ) : noBor.length === 0 && shown.length === 0 ? (
              <tr><td colSpan={15} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
            ) : shown.map((r, i) => {
              const first = i === 0 || shown[i - 1].productId !== r.productId
              return (
                <tr key={r.id} style={first && i > 0 ? { borderTop: '2px solid #d7dce3' } : undefined}>
                  <td className="text-center text-ec-hint">{i + 1}</td>
                  <td>{first ? r.productCode : ''}</td>
                  <td>{first ? r.productName : ''}</td>
                  <td className="text-ec-label">{first ? (r.categoryName ? `[${r.categoryName}]` : '') : ''}</td>
                  <td>{r.processName}</td>
                  <td className="text-right text-ec-label">{r.baseQty.toLocaleString('ko-KR')}</td>
                  {/* 원본 실측: 왼쪽이다 — 세는 수가 아니라 차례를 적는 칸이라 자릿수를 맞출 일이 없다. */}
                  <td>{r.seq}</td>
                  <td>{r.workName}</td>
                  <td className="text-right">{r.workHours.toLocaleString('ko-KR')}</td>
                  <td style={{ fontFamily: 'monospace', color: r.workItemCode ? 'var(--ec-label)' : 'var(--ec-text-off)' }}>{r.workItemCode ?? ''}</td>
                  <td style={{ color: r.workItemName ? undefined : 'var(--ec-text-off)' }}>{r.workItemName ?? ''}</td>
                  <td style={{ textAlign: 'right', color: r.workQty != null ? undefined : 'var(--ec-text-off)' }}>
                    {r.workQty != null ? r.workQty.toLocaleString('ko-KR') : '-'}
                  </td>
                  <td className="text-right text-ec-label">{r.hoursPerUnit.toFixed(4)}</td>
                  <td className="text-right font-bold">{hhmm(r.hoursPerUnit * lot)}</td>
                  <td className="text-center">
                    <button onClick={() => openEdit(r)} style={{ color: 'var(--ec-blue)', marginRight: 8, background: 'none', border: 'none', cursor: 'pointer', fontSize: 12 }}>수정</button>
                    <button onClick={() => remove(r)} style={{ color: 'var(--ec-danger)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12 }}>삭제</button>
                  </td>
                </tr>
              )
            }).concat(noBor.map((it, k) => (
              <tr key={`nb${it.id}`} style={k === 0 && shown.length > 0 ? { borderTop: '2px solid #d7dce3' } : undefined}>
                <td className="text-center text-ec-hint">{shown.length + k + 1}</td>
                <td>{it.code}</td>
                <td>{it.name}</td>
                <td className="text-ec-label">{it.categoryName ? `[${it.categoryName}]` : ''}</td>
                <td colSpan={10} className="text-ec-off">BOR 없음</td>
                <td className="text-center">
                  <button onClick={() => { setForm({ ...emptyForm, productId: String(it.id) }); setShowForm(true) }}
                          style={{ color: 'var(--ec-blue)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12 }}>BOR등록</button>
                </td>
              </tr>
            )))}
          </tbody>
          {shown.length > 0 && (
            <tfoot>
              <tr className="font-bold bg-ec-page">
                <td colSpan={12} className="text-right">
                  품목 {perProduct.size}개 · 작업 {shown.length}줄
                </td>
                <td className="text-right">
                  {[...perProduct.values()].reduce((n, v) => n + v, 0).toFixed(4)}
                </td>
                <td className="text-right text-ec-navy">
                  {hhmm([...perProduct.values()].reduce((n, v) => n + v, 0) * lot)}
                </td>
                <td></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </EcListShell>
  )
}
