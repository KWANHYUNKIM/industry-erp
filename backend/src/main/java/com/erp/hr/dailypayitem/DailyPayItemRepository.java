package com.erp.hr.dailypayitem;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface DailyPayItemRepository extends JpaRepository<DailyPayItem, Long> {

    List<DailyPayItem> findByKindOrderBySortOrderAscCodeAsc(DailyPayItemKind kind);

    boolean existsByKindAndCode(DailyPayItemKind kind, String code);
}
