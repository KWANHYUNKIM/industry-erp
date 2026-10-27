package com.erp.hr.attendancekind;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface VacationKindRepository extends JpaRepository<VacationKind, Long> {

    /** 원본 목록 차례 — 사용기간이 늦은 것이 위, 같은 기간은 휴가코드 차례(2026-10-20 원본 20195 · 20196 실측). */
    List<VacationKind> findAllByOrderByPeriodFromDescCodeAsc();

    boolean existsByCarryFrom_Id(Long id);

    boolean existsByCode(String code);
}
