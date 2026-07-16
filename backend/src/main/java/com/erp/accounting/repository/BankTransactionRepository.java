package com.erp.accounting.repository;

import com.erp.accounting.domain.BankTransaction;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDate;
import java.util.List;

public interface BankTransactionRepository extends JpaRepository<BankTransaction, Long> {

    /** 상대계정은 간편전표로 생긴 이동에서 비어 있으므로 left join 이어야 목록에서 빠지지 않는다. */
    @Query("select t from BankTransaction t " +
           "join fetch t.bankAccount ba left join fetch t.counterAccount " +
           "left join fetch t.partner left join fetch t.journalEntry " +
           "order by t.txnDate desc, t.id desc")
    List<BankTransaction> findAllWithRefs();

    /**
     * 자금계획 실적: 기간 내 계좌 입금·출금 합계 [입금합, 출금합].
     * 다중 컬럼 단일 행은 Object[] 로 바로 받으면 한 겹 더 감싸여 오므로 List 로 받아 첫 행을 쓴다.
     */
    @Query("select coalesce(sum(case when t.deposit = true then t.amount else 0 end), 0), " +
           "coalesce(sum(case when t.deposit = false then t.amount else 0 end), 0) " +
           "from BankTransaction t where t.txnDate between :from and :to")
    List<Object[]> sumInOut(@Param("from") LocalDate from, @Param("to") LocalDate to);
}
