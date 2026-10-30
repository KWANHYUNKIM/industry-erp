package com.erp.auth.permissionrequest.dto;

import com.erp.auth.permissionrequest.ApproveKind;
import com.erp.auth.permissionrequest.PermissionRequest;
import com.erp.auth.permissionrequest.PermissionRequestStatus;
import com.erp.auth.workpermission.dto.WorkPermissionDtos.SaveWorkRow;
import com.erp.common.MenuPermissionCatalog;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.time.LocalDateTime;

/** 권한요청 · 권한승인대기현황. */
public final class PermissionRequestDtos {

    private PermissionRequestDtos() {}

    /** 자물쇠 화면 [권한요청] — 사유는 비워도 된다(원본 영상 1998). */
    public record CreatePermissionRequest(
            @NotBlank(message = "업무가 없습니다.") @Size(max = 50) String workCode,
            @Size(max = 200) String menuPath,
            @Size(max = 100) String menuName,
            @Size(max = 500, message = "사유는 500자까지 넣을 수 있습니다.") String reason) {}

    /** [승인] — 개별권한(USER) 또는 권한그룹(GROUP)에 이 업무 권한을 주고 승인으로 바꾼다. */
    public record ApproveRequest(@NotNull(message = "승인 방식을 고르세요.") ApproveKind kind,
                                 @NotNull(message = "권한을 고르세요.") @Valid SaveWorkRow row) {}

    public record PermissionRequestResponse(
            Long id, LocalDateTime requestedAt,
            Long requesterId, String requesterUsername, String requesterName,
            String workCode, String workName, String menuPath, String menuName, String reason,
            PermissionRequestStatus status, String processedByName,
            /** 승인ID(원본 열 이름) */
            String processedByUsername, LocalDateTime processedAt, ApproveKind approveKind,
            /** 요청자의 권한그룹(승인 › 권한그룹 이 바꿀 그룹). 없으면 null. */
            Long groupId, String groupName) {

        public static PermissionRequestResponse from(PermissionRequest r, Long groupId, String groupName) {
            return new PermissionRequestResponse(r.getId(), r.getRequestedAt(),
                    r.getRequester().getId(), r.getRequester().getUsername(), r.getRequester().getName(),
                    r.getWorkCode(), MenuPermissionCatalog.nameOf(r.getWorkCode()), r.getMenuPath(), r.getMenuName(),
                    r.getReason(), r.getStatus(),
                    r.getProcessedBy() == null ? null : r.getProcessedBy().getName(),
                    r.getProcessedBy() == null ? null : r.getProcessedBy().getUsername(), r.getProcessedAt(),
                    r.getApproveKind(), groupId, groupName);
        }
    }
}
