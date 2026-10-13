package com.erp.hr.attendancekind;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface VacationKindRepository extends JpaRepository<VacationKind, Long> {

    /** 원본 목록 차례 — 사용기간이 늦은 것이 위. */
    List<VacationKind> findAllByOrderByPeriodFromDescCodeDesc();

    boolean existsByCarryFrom_Id(Long id);

    boolean existsByCode(String code);
}
