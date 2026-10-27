package com.erp.hr.employee.dto;

import com.erp.hr.employee.EmployeeProfile;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.time.LocalDate;

/** 인사카드 창의 사원 한 명 곁 자료(여권번호 · 신상명세서 · 추천인 · 보증보험 · 무주택자 · 추가정보 열다섯 칸). 요청과 응답이 같은 꼴이다. */
public class EmployeeProfileDtos {

    public record Profile(
            @Size(max = 30, message = "입력한 글자가 너무 깁니다. 30자까지 넣을 수 있습니다.") String passportNo,
            @Pattern(regexp = "[YN]?", message = "Y 또는 N 이어야 합니다.") String homeless,
            @Size(max = 50, message = "입력한 글자가 너무 깁니다. 50자까지 넣을 수 있습니다.") String headName,
            @Size(max = 50, message = "입력한 글자가 너무 깁니다. 50자까지 넣을 수 있습니다.") String headRelation,
            @Size(max = 30, message = "입력한 글자가 너무 깁니다. 30자까지 넣을 수 있습니다.") String residentPhone,
            @Size(max = 50, message = "입력한 글자가 너무 깁니다. 50자까지 넣을 수 있습니다.") String familyOrigin,
            @Size(max = 100, message = "입력한 글자가 너무 깁니다. 100자까지 넣을 수 있습니다.") String domicile,
            @Size(max = 10, message = "입력한 글자가 너무 깁니다. 10자까지 넣을 수 있습니다.") String residentZip,
            @Size(max = 200, message = "입력한 글자가 너무 깁니다. 200자까지 넣을 수 있습니다.") String residentAddress,
            LocalDate birthDate,
            @Pattern(regexp = "[YN]?", message = "Y 또는 N 이어야 합니다.") String lunar,
            @Pattern(regexp = "[YN]?", message = "Y 또는 N 이어야 합니다.") String married,
            LocalDate weddingDate,
            @Pattern(regexp = "[YN]?", message = "Y 또는 N 이어야 합니다.") String disabled,
            LocalDate healthAcquired,
            LocalDate healthLost,
            @Size(max = 50, message = "입력한 글자가 너무 깁니다. 50자까지 넣을 수 있습니다.") String healthCardNo,
            LocalDate pensionAcquired,
            LocalDate pensionLost,
            @Pattern(regexp = "[YN]?", message = "Y 또는 N 이어야 합니다.") String veteran,
            @Size(max = 50, message = "입력한 글자가 너무 깁니다. 50자까지 넣을 수 있습니다.") String veteranRelation,
            @Size(max = 30, message = "입력한 글자가 너무 깁니다. 30자까지 넣을 수 있습니다.") String militaryType,
            @Size(max = 30, message = "입력한 글자가 너무 깁니다. 30자까지 넣을 수 있습니다.") String militaryBranch,
            @Size(max = 100, message = "입력한 글자가 너무 깁니다. 100자까지 넣을 수 있습니다.") String militaryUnmet,
            @Size(max = 30, message = "입력한 글자가 너무 깁니다. 30자까지 넣을 수 있습니다.") String militaryRank,
            @Size(max = 50, message = "입력한 글자가 너무 깁니다. 50자까지 넣을 수 있습니다.") String refName,
            @Size(max = 50, message = "입력한 글자가 너무 깁니다. 50자까지 넣을 수 있습니다.") String refRelation,
            @Size(max = 100, message = "입력한 글자가 너무 깁니다. 100자까지 넣을 수 있습니다.") String refCompany,
            @Size(max = 30, message = "입력한 글자가 너무 깁니다. 30자까지 넣을 수 있습니다.") String refPhone,
            @Size(max = 50, message = "입력한 글자가 너무 깁니다. 50자까지 넣을 수 있습니다.") String refDuty,
            @Size(max = 10, message = "입력한 글자가 너무 깁니다. 10자까지 넣을 수 있습니다.") String refZip,
            @Size(max = 200, message = "입력한 글자가 너무 깁니다. 200자까지 넣을 수 있습니다.") String refAddress,
            @Size(max = 100, message = "입력한 글자가 너무 깁니다. 100자까지 넣을 수 있습니다.") String bondCompany,
            @Size(max = 50, message = "입력한 글자가 너무 깁니다. 50자까지 넣을 수 있습니다.") String bondNo,
            @Size(max = 30, message = "입력한 글자가 너무 깁니다. 30자까지 넣을 수 있습니다.") String bondPhone,
            BigDecimal bondAmount,
            LocalDate bondFrom,
            LocalDate bondTo,
            @Size(max = 100, message = "입력한 글자가 너무 깁니다. 100자까지 넣을 수 있습니다.") String text1,
            @Size(max = 100, message = "입력한 글자가 너무 깁니다. 100자까지 넣을 수 있습니다.") String text2,
            @Size(max = 100, message = "입력한 글자가 너무 깁니다. 100자까지 넣을 수 있습니다.") String text3,
            BigDecimal num1,
            BigDecimal num2,
            BigDecimal num3,
            @Pattern(regexp = "[YN]?", message = "Y 또는 N 이어야 합니다.") String yn1,
            @Pattern(regexp = "[YN]?", message = "Y 또는 N 이어야 합니다.") String yn2,
            @Pattern(regexp = "[YN]?", message = "Y 또는 N 이어야 합니다.") String yn3,
            LocalDate date1,
            LocalDate date2,
            LocalDate date3,
            @Size(max = 50, message = "입력한 글자가 너무 깁니다. 50자까지 넣을 수 있습니다.") String code1,
            @Size(max = 50, message = "입력한 글자가 너무 깁니다. 50자까지 넣을 수 있습니다.") String code2,
            @Size(max = 50, message = "입력한 글자가 너무 깁니다. 50자까지 넣을 수 있습니다.") String code3
    ) {
        public static Profile empty() {
            return new Profile(null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null);
        }

        public static Profile from(EmployeeProfile p) {
            return new Profile(p.getPassportNo(), p.getHomeless(), p.getHeadName(), p.getHeadRelation(), p.getResidentPhone(), p.getFamilyOrigin(), p.getDomicile(), p.getResidentZip(), p.getResidentAddress(), p.getBirthDate(), p.getLunar(), p.getMarried(), p.getWeddingDate(), p.getDisabled(), p.getHealthAcquired(), p.getHealthLost(), p.getHealthCardNo(), p.getPensionAcquired(), p.getPensionLost(), p.getVeteran(), p.getVeteranRelation(), p.getMilitaryType(), p.getMilitaryBranch(), p.getMilitaryUnmet(), p.getMilitaryRank(), p.getRefName(), p.getRefRelation(), p.getRefCompany(), p.getRefPhone(), p.getRefDuty(), p.getRefZip(), p.getRefAddress(), p.getBondCompany(), p.getBondNo(), p.getBondPhone(), p.getBondAmount(), p.getBondFrom(), p.getBondTo(), p.getText1(), p.getText2(), p.getText3(), p.getNum1(), p.getNum2(), p.getNum3(), p.getYn1(), p.getYn2(), p.getYn3(), p.getDate1(), p.getDate2(), p.getDate3(), p.getCode1(), p.getCode2(), p.getCode3());
        }
    }
}
