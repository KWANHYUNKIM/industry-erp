package com.erp.auth.memory;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface UserInputMemoryRepository extends JpaRepository<UserInputMemory, Long> {

    Optional<UserInputMemory> findByUser_IdAndKey(Long userId, String key);
}
