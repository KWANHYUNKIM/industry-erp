package com.erp.repository;

import com.erp.domain.Payslip;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface PayslipRepository extends JpaRepository<Payslip, Long> {

    boolean existsByEmployee_IdAndPayMonth(Long employeeId, String payMonth);

    @Query("select distinct p from Payslip p join fetch p.employee " +
            "where p.payMonth = :month order by p.employee.code")
    List<Payslip> findByPayMonth(@Param("month") String month);
}
