package com.erp.hr.repository;

import com.erp.hr.domain.Payslip;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface PayslipRepository extends JpaRepository<Payslip, Long> {

    boolean existsByEmployee_IdAndPayMonth(Long employeeId, String payMonth);

    @Query("select distinct p from Payslip p join fetch p.employee " +
            "where p.payMonth = :month order by p.employee.code")
    List<Payslip> findByPayMonth(@Param("month") String month);

    /** 연간 원천징수영수증용. prefix 는 'YYYY-' 형태의 귀속월 접두어. */
    @Query("select distinct p from Payslip p join fetch p.employee " +
            "where p.payMonth like concat(:yearPrefix, '%') " +
            "order by p.employee.code, p.payMonth")
    List<Payslip> findByYear(@Param("yearPrefix") String yearPrefix);
}
