package com.erp.groupware.repository;

import com.erp.groupware.domain.MyItem;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface MyItemRepository extends JpaRepository<MyItem, Long> {

    /** 목록에서 품목코드·품명·단가를 함께 쓰므로 fetch join 한다 (N+1 방지). */
    @Query("select m from MyItem m join fetch m.item "
            + "where m.owner.username = :username order by m.sortOrder asc, m.id asc")
    List<MyItem> findMine(@Param("username") String username);

    Optional<MyItem> findByOwner_UsernameAndItem_Id(String username, Long itemId);

    boolean existsByOwner_UsernameAndItem_Id(String username, Long itemId);
}
