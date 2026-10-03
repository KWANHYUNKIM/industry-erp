package com.erp.groupware.mail;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface SpamRuleRepository extends JpaRepository<SpamRule, Long> {

    List<SpamRule> findAllByOrderByIdAsc();

    List<SpamRule> findByActiveTrue();
}
