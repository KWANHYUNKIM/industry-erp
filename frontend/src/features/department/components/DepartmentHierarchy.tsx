import { useState } from 'react'
import Modal from '../../../components/Modal'
import { api, extractErrorMessage } from '../../../api/client'
import type { Department } from '../../../types/api'

/**
 * 부서리스트 [계층그룹](원본 E010105 '부서계층그룹', 2026-10-04 실측).
 * 원본: 왼쪽 나무(root 아래 그룹) · 오른쪽 '선택한 그룹에 있는 부서리스트'(포함 · 미포함 알약, 부서코드 · 부서명) · 제외 · 이동 · 닫기.
 * 우리는 부서계층그룹을 따로 두지 않고 상위 부서로 나무를 만든다(부서등록 [부서계층그룹]과 같다) — 그래서 나무의 마디가 곧 부서다.
 * [포함]에서 고르고 [제외] = 상위 부서를 푼다, [미포함]에서 고르고 [이동] = 고른 마디 아래로 옮긴다(서버가 순환을 막는다).
 * 원본의 미포함(전체그룹) · 소속그룹 · 순서변경 · 웹자료올리기는 없다.
 */
export default function DepartmentHierarchy({ departments, onClose, onChanged }: {
  departments: Department[]
  onClose: () => void
  onChanged: () => void
}) {
  const [node, setNode] = useState<number | null>(null)
  const [tab, setTab] = useState<'포함' | '미포함'>('포함')
  const [checked, setChecked] = useState<Set<number>>(new Set())
  const [error, setError] = useState('')

  const childrenOf = (id: number | null) => departments.filter((d) => (d.parentId ?? null) === id)
  const list = tab === '포함' ? childrenOf(node) : departments.filter((d) => (d.parentId ?? null) !== node && d.id !== node)
  const nodeName = node == null ? 'root' : departments.find((d) => d.id === node)?.name ?? ''

  function branch(id: number | null): React.ReactNode {
    return childrenOf(id).map((d) => (
      <div key={d.id} className="pl-[14px]">
        <button type="button" className={`block w-full text-left${node === d.id ? ' font-bold' : ''}`}
                onClick={() => { setNode(d.id); setChecked(new Set()) }}>
          [{d.code}] {d.name}
        </button>
        {branch(d.id)}
      </div>
    ))
  }

  async function move(parentId: number | null) {
    if (checked.size === 0) { setError('리스트에 선택된 자료가 없습니다. 체크박스에 체크한 후 다시 시도 바랍니다.'); return }
    setError('')
    try {
      for (const d of departments.filter((x) => checked.has(x.id))) {
        await api.put(`/departments/${d.id}`, { name: d.name, parentId, sortOrder: d.sortOrder, active: d.active })
      }
      setChecked(new Set())
      onChanged()
    } catch (e) {
      setError(extractErrorMessage(e))
    }
  }

  return (
    <Modal open title="부서계층그룹" width={900} error={error} onClose={onClose}>
      <div className="flex gap-[12px] mobile:flex-col">
        <div className="w-[260px] mobile:w-full border border-ec-line rounded-ec p-[8px] max-h-[420px] overflow-auto">
          <button type="button" className={`block w-full text-left${node == null ? ' font-bold' : ''}`}
                  onClick={() => { setNode(null); setChecked(new Set()) }}>root</button>
          {branch(null)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-bold mb-[6px]">{nodeName}</div>
          <div className="ec-pills mb-[6px]">
            {(['포함', '미포함'] as const).map((t) => (
              <button key={t} type="button" className={`ec-pill${tab === t ? ' active' : ''}`}
                      onClick={() => { setTab(t); setChecked(new Set()) }}>{t}</button>
            ))}
          </div>
          <table className="w-full text-left">
            <thead><tr><th className="w-[34px]"></th><th>부서코드</th><th>부서명</th></tr></thead>
            <tbody>
              {list.length === 0 ? (
                <tr><td colSpan={3} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
              ) : list.map((d) => (
                <tr key={d.id}>
                  <td className="text-center">
                    <input type="checkbox" aria-label={d.name} checked={checked.has(d.id)} onChange={() => {
                      const n = new Set(checked); if (n.has(d.id)) n.delete(d.id); else n.add(d.id); setChecked(n)
                    }} />
                  </td>
                  <td>{d.code}</td>
                  <td>{d.name}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex gap-[6px] mt-[8px]">
            {tab === '포함'
              ? <button type="button" className="ec-btn ec-btn-primary" onClick={() => move(null)}>제외</button>
              : <button type="button" className="ec-btn ec-btn-primary" onClick={() => move(node)}>이동</button>}
          </div>
        </div>
      </div>
      <div className="flex gap-[6px] mt-[12px]">
        <button type="button" className="ec-btn" onClick={onClose}>닫기</button>
      </div>
    </Modal>
  )
}
