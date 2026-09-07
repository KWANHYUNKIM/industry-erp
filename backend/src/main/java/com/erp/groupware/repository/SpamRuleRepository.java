package com.erp.groupware.repository;

import com.erp.groupware.domain.SpamRule;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface SpamRuleRepository extends JpaRepository<SpamRule, Long> {

    List<SpamRule> findAllByOrderByIdAsc();

    List<SpamRule> findByActiveTrue();
}
