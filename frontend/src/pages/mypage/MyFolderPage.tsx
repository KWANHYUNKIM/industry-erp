import { useEffect, useState } from 'react'
import { extractErrorMessage } from '../../api/client'
import { FLAT_MENU } from '../../app/layout/EcountLayout'
import CodePickerField from '../../components/CodePickerField'
import EcEmptyRow from '../../components/ui/EcEmptyRow'
import { myFolders, type MyFolder } from '../../features/mypage/api'

/**
 * MyPage › 나만의 업무 폴더 설정.
 *
 * <p>원본 MyPage 의 [나만의 업무 폴더] 는 "사용할 메뉴를 직접 설정할 수 있습니다. 메뉴명도 수정 가능합니다." 라고
 * 안내하는 자리다. 원본의 편집 화면은 마스터 전용이라 재지 못했다 — 그래서 모양은 우리 부품으로 짰고,
 * 할 수 있는 일은 안내 그대로다: 폴더를 만들고 · 이름을 바꾸고 · 지우고 · 차례를 바꾸고, 폴더에 메뉴를 담고 ·
 * 메뉴명을 바꾸고 · 빼고 · 차례를 바꾼다. 바꾸면 머리 메뉴(MyPage 2단)가 바로 따라 바뀐다.
 */

// 담을 수 있는 메뉴 — MyPage 예시 폴더에 겹쳐 실린 것은 빼고 제 모듈 자리로 고른다.
const PICKABLE = FLAT_MENU.filter((m) => !m.path.startsWith('MyPage'))
const pathOf = (to: string) => PICKABLE.find((m) => m.to === to)?.path ?? ''

