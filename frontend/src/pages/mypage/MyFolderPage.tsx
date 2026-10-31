import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { extractErrorMessage } from '../../api/client'
import { FLAT_MENU } from '../../app/layout/menu'
import Modal from '../../components/Modal'
import { myFolders, type MyFolder } from '../../features/mypage/api'
import { ecAlert, ecConfirm } from '../../components/EcDialog'

/**
 * MyPage › MyPage설정 (원본: 사용자 사진 → 개인기능설정 → 기능설정 › My Page설정, 2026-10-13 loginaa 실측).
 *
 * <p>왼쪽 'MyPage설정' 나무(뿌리 MyPage → 폴더 → 담은 메뉴)와 오른쪽 '메뉴검색' 나무(모듈 → 탭 → 묶음 → 메뉴)를
 * 가운데 [←] 로 잇는다. 원본처럼 편집은 <b>이 화면 안에만</b> 있다가 [저장(F8)] 때 한 번에 서버로 간다 —
 * 고친 채 [닫기] 하면 원본 문구 그대로 묻는다. 노드마다 [Fn]: 뿌리 = 그룹추가 / 폴더 = 이름수정 · 설정 · 삭제 /
 * 메뉴 = 이름수정 · 설정 · 삭제. [설정] 의 표시순서로 차례를 바꾼다.
 *
 * <p>원본과 다른 점(plans/mypage.md '남은 것'): 폴더 아래 묶음(3단 그룹) · 메뉴의 [메인] 은 아직 없다(스키마),
 * 같은 폴더에 같은 메뉴를 두 번 담지 못한다(원본은 막지 않음 — 테이블 UNIQUE).
 */

// 담을 수 있는 메뉴 — MyPage 예시 폴더에 겹쳐 실린 것은 빼고 제 모듈 자리로 고른다.
const PICKABLE = FLAT_MENU.filter((m) => !m.path.startsWith('MyPage'))

/** 원본 오른쪽 나무 1단은 재고 I · II 를 '재고', 회계 I · II 를 '회계' 로 묶는다. */
const rootOf = (mod: string) => mod.replace(/ (I|II)$/, '')

interface RNode { key: string; label: string; to?: string; children: RNode[] }

function buildRightTree(): RNode[] {
  const roots: RNode[] = []
  const at = (list: RNode[], key: string, label: string) => {
    let n = list.find((x) => x.key === key)
    if (!n) { n = { key, label, children: [] }; list.push(n) }
    return n
  }
  for (const m of PICKABLE) {
    const parts = m.path.split(' > ')
    let list = roots
    let key = ''
    parts.forEach((p, i) => {
      const label = i === 0 ? rootOf(p) : p
      key += '/' + label
      list = at(list, key, label).children
      // 재고 I · 재고 II 는 '재고' 아래 한 단 더 둔다(원본: 재고 › 재고 I › 기초등록 …).
      if (i === 0 && label !== p) { key += '/' + p; list = at(list, key, p).children }
    })
    list.push({ key: key + '/' + m.to + '#' + m.label, label: m.label, to: m.to, children: [] })
  }
  return roots
}

const leavesOf = (n: RNode): RNode[] => (n.to ? [n] : n.children.flatMap(leavesOf))

interface DItem { key: string; id?: number; label: string; path: string }
interface DFolder { key: string; id?: number; name: string; items: DItem[] }

let seq = 0
const newKey = () => `n${++seq}`

const toDraft = (list: MyFolder[]): DFolder[] =>
  list.map((f) => ({ key: `f${f.id}`, id: f.id, name: f.name, items: f.items.map((i) => ({ key: `i${i.id}`, id: i.id, label: i.label, path: i.path })) }))

const sameDraft = (a: DFolder[], b: DFolder[]) => JSON.stringify(a) === JSON.stringify(b)

const UNSAVED = '작업한 내용이 저장되지 않았습니다. 저장되지 않은 내용은 삭제됩니다.\n이 페이지를 벗어나겠습니까?'
const DELETE_ASK = '선택한 항목을 삭제하겠습니까?\n그룹의 경우 하위 항목까지 삭제됩니다.'
const LIMIT = 200

