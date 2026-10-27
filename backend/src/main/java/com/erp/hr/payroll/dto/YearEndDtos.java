package com.erp.hr.payroll.dto;

import java.time.LocalDate;

public class YearEndDtos {

    private YearEndDtos() {}

    /** 연말정산 · 중도정산 대상자 추가 창 한 줄 — (체크) · 사번 · 성명 · 주민번호(우리 없음) · 퇴사일. */
    public record Candidate(Long employeeId, String code, String name, LocalDate resignDate) {}
}
