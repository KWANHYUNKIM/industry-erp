package com.erp.trade.repository;

import com.erp.trade.domain.MallAccount;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;

public interface MallAccountRepository extends JpaRepository<MallAccount, Long> {

    @Query("select a from MallAccount a left join fetch a.partner order by a.name asc")
    List<MallAccount> findAllWithPartner();

    boolean existsByCode(String code);

    long countByCodeStartingWith(String prefix);
}
