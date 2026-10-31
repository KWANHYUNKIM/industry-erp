package com.erp.accounting.fund.cash;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface CashPlanRepository extends JpaRepository<CashPlan, Long> {

    List<CashPlan> findByPeriodOrderByTypeAscIdAsc(String period);
}
