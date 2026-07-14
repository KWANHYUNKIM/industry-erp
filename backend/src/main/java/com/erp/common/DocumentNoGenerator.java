package com.erp.common;

import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.format.DateTimeFormatter;

/**
 * 전표번호 채번: {@code PREFIX-yyyyMMdd-NNNN}.
 * <p>
 * 같은 날짜·같은 접두어의 마지막 일련번호 다음 값을 준다. 전체 건수(count)로 채번하면
 * 전표가 하나라도 삭제되거나 과거 날짜 전표가 섞이는 순간 이미 쓰인 번호를 다시 발급해
 * unique 제약에 걸린다.
 * <p>
 * <b>동시성:</b> "max 조회 → 다음 번호로 insert" 사이에 다른 트랜잭션이 끼어들면 둘이 같은
 * 번호를 발급받아 unique 제약에서 하나가 터진다(실제로 터졌다 — 두 클라이언트가 동시에
 * 회계전표를 만들자 GL-yyyyMMdd-NNNN 이 중복됐다). 그래서 채번 직전에 (접두어, 날짜) 단위
 * advisory lock 을 잡아 같은 번호 공간의 채번만 줄을 세운다. 락은 트랜잭션이 끝나면 자동으로
 * 풀리고, 접두어나 날짜가 다르면 서로를 막지 않는다.
 */
@Component
public class DocumentNoGenerator {

    private static final DateTimeFormatter YMD = DateTimeFormatter.BASIC_ISO_DATE;

    @PersistenceContext
    private EntityManager em;

    /**
     * @param prefix     접두어. 하이픈 포함 ("SO-")
     * @param table      테이블명
     * @param noColumn   전표번호 컬럼
     * @param dateColumn 전표일자 컬럼 (번호의 날짜 부분과 같은 값이어야 함)
     */
    @Transactional(propagation = Propagation.MANDATORY)
    public String next(String prefix, String table, String noColumn, String dateColumn, LocalDate date) {
        // 같은 (접두어, 날짜) 번호 공간을 쓰는 트랜잭션끼리만 줄을 세운다. 트랜잭션 종료 시 자동 해제.
        em.createNativeQuery("select pg_advisory_xact_lock(hashtext(:key))")
                .setParameter("key", prefix + date.format(YMD))
                .getSingleResult();

        // table/noColumn/dateColumn 은 호출부의 상수만 들어온다 (사용자 입력 아님).
        Object max = em.createNativeQuery(
                        "select coalesce(max(cast(split_part(" + noColumn + ", '-', 3) as integer)), 0)"
                                + " from " + table
                                + " where " + dateColumn + " = :date and " + noColumn + " like :prefix")
                .setParameter("date", date)
                .setParameter("prefix", prefix + "%")
                .getSingleResult();
        int seq = ((Number) max).intValue() + 1;
        return prefix + date.format(YMD) + "-" + String.format("%04d", seq);
    }
}
