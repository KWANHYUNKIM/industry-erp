package com.erp.hr.payroll;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface PayLedgerRepository extends JpaRepository<PayLedger, Long> {

    List<PayLedger> findAllByOrderByPayMonthDesc();

    Optional<PayLedger> findByPayMonth(String payMonth);
}
