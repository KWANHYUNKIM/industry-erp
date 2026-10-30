package com.erp.auth.permissionrequest;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;
import java.util.Optional;

public interface PermissionRequestRepository extends JpaRepository<PermissionRequest, Long> {

    Optional<PermissionRequest> findByRequester_IdAndWorkCodeAndStatus(Long requesterId, String workCode,
                                                                        PermissionRequestStatus status);

    long countByStatus(PermissionRequestStatus status);

    @Query("select r from PermissionRequest r join fetch r.requester left join fetch r.processedBy " +
           "order by r.requestedAt desc, r.id desc")
    List<PermissionRequest> findAllWithRefs();
}
