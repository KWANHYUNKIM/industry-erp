package com.erp.accounting.withholdingpayee.dto;

import com.erp.accounting.withholdingpayee.PayeeKind;
import com.erp.accounting.withholdingpayee.WithholdingPayee;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/** 소득자등록(E030301) */
public final class WithholdingPayeeDtos {

    private WithholdingPayeeDtos() {}

    /** 원본 필수칸은 주민(법인)등록번호 · 성명(대표자명) 둘 — 비우면 'OO를 입력하세요.' */
    public record PayeeRequest(
            @NotNull PayeeKind kind,
            @Size(max = 20) String bizRegNo,
            @NotBlank(message = "주민(법인)등록번호를 입력하세요.") @Size(max = 20) String regNo,
            @Size(max = 100) String tradeName,
            @NotBlank(message = "성명(대표자명)을 입력하세요.") @Size(max = 100) String name,
            @Size(max = 200) String address,
            @Size(max = 100) String englishName,
            @Size(max = 200) String bizAddress,
            @Pattern(regexp = "\\d{3}", message = "소득자구분코드는 숫자 3자리입니다.") String payeeKindCode,
            @Pattern(regexp = "\\d{6}", message = "업종구분코드는 숫자 6자리입니다.") String industryCode,
            @Size(max = 50) String bankName,
            @Size(max = 50) String accountNo,
            boolean nonResident,
            boolean foreigner,
            boolean nonRealName,
            @Pattern(regexp = "\\d{8}", message = "생년월일은 YYYYMMDD 입니다.") String birthDate,
            @Size(max = 20) String accountCode,
            @Size(max = 30) String mobile,
            @Size(max = 100) String email,
            @Size(max = 500) String memo
    ) {}

    public record PayeeResponse(Long id, PayeeKind kind, String kindName, String bizRegNo, String regNo, String regNoFront,
                                String tradeName, String name, String address, String englishName, String bizAddress,
                                String payeeKindCode, String industryCode, String industryName, String bankName, String accountNo,
                                boolean nonResident, boolean foreigner, boolean nonRealName, String birthDate, String accountCode,
                                String mobile, String email, String memo, boolean deleted) {

        public static PayeeResponse from(WithholdingPayee p, String industryName) {
            String reg = p.getRegNo().replace("-", "");
            return new PayeeResponse(p.getId(), p.getKind(), p.getKind().getDisplayName(), p.getBizRegNo(), p.getRegNo(),
                    reg.length() > 6 ? reg.substring(0, 6) : reg,
                    p.getTradeName(), p.getName(), p.getAddress(), p.getEnglishName(), p.getBizAddress(),
                    p.getPayeeKindCode(), p.getIndustryCode(), industryName, p.getBankName(), p.getAccountNo(),
                    p.isNonResident(), p.isForeigner(), p.isNonRealName(), p.getBirthDate(), p.getAccountCode(),
                    p.getMobile(), p.getEmail(), p.getMemo(), p.isDeleted());
        }
    }

    /** 코드도움 한 줄 — 업종구분코드 · 소득자구분코드 · 기타소득 소득코드. */
    public record CodeItem(String code, String name, String rate1, String rate2) {}
}