export default function MyFolderPage() {
  const [folders, setFolders] = useState<MyFolder[] | null>(null)
  const [pickedId, setPickedId] = useState<number | null>(null)
  const [newFolder, setNewFolder] = useState('')
  const [folderName, setFolderName] = useState('')
  const [menuTo, setMenuTo] = useState('')
  const [labels, setLabels] = useState<Record<number, string>>({})
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const picked = folders?.find((f) => f.id === pickedId) ?? null

  useEffect(() => {
    myFolders.list().then(apply).catch((e) => setError(extractErrorMessage(e)))
  }, [])

  function apply(list: MyFolder[]) {
    setFolders(list)
    setLabels(Object.fromEntries(list.flatMap((f) => f.items.map((i) => [i.id, i.label]))))
    setPickedId((cur) => (cur && list.some((f) => f.id === cur) ? cur : list[0]?.id ?? null))
  }

  /** 서버에 보내고, 돌아온 목록으로 화면을 다시 그린다. 실패하면 서버 문구를 그대로 보인다. */
  async function act(p: Promise<MyFolder[]>, done?: string): Promise<MyFolder[] | null> {
    setError(''); setNotice('')
    try {
      const list = await p
      apply(list)
      if (done) setNotice(done)
      return list
    } catch (e) {
      setError(extractErrorMessage(e))
      return null
    }
  }

  useEffect(() => { setFolderName(picked?.name ?? ''); setMenuTo('') }, [pickedId, picked?.name])

  async function addFolder() {
    if (!newFolder.trim()) { setError('폴더명을 입력하세요.'); return }
    const before = new Set((folders ?? []).map((f) => f.id))
    const list = await act(myFolders.createFolder(newFolder.trim()), '폴더를 만들었습니다.')
    if (list) {
      setNewFolder('')
      // 새로 만든 폴더를 바로 고른다 — 메뉴를 담는 것이 다음 일이다.
      const made = list.find((f) => !before.has(f.id))
      if (made) setPickedId(made.id)
    }
  }

  function move<T extends { id: number }>(rows: T[], id: number, step: -1 | 1) {
    const i = rows.findIndex((r) => r.id === id)
    const j = i + step
    if (i < 0 || j < 0 || j >= rows.length) return null
    const ids = rows.map((r) => r.id)
    ;[ids[i], ids[j]] = [ids[j], ids[i]]
    return ids
  }

  function removeFolder() {
    if (!picked) return
    if (!window.confirm(`[${picked.name}] 폴더를 지울까요? 담은 메뉴도 함께 빠집니다.`)) return
    act(myFolders.deleteFolder(picked.id), '폴더를 지웠습니다.')
  }

  function addItem() {
    if (!picked) return
    const m = PICKABLE.find((x) => x.to === menuTo)
    if (!m) { setError('담을 메뉴를 고르세요.'); return }
    act(myFolders.addItem(picked.id, m.label, m.to), `[${m.label}] 을(를) 담았습니다.`).then((list) => { if (list) setMenuTo('') })
  }

  return (
    <div className="flex flex-col min-h-[100%]">
      <div className="ec-page-head">
        <h1 className="ec-page-title off">나만의 업무 폴더 설정</h1>
      </div>
      <p className="mb-[8px] text-ec-hint">사용할 메뉴를 직접 설정할 수 있습니다. 메뉴명도 수정 가능합니다.</p>

      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
      {notice && <p className="ec-alert ec-alert-success mb-[8px]">{notice}</p>}

      <div className="flex gap-[12px] items-start mobile:flex-col">
        {/* 폴더 */}
        <div className="w-[320px] shrink-0 mobile:w-full">
          <div className="flex gap-[5px] mb-[6px]">
            <input className="ec-input flex-1" placeholder="새 폴더명" value={newFolder} maxLength={100}
              onChange={(e) => setNewFolder(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') addFolder() }} />
            <button className="ec-btn ec-btn-primary" onClick={addFolder}>폴더 추가</button>
          </div>
          <table className="w-full">
            <thead><tr><th>폴더명</th><th className="w-[70px] text-center">순서</th></tr></thead>
            <tbody>
              {!folders ? <EcEmptyRow colSpan={2} loading />
                : folders.length === 0 ? <EcEmptyRow colSpan={2} text="만든 폴더가 없습니다." />
                : folders.map((f) => (
                  <tr key={f.id} className={f.id === pickedId ? 'bg-ec-blue-wash' : ''}>
                    <td><button className="text-ec-navy text-left w-full" onClick={() => setPickedId(f.id)}>{f.name} ({f.items.length})</button></td>
                    <td className="text-center">
                      <button className="ec-btn ec-btn-sm" aria-label="위로" onClick={() => { const ids = move(folders, f.id, -1); if (ids) act(myFolders.reorderFolders(ids)) }}>▲</button>
                      <button className="ec-btn ec-btn-sm ml-[2px]" aria-label="아래로" onClick={() => { const ids = move(folders, f.id, 1); if (ids) act(myFolders.reorderFolders(ids)) }}>▼</button>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>

        {/* 고른 폴더의 메뉴 */}
        <div className="flex-1 min-w-0 mobile:w-full">
          {!picked ? <p className="ec-empty">왼쪽에서 폴더를 만들거나 고르세요.</p> : (
            <>
              <div className="flex flex-wrap items-center gap-[5px] mb-[6px]">
                <span className="text-ec-label">폴더명</span>
                <input className="ec-input w-[200px]" value={folderName} maxLength={100} onChange={(e) => setFolderName(e.target.value)} />
                <button className="ec-btn" onClick={() => act(myFolders.renameFolder(picked.id, folderName.trim()), '폴더명을 바꿨습니다.')}>이름 저장</button>
                <button className="ec-btn" onClick={removeFolder}>폴더 삭제</button>
              </div>
              <div className="flex flex-wrap items-center gap-[5px] mb-[6px]">
                <span className="text-ec-label">메뉴</span>
                <CodePickerField label="담을 메뉴" hideLabel width={260} emptyLabel="선택 안 함" value={menuTo} onChange={setMenuTo}
                  items={PICKABLE.map((m) => ({ value: m.to, code: m.path, name: m.label }))} />
                <button className="ec-btn ec-btn-primary" onClick={addItem}>메뉴 담기</button>
              </div>
              <table className="w-full">
                <thead>
                  <tr>
                    <th className="w-[240px]">메뉴명</th>
                    <th>원래 메뉴</th>
                    <th className="w-[70px] text-center">순서</th>
                    <th className="w-[110px] text-center">관리</th>
                  </tr>
                </thead>
                <tbody>
                  {picked.items.length === 0 ? <EcEmptyRow colSpan={4} text="담은 메뉴가 없습니다." />
                    : picked.items.map((i) => (
                      <tr key={i.id}>
                        <td>
                          <input className="ec-input w-full" value={labels[i.id] ?? ''} maxLength={100}
                            onChange={(e) => setLabels((l) => ({ ...l, [i.id]: e.target.value }))} />
                        </td>
                        <td className="text-ec-label">{pathOf(i.path) || i.path}</td>
                        <td className="text-center">
                          <button className="ec-btn ec-btn-sm" aria-label="위로" onClick={() => { const ids = move(picked.items, i.id, -1); if (ids) act(myFolders.reorderItems(picked.id, ids)) }}>▲</button>
                          <button className="ec-btn ec-btn-sm ml-[2px]" aria-label="아래로" onClick={() => { const ids = move(picked.items, i.id, 1); if (ids) act(myFolders.reorderItems(picked.id, ids)) }}>▼</button>
                        </td>
                        <td className="text-center">
                          <button className="ec-btn ec-btn-sm" disabled={(labels[i.id] ?? '') === i.label}
                            onClick={() => act(myFolders.renameItem(i.id, (labels[i.id] ?? '').trim()), '메뉴명을 바꿨습니다.')}>저장</button>
                          <button className="ec-btn ec-btn-sm ml-[2px]" onClick={() => act(myFolders.deleteItem(i.id), `[${i.label}] 을(를) 뺐습니다.`)}>빼기</button>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
