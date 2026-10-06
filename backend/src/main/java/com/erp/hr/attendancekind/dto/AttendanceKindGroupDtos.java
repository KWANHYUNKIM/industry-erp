package com.erp.hr.attendancekind.dto;

import com.erp.hr.attendancekind.AttendanceKindGroup;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public class AttendanceKindGroupDtos {

    public record GroupRequest(
            @Size(max = 20, message = "입력한 글자가 너무 깁니다. 20자까지 넣을 수 있습니다.") String code,
            @NotBlank(message = "근태그룹 명을 입력 바랍니다.")
            @Size(max = 50, message = "입력한 글자가 너무 깁니다. 50자까지 넣을 수 있습니다.") String name
    ) {}

    public record GroupResponse(Long id, String code, String name) {
        public static GroupResponse from(AttendanceKindGroup g) {
            return new GroupResponse(g.getId(), g.getCode(), g.getName());
        }
    }
}
