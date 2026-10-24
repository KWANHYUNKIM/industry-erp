package com.erp.hr.payroll;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface PayslipRepository extends JpaRepository<Payslip, Long> {

    boolean existsByEmployee_IdAndPayMonth(Long employeeId, String payMonth);

    @Query("select distinct p from Payslip p join fetch p.employee " +
            "where p.payMonth = :month order by p.employee.code")
    List<Payslip> findByPayMonth(@Param("month") String month);

    /** 사원별급여조회(E090110): 귀속월 구간(YYYY-MM 끼리는 글자 비교가 곧 날짜 비교다). */
    @Query("select distinct p from Payslip p join fetch p.employee e left join fetch e.department " +
            "where p.payMonth between :from and :to order by p.payMonth desc, e.code")
    List<Payslip> findByPayMonthBetween(@Param("from") String from, @Param("to") String to);

    /** 연간 원천징수영수증용. prefix 는 'YYYY-' 형태의 귀속월 접두어. */
    @Query("select distinct p from Payslip p join fetch p.employee " +
            "where p.payMonth like concat(:yearPrefix, '%') " +
            "order by p.employee.code, p.payMonth")
    List<Payslip> findByYear(@Param("yearPrefix") String yearPrefix);
}
