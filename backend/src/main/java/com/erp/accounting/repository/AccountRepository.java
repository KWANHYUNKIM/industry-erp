package com.erp.accounting.repository;

import com.erp.accounting.domain.Account;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface AccountRepository extends JpaRepository<Account, Long> {

    boolean existsByCode(String code);

    Optional<Account> findByCode(String code);
}
