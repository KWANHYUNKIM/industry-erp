package com.erp.hr.employee;

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

    @Query("select coalesce(max(a.slipNo), 0) from EmployeeAssignment a where a.slipDate = :slipDate")
    int maxSlipNo(java.time.LocalDate slipDate);

    @Query("select a from EmployeeAssignment a join fetch a.employee left join fetch a.department left join fetch a.prevDepartment "
            + "where a.slipDate between :from and :to order by a.slipDate desc, a.slipNo desc, a.id")
    List<EmployeeAssignment> findBySlipDateBetween(java.time.LocalDate from, java.time.LocalDate to);

    @Query("select a from EmployeeAssignment a join fetch a.employee left join fetch a.department left join fetch a.prevDepartment "
            + "where a.slipDate = :slipDate and a.slipNo = :slipNo order by a.id")
    List<EmployeeAssignment> findSlip(java.time.LocalDate slipDate, int slipNo);
}
