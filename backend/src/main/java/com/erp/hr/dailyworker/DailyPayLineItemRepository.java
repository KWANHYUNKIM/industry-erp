package com.erp.hr.dailyworker;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.Collection;
import java.util.List;

public interface DailyPayLineItemRepository extends JpaRepository<DailyPayLineItem, Long> {

    @Query("select i from DailyPayLineItem i join fetch i.item join fetch i.line l where l.id in :lineIds")
    List<DailyPayLineItem> findByLines(Collection<Long> lineIds);

    boolean existsByItem_Id(Long itemId);
}
