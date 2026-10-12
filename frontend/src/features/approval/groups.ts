import { api } from '../../api/client'

/** 기안서 구분(그룹) — 원본 공통양식 [구분] 코드도움 '구분검색'(그룹코드 · 그룹명). */
export type ApprovalGroup = { id: number; code: string; name: string }

/** 양식 응답에 실려 오는 구분 — 기본값설정 › 구분(비면 구분 없음). */
export type WithGroup = { groupCode?: string | null; groupName?: string | null }

export const fetchApprovalGroups = async () =>
  (await api.get<ApprovalGroup[]>('/approval-settings/groups')).data

/** 구분검색 [신규(F2)] — 그룹코드 · 그룹명. 같은 코드가 있으면 서버가 막는다. */
export const createApprovalGroup = async (code: string, name: string) =>
  (await api.post<ApprovalGroup>('/approval-settings/groups', { code, name })).data

/** 구분검색 [수정] — 그룹명만 바뀐다(코드는 양식이 가리키고 있다). */
export const updateApprovalGroup = async (g: ApprovalGroup, name: string) =>
  (await api.put<ApprovalGroup>(`/approval-settings/groups/${g.id}`, { code: g.code, name })).data
