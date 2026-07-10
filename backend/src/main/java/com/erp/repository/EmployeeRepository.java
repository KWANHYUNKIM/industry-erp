package com.erp.repository;

import com.erp.domain.Employee;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface EmployeeRepository extends JpaRepository<Employee, Long> {

    boolean existsByCode(String code);

    Optional<Employee> findByCode(String code);

    /** work_results.worker 문자열을 사원으로 잇기 위한 조회. 동명이인이면 여러 건이 나온다. */
    List<Employee> findByName(String name);

    List<Employee> findByActiveTrueOrderByNameAsc();
}
