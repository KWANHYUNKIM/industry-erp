package com.erp.auth.workpermission;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
import java.util.List;

public interface WorkPermissionRepository extends JpaRepository<WorkPermission, Long> {

    List<WorkPermission> findByUser_Id(Long userId);

    List<WorkPermission> findByRole_Id(Long roleId);

    /** 사용자 개별 줄 + 그 사용자 권한그룹들의 줄을 한 번에 — 요청마다 부르므로 한 쿼리로. */
    @Query("select w from WorkPermission w left join fetch w.user left join fetch w.role " +
           "where w.user.id = :userId or w.role.id in :roleIds")
    List<WorkPermission> findForResolve(@Param("userId") Long userId, @Param("roleIds") Collection<Long> roleIds);
}
