package com.erp.accounting.bankcard;

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
           "where t.txnDate >= :from and t.txnDate <= :to " +
           "order by t.txnDate desc, t.id desc")
    List<BankTransaction> findAllWithRefs(@Param("from") java.time.LocalDate from,
                                          @Param("to") java.time.LocalDate to);

    /** 같은 조건의 줄 수. 다 꺼내 놓고 세면 이미 늦다. */
    @Query("select count(t) from BankTransaction t " +
           "where t.txnDate >= :from and t.txnDate <= :to")
    long countAll(@Param("from") java.time.LocalDate from, @Param("to") java.time.LocalDate to);

    /**
     * 같은 차례로 <b>id 만</b> 앞에서 몇 개 꺼낸다.
     * 위 질의는 {@code join fetch} 라 그대로 페이징하면 하이버네이트가 전부 읽어
     * 메모리에서 자른다 — 자르는 뜻이 없어진다.
     */
    @Query("select t.id from BankTransaction t " +
           "where t.txnDate >= :from and t.txnDate <= :to " +
           "order by t.txnDate desc, t.id desc")
    List<Long> findIdsPaged(@Param("from") java.time.LocalDate from,
                            @Param("to") java.time.LocalDate to,
                            org.springframework.data.domain.Pageable pageable);

    /** 위에서 고른 id 들을 붙임까지 실어 같은 차례로 가져온다. */
    @Query("select t from BankTransaction t "
           + "join fetch t.bankAccount ba left join fetch t.counterAccount "
           + "left join fetch t.partner left join fetch t.journalEntry "
           + "where t.id in :ids "
           + "order by t.txnDate desc, t.id desc")
    List<BankTransaction> findByIdsWithRefs(@Param("ids") List<Long> ids);

    /**
     * 자금계획 실적: 기간 내 계좌 입금·출금 합계 [입금합, 출금합].
     * 다중 컬럼 단일 행은 Object[] 로 바로 받으면 한 겹 더 감싸여 오므로 List 로 받아 첫 행을 쓴다.
     */
    @Query("select coalesce(sum(case when t.deposit = true then t.amount else 0 end), 0), " +
           "coalesce(sum(case when t.deposit = false then t.amount else 0 end), 0) " +
           "from BankTransaction t where t.txnDate between :from and :to")
    List<Object[]> sumInOut(@Param("from") LocalDate from, @Param("to") LocalDate to);

    /** 한 분개로 생긴 계좌 이동(계좌간이동이면 출금·입금 두 줄). 그 전표를 지울 때 되돌린다. */
    List<BankTransaction> findByJournalEntryId(Long journalEntryId);

    /** 이 줄 뒤(입력 차례)에 같은 계좌로 생긴 줄들의 거래후 잔액 중 가장 작은 값. 없으면 null. */
    @Query("select min(t.balanceAfter) from BankTransaction t where t.bankAccount.id = :accountId and t.id > :id")
    java.math.BigDecimal minBalanceAfterLater(@Param("accountId") Long accountId, @Param("id") Long id);

    /** 이 줄을 지운 만큼 뒤 줄들의 거래후 잔액을 옮긴다. */
    @org.springframework.data.jpa.repository.Modifying
    @Query("update BankTransaction t set t.balanceAfter = t.balanceAfter - :delta " +
           "where t.bankAccount.id = :accountId and t.id > :id")
    int shiftBalanceAfterLater(@Param("accountId") Long accountId, @Param("id") Long id,
                               @Param("delta") java.math.BigDecimal delta);
}
