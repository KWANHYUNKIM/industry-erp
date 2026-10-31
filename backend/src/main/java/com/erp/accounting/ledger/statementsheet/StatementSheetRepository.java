package com.erp.accounting.ledger.statementsheet;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface StatementSheetRepository extends JpaRepository<StatementSheet, Long> {
    List<StatementSheet> findByKindOrderByTermNoDescIdDesc(StatementSheetKind kind);
}
