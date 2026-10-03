package com.erp.hr.dailyworker;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;

public interface DailyWorkerRepository extends JpaRepository<DailyWorker, Long> {

    @Query("select w from DailyWorker w left join fetch w.department order by w.code")
    List<DailyWorker> findAllWithRefs();

    boolean existsByCode(String code);
}
