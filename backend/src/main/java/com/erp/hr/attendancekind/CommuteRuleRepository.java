package com.erp.hr.attendancekind;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface CommuteRuleRepository extends JpaRepository<CommuteRule, Long> {

    List<CommuteRule> findAllByOrderByCodeAsc();

    boolean existsByCode(String code);
}
