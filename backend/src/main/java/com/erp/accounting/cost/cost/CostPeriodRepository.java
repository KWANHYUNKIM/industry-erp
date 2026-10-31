package com.erp.accounting.cost.cost;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface CostPeriodRepository extends JpaRepository<CostPeriod, Long> {

    List<CostPeriod> findAllByOrderByStartMonthDesc();

    Optional<CostPeriod> findFirstByOrderByStartMonthDesc();
}
