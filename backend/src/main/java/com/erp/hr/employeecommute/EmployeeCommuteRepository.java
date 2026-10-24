package com.erp.hr.employeecommute;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

public interface EmployeeCommuteRepository extends JpaRepository<EmployeeCommute, Long> {

    @Query("select c from EmployeeCommute c join fetch c.employee e left join fetch e.department "
            + "where c.workDate between :from and :to order by c.workDate, e.code")
    List<EmployeeCommute> findInPeriod(LocalDate from, LocalDate to);

    Optional<EmployeeCommute> findByEmployee_IdAndWorkDate(Long employeeId, LocalDate workDate);
}
