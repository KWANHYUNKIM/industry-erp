import { useEffect, useState, type FormEvent } from 'react'
import EcListShell from '../../components/EcListShell'
import { EcCond } from '../../components/EcStatusPanel'
import CodePickerField from '../../components/codepicker/CodePickerField'
import Modal from '../../components/Modal'
import { api, extractErrorMessage } from '../../api/client'
import type { Item, MallItemMapping } from '../../types/api'
import { ecConfirm } from '../../components/EcDialog'

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
  /*
   * 원본 신규 창은 [쇼핑몰] · [품목] 하나에 [쇼핑몰품목key] 를 <b>여러 줄</b>(처음 세 줄) 받는다(2026-10-20 실측).
   * 수정 창은 쇼핑몰 · 품목이 글자로 굳고 key 만 고친다 — 우리 key 는 연결의 키라 바뀌면 새로 맺고 옛것을 지운다.
   */
  const [form, setForm] = useState({ mall: '', mallProductCode: '', mallProductName: '', itemId: '' })
  const [keys, setKeys] = useState<string[]>(['', '', ''])
  const [editing, setEditing] = useState<MallItemMapping | null>(null)

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
    setEditId(null); setEditing(null); setKeys(['', '', ''])
    setForm({ mall: '', mallProductCode: '', mallProductName: '', itemId: '' }); setShowForm(true)
  }
  function openEdit(m: MallItemMapping) {
    setEditId(m.id); setEditing(m)
    setForm({ mall: m.mall, mallProductCode: m.mallProductCode, mallProductName: m.mallProductName ?? '', itemId: String(m.itemId) })
    setShowForm(true)
  }

  async function submit(e: FormEvent) {
    e.preventDefault(); setError(''); setOk('')
    if (!form.mall.trim() || !form.itemId) return setError('쇼핑몰과 품목을 입력하세요.')
    const key = form.mallProductCode.trim()
    const list = keys.map((k) => k.trim()).filter(Boolean)
    if (editing ? !key : list.length === 0) return setError('쇼핑몰품목key 를 입력하세요.')
    /* 원본은 저장 전에 "저장하겠습니까?" 를 묻는다(2026-10-20 실측). */
    if (!(await ecConfirm('저장하겠습니까?'))) return
    try {
      if (editId && editing) {
        if (key === editing.mallProductCode) {
          await api.put(`/mall-item-mappings/${editId}`, { mallProductName: form.mallProductName || undefined, itemId: Number(form.itemId) })
        } else {
          await api.post('/mall-item-mappings', { mall: form.mall, mallProductCode: key, mallProductName: form.mallProductName || undefined, itemId: Number(form.itemId) })
          await api.delete(`/mall-item-mappings/${editId}`)
        }
        setOk('매핑을 수정했습니다.')
      } else {
        for (const k of list) {
          await api.post('/mall-item-mappings', { mall: form.mall, mallProductCode: k, itemId: Number(form.itemId) })
        }
        setOk('품목코드를 연결했습니다.')
      }
      setShowForm(false); load()
    } catch (err) { setError(extractErrorMessage(err)) }
  }

  /** 원본 수정 창의 [삭제] — "삭제하겠습니까?" 를 묻고 지운다. */
  async function remove(id: number) {
    if (!(await ecConfirm('삭제하겠습니까?'))) return
    setError('')
    try { await api.delete(`/mall-item-mappings/${id}`); setShowForm(false); load() }
    catch (err) { setError(extractErrorMessage(err)) }
  }

  const shown = [...rows]
    .sort((a, b) => mallCodeOf(a.mall).localeCompare(mallCodeOf(b.mall)) || a.itemCode.localeCompare(b.itemCode))
    /* 이름은 겹칠 수 있다 — id 로 거른다(QA 9회차). */
    .filter((m) => !itemCond || String(m.itemId) === itemCond)
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
    if (!(await ecConfirm(`고른 ${ids.length}건을 삭제할까요?`))) return
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
        { label: '선택삭제', selected: picked.size, onClick: removeChecked },
        { label: 'Excel' },
      ]}
    >
      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
      {ok && <p className="ec-alert ec-alert-success mb-[8px]">{ok}</p>}

      <Modal error={error} open={showForm} title="쇼핑몰품목코드연결" onClose={() => setShowForm(false)}>{(
        <form onSubmit={submit} className="ec-form">
          <table className="w-full text-left mb-[8px]"><tbody>
            <tr>
              <th className="w-[110px] bg-ec-page">쇼핑몰</th>
              <td>{editing ? (mallCodeOf(editing.mall) ? `${mallCodeOf(editing.mall)}(${editing.mall})` : editing.mall) : (
                <select className="ec-input w-[220px]" value={form.mall} onChange={(e) => set('mall', e.target.value)}>
                  <option value="">쇼핑몰</option>
                  {malls.map((m) => <option key={m.code} value={m.name}>{m.code} {m.name}</option>)}
                </select>
              )}</td>
            </tr>
            <tr>
              <th className="bg-ec-page">품목</th>
              <td>{editing ? `${editing.itemCode}(${editing.itemName})` : (
                /* label 로 감싸면 팝업 행 클릭이 안 먹어 td 에 바로. */
                <CodePickerField label="품목" hideLabel width={220} placeholder="품목" emptyLabel="선택 해제"
                                 value={form.itemId} onChange={(v) => set('itemId', v)}
                                 items={items.filter((it) => it.active !== false || String(it.id) === form.itemId).map((it) => ({ value: String(it.id), code: it.code, name: it.name, sub: it.spec, alias: it.searchKeyword }))} />
              )}</td>
            </tr>
          </tbody></table>
          <table className="w-full text-left">
            <thead><tr><th className="w-[34px]"></th><th>쇼핑몰품목key</th></tr></thead>
            <tbody>
              {(editing ? [form.mallProductCode] : keys).map((k, i) => (
                <tr key={i}>
                  <td className="text-center text-ec-hint">{i + 1}</td>
                  <td><input className="ec-input w-full" value={k}
                             onChange={(e) => (editing ? set('mallProductCode', e.target.value) : setKeys((ks) => ks.map((x, j) => (j === i ? e.target.value : x))))} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex gap-[6px] mt-[10px]">
            <button type="submit" className="ec-btn ec-btn-primary">저장(F8)</button>
            {editing && <button type="button" className="ec-btn" onClick={() => remove(editing.id)}>삭제</button>}
            {!editing && <button type="button" className="ec-btn" onClick={() => setKeys((ks) => [...ks, ''])}>줄추가</button>}
            <button type="button" className="ec-btn" onClick={() => setShowForm(false)}>닫기</button>
          </div>
        </form>
      )}</Modal>

      {/* 원본 조건 차례: 품목 · 쇼핑몰 · 쇼핑몰품목key */}
      <ul className="ec-cond" style={{ marginBottom: 8 }}>
        <EcCond label="품목" pick>
          <CodePickerField label="품목" hideLabel width={190} emptyLabel="전체"
                           value={itemCond} onChange={setItemCond}
                           items={items.map((x) => ({ value: String(x.id), code: x.code, name: x.name, sub: x.spec }))} />
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

      {/* 원본 열: ☐ · 쇼핑몰코드 · 쇼핑몰명 · 품목코드 · 품목명 · 쇼핑몰품목key (2026-10-20 실측). 품목을 누르면 수정 창. */}
      <table className="w-full text-left">
        <thead><tr>
          <th className="w-[34px] text-center">
            <input type="checkbox" checked={shown.length > 0 && shown.every((m) => picked.has(m.id))}
                   onChange={(e) => setPicked(e.target.checked ? new Set(shown.map((m) => m.id)) : new Set())} />
          </th>
          <th className="w-[90px]">쇼핑몰코드</th>
          <th className="w-[160px]">쇼핑몰명</th>
          <th className="w-[140px]">품목코드</th>
          <th>품목명</th>
          <th>쇼핑몰품목key</th>
        </tr></thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={6} className="ec-empty">불러오는 중…</td></tr>
          ) : shown.length === 0 ? (
            <tr><td colSpan={6} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
          ) : shown.map((m) => (
            <tr key={m.id} className={m.active ? undefined : 'opacity-50'}>
              <td className="text-center">
                <input type="checkbox" checked={picked.has(m.id)} onChange={() => pick(m.id)} />
              </td>
              {/* 마스터에 없는 이름으로 맺힌 옛 연결은 코드가 빈칸이다(지어내지 않는다). */}
              <td>{mallCodeOf(m.mall)}</td>
              <td>{m.mall}</td>
              <td><a className="cursor-pointer" onClick={() => openEdit(m)}>{m.itemCode}</a></td>
              <td><a className="cursor-pointer" onClick={() => openEdit(m)}>{m.itemName}</a></td>
              <td>{m.mallProductCode}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </EcListShell>
  )
}
