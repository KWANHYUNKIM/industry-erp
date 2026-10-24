package com.erp.accounting.extrafield;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;

public interface ExtraFieldTypeAccountRepository extends JpaRepository<ExtraFieldTypeAccount, Long> {

    @Query("select ta from ExtraFieldTypeAccount ta join fetch ta.account where ta.type.id = :typeId order by ta.account.code")
    List<ExtraFieldTypeAccount> findByTypeWithAccount(Long typeId);

    @Query("select ta from ExtraFieldTypeAccount ta join fetch ta.type join fetch ta.account")
    List<ExtraFieldTypeAccount> findAllWithRefs();

    boolean existsByTypeIdAndAccountId(Long typeId, Long accountId);

    void deleteByTypeId(Long typeId);
}
