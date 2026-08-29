import { useEffect, useMemo, useState } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import type { Item, QualityInspectionRequest, QualityInspectionType, QualityRequestStatus } from '../../api/types'
import EcListShell from '../../components/EcListShell'
import CodePickerField from '../../components/CodePickerField'
import { EcCond } from '../../components/EcStatusPanel'
import { useTableSort } from '../../utils/useTableSort'
import Modal from '../../components/Modal'
import { ymd } from '../../components/EcPeriodPicks'
import { dateText } from '../../utils/dateText'

/**
 * 재고 II > 품질관리 — 품질검사요청 (이카운트 C000692·E040628~E040631)
 * 검사 전 '요청'을 등록하고, 요청 → 검사완료/취소로 진행. 미검사현황 = 요청(REQUESTED) 상태.
 * 데이터는 GET/POST/PATCH/DELETE /api/quality-inspection-requests (백엔드 신설).
 */

const today = () => ymd(new Date())

const TYPES: { v: QualityInspectionType; label: string }[] = [
  { v: 'INCOMING', label: '수입검사' },
  { v: 'PROCESS', label: '공정검사' },
  { v: 'SHIPMENT', label: '출하검사' },
]

type Tab = 'ALL' | QualityRequestStatus
const TABS: { v: Tab; label: string }[] = [
  { v: 'ALL', label: '전체' },
  { v: 'REQUESTED', label: '미검사(요청)' },
  { v: 'INSPECTED', label: '검사완료' },
  { v: 'CANCELED', label: '취소' },
]
const statusColor = (s: QualityRequestStatus) => (s === 'REQUESTED' ? '#c07a00' : s === 'INSPECTED' ? '#1c7c3c' : '#8a929c')

