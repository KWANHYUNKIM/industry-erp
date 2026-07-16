package com.erp.groupware.repository;

import com.erp.groupware.domain.FieldWork;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDate;
import java.util.List;
import com.erp.groupware.domain.enums.FieldWorkStatus;

public interface FieldWorkRepository extends JpaRepository<FieldWork, Long> {

    @Query("select f from FieldWork f join fetch f.user left join fetch f.approver " +
            "where f.workDate between :from and :to " +
            "order by f.workDate desc, f.id desc")
    List<FieldWork> findByPeriod(@Param("from") LocalDate from, @Param("to") LocalDate to);

    boolean existsByUser_IdAndWorkDateAndStatusNot(Long userId, LocalDate workDate,
                                                   com.erp.groupware.domain.enums.FieldWorkStatus status);
}
