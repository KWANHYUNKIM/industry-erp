package com.erp.groupware.workpost;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;
import java.util.Optional;

public interface WorkPostReadRepository extends JpaRepository<WorkPostRead, Long> {

    Optional<WorkPostRead> findByPostIdAndUserId(Long postId, Long userId);

    @Query("select r from WorkPostRead r join fetch r.user where r.post.id = :postId order by r.firstReadAt")
    List<WorkPostRead> findAllByPostIdWithUser(Long postId);
}
