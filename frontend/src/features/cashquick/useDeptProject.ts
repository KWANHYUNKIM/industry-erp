import { useEffect, useState } from 'react'
import { api } from '../../api/client'
import type { CodeItem } from '../../components/CodePickerField'

/**
 * 현금거래 한 장 입력(영수증으로 · 매출처로부터 …) 머리의 [부서] · [프로젝트] 코드도움 목록.
 * 원본 폼은 전표일자 다음에 이 두 칸을 둔다(2026-10-12 loginaa 실측). 권한이 없어 목록을 못 받으면 빈 목록이다.
 */
export function useDeptProjectItems() {
  const [departments, setDepartments] = useState<CodeItem[]>([])
  const [projects, setProjects] = useState<CodeItem[]>([])
  useEffect(() => {
    api.get<{ id: number; code: string; name: string }[]>('/departments')
      .then((r) => setDepartments(r.data.map((d) => ({ value: String(d.id), code: d.code, name: d.name }))))
      .catch(() => setDepartments([]))
    api.get<{ id: number; code: string; name: string }[]>('/projects')
      .then((r) => setProjects(r.data.map((p) => ({ value: String(p.id), code: p.code, name: p.name }))))
      .catch(() => setProjects([]))
  }, [])
  return { departments, projects }
}
