package com.erp.accounting.repository;

import com.erp.accounting.domain.CreditCard;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;

public interface CreditCardRepository extends JpaRepository<CreditCard, Long> {

    boolean existsByCardNo(String cardNo);

    @Query("select c from CreditCard c left join fetch c.settlementAccount order by c.cardCompany, c.cardName")
    List<CreditCard> findAllWithSettlement();
}