type Setting = { kind: 'folder' | 'item'; key: string; name: string; order: string }

export default function MyFolderPage() {
  const navigate = useNavigate()
  const [saved, setSaved] = useState<DFolder[] | null>(null)
  const [draft, setDraft] = useState<DFolder[]>([])
  const [leftChecked, setLeftChecked] = useState<Set<string>>(new Set())
  const [rightChecked, setRightChecked] = useState<Set<string>>(new Set())
  const [leftOpen, setLeftOpen] = useState<Set<string>>(new Set(['root']))
  const [rightOpen, setRightOpen] = useState<Set<string>>(new Set())
  const [fnFor, setFnFor] = useState<string | null>(null)
  const [renaming, setRenaming] = useState<{ key: string; value: string } | null>(null)
  const [setting, setSetting] = useState<Setting | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const rightTree = useMemo(buildRightTree, [])
  const dirty = saved !== null && !sameDraft(saved, draft)
  const count = draft.reduce((n, f) => n + 1 + f.items.length, 0)

  function load(list: MyFolder[]) {
    const d = toDraft(list)
    setSaved(d); setDraft(d)
    setLeftChecked(new Set()); setRightChecked(new Set())
  }

  useEffect(() => {
    myFolders.list().then(load).catch((e) => setError(extractErrorMessage(e)))
  }, [])

  // F8 = 저장
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'F8' && !setting) { e.preventDefault(); save() } }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const toggle = (set: Set<string>, key: string) => { const s = new Set(set); if (s.has(key)) s.delete(key); else s.add(key); return s }

  /* ── 왼쪽 나무 편집 (화면 안에서만) ── */

  function addGroup() {
    const key = newKey()
    setDraft((d) => [...d, { key, name: '', items: [] }])
    setRenaming({ key, value: '' })
    setFnFor(null)
  }

  function commitRename() {
    if (!renaming) return
    const v = renaming.value.trim()
    setDraft((d) => {
      const f = d.find((x) => x.key === renaming.key)
      // 새로 만든 그룹을 이름 없이 끝내면 만들지 않은 것으로 한다.
      if (f && !f.id && !f.name && !v) return d.filter((x) => x.key !== renaming.key)
      if (!v) return d
      return d.map((x) => x.key === renaming.key ? { ...x, name: v }
        : { ...x, items: x.items.map((i) => i.key === renaming.key ? { ...i, label: v } : i) })
    })
    setRenaming(null)
  }

  function removeKeys(keys: Set<string>) {
    setDraft((d) => d.filter((f) => !keys.has(f.key)).map((f) => ({ ...f, items: f.items.filter((i) => !keys.has(i.key)) })))
    setLeftChecked(new Set())
  }

  async function askDelete(keys: Set<string>) {
    setFnFor(null)
    if (!(await ecConfirm(DELETE_ASK))) return
    removeKeys(keys)
  }

  function openSetting(key: string) {
    setFnFor(null)
    const fi = draft.findIndex((f) => f.key === key)
    if (fi >= 0) { setSetting({ kind: 'folder', key, name: draft[fi].name, order: String(fi + 1) }); return }
    for (const f of draft) {
      const ii = f.items.findIndex((i) => i.key === key)
      if (ii >= 0) { setSetting({ kind: 'item', key, name: f.items[ii].label, order: String(ii + 1) }); return }
    }
  }

  /** [적용(F8)] — 이름을 비우면 원래 이름을 둔다(원본도 말없이 그대로). 표시순서는 그 자리로 옮긴다. */
  function applySetting() {
    if (!setting) return
    const name = setting.name.trim()
    const move = <T,>(rows: T[], from: number): T[] => {
      const n = Number(setting.order)
      if (!Number.isFinite(n) || n < 1) return rows
      const to = Math.min(Math.round(n), rows.length) - 1
      const r = [...rows]; const [x] = r.splice(from, 1); r.splice(to, 0, x); return r
    }
    setDraft((d) => {
      if (setting.kind === 'folder') {
        const i = d.findIndex((f) => f.key === setting.key)
        const named = d.map((f) => f.key === setting.key && name ? { ...f, name } : f)
        return move(named, i)
      }
      return d.map((f) => {
        const i = f.items.findIndex((x) => x.key === setting.key)
        if (i < 0) return f
        const items = f.items.map((x) => x.key === setting.key && name ? { ...x, label: name } : x)
        return { ...f, items: move(items, i) }
      })
    })
    setSetting(null)
  }

  /** [←] — 오른쪽에서 체크한 메뉴를 왼쪽에서 체크한 그룹 끝에 붙인다. */
  function bring() {
    setError('')
    const target = draft.find((f) => leftChecked.has(f.key))
    if (!target) { void ecAlert('메뉴를 추가할 그룹을 선택하기 바랍니다.'); return }
    const picked = rightTree.flatMap(leavesOf).filter((n) => rightChecked.has(n.key))
    if (picked.length === 0) return
    setDraft((d) => d.map((f) => {
      if (f.key !== target.key) return f
      const have = new Set(f.items.map((i) => i.path))
      const add = picked.filter((p) => !have.has(p.to!)).map((p) => ({ key: newKey(), label: p.label, path: p.to! }))
      return { ...f, items: [...f.items, ...add] }
    }))
    setLeftOpen((s) => new Set(s).add(target.key))
    setLeftChecked(new Set()); setRightChecked(new Set())
  }

  /* ── 저장 — 화면 안의 편집을 서버에 차례로 옮긴다 ── */

  async function save() {
    if (!saved || busy) return
    setBusy(true); setError('')
    try {
      let list: MyFolder[] = await myFolders.list()
      const keep = new Set(draft.map((f) => f.id).filter(Boolean))
      for (const f of saved) if (f.id && !keep.has(f.id)) list = await myFolders.deleteFolder(f.id)
      const ids: number[] = []
      for (const f of draft) {
        let id = f.id
        if (!id) {
          const before = new Set(list.map((x) => x.id))
          list = await myFolders.createFolder(f.name)
          id = list.find((x) => !before.has(x.id))!.id
        } else {
          const cur = list.find((x) => x.id === id)
          if (cur && cur.name !== f.name) list = await myFolders.renameFolder(id, f.name)
        }
        ids.push(id)
        const cur = list.find((x) => x.id === id)!
        const keepItems = new Set(f.items.map((i) => i.id).filter(Boolean))
        for (const i of cur.items) if (!keepItems.has(i.id)) list = await myFolders.deleteItem(i.id)
        const itemIds: number[] = []
        for (const i of f.items) {
          if (!i.id) {
            const before = new Set(list.find((x) => x.id === id)!.items.map((x) => x.id))
            list = await myFolders.addItem(id, i.label, i.path)
            itemIds.push(list.find((x) => x.id === id)!.items.find((x) => !before.has(x.id))!.id)
          } else {
            const ci = list.find((x) => x.id === id)!.items.find((x) => x.id === i.id)
            if (ci && ci.label !== i.label) list = await myFolders.renameItem(i.id, i.label)
            itemIds.push(i.id)
          }
        }
        const now = list.find((x) => x.id === id)!.items.map((x) => x.id)
        if (now.join() !== itemIds.join()) list = await myFolders.reorderItems(id, itemIds)
      }
      if (list.map((x) => x.id).join() !== ids.join()) list = await myFolders.reorderFolders(ids)
      load(list)
    } catch (e) {
      setError(extractErrorMessage(e))
      myFolders.list().then(load).catch(() => {})
    } finally {
      setBusy(false)
    }
  }

  async function close() {
    if (dirty && !(await ecConfirm(UNSAVED))) return
    navigate('/')
  }

  /* ── 그리기 ── */

  const fnMenu = (key: string, items: [string, () => void][]) => (
    <span className="relative inline-flex ml-[4px]">
      <button type="button" className="ec-btn ec-btn-sm" onClick={() => setFnFor(fnFor === key ? null : key)}>Fn</button>
      {fnFor === key && (
        <>
          <div className="ec-backdrop-clear" onClick={() => setFnFor(null)} />
          <div className="ec-menu left-0 right-auto">
            {items.map(([label, run]) => <button key={label} type="button" onClick={run}>{label}</button>)}
          </div>
        </>
      )}
    </span>
  )

  const nameOrInput = (key: string, text: string) =>
    renaming?.key === key ? (
      <input className="ec-input w-[200px]" autoFocus maxLength={100} value={renaming.value}
        onChange={(e) => setRenaming({ key, value: e.target.value })}
        onBlur={commitRename}
        onKeyDown={(e) => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') { setRenaming(null); setDraft((d) => d.filter((f) => f.id || f.name || f.key !== key)) } }} />
    ) : <span>{text}</span>

  const caret = (open: boolean, has: boolean, onClick: () => void) => (
    <button type="button" className={`w-[14px] text-ec-icon ${has ? '' : 'invisible'}`} aria-label={open ? '접기' : '펼치기'} onClick={onClick}>{open ? '▾' : '▸'}</button>
  )

  const PAD = ['pl-0', 'pl-[18px]', 'pl-[36px]', 'pl-[54px]', 'pl-[72px]']
  const rightNode = (n: RNode, depth: number): ReactNode => {
    const open = rightOpen.has(n.key)
    const leaves = leavesOf(n)
    const all = leaves.length > 0 && leaves.every((l) => rightChecked.has(l.key))
    return (
      <li key={n.key}>
        <div className={`flex items-center gap-[4px] h-[24px] ${PAD[Math.min(depth, 4)]}`}>
          {caret(open, !n.to, () => setRightOpen((s) => toggle(s, n.key)))}
          <input type="checkbox" checked={all} onChange={() => setRightChecked((s) => {
            const r = new Set(s); leaves.forEach((l) => (all ? r.delete(l.key) : r.add(l.key))); return r
          })} />
          <span className={n.to ? '' : 'text-ec-label'}>{n.to ? '' : '▣ '}{n.label}</span>
        </div>
        {!n.to && open && <ul>{n.children.map((c) => rightNode(c, depth + 1))}</ul>}
      </li>
    )
  }

  const allLeftKeys = draft.map((f) => f.key)
  const allRightGroups = (ns: RNode[]): string[] => ns.flatMap((n) => (n.to ? [] : [n.key, ...allRightGroups(n.children)]))
  const leftAllOpen = allLeftKeys.every((k) => leftOpen.has(k))
  const rightKeys = allRightGroups(rightTree)
  const rightAllOpen = rightKeys.every((k) => rightOpen.has(k))

  return (
    <div className="flex flex-col min-h-[100%]">
      <div className="ec-page-head">
        <h1 className="ec-page-title off">MyPage설정</h1>
      </div>

      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}

      <div className="flex gap-[12px] items-stretch mobile:flex-col">
        {/* 왼쪽 — MyPage설정 */}
        <div className="flex-1 min-w-0 ec-form p-0 flex flex-col">
          <div className="flex items-center justify-between px-[9px] h-[35px] bg-ec-basic rounded-t-ec-panel">
            <span className="font-bold">MyPage설정</span>
            <span>{count} / {LIMIT}</span>
          </div>
          <div className="p-[9px] flex-1">
            <div className="flex gap-[4px] mb-[6px]">
              <button type="button" className="ec-btn ec-btn-sm"
                onClick={() => setLeftOpen(leftAllOpen ? new Set(['root']) : new Set(['root', ...allLeftKeys]))}>{leftAllOpen ? '전체접기' : '전체펼치기'}</button>
              <button type="button" className="ec-btn ec-btn-sm" onClick={() => askDelete(leftChecked)}>선택삭제</button>
            </div>
            {!saved ? <p className="ec-empty">불러오는 중…</p> : (
              <ul>
                <li>
                  <div className="flex items-center gap-[4px] h-[24px]">
                    {caret(leftOpen.has('root'), true, () => setLeftOpen((s) => toggle(s, 'root')))}
                    <span className="font-bold">MyPage</span>
                    {fnMenu('root', [['그룹추가', addGroup]])}
                  </div>
                  {leftOpen.has('root') && (
                    <ul>
                      {draft.map((f) => (
                        <li key={f.key}>
                          <div className="flex items-center gap-[4px] h-[26px] pl-[18px]">
                            {caret(leftOpen.has(f.key), f.items.length > 0, () => setLeftOpen((s) => toggle(s, f.key)))}
                            <input type="checkbox" aria-label={`${f.name} 선택`} checked={leftChecked.has(f.key)} onChange={() => setLeftChecked((s) => toggle(s, f.key))} />
                            <span className="text-ec-star">▣</span>
                            {nameOrInput(f.key, f.name)}
                            {f.id !== undefined || f.name ? fnMenu(f.key, [
                              ['이름수정', () => { setRenaming({ key: f.key, value: f.name }); setFnFor(null) }],
                              ['설정', () => openSetting(f.key)],
                              ['삭제', () => askDelete(new Set([f.key]))],
                            ]) : null}
                          </div>
                          {leftOpen.has(f.key) && (
                            <ul>
                              {f.items.map((i) => (
                                <li key={i.key} className="flex items-center gap-[4px] h-[26px] pl-[54px]">
                                  <input type="checkbox" aria-label={`${i.label} 선택`} checked={leftChecked.has(i.key)} onChange={() => setLeftChecked((s) => toggle(s, i.key))} />
                                  {nameOrInput(i.key, i.label)}
                                  {fnMenu(i.key, [
                                    ['이름수정', () => { setRenaming({ key: i.key, value: i.label }); setFnFor(null) }],
                                    ['설정', () => openSetting(i.key)],
                                    ['삭제', () => askDelete(new Set([i.key]))],
                                  ])}
                                </li>
                              ))}
                            </ul>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              </ul>
            )}
          </div>
        </div>

        {/* 가운데 — 담기 */}
        <div className="flex items-center justify-center mobile:py-[6px]">
          <button type="button" className="ec-btn ec-btn-primary" aria-label="담기" onClick={bring}>←</button>
        </div>

        {/* 오른쪽 — 메뉴검색 */}
        <div className="flex-1 min-w-0 ec-form p-0 flex flex-col">
          <div className="flex items-center px-[9px] h-[35px] bg-ec-basic rounded-t-ec-panel">
            <span className="font-bold">메뉴검색</span>
          </div>
          <div className="p-[9px] flex-1 max-h-[560px] overflow-auto">
            <div className="flex gap-[4px] mb-[6px]">
              <button type="button" className="ec-btn ec-btn-sm"
                onClick={() => setRightOpen(rightAllOpen ? new Set() : new Set(rightKeys))}>{rightAllOpen ? '전체접기' : '전체펼치기'}</button>
            </div>
            <ul>{rightTree.map((n) => rightNode(n, 0))}</ul>
          </div>
        </div>
      </div>

      <div className="flex gap-[4px] mt-[9px]">
        <button type="button" className="ec-btn ec-btn-primary" disabled={busy} onClick={save}>저장(F8)</button>
        <button type="button" className="ec-btn" onClick={close}>닫기</button>
      </div>

      <Modal open={!!setting} title="설정" width={420} error={error || null} onClose={() => setSetting(null)}>
        {setting && (
          <div className="ec-form">
            <p className="font-bold mb-[6px]">공통</p>
            {setting.kind === 'folder' && (
              <div className="flex items-center gap-[6px] mb-[6px]"><span className="w-[80px] text-ec-label">상위그룹</span><span>MyPage</span></div>
            )}
            <label className="flex items-center gap-[6px] mb-[6px]">
              <span className="w-[80px] text-ec-label">{setting.kind === 'folder' ? '그룹명' : '표시명'}</span>
              <input className="ec-input flex-1" maxLength={100} value={setting.name}
                onChange={(e) => setSetting({ ...setting, name: e.target.value })} />
            </label>
            <label className="flex items-center gap-[6px] mb-[6px]">
              <span className="w-[80px] text-ec-label">표시순서</span>
              <input className="ec-input flex-1 text-right" inputMode="numeric" value={setting.order}
                onChange={(e) => setSetting({ ...setting, order: e.target.value.replace(/[^0-9]/g, '') })}
                onKeyDown={(e) => { if (e.key === 'F8' || e.key === 'Enter') { e.preventDefault(); applySetting() } }} />
            </label>
            <div className="flex gap-[4px] mt-[9px]">
              <button type="button" className="ec-btn ec-btn-primary" onClick={applySetting}>적용(F8)</button>
              <button type="button" className="ec-btn" onClick={() => setSetting(null)}>닫기</button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
