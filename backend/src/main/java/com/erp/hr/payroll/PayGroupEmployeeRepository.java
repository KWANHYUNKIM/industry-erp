package com.erp.hr.payroll;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;
import java.util.Optional;

public interface PayGroupEmployeeRepository extends JpaRepository<PayGroupEmployee, Long> {

    @Query("select a from PayGroupEmployee a join fetch a.employee e left join fetch e.department " +
           "where a.group.id = :groupId order by e.code")
    List<PayGroupEmployee> findByGroupWithEmployee(Long groupId);

    @Query("select a from PayGroupEmployee a join fetch a.group where a.employee.id = :employeeId")
    Optional<PayGroupEmployee> findByEmployeeId(Long employeeId);

    @Query("select a.group.id, count(a) from PayGroupEmployee a group by a.group.id")
    List<Object[]> countByGroup();

    void deleteByGroup_Id(Long groupId);

    void deleteByEmployee_IdIn(List<Long> employeeIds);
}
