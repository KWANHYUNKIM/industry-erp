package com.erp.repository;

import com.erp.domain.BankTransaction;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;

public interface BankTransactionRepository extends JpaRepository<BankTransaction, Long> {

    @Query("select t from BankTransaction t " +
           "join fetch t.bankAccount ba join fetch t.counterAccount " +
           "left join fetch t.partner left join fetch t.journalEntry " +
           "order by t.txnDate desc, t.id desc")
    List<BankTransaction> findAllWithRefs();
}
