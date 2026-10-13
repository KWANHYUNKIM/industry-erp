package com.erp.hr.employeecommute;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.time.LocalDate;
import java.util.List;

public interface EmployeeCommuteEventRepository extends JpaRepository<EmployeeCommuteEvent, Long> {

    @Query("select ev from EmployeeCommuteEvent ev where ev.commute.workDate between :from and :to order by ev.at, ev.id")
    List<EmployeeCommuteEvent> findInPeriod(LocalDate from, LocalDate to);

    @Query("select ev from EmployeeCommuteEvent ev where ev.commute.id = :commuteId order by ev.at, ev.id")
    List<EmployeeCommuteEvent> findOfCommute(Long commuteId);
}
