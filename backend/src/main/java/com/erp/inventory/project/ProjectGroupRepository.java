package com.erp.inventory.project;

import org.springframework.data.jpa.repository.JpaRepository;

public interface ProjectGroupRepository extends JpaRepository<ProjectGroup, Long> {

    boolean existsByCode(String code);
}
