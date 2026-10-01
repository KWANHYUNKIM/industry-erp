package com.erp.accounting.cardissuer;

import org.springframework.data.jpa.repository.JpaRepository;

public interface CardIssuerRepository extends JpaRepository<CardIssuer, Long> {
    boolean existsByCode(String code);
    long countByCodeStartingWith(String prefix);
}
