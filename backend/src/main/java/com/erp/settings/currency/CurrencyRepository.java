package com.erp.settings.currency;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface CurrencyRepository extends JpaRepository<Currency, Long> {

    boolean existsByCode(String code);

    List<Currency> findAllByOrderByCodeAsc();
}
