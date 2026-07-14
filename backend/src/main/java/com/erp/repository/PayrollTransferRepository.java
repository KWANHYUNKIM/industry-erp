package com.erp.repository;

import com.erp.domain.PayrollTransfer;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;

public interface PayrollTransferRepository extends JpaRepository<PayrollTransfer, Long> {

    @Query("select distinct t from PayrollTransfer t " +
           "join fetch t.bankAccount left join fetch t.journalEntry " +
           "left join fetch t.lines l left join fetch l.payslip p left join fetch p.employee " +
           "order by t.transferDate desc, t.id desc")
    List<PayrollTransfer> findAllWithRefs();

    /** 이미 이체된 급여명세 id 들 — 재이체를 막고 화면에서 제외한다 */
    @Query("select l.payslip.id from PayrollTransferLine l")
    List<Long> findTransferredPayslipIds();
}
