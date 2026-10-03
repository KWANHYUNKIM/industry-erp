package com.erp.hr.dailyworker;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;

import java.util.List;

public interface DailyWorkConfirmRepository extends JpaRepository<DailyWorkConfirm, Long> {

    @Query("select c from DailyWorkConfirm c join fetch c.worker where c.ledger.id = :ledgerId")
    List<DailyWorkConfirm> findByLedger(Long ledgerId);

    long countByLedger_Id(Long ledgerId);

    @Modifying
    @Query("delete from DailyWorkConfirm c where c.ledger.id = :ledgerId")
    void deleteByLedger(Long ledgerId);

    @Query("select c from DailyWorkConfirm c join fetch c.ledger g join fetch c.worker w left join fetch w.department "
            + "where g.payMonth between :from and :to order by g.payMonth, g.seq, w.code")
    List<DailyWorkConfirm> findInMonths(String from, String to);

    boolean existsByWorker_Id(Long workerId);
}
