package com.erp.hr.dailyworker;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;

import java.util.Collection;
import java.util.List;

public interface DailyWorkerPayAmountRepository extends JpaRepository<DailyWorkerPayAmount, Long> {

    @Query("select a from DailyWorkerPayAmount a join fetch a.item where a.worker.id = :workerId")
    List<DailyWorkerPayAmount> findByWorker(Long workerId);

    @Query("select a from DailyWorkerPayAmount a join fetch a.item join fetch a.worker where a.worker.id in :workerIds")
    List<DailyWorkerPayAmount> findByWorkers(Collection<Long> workerIds);

    @Modifying
    @Query("delete from DailyWorkerPayAmount a where a.worker.id = :workerId")
    void deleteByWorker(Long workerId);
}
