package com.erp.hr.contract.dto;

import com.erp.hr.contract.EmploymentContract;
import com.erp.hr.contract.ContractStatus;
import com.erp.hr.contract.ContractType;
import jakarta.validation.constraints.Size;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.NotBlank;
import com.erp.hr.contract.DeliveryMethod;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

public class EmploymentContractDtos {

    public record CreateContractRequest(
            @NotNull(message = "사원을 선택하세요.") Long employeeId,
            @NotNull(message = "계약 유형을 선택하세요.") ContractType type,
            @NotNull(message = "계약 시작일을 입력하세요.") LocalDate startDate,
            LocalDate endDate,
            Long departmentId,
            @Size(max = 100, message = "입력한 글자가 너무 깁니다. 100자까지 넣을 수 있습니다.")
            String jobTitle,
            BigDecimal monthlySalary,
            @PositiveOrZero(message = "주 소정근로시간은 0~168 입니다.")
            @Max(value = 168, message = "주 소정근로시간은 0~168 입니다.") Integer weeklyHours,
            @Size(max = 200, message = "입력한 글자가 너무 깁니다. 200자까지 넣을 수 있습니다.")
            String workPlace,
            @Size(max = 200, message = "입력한 글자가 너무 깁니다. 200자까지 넣을 수 있습니다.")
            String duty,
            @Size(max = 500, message = "입력한 글자가 너무 깁니다. 500자까지 넣을 수 있습니다.")
            String remark
    ) {}

    /**
     * 원본 근로계약서진행단계 [신규(F2)] · 계약서명 링크가 여는 '계약서입력' 창.
     * 계약서명 · 첨부(PDF) 가 필수 — 원본은 빈 칸을 빨갛게 하고 저장하지 않는다.
     */
    public record DocumentRequest(
            @NotBlank(message = "데이터를 입력하기 바랍니다")
            @Size(max = 100, message = "입력한 글자가 너무 깁니다. 100자까지 넣을 수 있습니다.")
            String contractName,
            @NotNull(message = "데이터를 입력하기 바랍니다") Long attachmentFileId,
            boolean twoFactor,
            @Size(max = 50, message = "입력한 글자가 너무 깁니다. 50자까지 넣을 수 있습니다.")
            String category,
            Long departmentId,
            Long projectId,
            @Size(max = 500, message = "입력한 글자가 너무 깁니다. 500자까지 넣을 수 있습니다.")
            String remark
    ) {}

    /** 원본 [복사] — '계약서복사' 창은 계약서명 하나만 받는다. 첨부 · 설정은 원래 계약서를 그대로 쓴다. */
    public record CopyRequest(
            @NotBlank(message = "데이터를 입력하기 바랍니다")
            @Size(max = 100, message = "입력한 글자가 너무 깁니다. 100자까지 넣을 수 있습니다.")
            String contractName
    ) {}

    /** 원본 [수신정보입력] — 계약참여자1(사원) · 전달방식. */
    public record RecipientRequest(
            @NotNull(message = "데이터를 입력하기 바랍니다") Long employeeId,
            @NotNull(message = "데이터를 입력하기 바랍니다") DeliveryMethod deliveryMethod,
            /** [항목등록] 한 항목의 값(원본 [전송정보입력] 격자의 항목 열). 없으면 그대로 둔다. */
            java.util.List<ItemValue> items
    ) {}

    public record ItemValue(@NotNull Long id, @Size(max = 200, message = "입력한 글자가 너무 깁니다. 200자까지 넣을 수 있습니다.") String value) {}

    /** 원본 '항목등록' · '항목수정' 창 — 항목명 하나. */
    public record ItemRequest(
            @NotBlank(message = "데이터를 입력하기 바랍니다")
            @Size(max = 100, message = "입력한 글자가 너무 깁니다. 100자까지 넣을 수 있습니다.")
            String name
    ) {}

    public record ItemResponse(Long id, String name, String value) {
        public static ItemResponse from(com.erp.hr.contract.EmploymentContractItem i) {
            return new ItemResponse(i.getId(), i.getName(), i.getValue());
        }
    }

    /** 서명. 사원 본인 확인용 서명자명을 남긴다. */
    public record SignContractRequest(
            @Size(max = 100, message = "서명자명은 100자까지 넣을 수 있습니다.")
            @NotNull(message = "서명자명을 입력하세요.") String signedBy
    ) {}

    public record ContractResponse(
            Long id,
            String contractNo,
            Long employeeId,
            String employeeCode,
            String employeeName,
            ContractType type,
            String typeName,
            ContractStatus status,
            String statusName,
            LocalDate startDate,
            LocalDate endDate,
            Long departmentId,
            String department,
            String jobTitle,
            BigDecimal monthlySalary,
            int weeklyHours,
            String workPlace,
            String duty,
            LocalDateTime signedAt,
            String signedBy,
            String remark,
            String createdBy,
            /** 원본 근로계약현황 [요청일시] · [최종수정일자] */
            LocalDateTime sentAt,
            LocalDateTime updatedAt,
            /** 원본 [최초작성일자] */
            LocalDateTime createdAt,
            /** 원본 [계약서명]. 예전 구조화 계약은 '계약번호 사원명 근로계약서' */
            String contractName,
            Long attachmentFileId,
            String attachmentName,
            Long attachmentSize,
            boolean twoFactor,
            String category,
            Long projectId,
            DeliveryMethod deliveryMethod,
            String deliveryMethodName
    ) {
        public static ContractResponse from(EmploymentContract c) {
            var e = c.getEmployee();
            var f = c.getAttachment();
            return new ContractResponse(
                    c.getId(), c.getContractNo(),
                    e != null ? e.getId() : null, e != null ? e.getCode() : "", e != null ? e.getName() : "",
                    c.getType(), c.getType() != null ? c.getType().getDisplayName() : "",
                    c.getStatus(), c.getStatus().getDisplayName(),
                    c.getStartDate(), c.getEndDate(),
                    c.getDepartment() != null ? c.getDepartment().getId() : null,
                    c.getDepartment() != null ? c.getDepartment().getName() : "",
                    c.getJobTitle() != null ? c.getJobTitle() : "",
                    c.getMonthlySalary(), c.getWeeklyHours(),
                    c.getWorkPlace(), c.getDuty(),
                    c.getSignedAt(), c.getSignedBy(),
                    c.getRemark(), c.getCreatedBy(), c.getSentAt(), c.getUpdatedAt(),
                    c.getCreatedAt(),
                    c.getContractName() != null ? c.getContractName()
                            : c.getContractNo() + " " + (e != null ? e.getName() : "") + " 근로계약서",
                    f != null ? f.getId() : null, f != null ? f.getName() : null, f != null ? f.getSizeBytes() : null,
                    c.isTwoFactor(), c.getCategory() != null ? c.getCategory() : (c.getType() != null ? c.getType().getDisplayName() : ""),
                    c.getProjectId(),
                    c.getDeliveryMethod(), c.getDeliveryMethod() != null ? c.getDeliveryMethod().getDisplayName() : "");
        }
    }
}
