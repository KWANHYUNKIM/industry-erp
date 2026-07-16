package com.erp.hr.repository;

import com.erp.hr.domain.EmployeeAssignment;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;

public interface EmployeeAssignmentRepository extends JpaRepository<EmployeeAssignment, Long> {

    /** 사원별 발령이력 (최신순). 부서명을 함께 쓰므로 fetch join 한다. */
    @Query("select a from EmployeeAssignment a left join fetch a.department "
            + "where a.employee.id = :employeeId order by a.assignDate desc, a.id desc")
    List<EmployeeAssignment> findByEmployee(Long employeeId);

    /** 전체 발령이력 (최신순) */
    @Query("select a from EmployeeAssignment a join fetch a.employee left join fetch a.department "
            + "order by a.assignDate desc, a.id desc")
    List<EmployeeAssignment> findAllWithRefs();
}
