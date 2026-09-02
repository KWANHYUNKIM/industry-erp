package com.erp.groupware.domain.enums;

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
    NOTICE("공지사항");

    private final String displayName;

    PostBoard(String displayName) { this.displayName = displayName; }

    public String getDisplayName() { return displayName; }
}
