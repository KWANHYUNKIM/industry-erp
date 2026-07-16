package com.erp.accounting.repository;

import com.erp.accounting.domain.ExchangeRate;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

public interface ExchangeRateRepository extends JpaRepository<ExchangeRate, Long> {

    boolean existsByCurrencyIdAndRateDate(Long currencyId, LocalDate rateDate);

    @Query("select r from ExchangeRate r join fetch r.currency c " +
           "where (:currencyId is null or c.id = :currencyId) " +
           "order by r.rateDate desc, c.code")
    List<ExchangeRate> findAllWithCurrency(@Param("currencyId") Long currencyId);

    /** 기준일 이하에서 가장 최근 환율 — 그날 고시가 없으면 직전 고시를 쓴다 */
    @Query("select r from ExchangeRate r join fetch r.currency c " +
           "where c.id = :currencyId and r.rateDate <= :date " +
           "order by r.rateDate desc limit 1")
    Optional<ExchangeRate> findLatest(@Param("currencyId") Long currencyId, @Param("date") LocalDate date);
}
