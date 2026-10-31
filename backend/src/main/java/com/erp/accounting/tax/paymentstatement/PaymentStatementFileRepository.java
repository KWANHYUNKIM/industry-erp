package com.erp.accounting.tax.paymentstatement;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface PaymentStatementFileRepository extends JpaRepository<PaymentStatementFile, Long> {

    List<PaymentStatementFile> findByAttrYearBetween(Integer fromYear, Integer toYear);

    boolean existsByKindAndAttrYearAndAttrMonth(PaymentStatementKind kind, Integer attrYear, Integer attrMonth);
}
