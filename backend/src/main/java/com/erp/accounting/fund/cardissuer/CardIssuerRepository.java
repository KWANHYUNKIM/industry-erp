package com.erp.accounting.fund.cardissuer;

import org.springframework.data.jpa.repository.JpaRepository;

public interface CardIssuerRepository extends JpaRepository<CardIssuer, Long> {
    boolean existsByCode(String code);
}
