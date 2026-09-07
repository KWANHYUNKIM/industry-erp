package com.erp.groupware.repository;

import com.erp.groupware.domain.Survey;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;
import java.util.Optional;

public interface SurveyRepository extends JpaRepository<Survey, Long> {

    /** 게시글번호 채번. 업무관리 게시글과 같은 방식이다. 동시 채번은 서비스에서 락으로 막는다. */
    @Query("select coalesce(max(s.postNo), 0) from Survey s")
    int maxPostNo();

    /**
     * 목록용. 화면이 문항 수·응답 수·대상 수를 바로 쓰므로 같이 가져온다.
     * 컬렉션을 둘 이상 fetch join 하면 카테시안 곱이 되므로 distinct 로 접고,
     * 나머지는 지연로딩이 트랜잭션 안에서 풀리도록 서비스에서 DTO 로 바꾼다.
     */
    @Query("select distinct s from Survey s left join fetch s.writer order by s.id desc")
    List<Survey> findAllWithWriter();

    @Query("select s from Survey s left join fetch s.writer where s.id = :id")
    Optional<Survey> findByIdWithWriter(Long id);
}
