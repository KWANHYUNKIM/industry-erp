package com.erp.auth.bookmark;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface UserBookmarkRepository extends JpaRepository<UserBookmark, Long> {

    List<UserBookmark> findByUser_IdOrderBySortOrderAscIdAsc(Long userId);

    Optional<UserBookmark> findByUser_IdAndPath(Long userId, String path);

    boolean existsByUser_Id(Long userId);
}
