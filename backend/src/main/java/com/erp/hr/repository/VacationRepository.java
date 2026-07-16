package com.erp.hr.repository;

import com.erp.hr.domain.VacationRequest;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDate;
import java.util.List;

public interface VacationRepository extends JpaRepository<VacationRequest, Long> {

    @Query("select v from VacationRequest v join fetch v.user " +
            "where v.startDate between :from and :to " +
            "order by v.startDate desc, v.id desc")
    List<VacationRequest> findByStartDateBetweenWithUser(@Param("from") LocalDate from,
                                                         @Param("to") LocalDate to);

    boolean existsByUserId(Long userId);
}
