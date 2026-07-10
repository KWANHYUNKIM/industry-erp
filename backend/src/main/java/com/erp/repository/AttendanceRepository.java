package com.erp.repository;

import com.erp.domain.Attendance;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

public interface AttendanceRepository extends JpaRepository<Attendance, Long> {

    @Query("select a from Attendance a join fetch a.user " +
            "order by a.workDate desc, a.id desc")
    List<Attendance> findAllWithRefs();

    Optional<Attendance> findByUserUsernameAndWorkDate(String username, LocalDate workDate);

    @Query("select a from Attendance a join fetch a.user " +
            "where a.workDate between :from and :to " +
            "order by a.workDate desc, a.id desc")
    List<Attendance> findByWorkDateBetweenWithUser(@Param("from") LocalDate from,
                                                   @Param("to") LocalDate to);

    Optional<Attendance> findByUserIdAndWorkDate(Long userId, LocalDate workDate);

    boolean existsByUserIdAndWorkDate(Long userId, LocalDate workDate);
}