export default function QualityRequestPage() {
  const [rows, setRows] = useState<QualityInspectionRequest[]>([])
  const [items, setItems] = useState<Item[]>([])
  const [projects, setProjects] = useState<{ id: number; code: string; name: string }[]>([])
  const [keyword, setKeyword] = useState('')
  /*
   * 원본 품질검사요청입력 조건: <b>일자-No.</b> · <b>담당자</b>.
   * 요청번호·요청일자·요청자가 표에는 다 찍히는데 <b>거를 수가 없었다</b> —
   * 검색상자는 품목명·로트까지 한꺼번에 훑어서 번호로만 좁힐 수 없었다.
   */
  const [docCond, setDocCond] = useState('')
  const [reqCond, setReqCond] = useState('')
  const [tab, setTab] = useState<Tab>('ALL')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({
    requestDate: today(), type: 'INCOMING', itemId: '',
    lotNo: '', requestQty: '', dueDate: '', projectId: '', requester: '', remark: '',
    inspectMethod: '', samplePercent: '',
  })

  async function load() {
    setLoading(true)
    try {
      const [q, i, pj] = await Promise.all([
        api.get<QualityInspectionRequest[]>('/quality-inspection-requests'),
        api.get<Item[]>('/items'),
        api.get<{ id: number; code: string; name: string }[]>('/projects'),
      ])
      setRows(q.data); setItems(i.data); setProjects(pj.data)
    } catch (err) { setError(extractErrorMessage(err)) }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  function set(k: keyof typeof form, v: string) { setForm((f) => ({ ...f, [k]: v })) }

  async function submit() {
    setError('')
    if (!form.itemId) return setError('품목을 선택하세요.')
    if (form.requestQty === '' || Number(form.requestQty) <= 0) return setError('요청수량을 입력하세요.')
    try {
      await api.post('/quality-inspection-requests', {
        requestDate: form.requestDate,
        type: form.type,
        itemId: Number(form.itemId),
        lotNo: form.lotNo || undefined,
        requestQty: Number(form.requestQty),
        dueDate: form.dueDate || undefined,
        projectId: form.projectId ? Number(form.projectId) : undefined,
        inspectMethod: form.inspectMethod || undefined,
        samplePercent: form.samplePercent ? Number(form.samplePercent) : undefined,
        requester: form.requester || undefined,
        remark: form.remark || undefined,
      })
      setForm((f) => ({ ...f, itemId: '', lotNo: '', requestQty: '', dueDate: '', projectId: '',
        inspectMethod: '', samplePercent: '', requester: '', remark: '' }))
      setShowForm(false)
      load()
    } catch (err) { setError(extractErrorMessage(err)) }
  }

  async function advance(r: QualityInspectionRequest, status: QualityRequestStatus) {
    try { await api.patch(`/quality-inspection-requests/${r.id}/status`, { status }); load() }
    catch (err) { alert(extractErrorMessage(err)) }
  }

  const shown = useMemo(() => rows
    .filter((r) => tab === 'ALL' || r.status === tab)
    .filter((r) => !docCond || r.requestNo.includes(docCond) || r.requestDate.includes(docCond))
    .filter((r) => !reqCond || (r.requester ?? '') === reqCond)
    .filter((r) => !keyword || r.itemName.includes(keyword) || r.requestNo.includes(keyword) || (r.lotNo ?? '').includes(keyword)),
  [rows, tab, keyword, docCond, reqCond])
  const count = (t: Tab) => (t === 'ALL' ? rows.length : rows.filter((r) => r.status === t).length)
  const inputCls = 'ec-input'


  /* 머리에 <b>▼ 만 그려 놓고</b> 정렬은 없었다 — 눌러도 아무 일이 없었다. */
  const sort = useTableSort(shown, {
    요청일자: (r) => r.requestDate,
  })

  return (
    <EcListShell
      title="품질검사요청"
      search={keyword}
      onSearchChange={setKeyword}
      onNew={() => setShowForm(true)}
      actions={[{ label: '새로고침', onClick: load }, { label: 'Excel' }]}
    >
      <p className="mb-2 text-xs text-slate-500">검사 전 요청을 등록 → 검사완료/취소 처리. 미검사현황 = 요청(대기) 상태.</p>
      {error && <p style={{ marginBottom: 8, background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3 }}>{error}</p>}

      <Modal open={showForm} title="품질검사요청 등록" onClose={() => setShowForm(false)}>{(
        <div style={{ border: '1px solid var(--ec-border)', background: '#fff', padding: 14, marginTop: 8, marginBottom: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--ec-blue-dark)', marginBottom: 10 }}>검사요청 등록</div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <label style={{ fontSize: 12.5 }}><div style={{ color: '#5a626e', marginBottom: 3 }}>요청일자</div>
              <input className={inputCls} type="date" value={form.requestDate} onChange={(e) => set('requestDate', e.target.value)} style={{ width: 140 }} /></label>
            <label style={{ fontSize: 12.5 }}><div style={{ color: '#5a626e', marginBottom: 3 }}>검사구분</div>
              <select className={inputCls} value={form.type} onChange={(e) => set('type', e.target.value)} style={{ width: 110 }}>
                {TYPES.map((t) => <option key={t.v} value={t.v}>{t.label}</option>)}
              </select></label>
            <label style={{ fontSize: 12.5 }}><div style={{ color: '#5a626e', marginBottom: 3 }}>품목 *</div>
              <select className={inputCls} value={form.itemId} onChange={(e) => set('itemId', e.target.value)} style={{ width: 220 }}>
                <option value="">선택하세요</option>
                {items.map((it) => <option key={it.id} value={it.id}>[{it.code}] {it.name}</option>)}
              </select></label>
            <label style={{ fontSize: 12.5 }}><div style={{ color: '#5a626e', marginBottom: 3 }}>로트No.</div>
              <input className={inputCls} value={form.lotNo} onChange={(e) => set('lotNo', e.target.value)} style={{ width: 150 }} /></label>
            <label style={{ fontSize: 12.5 }}><div style={{ color: '#5a626e', marginBottom: 3 }}>요청수량 *</div>
              <input className={inputCls} type="number" step="any" value={form.requestQty} onChange={(e) => set('requestQty', e.target.value)} style={{ width: 100 }} /></label>
            <label style={{ fontSize: 12.5 }}><div style={{ color: '#5a626e', marginBottom: 3 }}>검사기한</div>
              <input className={inputCls} type="date" value={form.dueDate} onChange={(e) => set('dueDate', e.target.value)} style={{ width: 140 }} /></label>
            <label style={{ fontSize: 12.5 }}><div style={{ color: '#5a626e', marginBottom: 3 }}>요청자</div>
              <input className={inputCls} value={form.requester} onChange={(e) => set('requester', e.target.value)} placeholder="미입력시 본인" style={{ width: 110 }} /></label>
            <label style={{ fontSize: 12.5, flex: 1, minWidth: 180 }}><div style={{ color: '#5a626e', marginBottom: 3 }}>비고</div>
              <input className={inputCls} value={form.remark} onChange={(e) => set('remark', e.target.value)} style={{ width: '100%' }} /></label>
            {/*
              원본 [검사방법] — <b>전수 · 샘플링(%)</b> 둘이고 샘플링이면 옆에 비율을 적는다(실측).
              몇 개를 검사해 달라는 수량만으로는 <b>다 보라는 건지 몇 개만 보라는 건지</b>
              알 수 없어, 요청서를 받고 되물어야 했다.
            */}
            <label style={{ fontSize: 12.5 }}><div style={{ color: '#5a626e', marginBottom: 3 }}>검사방법</div>
              <select className={inputCls} value={form.inspectMethod}
                      onChange={(e) => set('inspectMethod', e.target.value)} style={{ width: 110 }}>
                <option value="">(미지정)</option>
                <option value="전수">전수</option>
                <option value="샘플링">샘플링</option>
              </select></label>
            <label style={{ fontSize: 12.5 }}><div style={{ color: '#5a626e', marginBottom: 3 }}>샘플링(%)</div>
              <input className={inputCls} type="number" step="any" value={form.samplePercent}
                     disabled={form.inspectMethod !== '샘플링'}
                     onChange={(e) => set('samplePercent', e.target.value)}
                     style={{ width: 90, textAlign: 'right' }} /></label>
            {/* 원본 격자의 마지막이 [프로젝트] 다. 여기서 안 받으면 그 열이 늘 빈칸이다. */}
            <label style={{ fontSize: 12.5 }}><div style={{ color: '#5a626e', marginBottom: 3 }}>프로젝트</div>
              <select className={inputCls} value={form.projectId} onChange={(e) => set('projectId', e.target.value)} style={{ width: 150 }}>
                <option value="">(없음)</option>
                {projects.map((pj) => <option key={pj.id} value={pj.id}>{pj.name}</option>)}
              </select></label>
            <button className="ec-btn ec-btn-primary" onClick={submit}>저장</button>
          </div>
        </div>
      )}</Modal>

      <div style={{ display: 'flex', gap: 2, marginBottom: 8 }}>
        {TABS.map((t) => (
          <button key={t.v} onClick={() => setTab(t.v)} className="no-ec" style={{
            padding: '5px 12px', fontSize: 12.5, border: '1px solid var(--ec-border)', cursor: 'pointer', borderRadius: 3,
            background: tab === t.v ? 'var(--ec-blue)' : '#fff', color: tab === t.v ? '#fff' : '#3a4453', fontWeight: tab === t.v ? 700 : 400,
          }}>{t.label} ({count(t.v)})</button>
        ))}
      </div>

      {/* 원본 조건 차례: <b>일자-No.</b> · <b>담당자</b> */}
      <ul className="ec-cond" style={{ marginBottom: 8 }}>
        <EcCond label="일자-No.">
          <input className="ec-input" value={docCond} placeholder="요청일자 또는 요청번호"
                 onChange={(e) => setDocCond(e.target.value)} style={{ width: 190 }} />
        </EcCond>
        <EcCond label="담당자" pick>
          {/* 요청자는 사원 마스터를 물지 않고 이름으로 적히므로, 후보를 실제 요청자들에서 뽑는다. */}
          <CodePickerField label="담당자" hideLabel width={150} emptyLabel="전체"
                           value={reqCond} onChange={setReqCond}
                           items={[...new Set(rows.map((r) => r.requester).filter(Boolean))]
                             .map((n) => ({ value: n as string, name: n as string }))} />
        </EcCond>
      </ul>

      <table className="w-full text-left">
        <thead>
          <tr>
            <th style={{ width: 34 }}></th>
            <th style={{ width: 130 }}>요청번호</th>
            <th style={{ width: 100, cursor: 'pointer' }} onClick={() => sort.toggle('요청일자')}>요청일자 {sort.mark('요청일자')}</th>
            <th style={{ width: 90 }}>검사구분</th>
            {/* 원본 격자의 첫 열이 [검사방법] 이다(사본 실측). 샘플링이면 비율까지 적는다. */}
            <th style={{ width: 100 }}>검사방법</th>
            {/* 원본 격자 차례: 검사방법 · <b>품목 · 품목명 · 규격</b> · <b>수량</b> · <b>적요</b> · 프로젝트 */}
            <th style={{ width: 110 }}>품목</th>
            <th>품목명</th>
            <th style={{ width: 100 }}>규격</th>
            <th style={{ width: 120 }}>로트No.</th>
            <th style={{ width: 80, textAlign: 'right' }}>수량</th>
            <th style={{ width: 100 }}>검사기한</th>
            <th>적요</th>
            <th style={{ width: 80, textAlign: 'center' }}>상태</th>
            {/*
              원본 격자의 [프로젝트]. 검사에는 진작 있던 값인데 <b>요청에는 없어</b>
              프로젝트를 걸어 요청해도 그 값이 어디에도 안 남았다.
            */}
            <th style={{ width: 100 }}>프로젝트</th>
            <th style={{ width: 80 }}>요청자</th>
            <th style={{ width: 150, textAlign: 'center' }}>처리</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={16} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
          ) : shown.length === 0 ? (
            <tr><td colSpan={16} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>등록된 데이터가 없습니다.</td></tr>
          ) : sort.sorted.map((r, i) => (
            <tr key={r.id}>
              <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
              <td style={{ fontFamily: 'monospace' }}>{r.requestNo}</td>
              <td>{dateText(r.requestDate)}</td>
              <td>{r.typeName}</td>
              <td style={{ color: r.inspectMethod ? '#5a626e' : '#c9ced6' }}>
                {r.inspectMethod
                  ? (r.inspectMethod === '샘플링' && r.samplePercent != null
                    ? `샘플링 ${r.samplePercent}%` : r.inspectMethod)
                  : '-'}
              </td>
              <td style={{ fontFamily: 'monospace', color: '#5a626e' }}>{r.itemCode}</td>
              <td>{r.itemName}</td>
              <td style={{ color: '#5a626e' }}>{r.spec ?? ''}</td>
              <td style={{ fontFamily: 'monospace' }}>{r.lotNo ?? ''}</td>
              <td style={{ textAlign: 'right' }}>{r.requestQty.toLocaleString()}</td>
              <td style={{ color: r.dueDate ? '#5a626e' : '#c5cbd3' }}>{dateText(r.dueDate) || '-'}</td>
              <td style={{ color: '#5a626e' }}>{r.remark ?? ''}</td>
              <td style={{ textAlign: 'center', color: statusColor(r.status), fontWeight: 700 }}>{r.statusName}</td>
              <td style={{ color: r.projectName ? '#5a626e' : '#c9ced6' }}>{r.projectName ?? '-'}</td>
              <td>{r.requester ?? ''}</td>
              <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                {r.status === 'REQUESTED' ? (
                  <>
                    <button className="no-ec" onClick={() => advance(r, 'INSPECTED')} style={{ border: 'none', background: 'none', color: '#1c7c3c', cursor: 'pointer', fontSize: 12, marginRight: 8 }}>→ 검사완료</button>
                    <button className="no-ec" onClick={() => advance(r, 'CANCELED')} style={{ border: 'none', background: 'none', color: '#c60a2e', cursor: 'pointer', fontSize: 12 }}>취소</button>
                  </>
                ) : <span style={{ color: '#c5cbd3', fontSize: 12 }}>—</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </EcListShell>
  )
}
