package com.erp.auth.workpermission.dto;

import com.erp.auth.user.BasePermission;
import com.erp.auth.workpermission.WorkPermissionMode;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;

import java.util.List;
import java.util.Map;

/** 업무권한(개별권한설정 · 권한그룹 업무권한 · 권한복사 · 관리자설정) 요청/응답. */
public final class WorkPermissionDtos {

    private WorkPermissionDtos() {}

    /**
     * 개별권한설정 창의 한 줄(업무 하나).
     * {@code individual} — 사용자 화면에서 이 업무를 개별로 정했나(false 면 기본권한 · 권한그룹에서 풀린 값을 보여 준다).
     * {@code menus} — 예외(메뉴): 화면 경로 → 진입 여부.
     */
    public record WorkRow(String workCode, String workName, String category, boolean masterOnly, boolean individual,
                          WorkPermissionMode mode, boolean create, boolean update, boolean delete, boolean export,
                          Map<String, Boolean> menus) {}

    public record UserWorksResponse(Long userId, String username, String name, boolean master,
                                    BasePermission basePermission, Long groupId, String groupName,
                                    List<WorkRow> works) {}

    public record GroupWorksResponse(Long groupId, String code, String name, List<WorkRow> works) {}

    /** 저장할 한 줄. 행위 칸을 안 주면 켜짐(권한있음). */
    public record SaveWorkRow(@NotBlank(message = "업무를 고르세요.") String workCode,
                              @NotNull(message = "권한을 고르세요.") WorkPermissionMode mode,
                              Boolean create, Boolean update, Boolean delete, Boolean export,
                              Map<String, Boolean> menus) {}

    /** 사용자: 개별로 정한 업무만 보낸다(안 보낸 업무는 기본권한을 따른다). 그룹: 정한 업무를 보낸다(없는 업무 = 권한없음). */
    public record SaveWorksRequest(@NotNull @Valid List<SaveWorkRow> rows) {}

    /** 기본권한. GROUP 이면 groupId 필수. */
    public record SaveBaseRequest(@NotNull(message = "기본권한을 고르세요.") BasePermission basePermission, Long groupId) {}

    /** 권한복사 — 원본대상 한 명의 권한(기본권한 · 권한그룹 · 개별권한)을 복사대상 여러 명에게. */
    public record CopyRequest(@NotNull(message = "원본대상을 고르세요.") Long sourceUserId,
                              @NotEmpty(message = "복사대상을 고르세요.") List<Long> targetUserIds) {}

    /** 관리자설정 — 마스터로 둘 사용자 전부. */
    public record SaveMastersRequest(@NotEmpty(message = "마스터는 한 명 이상이어야 합니다.") List<Long> userIds) {}

    public record MasterResponse(Long id, String username, String name) {}
}
