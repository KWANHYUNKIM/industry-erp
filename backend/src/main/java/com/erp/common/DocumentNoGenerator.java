package com.erp.common;

import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import org.springframework.stereotype.Component;

import java.time.LocalDate;
import java.time.format.DateTimeFormatter;

/**
 * 전표번호 채번: {@code PREFIX-yyyyMMdd-NNNN}.
 * <p>
 * 같은 날짜·같은 접두어의 마지막 일련번호 다음 값을 준다. 전체 건수(count)로 채번하면
 * 전표가 하나라도 삭제되거나 과거 날짜 전표가 섞이는 순간 이미 쓰인 번호를 다시 발급해
 * unique 제약에 걸린다.
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
    public String next(String prefix, String table, String noColumn, String dateColumn, LocalDate date) {
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
