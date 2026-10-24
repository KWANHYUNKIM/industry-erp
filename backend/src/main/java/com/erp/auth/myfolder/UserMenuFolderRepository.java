package com.erp.auth.myfolder;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface UserMenuFolderRepository extends JpaRepository<UserMenuFolder, Long> {

    List<UserMenuFolder> findByUser_IdOrderBySortOrderAscIdAsc(Long userId);

    /** 남의 폴더는 없는 것으로 본다 — 주인까지 같이 걸러 찾는다. */
    Optional<UserMenuFolder> findByIdAndUser_Id(Long id, Long userId);
}
