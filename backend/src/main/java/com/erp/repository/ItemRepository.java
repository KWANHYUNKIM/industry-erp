package com.erp.repository;

import com.erp.domain.Item;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface ItemRepository extends JpaRepository<Item, Long> {

    boolean existsByCode(String code);

    Optional<Item> findByCode(String code);
}
