package com.erp.accounting.repository;

import com.erp.accounting.domain.Income;
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
}
