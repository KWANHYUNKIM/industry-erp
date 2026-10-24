package com.erp.hr.dailypayitem;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface DailyPayItemFormulaRepository extends JpaRepository<DailyPayItemFormula, Long> {

    List<DailyPayItemFormula> findByItemIdOrderByApplyMonthDesc(Long itemId);

    Optional<DailyPayItemFormula> findByItemIdAndApplyMonth(Long itemId, String applyMonth);

    /** 귀속연월에 쓸 계산식 — 그 달 이하의 가장 늦은 적용시점. */
    Optional<DailyPayItemFormula> findFirstByItemIdAndApplyMonthLessThanEqualOrderByApplyMonthDesc(Long itemId, String month);
}
