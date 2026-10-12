import { api } from '../../api/client'

/** 기안서 구분(그룹) — 원본 공통양식 [구분] 코드도움 '구분검색'(그룹코드 · 그룹명). */
export type ApprovalGroup = { id: number; code: string; name: string }

/** 양식 응답에 실려 오는 구분 — 기본값설정 › 구분(비면 구분 없음). */
export type WithGroup = { groupCode?: string | null; groupName?: string | null }

export const fetchApprovalGroups = async () =>
  (await api.get<ApprovalGroup[]>('/approval-settings/groups')).data
