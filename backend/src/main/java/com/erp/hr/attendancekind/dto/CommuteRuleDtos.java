package com.erp.hr.attendancekind.dto;

import com.erp.hr.attendancekind.CommuteRule;
import com.erp.hr.attendancekind.CommuteRuleMethod;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public class CommuteRuleDtos {

    private static final String SLOT = "^$|^[01]\\|([01]\\d|2[0-3]):[0-5]\\d$";

    public record CommuteRuleRequest(
            @NotBlank(message = "반영기준코드를 입력 바랍니다.")
            @Size(max = 20, message = "입력한 글자가 너무 깁니다. 20자까지 넣을 수 있습니다.") String code,
            @NotBlank(message = "반영기준명을 입력 바랍니다.")
            @Size(max = 50, message = "입력한 글자가 너무 깁니다. 50자까지 넣을 수 있습니다.") String name,
            boolean hourUnit,
            @NotNull(message = "반영방식을 선택 바랍니다.") CommuteRuleMethod method,
            boolean directBasis,
            @Min(value = 0, message = "최소시간은 0 이상이어야 합니다.") @Max(value = 23, message = "최소시간은 23시간까지입니다.") Integer minHours,
            @Min(value = 0, message = "최소시간(분)은 0 이상이어야 합니다.") @Max(value = 59, message = "최소시간(분)은 59분까지입니다.") Integer minMinutes,
            @Size(max = 8, message = "제외시간 꼴이 맞지 않습니다.") @Pattern(regexp = SLOT, message = "제외시간 꼴이 맞지 않습니다.") String ex1From,
            @Size(max = 8, message = "제외시간 꼴이 맞지 않습니다.") @Pattern(regexp = SLOT, message = "제외시간 꼴이 맞지 않습니다.") String ex1To,
            @Size(max = 8, message = "제외시간 꼴이 맞지 않습니다.") @Pattern(regexp = SLOT, message = "제외시간 꼴이 맞지 않습니다.") String ex2From,
            @Size(max = 8, message = "제외시간 꼴이 맞지 않습니다.") @Pattern(regexp = SLOT, message = "제외시간 꼴이 맞지 않습니다.") String ex2To,
            @Size(max = 8, message = "제외시간 꼴이 맞지 않습니다.") @Pattern(regexp = SLOT, message = "제외시간 꼴이 맞지 않습니다.") String ex3From,
            @Size(max = 8, message = "제외시간 꼴이 맞지 않습니다.") @Pattern(regexp = SLOT, message = "제외시간 꼴이 맞지 않습니다.") String ex3To,
            @Size(max = 500, message = "입력한 글자가 너무 깁니다. 500자까지 넣을 수 있습니다.") String remark,
            Boolean active
    ) {}

    public record CommuteRuleResponse(
            Long id, String code, String name, boolean hourUnit, CommuteRuleMethod method, String methodName,
            boolean directBasis, String basisName, Integer minHours, Integer minMinutes,
            String ex1From, String ex1To, String ex2From, String ex2To, String ex3From, String ex3To,
            String remark, boolean active
    ) {
        public static CommuteRuleResponse from(CommuteRule r) {
            return new CommuteRuleResponse(r.getId(), r.getCode(), r.getName(), r.isHourUnit(), r.getMethod(),
                    r.getMethod().getDisplayName(), r.isDirectBasis(), r.isDirectBasis() ? "직접설정" : "근무시간설정기준",
                    r.getMinHours(), r.getMinMinutes(), r.getEx1From(), r.getEx1To(), r.getEx2From(), r.getEx2To(),
                    r.getEx3From(), r.getEx3To(), r.getRemark(), r.isActive());
        }
    }
}
