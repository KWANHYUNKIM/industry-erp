import { useEffect, useState, type FormEvent } from 'react'
import EcListShell from '../../components/EcListShell'
import { EcCond } from '../../components/EcStatusPanel'
import CodePickerField from '../../components/CodePickerField'
import Modal from '../../components/Modal'
import { api, extractErrorMessage } from '../../api/client'
import type { Item, MallItemMapping } from '../../api/types'

/**
 * 재고 I > 쇼핑몰관리 > 쇼핑몰품목코드연결 (이카운트 E041004)
 * (쇼핑몰, 몰품목코드) → 우리 품목 매핑 마스터. 주문 수집 시 품목 미지정이면 이 매핑으로 자동 연결된다.
 * 백엔드 신규: mall_item_mappings + /api/mall-item-mappings (수집 자동연결은 MallOrderService.collect).
 */
export default function MallItemMappingPage() {
  const [rows, setRows] = useState<MallItemMapping[]>([])
  const [items, setItems] = useState<Item[]>([])
  /*
   * 몰 마스터(쇼핑몰계정등록)를 그대로 쓴다. 예전에는 '코드를 가진 몰 마스터가 없다' 고
   * 적고 [쇼핑몰코드] 열을 뺐는데, <b>그 사이 마스터가 생겼다</b> — 코드도 들고 있다.
   * 연결은 몰 <b>이름</b>으로 맺으므로(키를 바꾸지 않는다) 코드는 이름으로 찾아 붙인다.
   */
  const [malls, setMalls] = useState<{ code: string; name: string }[]>([])
  const mallCodeOf = (name: string) => malls.find((m) => m.name === name)?.code ?? ''
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<number | null>(null)
  /*
   * 원본 쇼핑몰품목코드연결의 조건은 <b>품목 · 쇼핑몰 · 쇼핑몰품목key</b> 다(사본 실측).
   * 우리 화면은 <b>조건이 하나도 없어</b>, 몰이 여럿이면 연결이 수백 줄로 늘어서는데
   * 그 가운데 한 건을 찾으려면 눈으로 훑어야 했다.
   */
  const [itemCond, setItemCond] = useState('')
  const [mallCond, setMallCond] = useState('')
  const [keyCond, setKeyCond] = useState('')
  const [form, setForm] = useState({ mall: '', mallProductCode: '', mallProductName: '', itemId: '' })

  async function load() {
    setLoading(true); setError('')
    try {
      const [m, it, ma] = await Promise.all([
        api.get<MallItemMapping[]>('/mall-item-mappings'),
        api.get<Item[]>('/items'),
        api.get<{ code: string; name: string; active: boolean }[]>('/mall-accounts'),
      ])
      setRows(m.data); setItems(it.data)
      setMalls(ma.data.filter((x) => x.active).map((x) => ({ code: x.code, name: x.name })))
    } catch (err) { setError(extractErrorMessage(err)) }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }))

  function openNew() {
    setEditId(null); setForm({ mall: '', mallProductCode: '', mallProductName: '', itemId: '' }); setShowForm(true)
  }
  function openEdit(m: MallItemMapping) {
    setEditId(m.id)
    setForm({ mall: m.mall, mallProductCode: m.mallProductCode, mallProductName: m.mallProductName ?? '', itemId: String(m.itemId) })
    setShowForm(true)
  }

  async function submit(e: FormEvent) {
    e.preventDefault(); setError(''); setOk('')
    if (!form.itemId) return setError('연결할 품목을 선택하세요.')
    try {
      if (editId) {
        await api.put(`/mall-item-mappings/${editId}`, { mallProductName: form.mallProductName || undefined, itemId: Number(form.itemId) })
        setOk('매핑을 수정했습니다.')
      } else {
        if (!form.mall.trim() || !form.mallProductCode.trim()) return setError('쇼핑몰과 몰품목코드를 입력하세요.')
        await api.post('/mall-item-mappings', { mall: form.mall, mallProductCode: form.mallProductCode, mallProductName: form.mallProductName || undefined, itemId: Number(form.itemId) })
        setOk('품목코드를 연결했습니다.')
      }
      setShowForm(false); load()
    } catch (err) { setError(extractErrorMessage(err)) }
  }

  async function toggleActive(m: MallItemMapping) {
    setError('')
    try { await api.put(`/mall-item-mappings/${m.id}`, { mallProductName: m.mallProductName, itemId: m.itemId, active: !m.active }); load() }
    catch (err) { setError(extractErrorMessage(err)) }
  }

  async function remove(id: number) {
    if (!confirm('이 연결을 삭제할까요?')) return
    setError('')
    try { await api.delete(`/mall-item-mappings/${id}`); load() }
    catch (err) { setError(extractErrorMessage(err)) }
  }

  const inputCls = 'ec-input'

  const shown = rows
    .filter((m) => !itemCond || m.itemName === itemCond)
    .filter((m) => !mallCond || m.mall === mallCond)
    .filter((m) => !keyCond || m.mallProductCode.includes(keyCond))

  /*
   * 원본 하단 단추줄의 <b>[선택삭제]</b> — 고른 줄을 한 번에 지운다.
   *
   * <p>하나가 막혀도 <b>거기서 멈추지 않는다</b> — 나머지는 지우고 몇 건이 남았는지 알려 준다.
   */
  const [picked, setPicked] = useState<Set<number>>(new Set())
  const pick = (id: number) => setPicked((s) => {
    const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n
  })

  async function removeChecked() {
    const ids = [...picked]
    if (ids.length === 0) { setError('삭제할 연결을(를) 고르세요.'); return }
    if (!window.confirm(`고른 ${ids.length}건을 삭제할까요?`)) return
    const results = await Promise.allSettled(ids.map((id) => api.delete(`/mall-item-mappings/${id}`)))
    const failed = results.filter((r) => r.status === 'rejected').length
    setPicked(new Set())
    setError(failed ? `${failed}건은 삭제하지 못했습니다(이미 주문이 물고 있을 수 있습니다).` : '')
    load()
  }

  return (
    <EcListShell
      title="쇼핑몰품목코드연결"
      onNew={openNew}
      actions={[
        { label: '새로고침', onClick: load },
        { label: `선택삭제${picked.size ? ` (${picked.size})` : ''}`, onClick: removeChecked },
        { label: 'Excel' },
        { label: '인쇄' },
      ]}
    >
      <p className="mb-2 text-xs text-slate-500">(쇼핑몰, 몰품목코드) → 우리 품목 매핑. 주문 수집 시 품목이 지정되지 않으면 이 매핑으로 자동 연결됩니다.</p>

      {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}
      {ok && <p style={{ background: '#eaf6ec', color: '#1c7c3c', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{ok}</p>}

      <Modal open={showForm} title={editId ? '품목코드연결 수정' : '품목코드연결 등록'} onClose={() => setShowForm(false)}>{(
        <form onSubmit={submit} style={{ border: '1px solid var(--ec-border)', background: '#fff', padding: 14, marginTop: 8, marginBottom: 8 }}>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <label style={{ fontSize: 12.5 }}><div style={{ color: '#5a626e', marginBottom: 3 }}>쇼핑몰 *</div>
              <input className={inputCls} value={form.mall} disabled={!!editId} onChange={(e) => set('mall', e.target.value)} style={{ width: 150 }} placeholder="예: 스마트스토어" list="mapping-mall-list" />
              <datalist id="mapping-mall-list">{malls.map((m) => <option key={m.code} value={m.name} />)}</datalist></label>
            <label style={{ fontSize: 12.5 }}><div style={{ color: '#5a626e', marginBottom: 3 }}>몰품목코드 *</div>
              <input className={inputCls} value={form.mallProductCode} disabled={!!editId} onChange={(e) => set('mallProductCode', e.target.value)} style={{ width: 160 }} /></label>
            <label style={{ fontSize: 12.5 }}><div style={{ color: '#5a626e', marginBottom: 3 }}>몰상품명</div>
              <input className={inputCls} value={form.mallProductName} onChange={(e) => set('mallProductName', e.target.value)} style={{ width: 200 }} /></label>
            <label style={{ fontSize: 12.5 }}><div style={{ color: '#5a626e', marginBottom: 3 }}>연결 품목 *</div>
              <select className={inputCls} value={form.itemId} onChange={(e) => set('itemId', e.target.value)} style={{ width: 220 }}>
                <option value="">선택하세요</option>
                {items.map((it) => <option key={it.id} value={it.id}>[{it.code}] {it.name}</option>)}
              </select></label>
            <button type="submit" className="ec-btn ec-btn-primary">{editId ? '수정' : '저장'}</button>
          </div>
          {editId && <p style={{ fontSize: 11.5, color: '#8a929c', marginTop: 8 }}>쇼핑몰·몰품목코드는 키라 수정할 수 없습니다. 바꾸려면 삭제 후 재등록하세요.</p>}
        </form>
      )}</Modal>

      {/* 원본 조건 차례: 품목 · 쇼핑몰 · 쇼핑몰품목key */}
      <ul className="ec-cond" style={{ marginBottom: 8 }}>
        <EcCond label="품목" pick>
          <CodePickerField label="품목" hideLabel width={190} emptyLabel="전체"
                           value={itemCond} onChange={setItemCond}
                           items={items.map((x) => ({ value: x.name, code: x.code, name: x.name }))} />
        </EcCond>
        <EcCond label="쇼핑몰">
          <select className="ec-input" value={mallCond} onChange={(e) => setMallCond(e.target.value)} style={{ width: 150 }}>
            <option value="">전체</option>
            {malls.map((m) => <option key={m.code}>{m.name}</option>)}
          </select>
        </EcCond>
        <EcCond label="쇼핑몰품목key">
          <input className="ec-input" value={keyCond} placeholder="쇼핑몰품목key"
                 onChange={(e) => setKeyCond(e.target.value)} style={{ width: 170 }} />
        </EcCond>
      </ul>

      <table className="w-full text-left">
        <thead><tr>
          <th style={{ width: 28, textAlign: 'center' }}></th>
          <th style={{ width: 34 }}></th>
          {/*
            원본 쇼핑몰품목코드연결의 열은 <b>쇼핑몰명 · 품목코드 · 품목명 · 쇼핑몰품목key</b>
            다(사본 실측). 우리는 넷 다 다르게 부르고, 품목은 코드와 이름을 <b>한 칸</b>에
            몰아 두어 코드로 훑을 수가 없었다.
          */}
          {/*
            원본 첫 열은 <b>[쇼핑몰코드]</b> 이고 그다음이 [쇼핑몰명] 이다(사본 실측).
            연결은 몰 이름으로 맺으므로 코드는 몰 마스터에서 찾아 붙인다 —
            마스터에 없는 이름으로 맺힌 옛 연결은 빈칸이다(지어내지 않는다).
          */}
          <th style={{ width: 90 }}>쇼핑몰코드</th>
          <th style={{ width: 140 }}>쇼핑몰명</th>
          <th style={{ width: 120 }}>품목코드</th>
          <th>품목명</th>
          <th style={{ width: 160 }}>쇼핑몰품목key</th>
          <th>몰상품명</th>
          <th style={{ textAlign: 'center', width: 80 }}>사용</th>
          <th style={{ textAlign: 'center', width: 90 }}>관리</th>
        </tr></thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={10} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
          ) : shown.length === 0 ? (
            <tr><td colSpan={10} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>연결된 품목코드가 없습니다. 우측 상단에서 등록하세요.</td></tr>
          ) : shown.map((m, i) => (
            <tr key={m.id} style={{ opacity: m.active ? 1 : 0.5 }}>
              <td style={{ textAlign: 'center' }}>
                <input type="checkbox" checked={picked.has(m.id)} onChange={() => pick(m.id)} />
              </td>
              <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
              <td style={{ fontFamily: 'monospace', color: mallCodeOf(m.mall) ? '#5a626e' : '#c9ced6' }}>{mallCodeOf(m.mall) || ''}</td>
              <td>{m.mall}</td>
              <td style={{ fontFamily: 'monospace', color: '#8a929c' }}>{m.itemCode}</td>
              <td>{m.itemName}</td>
              <td style={{ fontFamily: 'monospace', color: 'var(--ec-blue)' }}>{m.mallProductCode}</td>
              <td style={{ color: '#6b7280' }}>{m.mallProductName ?? ''}</td>
              <td style={{ textAlign: 'center' }}>
                <button className="no-ec" onClick={() => toggleActive(m)} style={{ border: '1px solid var(--ec-border)', background: m.active ? '#eaf6ec' : '#f2f3f5', color: m.active ? '#1c7c3c' : '#8a929c', cursor: 'pointer', fontSize: 11.5, padding: '2px 8px', borderRadius: 3 }}>{m.active ? '사용' : '중단'}</button>
              </td>
              <td style={{ textAlign: 'center' }}>
                <button className="no-ec" onClick={() => openEdit(m)} style={{ border: 'none', background: 'none', color: 'var(--ec-blue)', cursor: 'pointer', fontSize: 12, marginRight: 6 }}>수정</button>
                <button className="no-ec" onClick={() => remove(m.id)} style={{ border: 'none', background: 'none', color: '#c60a2e', cursor: 'pointer', fontSize: 12 }}>삭제</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </EcListShell>
  )
}
