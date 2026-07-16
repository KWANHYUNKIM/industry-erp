package com.erp.accounting.repository;

import com.erp.accounting.domain.CashPlan;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface CashPlanRepository extends JpaRepository<CashPlan, Long> {

    List<CashPlan> findByPeriodOrderByTypeAscIdAsc(String period);
}
