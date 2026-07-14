package com.erp.repository;

import com.erp.domain.DailyWorkRecord;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDate;
import java.util.List;

public interface DailyWorkRecordRepository extends JpaRepository<DailyWorkRecord, Long> {

    boolean existsByEmployeeIdAndWorkDate(Long employeeId, LocalDate workDate);

    /** 기간 내 출역 기록. 사원·부서명을 함께 쓰므로 fetch join 한다. */
    @Query("select r from DailyWorkRecord r join fetch r.employee e left join fetch e.department "
            + "where r.workDate between :from and :to "
            + "order by r.workDate desc, e.name asc")
    List<DailyWorkRecord> findBetween(@Param("from") LocalDate from, @Param("to") LocalDate to);
}
