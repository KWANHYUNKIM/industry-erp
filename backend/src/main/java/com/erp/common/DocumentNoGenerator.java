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
        lockNumberSpace(prefix + date.format(YMD));

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

    /**
     * 같은 번호 공간의 채번을 트랜잭션 단위로 직렬화한다. 트랜잭션이 끝나면 자동 해제되고,
     * {@code key} 가 다르면 서로를 막지 않는다.
     * <p>
     * 번호를 직접 조립하는 호출부에서 쓴다 — 예: 기안서는 하나의 일련번호로 기안No(
     * {@code 2026/07/10-2})와 기안서No({@code AP-20260710-0002})를 동시에 만들어야 해서
     * {@link #next}(문자열만 반환)를 못 쓴다. 그런 경우 {@code max(seq)} 조회 직전에 이 락을
     * 잡아 두 트랜잭션이 같은 seq 를 읽는 race 를 막는다.
     *
     * @param key 번호 공간 식별자. 보통 {@code 접두어 + yyyyMMdd}.
     */
    @Transactional(propagation = Propagation.MANDATORY)
    public void lockNumberSpace(String key) {
        em.createNativeQuery("select pg_advisory_xact_lock(hashtext(:key))")
                .setParameter("key", key)
                .getSingleResult();
    }
}
