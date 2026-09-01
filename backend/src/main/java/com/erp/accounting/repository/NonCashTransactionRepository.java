package com.erp.accounting.repository;

import com.erp.accounting.domain.NonCashTransaction;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface NonCashTransactionRepository extends JpaRepository<NonCashTransaction, Long> {

    @Query("select t from NonCashTransaction t " +
           "join fetch t.debitAccount join fetch t.creditAccount " +
           "left join fetch t.partner left join fetch t.journalEntry " +
           "where t.txnDate >= :from and t.txnDate <= :to " +
           "order by t.txnDate desc, t.id desc")
    List<NonCashTransaction> findAllWithRefs(@Param("from") java.time.LocalDate from,
                                             @Param("to") java.time.LocalDate to);
}
