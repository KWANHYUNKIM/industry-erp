package com.erp.accounting.repository;

import com.erp.accounting.domain.CardPayment;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;

public interface CardPaymentRepository extends JpaRepository<CardPayment, Long> {

    @Query("select distinct p from CardPayment p " +
           "join fetch p.card join fetch p.bankAccount left join fetch p.journalEntry " +
           "left join fetch p.lines l left join fetch l.cardUsage " +
           "order by p.paymentDate desc, p.id desc")
    List<CardPayment> findAllWithRefs();

    /** 이미 결제된 카드사용 id — 재결제를 막고 미결제 목록에서 제외한다 */
    @Query("select l.cardUsage.id from CardPaymentLine l")
    List<Long> findPaidUsageIds();
}
