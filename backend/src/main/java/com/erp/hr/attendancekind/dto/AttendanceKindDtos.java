package com.erp.hr.attendancekind.dto;

import com.erp.hr.attendancekind.AttendanceKind;
import com.erp.hr.attendancekind.AttendanceKindType;
import com.erp.hr.attendancekind.VacationKind;
import java.time.LocalDate;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public class AttendanceKindDtos {

    public record AttendanceKindRequest(
            @Size(max = 20, message = "입력한 글자가 너무 깁니다. 20자까지 넣을 수 있습니다.") String code,
            @NotBlank(message = "근태명칭을 입력 바랍니다.")
            @Size(max = 20, message = "입력한 글자가 너무 깁니다. 20자까지 넣을 수 있습니다.") String name,
            @Size(max = 50, message = "입력한 글자가 너무 깁니다. 50자까지 넣을 수 있습니다.") String kindGroup,
            @NotNull(message = "근태유형을 선택 바랍니다.") AttendanceKindType type,
            Long vacationKindId,
            boolean hourUnit,
            @Size(max = 500, message = "입력한 글자가 너무 깁니다. 500자까지 넣을 수 있습니다.") String remark,
            Boolean active
    ) {}

    public record AttendanceKindResponse(
            Long id, String code, String name, String kindGroup, AttendanceKindType type, String typeName,
            Long vacationKindId, String vacationKindCode, String vacationKindName,
            boolean hourUnit, String remark, boolean active
    ) {
        public static AttendanceKindResponse from(AttendanceKind k) {
            VacationKind v = k.getVacationKind();
            return new AttendanceKindResponse(k.getId(), k.getCode(), k.getName(), k.getKindGroup(), k.getType(),
                    k.getType().getDisplayName(), v != null ? v.getId() : null, v != null ? v.getCode() : null,
                    v != null ? v.getName() : null, k.isHourUnit(), k.getRemark(), k.isActive());
        }
    }

    public record NextCodeResponse(String code) {}

    public record VacationKindRequest(
            @Size(max = 20, message = "입력한 글자가 너무 깁니다. 20자까지 넣을 수 있습니다.") String code,
            @NotBlank(message = "휴가명을 입력 바랍니다.")
            @Size(max = 50, message = "입력한 글자가 너무 깁니다. 50자까지 넣을 수 있습니다.") String name,
            @NotNull(message = "기간을 입력 바랍니다.") LocalDate periodFrom,
            @NotNull(message = "기간을 입력 바랍니다.") LocalDate periodTo,
            boolean carryOver,
            @Size(max = 500, message = "입력한 글자가 너무 깁니다. 500자까지 넣을 수 있습니다.") String remark,
            Boolean active
    ) {}

    public record VacationKindResponse(
            Long id, String code, String name, LocalDate periodFrom, LocalDate periodTo, boolean carryOver, String remark, boolean active
    ) {
        public static VacationKindResponse from(VacationKind v) {
            return new VacationKindResponse(v.getId(), v.getCode(), v.getName(), v.getPeriodFrom(), v.getPeriodTo(),
                    v.isCarryOver(), v.getRemark(), v.isActive());
        }
    }
}
