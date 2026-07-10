package com.erp.repository;

import com.erp.domain.WorkPost;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;

public interface WorkPostRepository extends JpaRepository<WorkPost, Long> {

    @Query("select coalesce(max(p.postNo), 0) from WorkPost p")
    int maxPostNo();

    @Query("select p from WorkPost p order by p.postDate desc, p.id desc")
    List<WorkPost> findAllOrdered();
}
