package com.erp.hr.dailyworker;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;

import java.util.List;
import java.util.Optional;

public interface DailyPayDirectAmountRepository extends JpaRepository<DailyPayDirectAmount, Long> {

    @Query("select d from DailyPayDirectAmount d join fetch d.worker where d.ledger.id = :ledgerId")
    List<DailyPayDirectAmount> findByLedger(Long ledgerId);

    Optional<DailyPayDirectAmount> findByLedger_IdAndWorker_Id(Long ledgerId, Long workerId);

    long countByLedger_Id(Long ledgerId);

    @Modifying
    @Query("delete from DailyPayDirectAmount d where d.ledger.id = :ledgerId")
    void deleteByLedger(Long ledgerId);

    @Modifying
    @Query("delete from DailyPayDirectAmount d where d.ledger.id = :ledgerId and d.worker.id in :workerIds")
    void deleteByLedgerAndWorkers(Long ledgerId, List<Long> workerIds);

    boolean existsByWorker_Id(Long workerId);
}
