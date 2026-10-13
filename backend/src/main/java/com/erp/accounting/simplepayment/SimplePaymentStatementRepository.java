package com.erp.accounting.simplepayment;

import org.springframework.data.jpa.repository.JpaRepository;

public interface SimplePaymentStatementRepository extends JpaRepository<SimplePaymentStatement, Long> {

    boolean existsByKindAndPayYearAndPeriod(SimplePaymentKind kind, Integer payYear, Integer period);

    boolean existsByKindAndPayYearAndPeriodAndIdNot(SimplePaymentKind kind, Integer payYear, Integer period, Long id);
}
