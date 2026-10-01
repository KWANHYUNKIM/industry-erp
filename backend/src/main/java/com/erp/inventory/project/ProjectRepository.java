package com.erp.inventory.project;

import org.springframework.data.jpa.repository.JpaRepository;

public interface ProjectRepository extends JpaRepository<Project, Long> {

    boolean existsByCode(String code);

    long countByCodeStartingWith(String prefix);
}
