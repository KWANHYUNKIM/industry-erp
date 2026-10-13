package com.erp.groupware.board;

/**
 * 게시글이 붙는 게시판.
 *
 * <p>원본은 게시판을 여러 개 두고 게시글을 그 아래 단다. 실제로 업무관리 &gt; 업무관리게시판은
 * <b>묶음</b>이고 그 안에 'WORK' 라는 게시판이 있으며, 공유정보 &gt; 게시판 아래에는 '공지사항'이 있다.
 * 두 게시판의 게시글번호가 <b>한 줄기로 이어지고 중간에 구멍이 있다</b>(공지사항에 5·4·2·1 —
 * 3번은 다른 게시판 글). 게시글 테이블이 하나라는 뜻이다.
 *
 * <p>사용자가 게시판을 만드는 관리 화면은 아직 확인하지 못했다. 그래서 지금은 원본에서 실제로
 * 본 두 개만 enum 으로 둔다. 그 화면을 확인하면 마스터 테이블로 옮긴다.
 */
public enum PostBoard {

    WORK("WORK"),
    NOTICE("공지사항"),
    /** 공유정보 &gt; 통합게시판 &gt; 공유정보/업무관리 게시판 20개까지 (2026-10-13 실측). 진행상태 'Default' 하나. */
    SHARED("공유정보/업무관리 게시판 20개까지"),
    /** 공유정보 &gt; 회의록(예시) &gt; 팀별회의록 게시판 (E200068). 진행상태 자리가 '부서구분'. */
    MEETING("팀별회의록 게시판"),
    /** 공유정보 &gt; 프로젝트 진행관리(예시) &gt; 간판제작 프로젝트관리 (E072501). */
    SIGN("간판제작 프로젝트관리"),
    /**
     * 공유정보 &gt; 회의록(예시) &gt; 통합회의록 (E200066, 2026-10-13 실측). 팀별회의록({@link #MEETING}) 글을 부서마다 한 칸씩 잇고
     * [주 차 구분]을 단다. 진행상태는 WORK 처럼 진행중 · 완료.
     */
    MINUTES("통합회의록");

    /**
     * 게시글번호를 이 게시판 혼자 세는가. 2026-10-13 원본: 공지사항(…16)과 팀별회의록(…16)의 번호가 겹치고,
     * 통합게시판은 2 · 간판제작은 12 에서 멈춘다 — 새 게시판들은 각자 센다. WORK · 공지사항은 예전 실측(한 줄기)대로 둔다.
     */
    public boolean ownNumbering() { return this == SHARED || this == MEETING || this == SIGN || this == MINUTES; }

    /** 진행상태 이름을 회사가 정한 게시판인가 — 그 이름은 status(진행중/완료)가 아니라 stage 에 적는다. */
    public boolean namedStages() { return this == SHARED || this == MEETING || this == SIGN; }

    private final String displayName;

    PostBoard(String displayName) { this.displayName = displayName; }

    public String getDisplayName() { return displayName; }
}
