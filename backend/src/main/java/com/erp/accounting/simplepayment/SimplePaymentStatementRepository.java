package com.erp.accounting.simplepayment;

import org.springframework.data.jpa.repository.JpaRepository;

public interface SimplePaymentStatementRepository extends JpaRepository<SimplePaymentStatement, Long> {
}
