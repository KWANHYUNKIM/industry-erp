package com.erp.auth.dto;

import com.erp.auth.domain.Permission;

public final class PermissionDtos {

    private PermissionDtos() {}

    /** 권한 카탈로그 항목. 역할 편집 화면이 카테고리별로 묶어 체크박스로 보여준다. */
    public record PermissionResponse(
            String code,
            String name,
            String category,
            int sort
    ) {
        public static PermissionResponse from(Permission p) {
            return new PermissionResponse(p.getCode(), p.getName(), p.getCategory(), p.getSort());
        }
    }
}
