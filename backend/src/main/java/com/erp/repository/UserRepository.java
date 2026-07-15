package com.erp.repository;

import com.erp.domain.User;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface UserRepository extends JpaRepository<User, Long> {

    Optional<User> findByUsername(String username);

    boolean existsByUsername(String username);

    /** 이 역할을 가진 사용자 수 (역할 삭제 가능 여부 판정용). */
    long countByRoles_Id(Long roleId);
}
