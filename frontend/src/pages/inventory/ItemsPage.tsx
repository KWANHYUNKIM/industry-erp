import { useEffect, useState, type FormEvent } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import type { CodeOption, GroupMaster, Item, ManagementItem } from '../../api/types'
import EcListShell from '../../components/EcListShell'
import Modal from '../../components/Modal'
import EcFileDrop from '../../components/EcFileDrop'
import CodePickerField from '../../components/CodePickerField'
import GroupMasterModal from '../../components/GroupMasterModal'

const inputCls = 'ec-input w-full'

const emptyForm = {
  code: '',
  name: '',
  spec: '',
  unit: 'EA',
  category: 'RAW_MATERIAL',
  unitPrice: '0',
  purchasePrice: '0',
  safetyStock: '0',
  barcode: '', searchKeyword: '',
  /** 재고수량관리. 기본은 관리대상 — 모르고 껐다가 재고가 조용히 안 움직이는 것보다 낫다. */
  stockTracked: 'Y',
  /**
   * 사용구분. 예전에는 저장할 때 늘 active:true 를 보냈다 —
   * <b>사용중단한 품목을 고치기만 해도 조용히 되살아났다.</b>
   * 거래처에서 똑같은 버그를 고쳤는데 품목에도 같은 것이 남아 있었다.
   */
  active: 'Y',
  udiDi: '',
  managementItemId: '',
  itemGroupId: '',
}

