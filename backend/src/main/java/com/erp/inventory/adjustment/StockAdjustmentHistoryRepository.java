package com.erp.inventory.adjustment;

import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDateTime;
import java.util.List;

public interface StockAdjustmentHistoryRepository extends JpaRepository<StockAdjustmentHistory, Long> {

    List<StockAdjustmentHistory> findBySortAndWorkedAtBetweenOrderByWorkedAtDescIdDesc(
            String sort, LocalDateTime from, LocalDateTime to);
}
