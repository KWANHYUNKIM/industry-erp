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
 * <b>지운 번호를 다시 쓰지 않는다</b>(원본 이카운트와 같다 — 같은 날 -1 · -2 를 저장하고 -2 를 지우면
 * 다음은 -3). 남은 행의 max + 1 로 매기면 마지막 번호를 지웠을 때 그 번호가 되돌아오고, count() + 1 은
 * 아무 번호나 지워도 이미 쓰는 번호를 다시 준다. 그래서 (번호 공간, 일자)별로 마지막에 준 번호를
 * {@code document_sequences} 표에 두고 거기서 올린다 — {@link #nextSeq}.
 * <p>
 * <b>동시성:</b> 올리기는 {@code INSERT … ON CONFLICT DO UPDATE … RETURNING} 한 문장이라 같은 (공간, 일자)
 * 행을 잠그고 줄을 세운다. 두 저장이 같은 번호를 집지 않는다(예전 max+1 은 GL 번호가 겹쳐 터진 적이 있다).
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
        // table/noColumn/dateColumn 은 호출부의 상수만 들어온다 (사용자 입력 아님).
        // 남은 행의 max 는 번호표가 생기기 전 전표를 따라잡는 데만 쓴다(nextSeq 의 GREATEST).
        Object max = em.createNativeQuery(
                        "select coalesce(max(cast(split_part(" + noColumn + ", '-', 3) as integer)), 0)"
                                + " from " + table
                                + " where " + dateColumn + " = :date and " + noColumn + " like :prefix")
                .setParameter("date", date)
                .setParameter("prefix", prefix + "%")
                .getSingleResult();
        int seq = nextSeq(table + ":" + prefix, date, ((Number) max).intValue());
        return prefix + date.format(YMD) + "-" + String.format("%04d", seq);
    }

    /**
     * (번호 공간, 일자)의 다음 일련번호. 지운 번호를 다시 주지 않는다.
     * <p>
     * 번호를 직접 조립하는 호출부(기안서 · 채권/채무 · 인사발령 · 일용직 근무기록 …)가 쓴다.
     * {@code currentMax} 는 그 표에 지금 남은 행의 최댓값 — 번호표가 생기기 전 전표와 겹치지 않게
     * 처음 한 번 따라잡는 데 쓴다: 다음 번호 = max(번호표의 마지막 번호, currentMax) + 1.
     *
     * @param space      번호 공간 이름(호출부 상수). 보통 {@code 테이블:접두어}
     * @param date       일자. 월 · 연 단위 번호는 그 달 · 그해 1일
     * @param currentMax 그 공간 · 일자에 지금 남은 번호의 최댓값(없으면 0)
     */
    @Transactional(propagation = Propagation.MANDATORY)
    public int nextSeq(String space, LocalDate date, int currentMax) {
        Object no = em.createNativeQuery(
                        "insert into document_sequences(space, seq_date, last_no) values (:space, :date, :first)"
                                + " on conflict (space, seq_date) do update"
                                + " set last_no = greatest(document_sequences.last_no, excluded.last_no - 1) + 1"
                                + " returning last_no")
                .setParameter("space", space)
                .setParameter("date", date)
                .setParameter("first", currentMax + 1)
                .getSingleResult();
        return ((Number) no).intValue();
    }

    /**
     * 마스터 코드 채번: {@code PREFIX + 0채움 일련번호} (예: CI001, PRJ-2605).
     * <p>
     * 그 접두어 뒤가 숫자인 코드 중 <b>가장 큰 값 + 1</b>. 건수 + 1 로 하던 곳들이(카드사·결제대행·
     * 관리항목·쇼핑몰계정·프로젝트) 하나라도 지우면 이미 쓰는 번호를 다시 줬다 — 프로젝트는 QA 가
     * 쌓은 460개를 정리하자 PRJ-26461 다음이 PRJ-2605 로 되돌아갔다.
     *
     * @param table      테이블명 (호출부 상수)
     * @param codeColumn 코드 컬럼 (호출부 상수)
     * @param width      일련번호 0채움 자릿수 (넘치면 그대로 길어진다)
     */
    @Transactional(propagation = Propagation.MANDATORY)
    public String nextMasterCode(String prefix, String table, String codeColumn, int width) {
        lockNumberSpace(prefix);
        String tail = "substring(" + codeColumn + " from " + (prefix.length() + 1) + ")";
        Object max = em.createNativeQuery(
                        "select coalesce(max(cast(" + tail + " as integer)), 0) from " + table
                                + " where " + codeColumn + " like :prefix and " + tail + " ~ '^[0-9]+$'")
                .setParameter("prefix", prefix + "%")
                .getSingleResult();
        return prefix + String.format("%0" + width + "d", ((Number) max).intValue() + 1);
    }

    /**
     * 같은 번호 공간의 채번을 트랜잭션 단위로 직렬화한다. 트랜잭션이 끝나면 자동 해제되고,
     * {@code key} 가 다르면 서로를 막지 않는다.
     * <p>
     * 전표 일련번호에는 쓰지 않는다 — {@link #nextSeq} 가 번호표 행 잠금으로 줄을 세우고 지운 번호도
     * 다시 주지 않는다. 지운 번호를 다시 써도 되는 게시판 글번호 같은 곳에서 {@code max} 조회 직전에 잡는다.
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