export default function ItemsPage() {
  const [items, setItems] = useState<Item[]>([])
  const [categories, setCategories] = useState<CodeOption[]>([])
  const [mgmtItems, setMgmtItems] = useState<ManagementItem[]>([])
  const [itemGroups, setItemGroups] = useState<GroupMaster[]>([])
  const [groupOpen, setGroupOpen] = useState(false)  // 계층그룹 모달
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<number | null>(null)
  const [form, setForm] = useState({ ...emptyForm })

  async function load() {
    setLoading(true)
    try {
      const [i, c, m, g] = await Promise.all([
        api.get<Item[]>('/items'),
        api.get<CodeOption[]>('/meta/item-categories'),
        api.get<ManagementItem[]>('/management-items'),
        api.get<GroupMaster[]>('/item-groups'),
      ])
      setItems(i.data)
      setCategories(c.data)
      setMgmtItems(m.data)
      setItemGroups(g.data)
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  function openCreate() {
    setEditId(null)
    setForm({ ...emptyForm })
    setShowForm(true)
  }

  function openEdit(item: Item) {
    setEditId(item.id)
    setForm({
      code: item.code,
      name: item.name,
      spec: item.spec ?? '',
      unit: item.unit,
      category: item.category,
      unitPrice: String(item.unitPrice),
      purchasePrice: String(item.purchasePrice ?? 0),
      safetyStock: String(item.safetyStock),
      barcode: item.barcode ?? '',
      searchKeyword: item.searchKeyword ?? '',
      stockTracked: item.stockTracked === false ? 'N' : 'Y',
      active: item.active ? 'Y' : 'N',
      udiDi: item.udiDi ?? '',
      managementItemId: item.managementItemId != null ? String(item.managementItemId) : '',
      itemGroupId: item.itemGroupId != null ? String(item.itemGroupId) : '',
    })
    setShowForm(true)
  }

  function set(field: keyof typeof form, value: string) {
    setForm((f) => ({ ...f, [field]: value }))
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError('')
    const payload = {
      ...form,
      unitPrice: Number(form.unitPrice),
      purchasePrice: Number(form.purchasePrice),
      safetyStock: Number(form.safetyStock),
      stockTracked: form.stockTracked === 'Y',
      active: form.active === 'Y',
      managementItemId: form.managementItemId ? Number(form.managementItemId) : null,
      itemGroupId: form.itemGroupId ? Number(form.itemGroupId) : null,
    }
    try {
      if (editId) {
        await api.put(`/items/${editId}`, payload)
      } else {
        await api.post('/items', payload)
      }
      setShowForm(false)
      load()
    } catch (err) {
      setError(extractErrorMessage(err))
    }
  }

  async function remove(item: Item) {
    if (!confirm(`품목 '${item.name}'을(를) 삭제할까요?`)) return
    try {
      await api.delete(`/items/${item.id}`)
      setSelected((s) => { const n = new Set(s); n.delete(item.id); return n })
      load()
    } catch (err) {
      alert(extractErrorMessage(err))
    }
  }

  // 그리드 행 선택(체크박스) 상태 — 하단 '삭제' 일괄삭제에 사용
  const [selected, setSelected] = useState<Set<number>>(new Set())
  function toggle(id: number) {
    setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  // 하단 '삭제': 선택된 행들을 기존 DELETE /items/{id} 로 일괄 삭제
  async function removeSelected() {
    if (selected.size === 0) { alert('삭제할 품목을 먼저 선택하세요.'); return }
    if (!confirm(`선택한 ${selected.size}개 품목을 삭제할까요?`)) return
    const ids = Array.from(selected)
    const results = await Promise.allSettled(ids.map((id) => api.delete(`/items/${id}`)))
    const failed = results.filter((r) => r.status === 'rejected').length
    setSelected(new Set())
    await load()
    if (failed > 0) alert(`${ids.length - failed}건 삭제, ${failed}건 실패(참조 중이거나 삭제 불가한 품목).`)
  }

  const [webOpen, setWebOpen] = useState(false)  // 웹자료올리기 안내 모달
  // 업로드 파일 클라이언트 미리보기(행수/헤더). 실제 서버 반영은 백엔드 미연동
  const [webFile, setWebFile] = useState<{ name: string; total: number; head: string[] } | null>(null)
  async function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    const text = await f.text()
    const lines = text.split(/\r?\n/).filter((l) => l.trim())
    setWebFile({ name: f.name, total: Math.max(0, lines.length - 1), head: (lines[0] ?? '').split(/[,\t]/).slice(0, 8) })
  }
  const [keyword, setKeyword] = useState('')
  /**
   * 원본 품목등록 리스트의 [사용중단포함] 체크. <b>기본은 꺼져 있다</b> —
   * 즉 기본 화면에는 사용중단 품목이 안 나온다. 우리는 늘 다 보여 줘서,
   * 이미 안 쓰는 품목이 코드도움·목록에 계속 섞여 나왔다.
   */
  const [withStopped, setWithStopped] = useState(false)
  const shown = items
    .filter((it) => withStopped || it.active)
    .filter((it) =>
      !keyword || it.code.toLowerCase().includes(keyword.toLowerCase()) || it.name.toLowerCase().includes(keyword.toLowerCase()))

  return (
    <EcListShell
      title="품목등록 리스트"
      search={keyword}
      onSearchChange={setKeyword}
      onNew={showForm ? () => setShowForm(false) : openCreate}
      actions={[{ label: '계층그룹', onClick: () => setGroupOpen(true) }, { label: 'Excel' }, { label: `삭제${selected.size ? ` (${selected.size})` : ''}`, onClick: removeSelected }, { label: '웹자료올리기', onClick: () => setWebOpen(true) }]}
    >
      {error && <p className="mb-2 rounded bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

      <label style={{ fontSize: 12.5, display: 'inline-flex', alignItems: 'center', gap: 4, marginBottom: 8 }}>
        <input type="checkbox" checked={withStopped} onChange={(e) => setWithStopped(e.target.checked)} />
        사용중단포함
      </label>

      <Modal open={showForm} title="품목등록" onClose={() => setShowForm(false)}>{(
        <form onSubmit={submit} style={{ marginTop: 8, marginBottom: 8, border: '1px solid var(--ec-border)', background: '#fff', padding: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--ec-blue-dark)', marginBottom: 8 }}>{editId ? '품목 수정' : '새 품목 등록'}</div>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-sm text-slate-600">품목코드 *</label>
              <input className={inputCls} value={form.code} disabled={!!editId} onChange={(e) => set('code', e.target.value)} />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-sm text-slate-600">품명 *</label>
              <input className={inputCls} value={form.name} onChange={(e) => set('name', e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-sm text-slate-600">규격</label>
              <input className={inputCls} value={form.spec} onChange={(e) => set('spec', e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-sm text-slate-600">단위 *</label>
              <input className={inputCls} value={form.unit} onChange={(e) => set('unit', e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-sm text-slate-600">품목분류 *</label>
              <select className={inputCls} value={form.category} onChange={(e) => set('category', e.target.value)}>
                {categories.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm text-slate-600">판매단가</label>
              <input type="number" className={inputCls} value={form.unitPrice} onChange={(e) => set('unitPrice', e.target.value)} />
            </div>
            <div>
              {/* 원본 품목등록도 판매단가와 구매단가를 따로 둔다. 하나로 쓰면 구매할인현황이
                  매입가를 판매가와 견주게 되고, 그러면 화면 이름과 달리 늘 할증만 찍힌다. */}
              <label className="mb-1 block text-sm text-slate-600">구매단가</label>
              <input type="number" className={inputCls} value={form.purchasePrice} onChange={(e) => set('purchasePrice', e.target.value)}
                     title="구매할인현황의 기준입니다. 0 이면 기준을 안 정한 것으로 보고 할인을 계산하지 않습니다." />
            </div>
            <div>
              <label className="mb-1 block text-sm text-slate-600">안전재고</label>
              <input type="number" className={inputCls} value={form.safetyStock} onChange={(e) => set('safetyStock', e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-sm text-slate-600">재고수량관리</label>
              <select className={inputCls} value={form.stockTracked} onChange={(e) => set('stockTracked', e.target.value)}>
                <option value="Y">수량관리대상</option>
                <option value="N">수량관리제외</option>
              </select>
              <span style={{ fontSize: 11, color: '#8a929c' }}>
                제외로 두면 이 품목은 재고를 잡지 않습니다(용역·운반비 등)
              </span>
            </div>
            <div>
              <label className="mb-1 block text-sm text-slate-600">사용구분</label>
              <select className={inputCls} value={form.active} onChange={(e) => set('active', e.target.value)}>
                <option value="Y">사용</option>
                <option value="N">사용중단</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm text-slate-600">바코드</label>
              <input className={inputCls} value={form.barcode} onChange={(e) => set('barcode', e.target.value)} />
            </div>
            {/*
              원본 품목등록 리스트의 [검색창내용]. 현장에서 부르는 이름(약칭·옛 코드)을
              적어 두고 그걸로 찾는다 — 코드도움이 이 값도 같이 본다.
            */}
            <div>
              <label className="mb-1 block text-sm text-slate-600">검색창내용</label>
              <input className={inputCls} value={form.searchKeyword}
                     onChange={(e) => set('searchKeyword', e.target.value)}
                     placeholder="약칭·옛 코드·영문명 등 (코드도움에서 이 값으로도 찾습니다)" />
            </div>
            <div>
              <label className="mb-1 block text-sm text-slate-600">UDI-DI (의료기기 표준코드)</label>
              <input className={inputCls} value={form.udiDi} onChange={(e) => set('udiDi', e.target.value)}
                     placeholder="의료기기만 입력 (공급내역보고 대상)" />
            </div>
            {/* 원본 품목등록 A7 탭의 [관리항목]. 전표 라인에는 여기 값이 읽기전용으로 따라 붙는다. */}
            <div>
              <CodePickerField
                label="관리항목" placeholder="관리항목 선택" emptyLabel="선택 해제"
                value={form.managementItemId} onChange={(v) => set('managementItemId', v)}
                items={mgmtItems.map((m) => ({ value: String(m.id), code: m.code, name: m.name, sub: m.description }))}
              />
            </div>
            {/* 원본 품목등록 리스트의 '품목그룹1명'. 우리는 그룹이 하나라 1/2 구분을 두지 않는다. */}
            <div>
              <CodePickerField
                label="품목그룹" placeholder="품목그룹 선택" emptyLabel="선택 해제"
                value={form.itemGroupId} onChange={(v) => set('itemGroupId', v)}
                items={itemGroups.map((g) => ({ value: String(g.id), code: g.code, name: g.name }))}
              />
            </div>
          </div>
          <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end' }}>
            <button type="submit" className="ec-btn ec-btn-primary">{editId ? '수정' : '등록'}</button>
          </div>
        </form>
      )}</Modal>

      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr>
              <th style={{ width: 30, textAlign: 'center' }} data-export-skip="true">
                <input
                  type="checkbox"
                  checked={shown.length > 0 && shown.every((it) => selected.has(it.id))}
                  onChange={(e) => setSelected(e.target.checked ? new Set(shown.map((it) => it.id)) : new Set())}
                />
              </th>
              <th style={{ width: 34 }}></th>
              <th>품목코드 ▼</th>
              <th>품목명 ▼</th>
              <th>규격정보</th>
              <th>단위</th>
              <th>품목구분 ▼</th>
              <th style={{ textAlign: 'right' }}>판매단가</th>
              <th style={{ textAlign: 'right' }}>구매단가</th>
              <th style={{ textAlign: 'right' }}>안전재고</th>
              <th style={{ width: 110 }}>재고수량관리</th>
              <th>관리항목</th>
              <th>품목그룹 ▼</th>
              <th>사용 ▼</th>
              <th>관리</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={14} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
            ) : shown.length === 0 ? (
              <tr><td colSpan={14} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>등록된 품목이 없습니다.</td></tr>
            ) : (
              shown.map((it, idx) => (
                <tr key={it.id} style={selected.has(it.id) ? { background: '#f5f8ff' } : undefined}>
                  <td style={{ textAlign: 'center' }}>
                    <input type="checkbox" checked={selected.has(it.id)} onChange={() => toggle(it.id)} />
                  </td>
                  <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{idx + 1}</td>
                  <td style={{ fontFamily: 'monospace' }}>{it.code}</td>
                  <td>{it.name}</td>
                  <td>{it.spec ?? ''}</td>
                  <td>{it.unit}</td>
                  <td>[{it.categoryName}]</td>
                  <td style={{ textAlign: 'right' }}>{it.unitPrice.toLocaleString('ko-KR')}</td>
                  <td style={{ textAlign: 'right', color: (it.purchasePrice ?? 0) > 0 ? undefined : '#c9ced6' }}>
                    {(it.purchasePrice ?? 0).toLocaleString('ko-KR')}
                  </td>
                  <td style={{ textAlign: 'right' }}>{it.safetyStock.toLocaleString('ko-KR')}</td>
                  <td style={{ color: it.stockTracked === false ? '#c07a00' : undefined }}>
                    {it.stockTracked === false ? '수량관리제외' : '수량관리대상'}
                  </td>
                  <td>{it.managementItemName ?? ''}</td>
                  <td>{it.itemGroupName ?? ''}</td>
                  <td style={{ color: it.active ? '#1c7c3c' : '#c60a2e' }}>{it.active ? '사용' : '사용중단'}</td>
                  <td>
                    <button onClick={() => openEdit(it)} style={{ color: 'var(--ec-blue)', marginRight: 8, background: 'none', border: 'none', cursor: 'pointer', fontSize: 12 }}>수정</button>
                    <button onClick={() => remove(it)} style={{ color: '#c60a2e', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12 }}>삭제</button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {groupOpen && (
        <GroupMasterModal
          title="품목그룹" endpoint="/item-groups"
          members={(() => {
            const m = new Map<string, string[]>()
            for (const it of items) {
              const k = it.itemGroupName ?? '(미지정)'
              if (!m.has(k)) m.set(k, [])
              m.get(k)!.push(`[${it.code}] ${it.name}`)
            }
            return m
          })()}
          onClose={() => setGroupOpen(false)} onChanged={load}
        />
      )}

      {webOpen && (
        <div onClick={() => setWebOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.35)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: 4, width: 520, maxWidth: '92vw', boxShadow: '0 10px 30px rgba(0,0,0,.2)' }}>
            <div style={{ padding: '10px 14px', borderBottom: '1px solid #e6eaef', fontWeight: 800, fontSize: 14, display: 'flex', alignItems: 'center' }}>
              <span>웹자료올리기 · 품목 대량 등록</span>
              <button className="ec-btn" style={{ marginLeft: 'auto' }} onClick={() => setWebOpen(false)}>닫기</button>
            </div>
            <div style={{ padding: 14, fontSize: 12.5, lineHeight: 1.7, color: '#3c4553' }}>
              <p style={{ margin: '0 0 8px' }}>엑셀/CSV 파일로 품목을 한 번에 등록하는 기능입니다. 아래에서 파일을 고르면 형식을 미리 확인할 수 있습니다.</p>
              {/* 원본 [웹자료올리기] 도 끌어다 놓을 수 있다. 파일 선택 버튼은 그대로 둔다. */}
              <EcFileDrop
                hint="여기에 파일 놓기 (엑셀·CSV)"
                onFiles={(fs) => onPickFile({ target: { files: fs } } as unknown as React.ChangeEvent<HTMLInputElement>)}
              />
              {webFile && (
                <div style={{ marginTop: 10, border: '1px solid #e6eaef', borderRadius: 3, padding: 10, background: '#f9fbfd' }}>
                  <div><b>{webFile.name}</b> · 데이터 <b style={{ color: 'var(--ec-blue-dark)' }}>{webFile.total.toLocaleString()}</b>행 인식</div>
                  {webFile.head.length > 0 && <div style={{ marginTop: 4, color: '#5a626e' }}>헤더: {webFile.head.join(' · ')}</div>}
                </div>
              )}
              <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                <button className="ec-btn" disabled title="서버 업로드 API 미구현" style={{ opacity: .55, cursor: 'default' }}>업로드 실행 (백엔드 미연동)</button>
                <span style={{ fontSize: 11.5, color: '#c07a00' }}>* 서버 일괄등록 API가 없어 미리보기까지만 제공합니다.</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </EcListShell>
  )
}
