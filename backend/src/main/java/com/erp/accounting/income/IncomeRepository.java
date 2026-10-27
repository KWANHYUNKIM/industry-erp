package com.erp.accounting.income;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDate;
import java.util.List;

public interface IncomeRepository extends JpaRepository<Income, Long> {

    @Query("select i from Income i join fetch i.account " +
            "left join fetch i.bankAccount left join fetch i.journalEntry " +
            "where i.incomeDate between :from and :to " +
            "order by i.incomeDate desc, i.id desc")
    List<Income> findByPeriod(@Param("from") LocalDate from, @Param("to") LocalDate to);

    /** 이 분개를 수입 내역이 쓰고 있나 — 계좌입금으로 받은 수입은 입출금과 분개를 함께 쓴다. */
    boolean existsByJournalEntryId(Long journalEntryId);
}
