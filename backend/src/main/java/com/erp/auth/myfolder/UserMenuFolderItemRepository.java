package com.erp.auth.myfolder;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface UserMenuFolderItemRepository extends JpaRepository<UserMenuFolderItem, Long> {

    /** 한 사용자의 폴더 항목 전부 — 폴더마다 따로 부르면 폴더 수만큼 쿼리가 나간다(N+1). */
    @Query("select i from UserMenuFolderItem i join fetch i.folder f " +
           "where f.user.id = :userId order by i.sortOrder asc, i.id asc")
    List<UserMenuFolderItem> findAllOfUser(@Param("userId") Long userId);

    List<UserMenuFolderItem> findByFolder_IdOrderBySortOrderAscIdAsc(Long folderId);

    boolean existsByFolder_IdAndPath(Long folderId, String path);

    @Query("select i from UserMenuFolderItem i join fetch i.folder f where i.id = :id and f.user.id = :userId")
    Optional<UserMenuFolderItem> findOwned(@Param("id") Long id, @Param("userId") Long userId);

    void deleteByFolder_Id(Long folderId);
}
